const VendorTier = require('../models/vendorTierModel');

/**
 * Seed Default Vendor Tiers if table is empty
 */
const seedDefaultTiers = async () => {
  try {
    const count = await VendorTier.countDocuments();
    if (count === 0) {
      const defaultTiers = [
        {
          name: 'Bronze',
          minAmount: 0,
          maxAmount: 50000,
          commissionPercentage: 1.0,
          priorityRank: 1,
          description: 'Entry-level vendor tier (Up to ₹50,000)'
        },
        {
          name: 'Silver',
          minAmount: 50001,
          maxAmount: 200000,
          commissionPercentage: 1.5,
          priorityRank: 2,
          description: 'Mid-level vendor tier (₹50,001 to ₹2,00,000)'
        },
        {
          name: 'Gold',
          minAmount: 200001,
          maxAmount: 500000,
          commissionPercentage: 2.0,
          priorityRank: 3,
          description: 'High-volume vendor tier (₹2,00,001 to ₹5,00,000)'
        },
        {
          name: 'Platinum',
          minAmount: 500001,
          maxAmount: 100000000,
          commissionPercentage: 2.5,
          priorityRank: 4,
          description: 'Premium enterprise vendor tier (Above ₹5,00,000)'
        }
      ];

      await VendorTier.insertMany(defaultTiers);
      console.log('🏷️ Default Vendor Tiers seeded successfully.');
    }
  } catch (err) {
    console.error('seedDefaultTiers Error:', err.message);
  }
};

/**
 * Determine applicable tier and commission percentage for a transaction amount
 * @param {Number} amount
 * @returns {Promise<Object>}
 */
const getApplicableTier = async (amount) => {
  const numericAmount = Number(amount) || 0;
  
  // Find matching active tier
  let tier = await VendorTier.findOne({
    isActive: true,
    minAmount: { $lte: numericAmount },
    maxAmount: { $gte: numericAmount }
  }).sort({ priorityRank: -1 });

  // Fallback to highest active tier if above max or default
  if (!tier) {
    tier = await VendorTier.findOne({ isActive: true }).sort({ minAmount: 1 });
  }

  if (!tier) {
    // Hard fallback if no DB tiers exist
    return {
      tierName: 'Standard',
      commissionPercentage: 1.0
    };
  }

  return {
    tierName: tier.name,
    commissionPercentage: tier.commissionPercentage
  };
};

/**
 * Get all tiers
 */
const getAllTiers = async (filter = {}) => {
  return await VendorTier.find(filter).sort({ priorityRank: 1 });
};

/**
 * Create a new tier (SuperAdmin)
 */
const createTier = async (data) => {
  return await VendorTier.create(data);
};

/**
 * Update a tier (SuperAdmin)
 */
const updateTier = async (id, data) => {
  return await VendorTier.findByIdAndUpdate(id, data, { new: true, runValidators: true });
};

module.exports = {
  seedDefaultTiers,
  getApplicableTier,
  getAllTiers,
  createTier,
  updateTier
};
