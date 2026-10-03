const mongoose = require('mongoose');
const FCFSQueue = require('../models/fcfsQueueModel');
const Vendor = require('../models/vendorModel');
const VendorWallet = require('../models/vendorWalletModel');
const { logAction } = require('./auditService');

/**
 * Ensure vendor is registered in FCFS priority queue
 * @param {ObjectId|string} vendorId
 * @param {ClientSession} session Optional mongoose session
 */
const syncVendorToQueue = async (vendorId, session = null) => {
  let entry = await FCFSQueue.findOne({ vendorId }).session(session);
  if (!entry) {
    const highestPosDoc = await FCFSQueue.findOne().sort({ priorityPosition: -1 }).session(session);
    const nextPos = highestPosDoc ? highestPosDoc.priorityPosition + 1 : 1;

    const created = await FCFSQueue.create(
      [
        {
          vendorId,
          priorityPosition: nextPos,
          isActive: true,
          consecutiveSkips: 0
        }
      ],
      { session }
    );
    entry = Array.isArray(created) ? created[0] : created;
  }
  return entry;
};

/**
 * Move vendor to the end (last position) of the FCFS Queue upon approved qualifying top-up.
 * Vendor with earliest approved top-up stays at top priority (#1).
 * When vendor tops up again, they rotate to the last position.
 * 
 * @param {ObjectId|string} vendorId
 * @param {ClientSession} session Optional mongoose session
 */
const moveVendorToEndOfQueue = async (vendorId, session = null) => {
  let entry = await FCFSQueue.findOne({ vendorId }).session(session);
  
  if (!entry) {
    // If vendor was not in queue, sync them to the next highest position (end of queue)
    return await syncVendorToQueue(vendorId, session);
  }

  const oldPos = entry.priorityPosition;
  const highestPosDoc = await FCFSQueue.findOne().sort({ priorityPosition: -1 }).session(session);
  const maxPos = highestPosDoc ? highestPosDoc.priorityPosition : 1;

  if (oldPos < maxPos) {
    // Shift all vendors behind oldPos up by 1 position (-1 priorityPosition number)
    await FCFSQueue.updateMany(
      { priorityPosition: { $gt: oldPos, $lte: maxPos } },
      { $inc: { priorityPosition: -1 } },
      { session }
    );
    entry.priorityPosition = maxPos;
  }

  // Reset consecutive skips on fresh qualifying top-up
  entry.consecutiveSkips = 0;
  await entry.save({ session });

  return entry;
};

/**
 * Get FCFS Queue list with Vendor profile, Bank Details, Wallets, and live Wallet balances
 * Automatically synchronizes all registered vendors into the queue so no vendor is missed.
 */
const getQueue = async ({ isActive, page = 1, limit = 500 } = {}) => {
  // 1. Synchronize all vendors in database to FCFS queue
  const allVendors = await Vendor.find({});
  const existingQueueEntries = await FCFSQueue.find({});
  const queuedVendorIdMap = new Map(existingQueueEntries.map(q => [q.vendorId ? q.vendorId.toString() : '', q]));

  // Clean up any orphaned queue entries whose vendor no longer exists
  const validVendorIdSet = new Set(allVendors.map(v => v._id.toString()));
  const orphanedQueueIds = existingQueueEntries
    .filter(q => !q.vendorId || !validVendorIdSet.has(q.vendorId.toString()))
    .map(q => q._id);
  if (orphanedQueueIds.length > 0) {
    await FCFSQueue.deleteMany({ _id: { $in: orphanedQueueIds } });
  }

  // Identify unqueued vendors and append them to the queue
  const unqueuedVendors = allVendors.filter(v => !queuedVendorIdMap.has(v._id.toString()));
  if (unqueuedVendors.length > 0) {
    let maxPos = existingQueueEntries.reduce((max, q) => Math.max(max, q.priorityPosition || 0), 0);
    const newDocs = [];
    for (const v of unqueuedVendors) {
      maxPos++;
      newDocs.push({
        vendorId: v._id,
        priorityPosition: maxPos,
        isActive: v.isActive !== false,
        consecutiveSkips: 0
      });
    }
    if (newDocs.length > 0) {
      await FCFSQueue.insertMany(newDocs);
    }
  }

  const query = {};
  if (isActive !== undefined) {
    query.isActive = isActive === 'true' || isActive === true;
  }

  const numPage = Math.max(1, parseInt(page, 10) || 1);
  const numLimit = Math.max(1, Math.min(1000, parseInt(limit, 10) || 500));
  const skip = (numPage - 1) * numLimit;

  const [queueItems, total] = await Promise.all([
    FCFSQueue.find(query)
      .sort({ priorityPosition: 1 })
      .skip(skip)
      .limit(numLimit)
      .populate('vendorId', 'firstName lastName email mobileNumber profilePhoto bankAccounts wallets verificationStatus isActive'),
    FCFSQueue.countDocuments(query)
  ]);

  // Attach live wallet balance, active bank accounts, active wallets, and eligibility status to each queue entry
  const enrichedItems = await Promise.all(
    queueItems.map(async (item, index) => {
      const itemObj = item.toObject();
      const vendor = itemObj.vendorId;

      if (vendor) {
        const wallet = await VendorWallet.findOne({ vendorId: vendor._id });
        const balance = wallet ? Number(wallet.balance) || 0 : 0;
        const lockedBalance = wallet ? Number(wallet.lockedBalance) || 0 : 0;
        const availableBalance = Math.max(0, balance - lockedBalance);

        itemObj.wallet = {
          balance,
          lockedBalance,
          availableBalance
        };

        // Filter active bank accounts & wallets
        const activeBankAccounts = Array.isArray(vendor.bankAccounts)
          ? vendor.bankAccounts.filter(b => b.isActive !== false)
          : [];
        const activeWallets = Array.isArray(vendor.wallets)
          ? vendor.wallets.filter(w => w.isActive !== false)
          : [];

        itemObj.bankAccounts = activeBankAccounts;
        itemObj.wallets = activeWallets;

        // Determine if vendor is fully eligible for immediate payment allocation
        const hasPaymentDestinations = activeBankAccounts.length > 0 || activeWallets.length > 0;
        itemObj.isEligible = Boolean(
          vendor.isActive &&
          vendor.verificationStatus === 'approved' &&
          availableBalance > 0 &&
          hasPaymentDestinations
        );

        if (!vendor.isActive) {
          itemObj.eligibilityReason = 'Vendor account inactive';
        } else if (vendor.verificationStatus !== 'approved') {
          itemObj.eligibilityReason = 'KYC verification pending/rejected';
        } else if (availableBalance <= 0) {
          itemObj.eligibilityReason = 'Zero available wallet balance';
        } else if (!hasPaymentDestinations) {
          itemObj.eligibilityReason = 'No active bank account or wallet added';
        } else {
          itemObj.eligibilityReason = 'Eligible and ready for allocation';
        }
      } else {
        itemObj.wallet = { balance: 0, lockedBalance: 0, availableBalance: 0 };
        itemObj.bankAccounts = [];
        itemObj.wallets = [];
        itemObj.isEligible = false;
        itemObj.eligibilityReason = 'Vendor not linked';
      }

      // Display rank (1-indexed based on position)
      itemObj.rank = itemObj.priorityPosition;

      return itemObj;
    })
  );

  return {
    queue: enrichedItems,
    pagination: {
      total,
      page: numPage,
      limit: numLimit,
      totalPages: Math.ceil(total / numLimit)
    }
  };
};

/**
 * Reorder Vendor priority in FCFS Queue (SuperAdmin only)
 * Supports:
 * - Single vendor: reorderQueue(vendorId, newPriorityPosition, adminId) OR reorderQueue({ vendorId, newPriorityPosition }, adminId)
 * - Batch array: reorderQueue({ vendorOrder: [id1, id2, ...] }, adminId)
 */
const reorderQueue = async (paramsOrVendorId, newPriorityPositionOrAdminId, maybeAdminId) => {
  let vendorId = null;
  let newPriorityPosition = null;
  let vendorOrder = null;
  let adminId = null;

  if (paramsOrVendorId && typeof paramsOrVendorId === 'object' && !mongoose.Types.ObjectId.isValid(paramsOrVendorId)) {
    vendorId = paramsOrVendorId.vendorId;
    newPriorityPosition = paramsOrVendorId.newPriorityPosition;
    vendorOrder = paramsOrVendorId.vendorOrder;
    adminId = newPriorityPositionOrAdminId;
  } else {
    vendorId = paramsOrVendorId;
    newPriorityPosition = newPriorityPositionOrAdminId;
    adminId = maybeAdminId;
  }

  // Handle batch vendor order array
  if (Array.isArray(vendorOrder) && vendorOrder.length > 0) {
    const updates = vendorOrder.map((vId, idx) =>
      FCFSQueue.updateOne(
        { vendorId: vId },
        { $set: { priorityPosition: idx + 1 } }
      )
    );
    await Promise.all(updates);

    await logAction({
      actor: adminId,
      actorRole: 'super_admin',
      action: 'FCFS_PRIORITY_BATCH_REORDERED',
      targetType: 'FCFSQueue',
      targetId: adminId,
      metadata: { vendorOrder }
    });

    return { reorderedCount: vendorOrder.length };
  }

  // Handle single vendor move
  if (!vendorId || !newPriorityPosition) {
    throw new Error('Please provide vendorId and newPriorityPosition, or vendorOrder array');
  }

  const targetPos = Math.max(1, parseInt(newPriorityPosition, 10));
  const currentEntry = await FCFSQueue.findOne({ vendorId });

  if (!currentEntry) {
    throw new Error('Vendor is not found in FCFS queue');
  }

  const oldPos = currentEntry.priorityPosition;
  if (oldPos === targetPos) {
    return currentEntry;
  }

  // Shift other queue items
  if (oldPos < targetPos) {
    await FCFSQueue.updateMany(
      { priorityPosition: { $gt: oldPos, $lte: targetPos } },
      { $inc: { priorityPosition: -1 } }
    );
  } else {
    await FCFSQueue.updateMany(
      { priorityPosition: { $gte: targetPos, $lt: oldPos } },
      { $inc: { priorityPosition: 1 } }
    );
  }

  currentEntry.priorityPosition = targetPos;
  await currentEntry.save();

  await logAction({
    actor: adminId,
    actorRole: 'super_admin',
    action: 'FCFS_PRIORITY_REORDERED',
    targetType: 'FCFSQueue',
    targetId: currentEntry._id,
    metadata: { vendorId, oldPosition: oldPos, newPosition: targetPos }
  });

  return currentEntry;
};

/**
 * Get Vendor's individual FCFS Queue Status
 */
const getVendorQueueStatus = async (vendorId) => {
  let entry = await FCFSQueue.findOne({ vendorId });
  if (!entry) {
    entry = await syncVendorToQueue(vendorId);
  }

  const totalActiveInQueue = await FCFSQueue.countDocuments({ isActive: true });
  const higherPriorityCount = await FCFSQueue.countDocuments({
    isActive: true,
    priorityPosition: { $lt: entry.priorityPosition }
  });

  const wallet = await VendorWallet.findOne({ vendorId });
  const availableBalance = wallet ? Math.max(0, wallet.balance - wallet.lockedBalance) : 0;

  return {
    priorityPosition: entry.priorityPosition,
    aheadInQueue: higherPriorityCount,
    totalVendorsInQueue: totalActiveInQueue,
    isQueueActive: entry.isActive,
    lastAllocatedAt: entry.lastAllocatedAt,
    consecutiveSkips: entry.consecutiveSkips,
    totalAllocatedTransactions: entry.totalAllocatedTransactions,
    totalAllocatedVolume: entry.totalAllocatedVolume,
    availableBalance
  };
};

module.exports = {
  syncVendorToQueue,
  moveVendorToEndOfQueue,
  getQueue,
  reorderQueue,
  getVendorQueueStatus
};
