/**
 * Test Suite: FCFS Queue Ordering, Top-Up Rotation, and Vendor Details
 * 
 * Rules Verified:
 * 1. Top Priority (#1) is assigned to the vendor who had the earliest approved qualifying top-up.
 * 2. When a vendor does another top-up and it is approved, that vendor moves to the LAST POSITION.
 * 3. Client payment allocation does NOT modify the FCFS queue order.
 * 4. FCFS Queue API returns full vendor details: Rank, Name, Email, Phone, Live Balance, Bank Accounts, Wallets, and Eligibility.
 * 5. SuperAdmin manual reordering functions correctly.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Models
const Vendor = require('../src/models/vendorModel');
const Admin = require('../src/models/adminModel');
const PaymentDestination = require('../src/models/paymentDestinationModel');
const TopUpRequest = require('../src/models/topUpRequestModel');
const PaymentConfirmation = require('../src/models/paymentConfirmationModel');
const VendorWallet = require('../src/models/vendorWalletModel');
const FCFSQueue = require('../src/models/fcfsQueueModel');

// Services
const topUpService = require('../src/services/topUpService');
const fcfsService = require('../src/services/fcfsService');
const allocationService = require('../src/services/allocationService');
const walletService = require('../src/services/walletService');

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

async function runFcfsRotationTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING FCFS TOP-UP ROTATION & QUEUE DETAILS TESTS');
  console.log('====================================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/moffin_db';
  await mongoose.connect(mongoUri);
  console.log(`Connected to MongoDB: ${mongoose.connection.host}/${mongoose.connection.name}\n`);

  const timestamp = Date.now();
  const passwordHash = await bcrypt.hash('TestPass@123', 10);

  // 1. Create Super Admin
  const admin = await Admin.create({
    name: 'FCFS Super Admin',
    email: `fcfs_admin_${timestamp}@test.com`,
    password: passwordHash,
    role: 'super_admin'
  });

  // 2. Create Company Bank Destination
  const companyBank = await PaymentDestination.create({
    type: 'bank',
    bankDetails: {
      accountNumber: '998877665544',
      ifscCode: 'HDFC0000001',
      bankName: 'HDFC Bank Ltd',
      accountHolderName: 'Moffin Payments PVT LTD',
      branchName: 'Corporate Branch'
    },
    minDepositLimit: 100,
    maxDepositLimit: 5000000,
    isActive: true
  });

  // 3. Create 4 Vendors (A, B, C, D) with Bank & Wallet details
  const createVendorHelper = async (letter, num) => {
    return await Vendor.create({
      firstName: `Vendor`,
      lastName: `${letter}`,
      email: `vendor_${letter.toLowerCase()}_${timestamp}@test.com`,
      password: passwordHash,
      mobileNumber: `980000000${num}_${timestamp}`.substring(0, 15),
      verificationStatus: 'approved',
      isActive: true,
      bankAccounts: [
        {
          bankName: 'ICICI Bank',
          accountNumber: `30000000000${num}`,
          ifscCode: 'ICIC0001234',
          accountHolderName: `Vendor ${letter}`,
          branchName: 'Main Branch',
          isDefault: true,
          isActive: true
        }
      ],
      wallets: [
        {
          walletName: 'PayTM UPI',
          walletId: `vendor${letter.toLowerCase()}@paytm`,
          isDefault: true,
          isActive: true
        }
      ]
    });
  };

  const vendorA = await createVendorHelper('A', 1);
  const vendorB = await createVendorHelper('B', 2);
  const vendorC = await createVendorHelper('C', 3);
  const vendorD = await createVendorHelper('D', 4);

  // Helper to simulate complete approved top-up
  const performApprovedTopUp = async (vendor, amount, txSuffix) => {
    const topUp = await topUpService.createTopUpRequest(vendor._id, {
      requestedAmount: amount,
      preferredPaymentMethod: 'bank'
    });

    await topUpService.adminRespondTopUp(topUp._id, admin._id, {
      selectedDestinationIds: [companyBank._id],
      approvedAmount: amount
    });

    const confirmation = await PaymentConfirmation.create({
      confirmationId: `CONF-${txSuffix}-${timestamp}`,
      topUpRequestId: topUp._id,
      vendorId: vendor._id,
      amountPaid: amount,
      paymentDestinationId: companyBank._id,
      paymentMethod: 'bank',
      transactionId: `UTR-${txSuffix}-${timestamp}`,
      transactionDate: new Date(),
      paymentProof: 'https://res.cloudinary.com/test/image/upload/sample.jpg',
      status: 'PAYMENT_SUBMITTED'
    });

    topUp.paymentConfirmationId = confirmation._id;
    topUp.status = 'PAYMENT_SUBMITTED';
    await topUp.save();

    return await topUpService.adminApprovePayment(confirmation._id, admin._id);
  };

  // STEP 1: Top-up approved sequentially for A, then B, then C, then D
  console.log('--- Step 1: Initial Sequential Top-Ups (A -> B -> C -> D) ---');
  await performApprovedTopUp(vendorA, 10000, 'A1');
  await performApprovedTopUp(vendorB, 15000, 'B1');
  await performApprovedTopUp(vendorC, 20000, 'C1');
  await performApprovedTopUp(vendorD, 25000, 'D1');

  // Fetch Queue Order
  let queueResult = await fcfsService.getQueue();
  let queueVendors = queueResult.queue.map(q => q.vendorId._id.toString());

  assert(
    queueVendors[0] === vendorA._id.toString() &&
    queueVendors[1] === vendorB._id.toString() &&
    queueVendors[2] === vendorC._id.toString() &&
    queueVendors[3] === vendorD._id.toString(),
    'Initial Queue is strictly ordered by earliest approved top-up: A (#1) -> B (#2) -> C (#3) -> D (#4)'
  );

  // STEP 2: Vendor A gets another approved top-up -> Should rotate to LAST POSITION (B -> C -> D -> A)
  console.log('\n--- Step 2: Vendor A Tops Up Again (Should move to End: B -> C -> D -> A) ---');
  await performApprovedTopUp(vendorA, 5000, 'A2');

  queueResult = await fcfsService.getQueue();
  queueVendors = queueResult.queue.map(q => q.vendorId._id.toString());

  assert(
    queueVendors[0] === vendorB._id.toString() &&
    queueVendors[1] === vendorC._id.toString() &&
    queueVendors[2] === vendorD._id.toString() &&
    queueVendors[3] === vendorA._id.toString(),
    'Vendor A rotates to LAST POSITION upon fresh approved top-up: B (#1) -> C (#2) -> D (#3) -> A (#4)'
  );

  // STEP 3: Vendor B gets another approved top-up -> Should rotate to LAST POSITION (C -> D -> A -> B)
  console.log('\n--- Step 3: Vendor B Tops Up Again (Should move to End: C -> D -> A -> B) ---');
  await performApprovedTopUp(vendorB, 8000, 'B2');

  queueResult = await fcfsService.getQueue();
  queueVendors = queueResult.queue.map(q => q.vendorId._id.toString());

  assert(
    queueVendors[0] === vendorC._id.toString() &&
    queueVendors[1] === vendorD._id.toString() &&
    queueVendors[2] === vendorA._id.toString() &&
    queueVendors[3] === vendorB._id.toString(),
    'Vendor B rotates to LAST POSITION upon fresh approved top-up: C (#1) -> D (#2) -> A (#3) -> B (#4)'
  );

  // STEP 4: Client Transaction allocation should NOT alter queue positions
  console.log('\n--- Step 4: Client Transaction Allocation (Queue order must remain unchanged) ---');
  const allocResult = await allocationService.allocateClientTransaction({
    clientId: 'CLIENT_TEST_001',
    requestedAmount: 5000
  });

  // Check which vendor was allocated (Should be Vendor C who is at #1)
  assert(
    allocResult.vendor.id.toString() === vendorC._id.toString(),
    'Client transaction allocated to Top Priority vendor (Vendor C at #1)'
  );

  // Verify Queue order is STILL C -> D -> A -> B
  queueResult = await fcfsService.getQueue();
  queueVendors = queueResult.queue.map(q => q.vendorId._id.toString());

  assert(
    queueVendors[0] === vendorC._id.toString() &&
    queueVendors[1] === vendorD._id.toString() &&
    queueVendors[2] === vendorA._id.toString() &&
    queueVendors[3] === vendorB._id.toString(),
    'Client transaction allocation DOES NOT modify FCFS queue order (Remains C -> D -> A -> B)'
  );

  // STEP 5: Verify Enriched FCFS Queue Data contains complete details
  console.log('\n--- Step 5: Verify Enriched Vendor Details in FCFS Queue Response ---');
  const firstVendorItem = queueResult.queue[0];

  assert(
    firstVendorItem.rank === 1 &&
    firstVendorItem.vendorId.firstName === 'Vendor' &&
    firstVendorItem.vendorId.lastName === 'C' &&
    firstVendorItem.vendorId.email.includes('vendor_c_') &&
    firstVendorItem.vendorId.mobileNumber.includes('9800000003'),
    'FCFS Queue contains vendor full identity and rank #1'
  );

  assert(
    firstVendorItem.wallet.availableBalance > 0 &&
    firstVendorItem.bankAccounts.length > 0 &&
    firstVendorItem.bankAccounts[0].bankName === 'ICICI Bank' &&
    firstVendorItem.bankAccounts[0].accountNumber === '300000000003' &&
    firstVendorItem.wallets.length > 0 &&
    firstVendorItem.wallets[0].walletId === 'vendorc@paytm',
    'FCFS Queue contains live available balance, bank accounts, and wallets'
  );

  assert(
    firstVendorItem.isEligible === true &&
    firstVendorItem.eligibilityReason === 'Eligible and ready for allocation',
    'FCFS Queue computes accurate eligibility status'
  );

  // STEP 6: SuperAdmin manual reorder works
  console.log('\n--- Step 6: SuperAdmin Manual Reorder ---');
  // Reorder queue to: D, C, B, A
  const manualOrder = [
    vendorD._id.toString(),
    vendorC._id.toString(),
    vendorB._id.toString(),
    vendorA._id.toString()
  ];
  await fcfsService.reorderQueue({ vendorOrder: manualOrder }, admin._id);

  queueResult = await fcfsService.getQueue();
  queueVendors = queueResult.queue.map(q => q.vendorId._id.toString());

  assert(
    queueVendors[0] === vendorD._id.toString() &&
    queueVendors[1] === vendorC._id.toString() &&
    queueVendors[2] === vendorB._id.toString() &&
    queueVendors[3] === vendorA._id.toString(),
    'SuperAdmin can manually reorder queue via batch array: D (#1) -> C (#2) -> B (#3) -> A (#4)'
  );

  console.log('\n====================================================');
  console.log(`📊 TEST RESULTS: ${passedTests} / ${totalTests} PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('====================================================\n');

  await mongoose.disconnect();
  process.exit(passedTests === totalTests ? 0 : 1);
}

runFcfsRotationTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
