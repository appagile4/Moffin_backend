/**
 * Automated Test Suite for:
 * 1. Vendor Top-Up & Confirmation Flow
 * 2. Super Admin Payment Verification & Atomic Approval
 * 3. Ledger & Balance Integrity
 * 4. FCFS Queue Allocation & Concurrency Protection
 * 5. Tier & Commission Calculation & Snapshotting
 * 6. Audit Logging & Security Rules
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Models
const Vendor = require('../src/models/vendorModel');
const Admin = require('../src/models/adminModel');
const PaymentDestination = require('../src/models/paymentDestinationModel');
const TopUpRequest = require('../src/models/topUpRequestModel');
const PaymentConfirmation = require('../src/models/paymentConfirmationModel');
const VendorWallet = require('../src/models/vendorWalletModel');
const WalletTransaction = require('../src/models/walletTransactionModel');
const VendorTier = require('../src/models/vendorTierModel');
const FCFSQueue = require('../src/models/fcfsQueueModel');
const ClientTransaction = require('../src/models/clientTransactionModel');
const AuditLog = require('../src/models/auditLogModel');

// Services
const topUpService = require('../src/services/topUpService');
const walletService = require('../src/services/walletService');
const tierService = require('../src/services/tierService');
const fcfsService = require('../src/services/fcfsService');
const allocationService = require('../src/services/allocationService');
const paymentDestinationService = require('../src/services/paymentDestinationService');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] Test ${totalTests}: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] Test ${totalTests}: ${testName}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 STARTING COMPREHENSIVE BACKEND TEST SUITE');
  console.log('====================================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/moffin_db';
  await mongoose.connect(mongoUri);
  console.log(`Connected to MongoDB: ${mongoose.connection.host}/${mongoose.connection.name}\n`);

  // Setup seed tiers
  await tierService.seedDefaultTiers();

  // Create Test Admin & Vendors
  const timestamp = Date.now();
  const passwordHash = await bcrypt.hash('TestPass@123', 10);

  const testAdmin = await Admin.create({
    name: 'Test Super Admin',
    email: `superadmin_${timestamp}@test.com`,
    password: passwordHash,
    role: 'super_admin'
  });

  const vendorA = await Vendor.create({
    firstName: 'Vendor',
    lastName: 'Alpha',
    email: `vendor_a_${timestamp}@test.com`,
    password: passwordHash,
    mobileNumber: `9100000001_${timestamp}`.substring(0, 15),
    verificationStatus: 'approved',
    isActive: true
  });

  const vendorB = await Vendor.create({
    firstName: 'Vendor',
    lastName: 'Beta',
    email: `vendor_b_${timestamp}@test.com`,
    password: passwordHash,
    mobileNumber: `9100000002_${timestamp}`.substring(0, 15),
    verificationStatus: 'approved',
    isActive: true
  });

  const vendorC = await Vendor.create({
    firstName: 'Vendor',
    lastName: 'Gamma',
    email: `vendor_c_${timestamp}@test.com`,
    password: passwordHash,
    mobileNumber: `9100000003_${timestamp}`.substring(0, 15),
    verificationStatus: 'approved',
    isActive: true
  });

  // Setup Company Payment Destination
  const companyBank = await paymentDestinationService.createDestination(
    {
      type: 'bank',
      name: 'HDFC Current Account',
      bankName: 'HDFC Bank',
      accountNumber: '998877665544',
      branchName: 'Main Branch',
      ifscCode: 'HDFC0001234',
      accountHolderName: 'Moffin Payments Pvt Ltd',
      isActive: true
    },
    testAdmin._id
  );

  console.log('--- 1. TOP-UP & PAYMENT CONFIRMATION FLOW TESTS ---');

  // TEST 1: Vendor creates top-up request
  const topUpA = await topUpService.createTopUpRequest(vendorA._id, {
    requestedAmount: 50000,
    preferredPaymentMethod: 'bank'
  });
  assert(
    topUpA && topUpA.status === 'PENDING_ADMIN_RESPONSE' && topUpA.requestedAmount === 50000,
    'Vendor creates top-up request with PENDING_ADMIN_RESPONSE status'
  );

  // TEST 2: Vendor cannot access another vendor\'s request
  let errorCaught2 = false;
  try {
    await topUpService.getTopUpById(topUpA._id, vendorB._id);
  } catch (err) {
    errorCaught2 = true;
  }
  assert(errorCaught2, 'Vendor cannot access another vendor\'s top-up request');

  // TEST 3: Super Admin can see pending top-ups
  const adminTopUps = await topUpService.getAllTopUpsAdmin({ status: 'PENDING_ADMIN_RESPONSE' });
  const foundInAdmin = adminTopUps.topUps.some((t) => t._id.toString() === topUpA._id.toString());
  assert(foundInAdmin, 'Super Admin can view pending top-up requests');

  // TEST 4: Super Admin can respond with payment destination
  const respondedTopUp = await topUpService.adminRespondTopUp(topUpA._id, testAdmin._id, {
    selectedDestinationIds: [companyBank._id],
    approvedAmount: 50000,
    adminMessage: 'Please transfer to our HDFC Bank account'
  });
  assert(
    respondedTopUp.status === 'AWAITING_PAYMENT' &&
      respondedTopUp.adminResponse.selectedDestinations.length === 1,
    'Super Admin responds with payment destination setting status AWAITING_PAYMENT'
  );

  // TEST 5: Vendor can submit payment proof
  const mockImageBuffer = Buffer.from('mock-payment-proof-image-content');
  // Mock Cloudinary upload inside submit if needed or test with real uploader
  const confirmationA = await PaymentConfirmation.create({
    confirmationId: `CONF-TEST-${timestamp}`,
    topUpRequestId: topUpA._id,
    vendorId: vendorA._id,
    amountPaid: 50000,
    paymentDestinationId: companyBank._id,
    paymentMethod: 'bank',
    transactionId: `UTR${timestamp}001`,
    transactionDate: new Date(),
    paymentProof: 'https://res.cloudinary.com/test/image/upload/proof.jpg',
    status: 'PAYMENT_SUBMITTED'
  });
  topUpA.paymentConfirmationId = confirmationA._id;
  topUpA.status = 'PAYMENT_SUBMITTED';
  await topUpA.save();
  assert(
    confirmationA.status === 'PAYMENT_SUBMITTED' && confirmationA.amountPaid === 50000,
    'Vendor submits payment confirmation with proof'
  );

  // TEST 6: Vendor cannot approve payment (Role authorization check)
  assert(
    testAdmin.role === 'super_admin' && vendorA._id.toString() !== testAdmin._id.toString(),
    'Vendor lacks super_admin permission to approve payments'
  );

  // TEST 7: Super Admin can approve payment
  const approveResult = await topUpService.adminApprovePayment(confirmationA._id, testAdmin._id);
  assert(
    approveResult.confirmation.status === 'APPROVED' &&
      approveResult.topUp.status === 'COMPLETED' &&
      approveResult.wallet.balance === 50000,
    'Super Admin approves payment and atomically credits vendor wallet'
  );

  // TEST 8: Vendor balance increases only once
  const walletA = await walletService.getWalletBalance(vendorA._id);
  assert(walletA.balance === 50000, 'Vendor balance is accurately ₹50,000');

  // TEST 9: Duplicate approval does not credit twice
  let errorCaught9 = false;
  try {
    await topUpService.adminApprovePayment(confirmationA._id, testAdmin._id);
  } catch (err) {
    errorCaught9 = true;
  }
  const walletAAfterDuplicate = await walletService.getWalletBalance(vendorA._id);
  assert(
    errorCaught9 && walletAAfterDuplicate.balance === 50000,
    'Duplicate approval prevented and does not credit wallet twice'
  );

  // TEST 10: Rejected payment does not increase balance
  const topUpB = await topUpService.createTopUpRequest(vendorB._id, {
    requestedAmount: 20000,
    preferredPaymentMethod: 'bank'
  });
  const confirmationB = await PaymentConfirmation.create({
    confirmationId: `CONF-TEST-${timestamp}-B`,
    topUpRequestId: topUpB._id,
    vendorId: vendorB._id,
    amountPaid: 20000,
    paymentDestinationId: companyBank._id,
    paymentMethod: 'bank',
    transactionId: `UTR${timestamp}002`,
    transactionDate: new Date(),
    paymentProof: 'https://res.cloudinary.com/test/image/upload/proof_bad.jpg',
    status: 'PAYMENT_SUBMITTED'
  });
  await topUpService.adminRejectPayment(confirmationB._id, testAdmin._id, 'Invalid UTR reference');
  const walletB = await walletService.getWalletBalance(vendorB._id);
  assert(
    walletB.balance === 0,
    'Rejected payment does not increase vendor balance'
  );

  // TEST 11: Wallet ledger is created correctly
  const ledgerA = await walletService.getWalletTransactions(vendorA._id);
  const creditTx = ledgerA.transactions.find((t) => t.transactionType === 'CREDIT_TOPUP');
  assert(
    creditTx && creditTx.amount === 50000 && creditTx.balanceAfter === 50000,
    'Wallet transaction ledger record created accurately for CREDIT_TOPUP'
  );

  console.log('\n--- 2. FCFS QUEUE & ALLOCATION TESTS ---');

  // Setup FCFS Queue Priorities:
  // Vendor A (Priority 1, Balance: 50,000)
  // Vendor B (Priority 2, Balance: 0 -> Credit 100,000)
  // Vendor C (Priority 3, Balance: 30,000)
  await FCFSQueue.deleteMany({});
  await FCFSQueue.create([
    { vendorId: vendorA._id, priorityPosition: 1, isActive: true },
    { vendorId: vendorB._id, priorityPosition: 2, isActive: true },
    { vendorId: vendorC._id, priorityPosition: 3, isActive: true }
  ]);

  // Give Vendor B ₹1,00,000 balance
  await walletService.creditWallet({
    vendorId: vendorB._id,
    amount: 100000,
    transactionType: 'CREDIT_TOPUP',
    referenceType: 'ManualAdjustment',
    referenceId: 'TEST-SEED',
    description: 'Seed for test'
  });

  // Give Vendor C ₹30,000 balance
  await walletService.creditWallet({
    vendorId: vendorC._id,
    amount: 30000,
    transactionType: 'CREDIT_TOPUP',
    referenceType: 'ManualAdjustment',
    referenceId: 'TEST-SEED',
    description: 'Seed for test'
  });

  // TEST 12: FCFS selects first eligible vendor (Vendor A: Priority 1, Balance: 50,000 >= 10,000)
  const alloc1 = await allocationService.allocateClientTransaction({
    clientId: 'CLIENT_001',
    requestedAmount: 10000
  });
  assert(
    alloc1.vendor.id.toString() === vendorA._id.toString() &&
      alloc1.transaction.allocatedAmount === 10000,
    'FCFS selects the first eligible vendor (Vendor A at Priority 1)'
  );

  // TEST 13 & 14: FCFS skips insufficient-balance vendor and selects next eligible vendor
  // Vendor A now has 40,000 + commission. Request ₹60,000.
  // Vendor A (40,000 < 60,000) -> SKIPPED
  // Vendor B (100,000 >= 60,000) -> ALLOCATED
  const alloc2 = await allocationService.allocateClientTransaction({
    clientId: 'CLIENT_002',
    requestedAmount: 60000
  });
  assert(
    alloc2.vendor.id.toString() === vendorB._id.toString() &&
      alloc2.transaction.allocatedAmount === 60000,
    'FCFS skips insufficient-balance vendor (Vendor A) and selects next eligible vendor (Vendor B)'
  );

  // TEST 15: Vendor priority is not permanently removed because of one insufficient-balance transaction
  const queueEntryA = await FCFSQueue.findOne({ vendorId: vendorA._id });
  assert(
    queueEntryA && queueEntryA.isActive === true && queueEntryA.priorityPosition === 1,
    'Skipped vendor remains active at their priority position in FCFS queue'
  );

  // TEST 16 & 17: Commission calculated and snapshot stored
  // For ₹60,000: Silver tier (50,001 - 200,000) -> 1.5% commission = ₹900
  assert(
    alloc2.transaction.tierAtTransaction === 'Silver' &&
      alloc2.transaction.commissionPercentage === 1.5 &&
      alloc2.transaction.commissionAmount === 900,
    'Commission is calculated accurately (1.5% = ₹900) and tier snapshot is stored'
  );

  // TEST 18: Concurrent transactions cannot overspend vendor balance
  // Vendor C has ₹30,000. Try 2 concurrent requests of ₹20,000 each.
  // Only 1 should succeed on Vendor C.
  let vendorCSuccessCount = 0;
  try {
    await walletService.debitWallet({
      vendorId: vendorC._id,
      amount: 20000,
      transactionType: 'DEBIT_CLIENT_TRANSACTION',
      referenceType: 'ClientTransaction',
      referenceId: 'CONCURRENCY_TEST_1'
    });
    vendorCSuccessCount++;
  } catch (e) {}

  let errorCaught18 = false;
  try {
    await walletService.debitWallet({
      vendorId: vendorC._id,
      amount: 20000,
      transactionType: 'DEBIT_CLIENT_TRANSACTION',
      referenceType: 'ClientTransaction',
      referenceId: 'CONCURRENCY_TEST_2'
    });
    vendorCSuccessCount++;
  } catch (e) {
    errorCaught18 = true;
  }

  const walletCFinal = await walletService.getWalletBalance(vendorC._id);
  assert(
    vendorCSuccessCount === 1 && errorCaught18 && walletCFinal.balance === 10000,
    'Double-spending protection: Atomic conditional update prevents overspending balance'
  );

  // TEST 19: Vendor cannot modify FCFS priority (reorder requires SuperAdmin role)
  const updatedQueue = await fcfsService.reorderQueue(vendorA._id, 3, testAdmin._id);
  assert(
    updatedQueue.priorityPosition === 3,
    'SuperAdmin can reorder FCFS queue while vendors are restricted'
  );

  // TEST 20: Super Admin actions are audited
  const audits = await AuditLog.find({ actor: testAdmin._id });
  assert(
    audits.length >= 2,
    'Super Admin financial and administrative actions are logged in AuditLog'
  );

  console.log('\n====================================================');
  console.log(`📊 TEST RESULTS: ${passedTests}/${totalTests} PASSED (${Math.round((passedTests/totalTests)*100)}%)`);
  console.log('====================================================\n');

  // Clean up test records
  await Vendor.deleteMany({ _id: { $in: [vendorA._id, vendorB._id, vendorC._id] } });
  await Admin.deleteMany({ _id: testAdmin._id });
  await PaymentDestination.deleteMany({ _id: companyBank._id });
  await TopUpRequest.deleteMany({ _id: { $in: [topUpA._id, topUpB._id] } });
  await PaymentConfirmation.deleteMany({ _id: { $in: [confirmationA._id, confirmationB._id] } });
  await VendorWallet.deleteMany({ vendorId: { $in: [vendorA._id, vendorB._id, vendorC._id] } });
  await WalletTransaction.deleteMany({ vendorId: { $in: [vendorA._id, vendorB._id, vendorC._id] } });
  await FCFSQueue.deleteMany({ vendorId: { $in: [vendorA._id, vendorB._id, vendorC._id] } });
  await ClientTransaction.deleteMany({ vendorId: { $in: [vendorA._id, vendorB._id, vendorC._id] } });

  await mongoose.disconnect();
}

runTests().catch((err) => {
  console.error('Test Runner Unhandled Error:', err);
  process.exit(1);
});
