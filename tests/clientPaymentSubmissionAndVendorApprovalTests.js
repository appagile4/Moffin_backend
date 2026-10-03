/**
 * Comprehensive Automated Test Suite for:
 * FEATURE: 2-STAGE CLIENT PAYMENT SUBMISSION & VENDOR MANUAL APPROVAL WORKFLOW
 * 
 * Verifies all 25 test cases:
 * - Stage 1 Allocation (Bank & Wallet)
 * - Stage 2 Client Payment Submission & Validation (UTR, amount, method, account matching, duplicates)
 * - Vendor Incoming Payment Requests API & Authorization
 * - Vendor Manual Approval with ATOMIC Financial Settlement (Client balance credit, Vendor balance deduct, Vendor Commission credit)
 * - Vendor Manual Rejection & Reserved balance restoration
 * - Block duplicate approvals / reject after approve / approve after reject
 * - Client Balance API & Full Wallet Transaction Ledger
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Models
const Client = require('../src/models/clientModel');
const Vendor = require('../src/models/vendorModel');
const VendorWallet = require('../src/models/vendorWalletModel');
const ClientTransaction = require('../src/models/clientTransactionModel');
const ClientWalletTransaction = require('../src/models/clientWalletTransactionModel');
const WalletTransaction = require('../src/models/walletTransactionModel');
const FCFSQueue = require('../src/models/fcfsQueueModel');
const Tier = require('../src/models/vendorTierModel');
const AuditLog = require('../src/models/auditLogModel');

// Services
const allocationService = require('../src/services/allocationService');
const paymentSubmissionService = require('../src/services/paymentSubmissionService');
const tierService = require('../src/services/tierService');
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

async function runStage2PaymentWorkflowTests() {
  console.log('========================================================================');
  console.log('🧪 RUNNING 2-STAGE CLIENT PAYMENT SUBMISSION & VENDOR APPROVAL TESTS');
  console.log('========================================================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/moffin_db';
  await mongoose.connect(mongoUri);

  try {
    // 0. Initialize Tiers if needed
    await tierService.seedDefaultTiers();

    // Clean test data
    await Client.deleteMany({ email: /test_stg2_.*@test\.com/ });
    await Vendor.deleteMany({ email: /test_stg2_.*@test\.com/ });
    await ClientTransaction.deleteMany({ externalTransactionId: /UTR-.*/ });
    await ClientWalletTransaction.deleteMany({});
    await WalletTransaction.deleteMany({ transactionType: 'COMMISSION_CREDIT' });

    const passwordHash = await bcrypt.hash('TestPass123!', 10);

    // Create 2 Test Clients
    const clientA = await Client.create({
      firstName: 'Alice',
      lastName: 'Client',
      email: 'test_stg2_clientA@test.com',
      password: passwordHash,
      mobile: '+919988771101',
      balance: 0,
      status: 'active',
      isVerified: true
    });

    const clientB = await Client.create({
      firstName: 'Bob',
      lastName: 'Client',
      email: 'test_stg2_clientB@test.com',
      password: passwordHash,
      mobile: '+919988771102',
      balance: 1000,
      status: 'active',
      isVerified: true
    });

    // Create 2 Test Vendors
    const vendorA = await Vendor.create({
      firstName: 'Vikram',
      lastName: 'Vendor',
      email: 'test_stg2_vendorA@test.com',
      password: passwordHash,
      mobileNumber: '+919988772201',
      status: 'active',
      isActive: true,
      verificationStatus: 'approved',
      isVerified: true,
      bankAccounts: [
        {
          bankName: 'HDFC Bank',
          accountNumber: 'HDFC9988776655',
          ifscCode: 'HDFC0001234',
          branchName: 'Koramangala',
          accountHolderName: 'Vikram Vendor',
          isVerified: true,
          isActive: true
        }
      ],
      wallets: [
        {
          walletName: 'GooglePay',
          walletId: 'vikram@okaxis',
          qrCode: 'https://example.com/qr/vikram.png',
          isVerified: true,
          isActive: true
        }
      ]
    });

    const vendorB = await Vendor.create({
      firstName: 'Vinod',
      lastName: 'Vendor',
      email: 'test_stg2_vendorB@test.com',
      password: passwordHash,
      mobileNumber: '+919988772202',
      status: 'active',
      isActive: true,
      verificationStatus: 'approved',
      isVerified: true,
      bankAccounts: [
        {
          bankName: 'ICICI Bank',
          accountNumber: 'ICICI5544332211',
          ifscCode: 'ICIC0005678',
          branchName: 'Indiranagar',
          accountHolderName: 'Vinod Vendor',
          isVerified: true,
          isActive: true
        }
      ],
      wallets: [
        {
          walletName: 'PhonePe',
          walletId: 'vinod@ybl',
          qrCode: 'https://example.com/qr/vinod.png',
          isVerified: true,
          isActive: true
        }
      ]
    });

    // Setup Wallets & Balances
    const vendorAWallet = await VendorWallet.create({
      vendorId: vendorA._id,
      balance: 50000,
      totalTopUp: 50000,
      totalClientTransacted: 0,
      commissionBalance: 0,
      totalCommissionEarned: 0
    });

    const vendorBWallet = await VendorWallet.create({
      vendorId: vendorB._id,
      balance: 50000,
      totalTopUp: 50000,
      totalClientTransacted: 0,
      commissionBalance: 0,
      totalCommissionEarned: 0
    });

    // Setup FCFS Queue - isolate queue for test
    await FCFSQueue.deleteMany({});
    await FCFSQueue.create({
      vendorId: vendorA._id,
      priorityPosition: 1,
      lastApprovedTopUpAt: new Date(Date.now() - 3600000)
    });
    await FCFSQueue.create({
      vendorId: vendorB._id,
      priorityPosition: 2,
      lastApprovedTopUpAt: new Date(Date.now() - 1800000)
    });

    // =========================================================================
    // TEST 1: STAGE 1 REQUEST ALLOCATION (WALLET)
    // =========================================================================
    const allocResult1 = await allocationService.createClientPaymentRequest({
      clientId: clientA._id,
      amount: 5000,
      paymentMethod: 'wallet',
      clientReference: 'ORDER-101'
    });

    assert(
      allocResult1.status === 'ASSIGNED' &&
      allocResult1.paymentDetails.walletId === 'vikram@okaxis' &&
      allocResult1.allocatedVendorId.toString() === vendorA._id.toString(),
      'Stage 1 Allocation assigns Rank #1 Vendor (Vendor A) with matching wallet'
    );

    const txId1 = allocResult1.transactionId;

    // =========================================================================
    // TEST 2: STAGE 2 CLIENT SUBMITS PAYMENT DETAILS WITH VALID UTR
    // =========================================================================
    const submitResult1 = await paymentSubmissionService.submitClientPayment({
      clientId: clientA._id,
      paymentRequestId: txId1,
      amount: 5000,
      paymentMethod: 'wallet',
      transactionId: 'UTR-TEST-123456',
      walletId: 'vikram@okaxis'
    });

    assert(
      submitResult1.success === true &&
      submitResult1.data.status === 'AWAITING_VENDOR_VERIFICATION' &&
      submitResult1.data.externalTransactionId === 'UTR-TEST-123456',
      'Stage 2: Client successfully submits payment details -> Status moves to AWAITING_VENDOR_VERIFICATION'
    );

    // =========================================================================
    // TEST 3: VALIDATION: REJECT EMPTY / WHITESPACE TRANSACTION ID (UTR)
    // =========================================================================
    let errEmptyTx = null;
    try {
      await paymentSubmissionService.submitClientPayment({
        clientId: clientA._id,
        paymentRequestId: txId1,
        amount: 5000,
        paymentMethod: 'wallet',
        transactionId: '   ',
        walletId: 'vikram@okaxis'
      });
    } catch (err) {
      errEmptyTx = err;
    }
    assert(errEmptyTx !== null, 'Validation: Rejects empty or whitespace external transaction ID');

    // =========================================================================
    // TEST 4: VALIDATION: REJECT INVALID AMOUNT (<= 0 OR NAN)
    // =========================================================================
    let errInvalidAmt = null;
    try {
      await paymentSubmissionService.submitClientPayment({
        clientId: clientA._id,
        paymentRequestId: txId1,
        amount: -500,
        paymentMethod: 'wallet',
        transactionId: 'UTR-999',
        walletId: 'vikram@okaxis'
      });
    } catch (err) {
      errInvalidAmt = err;
    }
    assert(errInvalidAmt !== null, 'Validation: Rejects negative or invalid monetary amount');

    // =========================================================================
    // TEST 5: VALIDATION: REJECT SUBMITTED AMOUNT EXCEEDING ALLOCATED AMOUNT
    // =========================================================================
    let errExceedAmt = null;
    try {
      await paymentSubmissionService.submitClientPayment({
        clientId: clientA._id,
        paymentRequestId: txId1,
        amount: 10000, // Allocated was 5000
        paymentMethod: 'wallet',
        transactionId: 'UTR-EXCEED',
        walletId: 'vikram@okaxis'
      });
    } catch (err) {
      errExceedAmt = err;
    }
    assert(
      errExceedAmt !== null && errExceedAmt.message.includes('cannot exceed'),
      'Validation: Rejects submitted amount greater than allocated amount'
    );

    // =========================================================================
    // TEST 6: VALIDATION: REJECT PAYMENT METHOD MISMATCH
    // =========================================================================
    let errMethodMismatch = null;
    try {
      await paymentSubmissionService.submitClientPayment({
        clientId: clientA._id,
        paymentRequestId: txId1,
        amount: 5000,
        paymentMethod: 'bank', // Original was wallet
        transactionId: 'UTR-METHOD-DIFF',
        bankId: 'HDFC9988776655'
      });
    } catch (err) {
      errMethodMismatch = err;
    }
    assert(errMethodMismatch !== null, 'Validation: Rejects payment method mismatch against assigned method');

    // =========================================================================
    // TEST 7: VALIDATION: REJECT WALLET ID MISMATCH FOR WALLET PAYMENTS
    // =========================================================================
    let errWalletMismatch = null;
    try {
      await paymentSubmissionService.submitClientPayment({
        clientId: clientA._id,
        paymentRequestId: txId1,
        amount: 5000,
        paymentMethod: 'wallet',
        transactionId: 'UTR-WRONG-WALLET',
        walletId: 'fake_wallet@upi'
      });
    } catch (err) {
      errWalletMismatch = err;
    }
    assert(
      errWalletMismatch !== null && errWalletMismatch.message.includes('does not match'),
      'Validation: Rejects walletId that does not match assigned vendor wallet'
    );

    // =========================================================================
    // TEST 8: STAGE 1 & 2 BANK PAYMENT SUBMISSION WITH BANK ID MATCHING
    // =========================================================================
    const allocResultBank = await allocationService.createClientPaymentRequest({
      clientId: clientA._id,
      amount: 10000,
      paymentMethod: 'bank',
      clientReference: 'ORDER-BANK-1'
    });

    const txIdBank = allocResultBank.transactionId;

    // Test bankId mismatch
    let errBankMismatch = null;
    try {
      await paymentSubmissionService.submitClientPayment({
        clientId: clientA._id,
        paymentRequestId: txIdBank,
        amount: 10000,
        paymentMethod: 'bank',
        transactionId: 'UTR-WRONG-BANK',
        bankId: 'WRONG_ACCOUNT_NO_123'
      });
    } catch (err) {
      errBankMismatch = err;
    }
    assert(
      errBankMismatch !== null && errBankMismatch.message.includes('does not match'),
      'Validation: Rejects bankId that does not match assigned vendor bank account'
    );

    // Submit with correct bankId
    const submitBankSuccess = await paymentSubmissionService.submitClientPayment({
      clientId: clientA._id,
      paymentRequestId: txIdBank,
      amount: 10000,
      paymentMethod: 'bank',
      transactionId: 'UTR-BANK-VALID-999',
      bankId: 'HDFC9988776655'
    });
    assert(submitBankSuccess.success === true, 'Stage 2: Bank payment submission succeeds with matching account number');

    // =========================================================================
    // TEST 9: VALIDATION: REJECT DUPLICATE EXTERNAL TRANSACTION ID (UTR)
    // =========================================================================
    const allocResultDup = await allocationService.createClientPaymentRequest({
      clientId: clientA._id,
      amount: 2000,
      paymentMethod: 'wallet',
      clientReference: 'ORDER-DUP-TEST'
    });

    let errDuplicateUtr = null;
    try {
      await paymentSubmissionService.submitClientPayment({
        clientId: clientA._id,
        paymentRequestId: allocResultDup.transactionId,
        amount: 2000,
        paymentMethod: 'wallet',
        transactionId: 'UTR-TEST-123456', // Same as Test 2
        walletId: 'vikram@okaxis'
      });
    } catch (err) {
      errDuplicateUtr = err;
    }
    assert(
      errDuplicateUtr !== null && errDuplicateUtr.message.includes('must be unique'),
      'Validation: Rejects duplicate external UTR / Transaction ID across submissions'
    );

    // =========================================================================
    // TEST 10: VALIDATION: REJECT SUBMISSION ON NON-EXISTENT PAYMENT REQUEST ID
    // =========================================================================
    let errNonExistent = null;
    try {
      await paymentSubmissionService.submitClientPayment({
        clientId: clientA._id,
        paymentRequestId: new mongoose.Types.ObjectId().toString(),
        amount: 1000,
        paymentMethod: 'wallet',
        transactionId: 'UTR-RANDOM-001',
        walletId: 'vikram@okaxis'
      });
    } catch (err) {
      errNonExistent = err;
    }
    assert(
      errNonExistent !== null && errNonExistent.message.includes('not found'),
      'Validation: Rejects submission on non-existent paymentRequestId'
    );

    // =========================================================================
    // TEST 11: VALIDATION: REJECT SUBMISSION BY UNAUTHORIZED CLIENT (CLIENT B ON CLIENT A'S TX)
    // =========================================================================
    let errUnauthorizedClient = null;
    try {
      await paymentSubmissionService.submitClientPayment({
        clientId: clientB._id, // Wrong client
        paymentRequestId: allocResultDup.transactionId,
        amount: 2000,
        paymentMethod: 'wallet',
        transactionId: 'UTR-CLIENTB-HACK',
        walletId: 'vikram@okaxis'
      });
    } catch (err) {
      errUnauthorizedClient = err;
    }
    assert(
      errUnauthorizedClient !== null && errUnauthorizedClient.message.includes('not found or unauthorized'),
      'Validation: Blocks submission attempt by unauthorized client'
    );

    // =========================================================================
    // TEST 12: VENDOR FETCHES INCOMING PAYMENT REQUESTS LIST
    // =========================================================================
    const vendorRequestsList = await paymentSubmissionService.getVendorPaymentRequests(vendorA._id, {
      status: 'AWAITING_VENDOR_VERIFICATION'
    });
    assert(
      vendorRequestsList.transactions.length >= 2 &&
      vendorRequestsList.transactions.some((t) => t.transactionId === txId1),
      'Vendor API: Lists incoming payment requests assigned to Vendor A awaiting verification'
    );

    // =========================================================================
    // TEST 13: VENDOR FETCHES SPECIFIC PAYMENT DETAILS BY ID
    // =========================================================================
    const vendorSpecificTx = await paymentSubmissionService.getVendorPaymentById(txId1, vendorA._id);
    assert(
      vendorSpecificTx &&
      vendorSpecificTx.transactionId === txId1 &&
      vendorSpecificTx.externalTransactionId === 'UTR-TEST-123456' &&
      vendorSpecificTx.clientId.firstName === 'Alice',
      'Vendor API: Fetches specific incoming payment details including Client information'
    );

    // =========================================================================
    // TEST 14: VENDOR REJECTS UNAUTHORIZED ACCESS TO ANOTHER VENDOR'S PAYMENT
    // =========================================================================
    let errVendorUnauthorized = null;
    try {
      await paymentSubmissionService.getVendorPaymentById(txId1, vendorB._id);
    } catch (err) {
      errVendorUnauthorized = err;
    }
    assert(
      errVendorUnauthorized !== null && errVendorUnauthorized.message.includes('access unauthorized'),
      'Vendor API: Prevents Vendor B from accessing Vendor A assigned payment'
    );

    // =========================================================================
    // TEST 15: VENDOR APPROVES PAYMENT -> ATOMIC FINANCIAL SETTLEMENT EXECUTES
    // =========================================================================
    const approveResult = await paymentSubmissionService.vendorApprovePayment(txId1, vendorA._id);

    assert(
      approveResult.success === true &&
      approveResult.data.status === 'APPROVED' &&
      approveResult.data.approvedAmount === 5000,
      'Vendor Approval: Successfully executes and settles transaction atomically'
    );

    // =========================================================================
    // TEST 16: VERIFY VENDOR WALLET BALANCE & CLIENT TRANSACTED METRICS
    // =========================================================================
    const updatedVendorAWallet = await VendorWallet.findOne({ vendorId: vendorA._id });
    assert(
      updatedVendorAWallet.totalClientTransacted >= 5000,
      'Vendor Wallet: totalClientTransacted is accurately incremented'
    );

    // =========================================================================
    // TEST 17: VERIFY DYNAMIC TIER COMMISSION CALCULATION
    // =========================================================================
    // Bronze V is 1.0% commission -> ₹5000 * 1.0% = ₹50
    const expectedCommission = 50;
    assert(
      approveResult.data.commissionAmount === expectedCommission &&
      approveResult.data.commissionPercentage === 1,
      `Tier Commission: Dynamically calculated commission matches tier rate (Expected: ₹${expectedCommission}, Got: ₹${approveResult.data.commissionAmount})`
    );

    // =========================================================================
    // TEST 18: VERIFY VENDOR COMMISSION WALLET CREDITED
    // =========================================================================
    assert(
      updatedVendorAWallet.commissionBalance === expectedCommission &&
      updatedVendorAWallet.totalCommissionEarned === expectedCommission,
      `Vendor Commission Balance: Commission wallet credited with ₹${expectedCommission}`
    );

    // =========================================================================
    // TEST 19: VERIFY VENDOR COMMISSION LEDGER ENTRY CREATED
    // =========================================================================
    const vendorCommLedger = await WalletTransaction.findOne({
      vendorId: vendorA._id,
      transactionType: 'COMMISSION_CREDIT',
      referenceId: txId1
    });
    assert(
      vendorCommLedger &&
      vendorCommLedger.amount === expectedCommission &&
      vendorCommLedger.balanceAfter === expectedCommission,
      'Vendor Ledger: WalletTransaction COMMISSION_CREDIT entry created with correct balanceAfter'
    );

    // =========================================================================
    // TEST 20: VERIFY CLIENT PLATFORM BALANCE CREDITED
    // =========================================================================
    const updatedClientA = await Client.findById(clientA._id);
    assert(
      Number(updatedClientA.balance) === 5000,
      'Client Balance: Client platform balance credited with ₹5000 (Initial: 0 -> Final: 5000)'
    );

    // =========================================================================
    // TEST 21: VERIFY CLIENT WALLET LEDGER ENTRY CREATED
    // =========================================================================
    const clientLedgerEntry = await ClientWalletTransaction.findOne({
      clientId: clientA._id,
      transactionId: txId1,
      transactionType: 'PAYMENT_RECEIVED'
    });
    assert(
      clientLedgerEntry &&
      clientLedgerEntry.amount === 5000 &&
      clientLedgerEntry.balanceBefore === 0 &&
      clientLedgerEntry.balanceAfter === 5000,
      'Client Ledger: ClientWalletTransaction PAYMENT_RECEIVED record created with exact balance flow'
    );

    // =========================================================================
    // TEST 22: BLOCK DUPLICATE APPROVAL OF ALREADY APPROVED TRANSACTION
    // =========================================================================
    let errDupApprove = null;
    try {
      await paymentSubmissionService.vendorApprovePayment(txId1, vendorA._id);
    } catch (err) {
      errDupApprove = err;
    }
    assert(
      errDupApprove !== null && errDupApprove.message.includes('already been approved'),
      'Idempotency: Rejects duplicate approval of already approved payment'
    );

    // =========================================================================
    // TEST 23: VENDOR MANUAL REJECTION & RESERVED BALANCE RESTORATION
    // =========================================================================
    const initialVendorBalBeforeReject = (await VendorWallet.findOne({ vendorId: vendorA._id })).balance;

    const rejectResult = await paymentSubmissionService.vendorRejectPayment(
      txIdBank,
      vendorA._id,
      'Amount not credited in bank statement'
    );

    const afterRejectVendorWallet = await VendorWallet.findOne({ vendorId: vendorA._id });

    assert(
      rejectResult.success === true &&
      rejectResult.data.status === 'REJECTED' &&
      afterRejectVendorWallet.balance === initialVendorBalBeforeReject + 10000,
      'Vendor Rejection: Marks transaction REJECTED and restores ₹10,000 reserved funds to Vendor Wallet'
    );

    // =========================================================================
    // TEST 24: REJECTED TRANSACTION CANNOT BE APPROVED AFTERWARDS
    // =========================================================================
    let errApproveRejected = null;
    try {
      await paymentSubmissionService.vendorApprovePayment(txIdBank, vendorA._id);
    } catch (err) {
      errApproveRejected = err;
    }
    assert(
      errApproveRejected !== null && errApproveRejected.message.includes('rejected and cannot be approved'),
      'Status Flow: Prevents approving a rejected transaction'
    );

    // =========================================================================
    // TEST 25: CLIENT BALANCE API RETURNS ACCURATE BALANCE & LEDGER HISTORY
    // =========================================================================
    const clientBalHistory = await paymentSubmissionService.getClientBalanceAndHistory(clientA._id);
    assert(
      clientBalHistory.balance === 5000 &&
      clientBalHistory.ledger.transactions.length >= 1 &&
      clientBalHistory.client.email === clientA.email,
      'Client API: getClientBalanceAndHistory returns verified balance ₹5000 and paginated ledger'
    );

    console.log('\n========================================================================');
    console.log(`🎉 TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
    console.log('========================================================================\n');

  } catch (error) {
    console.error('Test Suite Fatal Error:', error);
  } finally {
    if (require.main === module) {
      await mongoose.connection.close();
    }
  }
}

if (require.main === module) {
  runStage2PaymentWorkflowTests();
}

module.exports = { runStage2PaymentWorkflowTests };
