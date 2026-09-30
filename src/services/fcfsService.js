const FCFSQueue = require('../models/fcfsQueueModel');
const Vendor = require('../models/vendorModel');
const VendorWallet = require('../models/vendorWalletModel');
const { logAction } = require('./auditService');

/**
 * Ensure vendor is registered in FCFS priority queue
 * @param {ObjectId|string} vendorId
 */
const syncVendorToQueue = async (vendorId) => {
  let entry = await FCFSQueue.findOne({ vendorId });
  if (!entry) {
    const highestPosDoc = await FCFSQueue.findOne().sort({ priorityPosition: -1 });
    const nextPos = highestPosDoc ? highestPosDoc.priorityPosition + 1 : 1;

    entry = await FCFSQueue.create({
      vendorId,
      priorityPosition: nextPos,
      isActive: true,
      consecutiveSkips: 0
    });
  }
  return entry;
};

/**
 * Get FCFS Queue list with Vendor profile and Wallet balances
 */
const getQueue = async ({ isActive, page = 1, limit = 50 } = {}) => {
  const query = {};
  if (isActive !== undefined) {
    query.isActive = isActive === 'true' || isActive === true;
  }

  const numPage = Math.max(1, parseInt(page, 10) || 1);
  const numLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
  const skip = (numPage - 1) * numLimit;

  const [queueItems, total] = await Promise.all([
    FCFSQueue.find(query)
      .sort({ priorityPosition: 1 })
      .skip(skip)
      .limit(numLimit)
      .populate('vendorId', 'firstName lastName email mobileNumber verificationStatus isActive'),
    FCFSQueue.countDocuments(query)
  ]);

  // Attach live wallet balance to each queue entry
  const enrichedItems = await Promise.all(
    queueItems.map(async (item) => {
      const itemObj = item.toObject();
      if (item.vendorId) {
        const wallet = await VendorWallet.findOne({ vendorId: item.vendorId._id });
        itemObj.wallet = wallet
          ? {
              balance: wallet.balance,
              availableBalance: Math.max(0, wallet.balance - wallet.lockedBalance)
            }
          : { balance: 0, availableBalance: 0 };
      }
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
 * @param {ObjectId|string} vendorId
 * @param {Number} newPriorityPosition
 * @param {ObjectId|string} adminId
 */
const reorderQueue = async (vendorId, newPriorityPosition, adminId) => {
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
  getQueue,
  reorderQueue,
  getVendorQueueStatus
};
