const mongoose = require('mongoose');
const Vendor = require('../models/vendorModel');
const VendorTier = require('../models/vendorTierModel');
const VendorMonthlyTier = require('../models/vendorMonthlyTierModel');
const TierMovementLog = require('../models/tierMovementLogModel');
const PaymentConfirmation = require('../models/paymentConfirmationModel');
const WalletTransaction = require('../models/walletTransactionModel');
const { logAction } = require('./auditService');

/**
 * Timezone & Calendar Helpers (Asia/Kolkata)
 */
const getKolkataDate = (d = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(d);
  const getPart = (type) => parts.find(p => p.type === type)?.value;
  const year = parseInt(getPart('year'), 10);
  const month = parseInt(getPart('month'), 10); // 1-12
  const day = parseInt(getPart('day'), 10);
  const hour = parseInt(getPart('hour'), 10);
  const minute = parseInt(getPart('minute'), 10);
  const second = parseInt(getPart('second'), 10);
  return { year, month, day, hour, minute, second };
};

const getMonthLabel = (year, month) => {
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

const getMonthDateRange = (year, month) => {
  // Start of month in UTC matching 00:00:00.000 Asia/Kolkata (UTC - 5h30m)
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  start.setMinutes(start.getMinutes() - 330);

  // End of month in UTC matching 00:00:00.000 Asia/Kolkata of next month
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  end.setMinutes(end.getMinutes() - 330);

  return { start, end };
};

/**
 * 1. Find matching tier and next tier progress for a given volume
 */
const findMatchingTier = async (amount = 0) => {
  const numericAmount = Math.max(0, Number(amount) || 0);
  const activeTiers = await VendorTier.find({ isActive: true }).sort({ orderPriority: 1 });

  if (!activeTiers || activeTiers.length === 0) {
    return {
      currentTier: {
        _id: null,
        name: 'Bronze',
        displayName: 'Bronze V',
        commissionRate: 1.0,
        minTopUp: 0,
        maxTopUp: 50000,
        orderPriority: 1
      },
      nextTier: null,
      amountToNextTier: 0,
      progressPercentage: 100
    };
  }

  // Find tier where minTopUp <= amount <= maxTopUp
  let currentIndex = activeTiers.findIndex(
    t => numericAmount >= t.minTopUp && numericAmount <= t.maxTopUp
  );

  // If amount exceeds all max bounds, assign highest tier
  if (currentIndex === -1) {
    if (numericAmount > activeTiers[activeTiers.length - 1].maxTopUp) {
      currentIndex = activeTiers.length - 1;
    } else {
      currentIndex = 0;
    }
  }

  const currentTier = activeTiers[currentIndex];
  const nextTier = currentIndex < activeTiers.length - 1 ? activeTiers[currentIndex + 1] : null;

  let amountToNextTier = 0;
  let progressPercentage = 100;

  if (nextTier) {
    amountToNextTier = Math.max(0, nextTier.minTopUp - numericAmount);
    const tierSpan = nextTier.minTopUp - currentTier.minTopUp;
    const progressInTier = numericAmount - currentTier.minTopUp;
    if (tierSpan > 0) {
      progressPercentage = Math.min(
        100,
        Math.max(0, Number(((progressInTier / tierSpan) * 100).toFixed(2)))
      );
    } else {
      progressPercentage = 100;
    }
  }

  return {
    currentTier,
    nextTier,
    amountToNextTier,
    progressPercentage
  };
};

/**
 * 2. Find matching tier and next tier based on a manual commission rate
 */
const findTierByCommissionRate = async (rate) => {
  const numericRate = Number(rate);
  const activeTiers = await VendorTier.find({ isActive: true }).sort({ commissionRate: 1, orderPriority: 1 });

  if (!activeTiers || activeTiers.length === 0) {
    return {
      matchedTier: null,
      nextTier: null
    };
  }

  // 1. Try exact commission match first
  let matchedTier = activeTiers.find(t => Math.abs(t.commissionRate - numericRate) < 0.0001);

  // 2. If no exact match, find highest tier with configured commissionRate <= numericRate
  if (!matchedTier) {
    const candidates = activeTiers.filter(t => t.commissionRate <= numericRate);
    if (candidates.length > 0) {
      matchedTier = candidates[candidates.length - 1];
    } else {
      matchedTier = activeTiers[0];
    }
  }

  // Determine next tier in sequence
  const sortedByPriority = await VendorTier.find({ isActive: true }).sort({ orderPriority: 1 });
  const currentIndex = sortedByPriority.findIndex(t => t._id.toString() === matchedTier._id.toString());
  const nextTier = currentIndex !== -1 && currentIndex < sortedByPriority.length - 1 ? sortedByPriority[currentIndex + 1] : null;

  return {
    matchedTier,
    nextTier
  };
};

/**
 * 3. Calculate actual sum of confirmed top-ups for a vendor in a given month
 */
const calculateMonthlyTopUpSum = async (vendorId, year, month, session = null) => {
  const { start, end } = getMonthDateRange(year, month);
  const vendorObjId = mongoose.Types.ObjectId.isValid(vendorId) ? new mongoose.Types.ObjectId(vendorId) : vendorId;
  const vendorIdStr = vendorId ? vendorId.toString() : '';

  const TopUpRequest = require('../models/topUpRequestModel');

  // 1. Sum from approved PaymentConfirmation (by createdAt, verifiedAt, or transactionDate)
  const pQuery = {
    vendorId: vendorObjId,
    status: 'APPROVED',
    $or: [
      { createdAt: { $gte: start, $lt: end } },
      { verifiedAt: { $gte: start, $lt: end } },
      { transactionDate: { $gte: start, $lt: end } }
    ]
  };

  const pPipeline = [
    { $match: pQuery },
    { $group: { _id: null, total: { $sum: '$amountPaid' } } }
  ];

  // 2. Sum from WalletTransaction (CREDIT_TOPUP)
  const wQuery = {
    vendorId: vendorObjId,
    transactionType: 'CREDIT_TOPUP',
    createdAt: { $gte: start, $lt: end }
  };

  const wPipeline = [
    { $match: wQuery },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ];

  // 3. Sum from TopUpRequest (COMPLETED or APPROVED)
  const tQuery = {
    vendorId: vendorObjId,
    status: { $in: ['COMPLETED', 'APPROVED'] },
    $or: [
      { createdAt: { $gte: start, $lt: end } },
      { 'adminResponse.respondedAt': { $gte: start, $lt: end } }
    ]
  };

  const tPipeline = [
    { $match: tQuery },
    {
      $group: {
        _id: null,
        total: {
          $sum: {
            $cond: [
              { $gt: ['$adminResponse.approvedAmount', 0] },
              '$adminResponse.approvedAmount',
              '$requestedAmount'
            ]
          }
        }
      }
    }
  ];

  let pResult = null;
  let wResult = null;
  let tResult = null;

  if (session) {
    pResult = await PaymentConfirmation.aggregate(pPipeline).session(session);
    wResult = await WalletTransaction.aggregate(wPipeline).session(session);
    tResult = await TopUpRequest.aggregate(tPipeline).session(session);
  } else {
    pResult = await PaymentConfirmation.aggregate(pPipeline);
    wResult = await WalletTransaction.aggregate(wPipeline);
    tResult = await TopUpRequest.aggregate(tPipeline);
  }

  const pTotal = pResult && pResult.length > 0 ? Number(pResult[0].total) : 0;
  const wTotal = wResult && wResult.length > 0 ? Number(wResult[0].total) : 0;
  const tTotal = tResult && tResult.length > 0 ? Number(tResult[0].total) : 0;

  return Math.max(pTotal, wTotal, tTotal);
};

/**
 * 3. Get or create vendor monthly record
 */
const getOrCreateMonthlyRecord = async (vendorId, year = null, month = null, session = null) => {
  const nowKolkata = getKolkataDate();
  const currentYear = year || nowKolkata.year;
  const currentMonth = month || nowKolkata.month;

  let query = VendorMonthlyTier.findOne({ vendorId, year: currentYear, month: currentMonth });
  if (session) query = query.session(session);

  let record = await query;
  if (!record) {
    const { currentTier, nextTier, amountToNextTier, progressPercentage } = await findMatchingTier(0);

    const newRecordData = {
      vendorId,
      year: currentYear,
      month: currentMonth,
      monthLabel: getMonthLabel(currentYear, currentMonth),
      totalTopUp: 0,
      currentTierId: currentTier._id,
      currentTierName: currentTier.name,
      currentTierDisplayName: currentTier.displayName,
      commissionMode: 'AUTO',
      manualCommissionRate: null,
      effectiveCommissionRate: currentTier.commissionRate,
      nextTierId: nextTier ? nextTier._id : null,
      nextTierName: nextTier ? nextTier.displayName : null,
      amountToNextTier,
      progressPercentage,
      isClosed: false,
      startedAt: new Date(),
      lastUpdatedAt: new Date()
    };

    try {
      if (session) {
        const created = await VendorMonthlyTier.create([newRecordData], { session });
        record = created[0];
      } else {
        record = await VendorMonthlyTier.create(newRecordData);
      }
    } catch (err) {
      if (err.code === 11000) {
        let retryQuery = VendorMonthlyTier.findOne({ vendorId, year: currentYear, month: currentMonth });
        if (session) retryQuery = retryQuery.session(session);
        record = await retryQuery;
      } else {
        throw err;
      }
    }
  }

  return record;
};

/**
 * 4. Recalculate vendor tier dynamically after a qualifying top-up or recalculation request
 */
const recalculateVendorMonthlyTier = async (vendorId, options = {}) => {
  const {
    topUpAmount = 0,
    reason = 'Top-up volume updated',
    session = null,
    targetYear = null,
    targetMonth = null
  } = options;

  const { year: curYear, month: curMonth } = getKolkataDate();
  const year = targetYear || curYear;
  const month = targetMonth || curMonth;

  const monthlyRecord = await getOrCreateMonthlyRecord(vendorId, year, month, session);

  // If this is the current active month, it should always remain open and dynamically recalculated
  const isCurrentActiveMonth = (year === curYear && month === curMonth);
  if (isCurrentActiveMonth && monthlyRecord.isClosed) {
    monthlyRecord.isClosed = false;
    monthlyRecord.closedAt = null;
  }

  // If month is a past finalized/closed month, it is immutable
  if (monthlyRecord.isClosed && !isCurrentActiveMonth) {
    return monthlyRecord;
  }

  // Calculate actual total successful top-up volume from DB
  const totalTopUp = await calculateMonthlyTopUpSum(vendorId, year, month, session);
  const { currentTier, nextTier, amountToNextTier, progressPercentage } = await findMatchingTier(totalTopUp);

  const prevTierName = monthlyRecord.currentTierDisplayName || monthlyRecord.currentTierName || 'None';
  const prevTierId = monthlyRecord.currentTierId;
  const newTierName = currentTier.displayName || currentTier.name;
  const isTierChanged = !prevTierId || prevTierId.toString() !== (currentTier._id ? currentTier._id.toString() : '');

  const prevCommission = monthlyRecord.effectiveCommissionRate;
  const newAutoCommission = currentTier.commissionRate;
  const effectiveCommission = monthlyRecord.commissionMode === 'MANUAL' && monthlyRecord.manualCommissionRate !== null
    ? monthlyRecord.manualCommissionRate
    : newAutoCommission;

  // Log tier movement if rank changed
  if (isTierChanged) {
    const logData = {
      vendorId,
      year,
      month,
      previousTierId: prevTierId,
      previousTierName: prevTierName,
      newTierId: currentTier._id,
      newTierName,
      topUpAmountAtChange: Number(topUpAmount) || 0,
      totalMonthlyTopUp: totalTopUp,
      previousCommission: prevCommission,
      newCommission: effectiveCommission,
      changedAt: new Date(),
      reason
    };

    if (session) {
      await TierMovementLog.create([logData], { session });
    } else {
      await TierMovementLog.create(logData);
    }
  }

  // Update monthly record
  monthlyRecord.totalTopUp = totalTopUp;
  if (monthlyRecord.commissionMode !== 'MANUAL') {
    monthlyRecord.currentTierId = currentTier._id;
    monthlyRecord.currentTierName = currentTier.name;
    monthlyRecord.currentTierDisplayName = currentTier.displayName;
    monthlyRecord.nextTierId = nextTier ? nextTier._id : null;
    monthlyRecord.nextTierName = nextTier ? (nextTier.displayName || nextTier.name) : null;
    monthlyRecord.amountToNextTier = amountToNextTier;
    monthlyRecord.progressPercentage = progressPercentage;
  } else {
    monthlyRecord.amountToNextTier = amountToNextTier;
    monthlyRecord.progressPercentage = progressPercentage;
  }
  monthlyRecord.effectiveCommissionRate = effectiveCommission;
  monthlyRecord.lastUpdatedAt = new Date();

  await monthlyRecord.save(session ? { session } : {});

  // Keep Vendor document synced with current tier
  try {
    const vendorUpdate = {
      currentTierId: monthlyRecord.currentTierId,
      currentTier: monthlyRecord.currentTierDisplayName || monthlyRecord.currentTierName,
      commissionMode: monthlyRecord.commissionMode,
      effectiveCommissionRate: monthlyRecord.effectiveCommissionRate
    };
    if (session) {
      await Vendor.findByIdAndUpdate(vendorId, vendorUpdate, { session });
    } else {
      await Vendor.findByIdAndUpdate(vendorId, vendorUpdate);
    }
  } catch (err) {
    console.error('Error syncing Vendor document tier:', err);
  }

  return monthlyRecord;
};

/**
 * 5. Set manual commission override for a vendor
 */
const setManualCommission = async (vendorId, options, adminId) => {
  const rawRate = typeof options === 'object' && options !== null
    ? (options.rate !== undefined ? options.rate : options.commissionRate)
    : options;
  const reason = typeof options === 'object' && options !== null ? options.reason : '';

  const numRate = Number(rawRate);
  if (rawRate === undefined || rawRate === null || isNaN(numRate) || numRate < 0 || numRate > 100) {
    throw new Error('Commission rate must be a valid percentage between 0 and 100');
  }

  const { year, month } = getKolkataDate();
  const monthlyRecord = await getOrCreateMonthlyRecord(vendorId, year, month);

  // Automatically update tier according to the manual commission rate
  const { matchedTier, nextTier } = await findTierByCommissionRate(numRate);

  const prevTierName = monthlyRecord.currentTierDisplayName || monthlyRecord.currentTierName || 'None';
  const prevTierId = monthlyRecord.currentTierId;
  const prevCommission = monthlyRecord.effectiveCommissionRate;

  monthlyRecord.commissionMode = 'MANUAL';
  monthlyRecord.manualCommissionRate = numRate;
  monthlyRecord.manualCommissionReason = reason ? reason.trim() : 'Manual SuperAdmin Agreement';
  monthlyRecord.manualCommissionAssignedBy = adminId;
  monthlyRecord.manualCommissionAssignedAt = new Date();
  monthlyRecord.effectiveCommissionRate = numRate;

  if (matchedTier) {
    monthlyRecord.currentTierId = matchedTier._id;
    monthlyRecord.currentTierName = matchedTier.name;
    monthlyRecord.currentTierDisplayName = matchedTier.displayName || matchedTier.name;
    monthlyRecord.nextTierId = nextTier ? nextTier._id : null;
    monthlyRecord.nextTierName = nextTier ? (nextTier.displayName || nextTier.name) : null;

    // Log tier movement if tier changed
    if (!prevTierId || prevTierId.toString() !== matchedTier._id.toString()) {
      await TierMovementLog.create({
        vendorId,
        year,
        month,
        previousTierId: prevTierId,
        previousTierName: prevTierName,
        newTierId: matchedTier._id,
        newTierName: matchedTier.displayName || matchedTier.name,
        topUpAmountAtChange: 0,
        totalMonthlyTopUp: monthlyRecord.totalTopUp || 0,
        previousCommission: prevCommission,
        newCommission: numRate,
        changedAt: new Date(),
        reason: reason ? `Manual commission override (${numRate}%): ${reason}` : `Manual commission rate set to ${numRate}%`
      });
    }

    // Also update vendor model current tier
    await Vendor.findByIdAndUpdate(vendorId, {
      currentTierId: matchedTier._id,
      currentTier: matchedTier.displayName || matchedTier.name,
      commissionMode: 'MANUAL',
      manualCommissionRate: numRate,
      effectiveCommissionRate: numRate
    });
  }

  monthlyRecord.lastUpdatedAt = new Date();
  await monthlyRecord.save();

  await logAction({
    actor: adminId,
    actorRole: 'super_admin',
    action: 'MANUAL_COMMISSION_ASSIGNED',
    targetType: 'VendorMonthlyTier',
    targetId: monthlyRecord._id,
    metadata: {
      vendorId,
      year,
      month,
      manualCommissionRate: numRate,
      assignedTier: matchedTier?.displayName || matchedTier?.name,
      reason
    }
  });

  return monthlyRecord;
};

/**
 * 6. Remove manual commission override (restores AUTO tier rate based on current monthly topup)
 */
const removeManualCommission = async (vendorId, adminId) => {
  const { year, month } = getKolkataDate();
  const monthlyRecord = await getOrCreateMonthlyRecord(vendorId, year, month);

  // Calculate actual total qualifying monthly top-up volume
  const totalTopUp = await calculateMonthlyTopUpSum(vendorId, year, month);
  monthlyRecord.totalTopUp = totalTopUp;

  // Find automatic tier matching current monthly volume
  const { currentTier, nextTier, amountToNextTier, progressPercentage } = await findMatchingTier(totalTopUp);

  const prevTierName = monthlyRecord.currentTierDisplayName || monthlyRecord.currentTierName || 'None';
  const prevTierId = monthlyRecord.currentTierId;
  const prevCommission = monthlyRecord.effectiveCommissionRate;

  monthlyRecord.commissionMode = 'AUTO';
  monthlyRecord.manualCommissionRate = null;
  monthlyRecord.manualCommissionReason = null;
  monthlyRecord.manualCommissionAssignedBy = null;
  monthlyRecord.manualCommissionAssignedAt = null;
  monthlyRecord.effectiveCommissionRate = currentTier.commissionRate;
  monthlyRecord.currentTierId = currentTier._id;
  monthlyRecord.currentTierName = currentTier.name;
  monthlyRecord.currentTierDisplayName = currentTier.displayName;
  monthlyRecord.nextTierId = nextTier ? nextTier._id : null;
  monthlyRecord.nextTierName = nextTier ? (nextTier.displayName || nextTier.name) : null;
  monthlyRecord.amountToNextTier = amountToNextTier;
  monthlyRecord.progressPercentage = progressPercentage;
  monthlyRecord.lastUpdatedAt = new Date();

  if (prevTierId && prevTierId.toString() !== currentTier._id.toString()) {
    await TierMovementLog.create({
      vendorId,
      year,
      month,
      previousTierId: prevTierId,
      previousTierName: prevTierName,
      newTierId: currentTier._id,
      newTierName: currentTier.displayName || currentTier.name,
      topUpAmountAtChange: 0,
      totalMonthlyTopUp: monthlyRecord.totalTopUp || 0,
      previousCommission: prevCommission,
      newCommission: currentTier.commissionRate,
      changedAt: new Date(),
      reason: 'Manual commission override removed, auto tier restored'
    });
  }

  await Vendor.findByIdAndUpdate(vendorId, {
    currentTierId: currentTier._id,
    currentTier: currentTier.displayName || currentTier.name,
    commissionMode: 'AUTO',
    manualCommissionRate: null,
    effectiveCommissionRate: currentTier.commissionRate
  });

  await monthlyRecord.save();

  await logAction({
    actor: adminId,
    actorRole: 'super_admin',
    action: 'MANUAL_COMMISSION_REMOVED',
    targetType: 'VendorMonthlyTier',
    targetId: monthlyRecord._id,
    metadata: {
      vendorId,
      year,
      month,
      restoredTier: currentTier.displayName || currentTier.name,
      restoredTierCommission: currentTier.commissionRate
    }
  });

  return monthlyRecord;
};

/**
 * 7. Get vendor's current effective commission info for client transactions
 */
const getVendorEffectiveCommission = async (vendorId, session = null) => {
  const { year, month } = getKolkataDate();
  const record = await getOrCreateMonthlyRecord(vendorId, year, month, session);

  return {
    tierName: record.currentTierDisplayName || record.currentTierName,
    commissionPercentage: record.effectiveCommissionRate,
    commissionMode: record.commissionMode,
    isManual: record.commissionMode === 'MANUAL'
  };
};

/**
 * 8. Finalize month cycle and create immutable historical snapshot (Idempotent)
 */
const finalizeMonthlyCycle = async (year, month) => {
  const activeVendors = await Vendor.find({ isActive: true });
  let closedCount = 0;
  let totalCycleVolume = 0;

  for (const vendor of activeVendors) {
    let record = await VendorMonthlyTier.findOne({ vendorId: vendor._id, year, month });
    if (!record) {
      record = await getOrCreateMonthlyRecord(vendor._id, year, month);
    }

    if (!record.isClosed) {
      const totalTopUp = await calculateMonthlyTopUpSum(vendor._id, year, month);
      const { currentTier, nextTier, amountToNextTier, progressPercentage } = await findMatchingTier(totalTopUp);

      record.totalTopUp = totalTopUp;
      record.currentTierId = currentTier._id;
      record.currentTierName = currentTier.name;
      record.currentTierDisplayName = currentTier.displayName;
      record.effectiveCommissionRate = record.commissionMode === 'MANUAL' && record.manualCommissionRate !== null
        ? record.manualCommissionRate
        : currentTier.commissionRate;
      record.nextTierId = nextTier ? nextTier._id : null;
      record.nextTierName = nextTier ? nextTier.displayName : null;
      record.amountToNextTier = amountToNextTier;
      record.progressPercentage = progressPercentage;
      record.isClosed = true;
      record.closedAt = new Date();
      record.lastUpdatedAt = new Date();

      await record.save();
      closedCount++;
      totalCycleVolume += totalTopUp;
    }
  }

  return {
    year,
    month,
    monthLabel: getMonthLabel(year, month),
    closedCount,
    totalCycleVolume
  };
};

/**
 * 9. SuperAdmin Monthly Dashboard Analytics
 */
const getAdminMonthlyAnalytics = async (targetYear = null, targetMonth = null) => {
  const { year: curYear, month: curMonth } = getKolkataDate();
  const year = targetYear ? parseInt(targetYear, 10) : curYear;
  const month = targetMonth ? parseInt(targetMonth, 10) : curMonth;

  const activeVendors = await Vendor.find({ isActive: true });
  const totalVendors = activeVendors.length;

  // Ensure every active vendor has a recalculated monthly tier record
  for (const v of activeVendors) {
    try {
      await recalculateVendorMonthlyTier(v._id, { targetYear: year, targetMonth: month });
    } catch (e) {
      console.error(`Error calculating tier for vendor ${v._id}:`, e.message);
    }
  }

  const monthlyRecords = await VendorMonthlyTier.find({ year, month })
    .populate('vendorId', 'firstName lastName email mobileNumber profilePhoto')
    .sort({ totalTopUp: -1 });

  const totalMonthVolume = monthlyRecords.reduce((acc, r) => acc + (r.totalTopUp || 0), 0);

  // Group vendors by tier
  const tierDistributionMap = {};
  monthlyRecords.forEach(r => {
    const tierName = r.currentTierDisplayName || r.currentTierName || 'Bronze V';
    tierDistributionMap[tierName] = (tierDistributionMap[tierName] || 0) + 1;
  });

  const totalRecordsCount = monthlyRecords.length || 1;
  const tierDistribution = Object.keys(tierDistributionMap).map(tierName => {
    const count = tierDistributionMap[tierName];
    const percentage = Math.round((count / totalRecordsCount) * 100);
    return {
      tierName,
      displayName: tierName,
      count,
      vendorCount: count,
      percentage
    };
  });

  // Top vendors
  const topVendors = monthlyRecords.slice(0, 10).map(r => {
    const v = r.vendorId || {};
    const vendorName = v.firstName ? `${v.firstName} ${v.lastName || ''}`.trim() : (v.email || 'Unknown Vendor');
    return {
      vendor: r.vendorId,
      vendorId: v._id || r.vendorId,
      vendorName,
      totalTopUp: r.totalTopUp,
      totalMonthlyTopUp: r.totalTopUp,
      tierName: r.currentTierDisplayName || r.currentTierName,
      commissionMode: r.commissionMode,
      effectiveCommissionRate: r.effectiveCommissionRate
    };
  });

  // Vendors close to next tier (progress >= 70% and not at top tier)
  const closeToNextTier = monthlyRecords
    .filter(r => r.nextTierName && r.amountToNextTier > 0 && r.progressPercentage >= 70)
    .slice(0, 10)
    .map(r => {
      const v = r.vendorId || {};
      const vendorName = v.firstName ? `${v.firstName} ${v.lastName || ''}`.trim() : (v.email || 'Unknown Vendor');
      return {
        vendor: r.vendorId,
        vendorId: v._id || r.vendorId,
        vendorName,
        currentTier: r.currentTierDisplayName || r.currentTierName,
        currentTierName: r.currentTierDisplayName || r.currentTierName,
        nextTier: r.nextTierName,
        nextTierName: r.nextTierName,
        amountToNextTier: r.amountToNextTier,
        progressPercentage: r.progressPercentage,
        totalTopUp: r.totalTopUp,
        totalMonthlyTopUp: r.totalTopUp
      };
    });

  // Manual commission vendors
  const manualCommissionVendors = monthlyRecords
    .filter(r => r.commissionMode === 'MANUAL')
    .map(r => {
      const v = r.vendorId || {};
      const vendorName = v.firstName ? `${v.firstName} ${v.lastName || ''}`.trim() : (v.email || 'Unknown Vendor');
      return {
        vendor: r.vendorId,
        vendorId: v._id || r.vendorId,
        vendorName,
        tierName: r.currentTierDisplayName || r.currentTierName,
        currentTierName: r.currentTierDisplayName || r.currentTierName,
        manualCommissionRate: r.manualCommissionRate,
        manualCommissionReason: r.manualCommissionReason,
        manualCommissionAssignedAt: r.manualCommissionAssignedAt
      };
    });

  // Recent tier movement logs
  const recentMovements = await TierMovementLog.find({ year, month })
    .sort({ changedAt: -1 })
    .limit(15)
    .populate('vendorId', 'firstName lastName email');

  return {
    year,
    month,
    monthLabel: getMonthLabel(year, month),
    totalVendors,
    activeVendorsCount: totalVendors,
    totalMonthVolume,
    totalMonthlyVolume: totalMonthVolume,
    tierDistribution,
    topVendors,
    closeToNextTier,
    vendorsCloseToNextTier: closeToNextTier,
    manualCommissionVendors,
    recentMovements
  };
};

module.exports = {
  getKolkataDate,
  getMonthLabel,
  getMonthDateRange,
  findMatchingTier,
  calculateMonthlyTopUpSum,
  getOrCreateMonthlyRecord,
  recalculateVendorMonthlyTier,
  setManualCommission,
  removeManualCommission,
  getVendorEffectiveCommission,
  finalizeMonthlyCycle,
  getAdminMonthlyAnalytics
};
