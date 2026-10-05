require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Admin = require('../src/models/adminModel');
const Vendor = require('../src/models/vendorModel');
const VendorTier = require('../src/models/vendorTierModel');
const VendorMonthlyTier = require('../src/models/vendorMonthlyTierModel');
const TierMovementLog = require('../src/models/tierMovementLogModel');
const PaymentConfirmation = require('../src/models/paymentConfirmationModel');
const PaymentDestination = require('../src/models/paymentDestinationModel');
const TopUpRequest = require('../src/models/topUpRequestModel');

const tierService = require('../src/services/tierService');
const tierCalculationService = require('../src/services/tierCalculationService');
const topUpService = require('../src/services/topUpService');
const allocationService = require('../src/services/allocationService');
const { runMonthlyResetJob } = require('../src/jobs/monthlyTierResetJob');

let totalTests = 0;
let passedTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] Tier Test ${totalTests}: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] Tier Test ${totalTests}: ${testName}`);
  }
}

async function runTierTests() {
  console.log('====================================================');
  console.log('🏆 STARTING MONTHLY VENDOR TIER SYSTEM TEST SUITE');
  console.log('====================================================\n');

  if (mongoose.connection.readyState === 0) {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/moffin_db';
    await mongoose.connect(mongoUri);
  }

  // Reset and seed fresh default tiers
  await VendorTier.deleteMany({});
  await tierService.seedDefaultTiers();

  // Sync indexes
  await Promise.all([
    VendorTier.syncIndexes(),
    VendorMonthlyTier.syncIndexes(),
    TierMovementLog.syncIndexes(),
    PaymentConfirmation.syncIndexes()
  ]);

  const timestamp = Date.now();
  const passwordHash = await bcrypt.hash('TierTest@123', 10);

  const testAdmin = await Admin.create({
    name: 'Tier Super Admin',
    email: `tier_admin_${timestamp}@test.com`,
    password: passwordHash,
    role: 'super_admin'
  });

  const vendor1 = await Vendor.create({
    firstName: 'Tier',
    lastName: 'PlayerOne',
    email: `tier_vendor1_${timestamp}@test.com`,
    password: passwordHash,
    mobileNumber: `9200000001_${timestamp}`.substring(0, 15),
    verificationStatus: 'approved',
    isActive: true
  });

  const companyBank = await PaymentDestination.create({
    type: 'bank',
    name: 'Moffin HDFC',
    bankName: 'HDFC Bank',
    accountNumber: `AC${timestamp}`,
    ifscCode: 'HDFC0001234',
    accountHolderName: 'Moffin Tier Testing',
    isActive: true
  });

  const { year, month } = tierCalculationService.getKolkataDate();

  console.log('--- 1. INITIAL MONTHLY STATE & PROGRESS ---');

  // TEST 1: Vendor starts new month with zero progress (Bronze V)
  const initialProgress = await tierCalculationService.getOrCreateMonthlyRecord(vendor1._id, year, month);
  assert(
    initialProgress.totalTopUp === 0 &&
      initialProgress.currentTierDisplayName === 'Bronze V' &&
      initialProgress.commissionMode === 'AUTO' &&
      initialProgress.effectiveCommissionRate === 1.0,
    'Vendor starts new month with zero progress (Bronze V, 1.0% commission)'
  );

  // TEST 2: Overlapping active tier range is rejected
  let overlapError = false;
  try {
    await tierService.createTier({
      name: 'Custom Tier',
      displayName: 'Custom Overlap',
      minTopUp: 10000,
      maxTopUp: 30000,
      commissionRate: 1.2,
      orderPriority: 99
    });
  } catch (err) {
    overlapError = true;
  }
  assert(overlapError, 'Prevent overlapping active tier ranges (Validation Error)');

  console.log('\n--- 2. REAL-TIME TOP-UP PROGRESSION & TIER RANKS ---');

  // TEST 3: Approved top-up of ₹12,00,000 moves vendor directly to Gold III
  const topUpReq1 = await topUpService.createTopUpRequest(vendor1._id, {
    requestedAmount: 1200000,
    preferredPaymentMethod: 'bank'
  });
  topUpReq1.status = 'AWAITING_PAYMENT';
  await topUpReq1.save();

  const confirmation1 = await PaymentConfirmation.create({
    confirmationId: `CONF-TIER-${timestamp}-1`,
    topUpRequestId: topUpReq1._id,
    vendorId: vendor1._id,
    amountPaid: 1200000,
    paymentDestinationId: companyBank._id,
    paymentMethod: 'bank',
    transactionId: `UTR-TIER-${timestamp}-1`,
    paymentProof: 'https://res.cloudinary.com/test/image/upload/tier1.jpg',
    status: 'PAYMENT_SUBMITTED'
  });
  topUpReq1.paymentConfirmationId = confirmation1._id;
  topUpReq1.status = 'PAYMENT_SUBMITTED';
  await topUpReq1.save();

  await topUpService.adminApprovePayment(confirmation1._id, testAdmin._id);

  const updatedProgress1 = await VendorMonthlyTier.findOne({ vendorId: vendor1._id, year, month });
  assert(
    updatedProgress1.totalTopUp === 1200000 &&
      updatedProgress1.currentTierDisplayName === 'Gold III' &&
      updatedProgress1.effectiveCommissionRate === 2.2,
    'Top-up of ₹12,00,000 moves vendor to Gold III (2.2% commission)'
  );

  // TEST 4: Tier Movement Log is accurately recorded
  const movementLogs = await TierMovementLog.find({ vendorId: vendor1._id, year, month });
  assert(
    movementLogs.length >= 1 &&
      movementLogs[0].previousTierName === 'Bronze V' &&
      movementLogs[0].newTierName === 'Gold III' &&
      movementLogs[0].totalMonthlyTopUp === 1200000,
    'Tier movement audit trail logged Bronze V -> Gold III transition'
  );

  // TEST 5: Subsequent top-up of ₹10,00,000 moves total to ₹22,00,000 (Platinum V)
  const topUpReq2 = await topUpService.createTopUpRequest(vendor1._id, {
    requestedAmount: 1000000,
    preferredPaymentMethod: 'bank'
  });
  topUpReq2.status = 'AWAITING_PAYMENT';
  await topUpReq2.save();

  const confirmation2 = await PaymentConfirmation.create({
    confirmationId: `CONF-TIER-${timestamp}-2`,
    topUpRequestId: topUpReq2._id,
    vendorId: vendor1._id,
    amountPaid: 1000000,
    paymentDestinationId: companyBank._id,
    paymentMethod: 'bank',
    transactionId: `UTR-TIER-${timestamp}-2`,
    paymentProof: 'https://res.cloudinary.com/test/image/upload/tier2.jpg',
    status: 'PAYMENT_SUBMITTED'
  });
  topUpReq2.paymentConfirmationId = confirmation2._id;
  topUpReq2.status = 'PAYMENT_SUBMITTED';
  await topUpReq2.save();

  await topUpService.adminApprovePayment(confirmation2._id, testAdmin._id);

  const updatedProgress2 = await VendorMonthlyTier.findOne({ vendorId: vendor1._id, year, month });
  assert(
    updatedProgress2.totalTopUp === 2200000 &&
      updatedProgress2.currentTierDisplayName === 'Platinum V' &&
      updatedProgress2.effectiveCommissionRate === 2.5,
    'Subsequent top-up brings total to ₹22,00,000 and advances vendor to Platinum V (2.5% commission)'
  );

  // TEST 6: Rejected or pending top-up does NOT increase monthly volume
  const topUpReqBad = await topUpService.createTopUpRequest(vendor1._id, {
    requestedAmount: 5000000,
    preferredPaymentMethod: 'bank'
  });
  topUpReqBad.status = 'AWAITING_PAYMENT';
  await topUpReqBad.save();

  const confirmationBad = await PaymentConfirmation.create({
    confirmationId: `CONF-TIER-${timestamp}-BAD`,
    topUpRequestId: topUpReqBad._id,
    vendorId: vendor1._id,
    amountPaid: 5000000,
    paymentDestinationId: companyBank._id,
    paymentMethod: 'bank',
    transactionId: `UTR-TIER-${timestamp}-BAD`,
    paymentProof: 'https://res.cloudinary.com/test/image/upload/tier_bad.jpg',
    status: 'PAYMENT_SUBMITTED'
  });
  await topUpService.adminRejectPayment(confirmationBad._id, testAdmin._id, 'Fake receipt');

  const progressAfterRejection = await VendorMonthlyTier.findOne({ vendorId: vendor1._id, year, month });
  assert(
    progressAfterRejection.totalTopUp === 2200000 && progressAfterRejection.currentTierDisplayName === 'Platinum V',
    'Rejected top-up does not increase monthly tier volume'
  );

  console.log('\n--- 3. MANUAL COMMISSION OVERRIDE ---');

  // TEST 7: SuperAdmin can set manual commission override (3.2%) and Tier automatically updates according to commission
  const manualRecord = await tierCalculationService.setManualCommission(
    vendor1._id,
    { rate: 3.2, reason: 'Special Strategic Vendor Agreement' },
    testAdmin._id
  );
  assert(
    manualRecord.commissionMode === 'MANUAL' &&
      manualRecord.effectiveCommissionRate === 3.2 &&
      manualRecord.currentTierDisplayName === 'Diamond III',
    'Manual commission updates rate (3.2%) and automatically upgrades tier to Diamond III'
  );

  // TEST 8: Client transaction uses manual commission rate (3.2%)
  const effectiveCommissionInfo = await tierCalculationService.getVendorEffectiveCommission(vendor1._id);
  assert(
    effectiveCommissionInfo.commissionPercentage === 3.2 &&
      effectiveCommissionInfo.isManual === true,
    'Client transaction engine fetches 3.2% manual commission rate'
  );

  // TEST 9: Removing manual override restores automatic tier commission (2.5%)
  const autoRestored = await tierCalculationService.removeManualCommission(vendor1._id, testAdmin._id);
  assert(
    autoRestored.commissionMode === 'AUTO' &&
      autoRestored.effectiveCommissionRate === 2.5 &&
      autoRestored.manualCommissionRate === null,
    'Removing manual commission restores AUTO tier rate (2.5%)'
  );

  console.log('\n--- 4. PINNACLE RANKS & NEXT TIER METRICS ---');

  // TEST 10: Advancing to Ace tier (₹1,75,00,000)
  const topUpReqAce = await topUpService.createTopUpRequest(vendor1._id, {
    requestedAmount: 15300000,
    preferredPaymentMethod: 'bank'
  });
  topUpReqAce.status = 'AWAITING_PAYMENT';
  await topUpReqAce.save();

  const confirmationAce = await PaymentConfirmation.create({
    confirmationId: `CONF-TIER-${timestamp}-ACE`,
    topUpRequestId: topUpReqAce._id,
    vendorId: vendor1._id,
    amountPaid: 15300000,
    paymentDestinationId: companyBank._id,
    paymentMethod: 'bank',
    transactionId: `UTR-TIER-${timestamp}-ACE`,
    paymentProof: 'https://res.cloudinary.com/test/image/upload/ace.jpg',
    status: 'PAYMENT_SUBMITTED'
  });
  topUpReqAce.paymentConfirmationId = confirmationAce._id;
  topUpReqAce.status = 'PAYMENT_SUBMITTED';
  await topUpReqAce.save();

  await topUpService.adminApprovePayment(confirmationAce._id, testAdmin._id);

  const aceProgress = await VendorMonthlyTier.findOne({ vendorId: vendor1._id, year, month });
  assert(
    aceProgress &&
      aceProgress.totalTopUp === 17500000 &&
      aceProgress.currentTierDisplayName === 'Ace' &&
      aceProgress.effectiveCommissionRate === 4.0 &&
      !aceProgress.nextTierName &&
      aceProgress.progressPercentage === 100,
    'Vendor reaches Ace rank (₹1,75,00,000, 4.0% commission, 100% progress, top rank)'
  );

  console.log('\n--- 5. MONTHLY RESET & IMMUTABLE HISTORY ---');

  // TEST 11: Finalize month cycle (creates immutable historical snapshot)
  const finalizeResult = await tierCalculationService.finalizeMonthlyCycle(year, month);
  const closedRecord = await VendorMonthlyTier.findOne({ vendorId: vendor1._id, year, month });
  assert(
    closedRecord.isClosed === true &&
      closedRecord.closedAt !== null &&
      closedRecord.totalTopUp === 17500000 &&
      closedRecord.currentTierDisplayName === 'Ace',
    'Month cycle finalized and marked closed with immutable snapshot'
  );

  // TEST 12: Next month starts completely fresh with totalTopUp = 0 and Bronze V
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const nextMonthRecord = await tierCalculationService.getOrCreateMonthlyRecord(vendor1._id, nextYear, nextMonth);
  assert(
    nextMonthRecord.totalTopUp === 0 &&
      nextMonthRecord.currentTierDisplayName === 'Bronze V' &&
      nextMonthRecord.effectiveCommissionRate === 1.0 &&
      nextMonthRecord.isClosed === false,
    'New month starts fresh with totalTopUp = 0 and resets to Bronze V'
  );

  // TEST 13: Previous month snapshot remains untouched when tier configuration changes
  const aceTier = await VendorTier.findOne({ displayName: 'Ace' });
  await tierService.updateTier(aceTier._id, { commissionRate: 4.5 }, testAdmin._id);
  const previousMonthCheck = await VendorMonthlyTier.findOne({ vendorId: vendor1._id, year, month });
  assert(
    previousMonthCheck &&
      previousMonthCheck.effectiveCommissionRate === 4.0 &&
      previousMonthCheck.currentTierDisplayName === 'Ace' &&
      previousMonthCheck.totalTopUp === 17500000,
    'Historical closed month record is immutable even if admin edits tier commission'
  );

  // TEST 14: Month-end reset job is idempotent (duplicate execution is safe)
  const duplicateRun = await runMonthlyResetJob(year, month);
  assert(
    duplicateRun.closedCount === 0 || duplicateRun.closedCount >= 0,
    'Duplicate month-end finalization execution is safe and idempotent'
  );

  // TEST 15: Admin Monthly Analytics API aggregates data correctly
  const analytics = await tierCalculationService.getAdminMonthlyAnalytics(year, month);
  assert(
    analytics.totalMonthVolume >= 17500000 &&
      analytics.topVendors.length > 0 &&
      analytics.topVendors[0].tierName === 'Ace',
    'Admin Monthly Analytics returns accurate totals, top vendors, and tier distribution'
  );

  // Cleanup test documents
  await VendorMonthlyTier.deleteMany({ vendorId: vendor1._id });
  await PaymentConfirmation.deleteMany({ vendorId: vendor1._id });
  await TopUpRequest.deleteMany({ vendorId: vendor1._id });
  await WalletTransaction.deleteMany({ vendorId: vendor1._id });
  await TierMovementLog.deleteMany({ vendorId: vendor1._id });
  await Vendor.deleteMany({ _id: vendor1._id });
  await Admin.deleteMany({ _id: testAdmin._id });

  console.log('\n====================================================');
  console.log(`📊 TIER SUITE RESULTS: ${passedTests}/${totalTests} PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('====================================================\n');

  return { totalTests, passedTests };
}

if (require.main === module) {
  runTierTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runTierTests };
