const VendorTier = require('../models/vendorTierModel');
const { logAction } = require('./auditService');

/**
 * Seed Default Vendor Tiers if table is empty
 */
const seedDefaultTiers = async () => {
  try {
    // Remove any outdated/legacy tier schemas missing displayName
    await VendorTier.deleteMany({ displayName: { $in: [null, undefined] } });

    const count = await VendorTier.countDocuments();
    if (count === 0) {
      const defaultTiers = [
        // 1. Bronze (V to I)
        { name: 'Bronze', divisionGroup: 'Bronze', level: 'V', displayName: 'Bronze V', minTopUp: 0, maxTopUp: 20000, commissionRate: 1.0, orderPriority: 1, description: 'Entry-level Tier (₹0 - ₹20,000)' },
        { name: 'Bronze', divisionGroup: 'Bronze', level: 'IV', displayName: 'Bronze IV', minTopUp: 20001, maxTopUp: 50000, commissionRate: 1.1, orderPriority: 2, description: 'Bronze Tier IV (₹20,001 - ₹50,000)' },
        { name: 'Bronze', divisionGroup: 'Bronze', level: 'III', displayName: 'Bronze III', minTopUp: 50001, maxTopUp: 100000, commissionRate: 1.2, orderPriority: 3, description: 'Bronze Tier III (₹50,001 - ₹1,00,000)' },
        { name: 'Bronze', divisionGroup: 'Bronze', level: 'II', displayName: 'Bronze II', minTopUp: 100001, maxTopUp: 150000, commissionRate: 1.3, orderPriority: 4, description: 'Bronze Tier II (₹1,00,001 - ₹1,50,000)' },
        { name: 'Bronze', divisionGroup: 'Bronze', level: 'I', displayName: 'Bronze I', minTopUp: 150001, maxTopUp: 200000, commissionRate: 1.4, orderPriority: 5, description: 'Bronze Tier I (₹1,50,001 - ₹2,00,000)' },

        // 2. Silver (V to I)
        { name: 'Silver', divisionGroup: 'Silver', level: 'V', displayName: 'Silver V', minTopUp: 200001, maxTopUp: 300000, commissionRate: 1.5, orderPriority: 6, description: 'Silver Tier V (₹2,00,001 - ₹3,00,000)' },
        { name: 'Silver', divisionGroup: 'Silver', level: 'IV', displayName: 'Silver IV', minTopUp: 300001, maxTopUp: 400000, commissionRate: 1.6, orderPriority: 7, description: 'Silver Tier IV (₹3,00,001 - ₹4,00,000)' },
        { name: 'Silver', divisionGroup: 'Silver', level: 'III', displayName: 'Silver III', minTopUp: 400001, maxTopUp: 500000, commissionRate: 1.7, orderPriority: 8, description: 'Silver Tier III (₹4,00,001 - ₹5,00,000)' },
        { name: 'Silver', divisionGroup: 'Silver', level: 'II', displayName: 'Silver II', minTopUp: 500001, maxTopUp: 600000, commissionRate: 1.8, orderPriority: 9, description: 'Silver Tier II (₹5,00,001 - ₹6,00,000)' },
        { name: 'Silver', divisionGroup: 'Silver', level: 'I', displayName: 'Silver I', minTopUp: 600001, maxTopUp: 700000, commissionRate: 1.9, orderPriority: 10, description: 'Silver Tier I (₹6,00,001 - ₹7,00,000)' },

        // 3. Gold (V to I)
        { name: 'Gold', divisionGroup: 'Gold', level: 'V', displayName: 'Gold V', minTopUp: 700001, maxTopUp: 900000, commissionRate: 2.0, orderPriority: 11, description: 'Gold Tier V (₹7,00,001 - ₹9,00,000)' },
        { name: 'Gold', divisionGroup: 'Gold', level: 'IV', displayName: 'Gold IV', minTopUp: 900001, maxTopUp: 1100000, commissionRate: 2.1, orderPriority: 12, description: 'Gold Tier IV (₹9,00,001 - ₹11,00,000)' },
        { name: 'Gold', divisionGroup: 'Gold', level: 'III', displayName: 'Gold III', minTopUp: 1100001, maxTopUp: 1300000, commissionRate: 2.2, orderPriority: 13, description: 'Gold Tier III (₹11,00,001 - ₹13,00,000)' },
        { name: 'Gold', divisionGroup: 'Gold', level: 'II', displayName: 'Gold II', minTopUp: 1300001, maxTopUp: 1500000, commissionRate: 2.3, orderPriority: 14, description: 'Gold Tier II (₹13,00,001 - ₹15,00,000)' },
        { name: 'Gold', divisionGroup: 'Gold', level: 'I', displayName: 'Gold I', minTopUp: 1500001, maxTopUp: 1800000, commissionRate: 2.4, orderPriority: 15, description: 'Gold Tier I (₹15,00,001 - ₹18,00,000)' },

        // 4. Platinum (V to I)
        { name: 'Platinum', divisionGroup: 'Platinum', level: 'V', displayName: 'Platinum V', minTopUp: 1800001, maxTopUp: 2200000, commissionRate: 2.5, orderPriority: 16, description: 'Platinum Tier V (₹18,00,001 - ₹22,00,000)' },
        { name: 'Platinum', divisionGroup: 'Platinum', level: 'IV', displayName: 'Platinum IV', minTopUp: 2200001, maxTopUp: 2600000, commissionRate: 2.6, orderPriority: 17, description: 'Platinum Tier IV (₹22,00,001 - ₹26,00,000)' },
        { name: 'Platinum', divisionGroup: 'Platinum', level: 'III', displayName: 'Platinum III', minTopUp: 2600001, maxTopUp: 3000000, commissionRate: 2.7, orderPriority: 18, description: 'Platinum Tier III (₹26,00,001 - ₹30,00,000)' },
        { name: 'Platinum', divisionGroup: 'Platinum', level: 'II', displayName: 'Platinum II', minTopUp: 3000001, maxTopUp: 3500000, commissionRate: 2.8, orderPriority: 19, description: 'Platinum Tier II (₹30,00,001 - ₹35,00,000)' },
        { name: 'Platinum', divisionGroup: 'Platinum', level: 'I', displayName: 'Platinum I', minTopUp: 3500001, maxTopUp: 4000000, commissionRate: 2.9, orderPriority: 20, description: 'Platinum Tier I (₹35,00,001 - ₹40,00,000)' },

        // 5. Diamond (V to I)
        { name: 'Diamond', divisionGroup: 'Diamond', level: 'V', displayName: 'Diamond V', minTopUp: 4000001, maxTopUp: 4600000, commissionRate: 3.0, orderPriority: 21, description: 'Diamond Tier V (₹40,00,001 - ₹46,00,000)' },
        { name: 'Diamond', divisionGroup: 'Diamond', level: 'IV', displayName: 'Diamond IV', minTopUp: 4600001, maxTopUp: 5200000, commissionRate: 3.1, orderPriority: 22, description: 'Diamond Tier IV (₹46,00,001 - ₹52,00,000)' },
        { name: 'Diamond', divisionGroup: 'Diamond', level: 'III', displayName: 'Diamond III', minTopUp: 5200001, maxTopUp: 5800000, commissionRate: 3.2, orderPriority: 23, description: 'Diamond Tier III (₹52,00,001 - ₹58,00,000)' },
        { name: 'Diamond', divisionGroup: 'Diamond', level: 'II', displayName: 'Diamond II', minTopUp: 5800001, maxTopUp: 6500000, commissionRate: 3.3, orderPriority: 24, description: 'Diamond Tier II (₹58,00,001 - ₹65,00,000)' },
        { name: 'Diamond', divisionGroup: 'Diamond', level: 'I', displayName: 'Diamond I', minTopUp: 6500001, maxTopUp: 7500000, commissionRate: 3.4, orderPriority: 25, description: 'Diamond Tier I (₹65,00,001 - ₹75,00,000)' },

        // 6. Crown (V to I)
        { name: 'Crown', divisionGroup: 'Crown', level: 'V', displayName: 'Crown V', minTopUp: 7500001, maxTopUp: 8500000, commissionRate: 3.5, orderPriority: 26, description: 'Crown Tier V (₹75,00,001 - ₹85,00,000)' },
        { name: 'Crown', divisionGroup: 'Crown', level: 'IV', displayName: 'Crown IV', minTopUp: 8500001, maxTopUp: 10000000, commissionRate: 3.6, orderPriority: 27, description: 'Crown Tier IV (₹85,00,001 - ₹1,00,00,000)' },
        { name: 'Crown', divisionGroup: 'Crown', level: 'III', displayName: 'Crown III', minTopUp: 10000001, maxTopUp: 12000000, commissionRate: 3.7, orderPriority: 28, description: 'Crown Tier III (₹1,00,00,001 - ₹1,20,00,000)' },
        { name: 'Crown', divisionGroup: 'Crown', level: 'II', displayName: 'Crown II', minTopUp: 12000001, maxTopUp: 14000000, commissionRate: 3.8, orderPriority: 29, description: 'Crown Tier II (₹1,20,00,001 - ₹1,40,00,000)' },
        { name: 'Crown', divisionGroup: 'Crown', level: 'I', displayName: 'Crown I', minTopUp: 14000001, maxTopUp: 17000000, commissionRate: 3.9, orderPriority: 30, description: 'Crown Tier I (₹1,40,00,001 - ₹1,70,00,000)' },

        // 7. Ace (Top Pinnacle Rank)
        { name: 'Ace', divisionGroup: 'Ace', level: null, displayName: 'Ace', minTopUp: 17000001, maxTopUp: 1000000000, commissionRate: 4.0, orderPriority: 31, description: 'Ace Master Tier (Above ₹1,70,00,000)' }
      ];

      await VendorTier.insertMany(defaultTiers);
      console.log(`🏷️ Seeded ${defaultTiers.length} default Vendor Tiers successfully.`);
    }
  } catch (err) {
    console.error('seedDefaultTiers Error:', err.message);
  }
};

/**
 * Validate that tier ranges do not overlap with any other active tiers
 */
const validateTierRanges = async (minTopUp, maxTopUp, excludeTierId = null) => {
  const min = Number(minTopUp);
  const max = Number(maxTopUp);

  if (isNaN(min) || isNaN(max)) {
    throw new Error('minTopUp and maxTopUp must be valid numbers');
  }

  if (min < 0 || max < 0) {
    throw new Error('Tier amounts cannot be negative');
  }

  if (min > max) {
    throw new Error(`minTopUp (₹${min}) cannot be greater than maxTopUp (₹${max})`);
  }

  const query = { isActive: true };
  if (excludeTierId) {
    query._id = { $ne: excludeTierId };
  }

  const existingActiveTiers = await VendorTier.find(query);

  for (const tier of existingActiveTiers) {
    // Check if [min, max] overlaps with [tier.minTopUp, tier.maxTopUp]
    const isOverlapping = min <= tier.maxTopUp && max >= tier.minTopUp;
    if (isOverlapping) {
      throw new Error(
        `Tier range [₹${min.toLocaleString('en-IN')} - ₹${max.toLocaleString('en-IN')}] overlaps with existing active tier "${tier.displayName}" [₹${tier.minTopUp.toLocaleString('en-IN')} - ₹${tier.maxTopUp.toLocaleString('en-IN')}]. Overlapping active tier ranges are not allowed.`
      );
    }
  }
};

/**
 * Get all tiers
 */
const getAllTiers = async (filter = {}) => {
  return await VendorTier.find(filter).sort({ orderPriority: 1 });
};

/**
 * Get tier by ID
 */
const getTierById = async (id) => {
  const tier = await VendorTier.findById(id);
  if (!tier) throw new Error('Tier not found');
  return tier;
};

/**
 * Create a new tier (SuperAdmin)
 */
const createTier = async (data, adminId = null) => {
  const {
    name,
    divisionGroup,
    level,
    displayName,
    minTopUp,
    maxTopUp,
    commissionRate,
    orderPriority,
    icon,
    description,
    isActive = true
  } = data;

  const resolvedName = name || divisionGroup || 'Custom';
  const resolvedDisplayName = displayName || (level ? `${resolvedName} ${level}` : resolvedName);
  const resolvedMin = Number(minTopUp !== undefined ? minTopUp : data.minAmount || 0);
  const resolvedMax = Number(maxTopUp !== undefined ? maxTopUp : data.maxAmount || 0);
  const resolvedCommission = Number(commissionRate !== undefined ? commissionRate : data.commissionPercentage || 1.0);
  const resolvedPriority = Number(orderPriority !== undefined ? orderPriority : data.priorityRank || 1);

  if (isActive) {
    await validateTierRanges(resolvedMin, resolvedMax);
  }

  const tier = await VendorTier.create({
    name: resolvedName,
    divisionGroup: divisionGroup || resolvedName,
    level: level || null,
    displayName: resolvedDisplayName,
    minTopUp: resolvedMin,
    maxTopUp: resolvedMax,
    commissionRate: resolvedCommission,
    orderPriority: resolvedPriority,
    icon: icon || null,
    description: description || null,
    isActive,
    createdBy: adminId,
    updatedBy: adminId
  });

  if (adminId) {
    await logAction({
      actor: adminId,
      actorRole: 'super_admin',
      action: 'TIER_CREATED',
      targetType: 'VendorTier',
      targetId: tier._id,
      metadata: { displayName: tier.displayName, minTopUp: resolvedMin, maxTopUp: resolvedMax, commissionRate: resolvedCommission }
    });
  }

  return tier;
};

/**
 * Update a tier (SuperAdmin)
 */
const updateTier = async (id, data, adminId = null) => {
  const existingTier = await VendorTier.findById(id);
  if (!existingTier) {
    throw new Error('Vendor tier not found');
  }

  const newMin = data.minTopUp !== undefined ? Number(data.minTopUp) : (data.minAmount !== undefined ? Number(data.minAmount) : existingTier.minTopUp);
  const newMax = data.maxTopUp !== undefined ? Number(data.maxTopUp) : (data.maxAmount !== undefined ? Number(data.maxAmount) : existingTier.maxTopUp);
  const newIsActive = data.isActive !== undefined ? Boolean(data.isActive) : existingTier.isActive;

  if (newIsActive) {
    await validateTierRanges(newMin, newMax, id);
  }

  const updateFields = {
    ...data,
    minTopUp: newMin,
    maxTopUp: newMax,
    commissionRate: data.commissionRate !== undefined ? Number(data.commissionRate) : (data.commissionPercentage !== undefined ? Number(data.commissionPercentage) : existingTier.commissionRate),
    orderPriority: data.orderPriority !== undefined ? Number(data.orderPriority) : (data.priorityRank !== undefined ? Number(data.priorityRank) : existingTier.orderPriority),
    updatedBy: adminId
  };

  const updatedTier = await VendorTier.findByIdAndUpdate(id, updateFields, {
    new: true,
    runValidators: true
  });

  if (adminId) {
    await logAction({
      actor: adminId,
      actorRole: 'super_admin',
      action: 'TIER_UPDATED',
      targetType: 'VendorTier',
      targetId: updatedTier._id,
      metadata: updateFields
    });
  }

  return updatedTier;
};

/**
 * Delete tier (SuperAdmin) - safely deactivates or removes
 */
const deleteTier = async (id, adminId = null) => {
  const tier = await VendorTier.findById(id);
  if (!tier) throw new Error('Tier not found');

  await VendorTier.findByIdAndDelete(id);

  if (adminId) {
    await logAction({
      actor: adminId,
      actorRole: 'super_admin',
      action: 'TIER_DELETED',
      targetType: 'VendorTier',
      targetId: id,
      metadata: { displayName: tier.displayName }
    });
  }

  return { success: true, message: `Tier "${tier.displayName}" deleted successfully` };
};

module.exports = {
  seedDefaultTiers,
  validateTierRanges,
  getAllTiers,
  getTierById,
  createTier,
  updateTier,
  deleteTier
};
