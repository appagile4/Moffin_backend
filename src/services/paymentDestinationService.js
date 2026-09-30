const PaymentDestination = require('../models/paymentDestinationModel');

/**
 * Create a new company payment destination (SuperAdmin)
 */
const createDestination = async (data, adminId) => {
  const type = data.type || data.destinationType || (data.bankName ? 'bank' : 'wallet');
  const name = data.name || (type === 'bank' ? data.bankName : data.walletName) || 'Company Destination';

  const destination = new PaymentDestination({
    ...data,
    type,
    name,
    createdBy: adminId,
    updatedBy: adminId
  });
  return await destination.save();
};

/**
 * Get all payment destinations with optional filter (e.g. { isActive: true })
 */
const getAllDestinations = async (filter = {}) => {
  return await PaymentDestination.find(filter).sort({ createdAt: -1 });
};

/**
 * Get single destination by ID
 */
const getDestinationById = async (id) => {
  return await PaymentDestination.findById(id);
};

/**
 * Update payment destination
 */
const updateDestination = async (id, data, adminId) => {
  return await PaymentDestination.findByIdAndUpdate(
    id,
    {
      ...data,
      updatedBy: adminId
    },
    { new: true, runValidators: true }
  );
};

/**
 * Delete payment destination
 */
const deleteDestination = async (id) => {
  return await PaymentDestination.findByIdAndDelete(id);
};

module.exports = {
  createDestination,
  getAllDestinations,
  getDestinationById,
  updateDestination,
  deleteDestination
};
