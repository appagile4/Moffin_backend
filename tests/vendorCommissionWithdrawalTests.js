/**
 * Comprehensive Automated Test Suite for:
 * FEATURE: VENDOR COMMISSION WITHDRAWALS SYSTEM & TOTAL WITHDRAW BALANCE FIX
 * 
 * Verifies:
 * 1. Vendor Overview stats: totalWithdraw = 0.00 until approved commission payouts happen.
 * 2. Minimum withdrawal validation: Rejects requests < ₹25,000.
 * 3. Insufficient commission balance validation.
 * 4. Withdrawal Request Creation with linked Bank account.
 * 5. Withdrawal Request Creation with manual new Wallet / UPI account.
 * 6. Vendor Withdrawal List & Filter API.
 * 7. Admin Withdrawal List, Status Filter, and KPI Stats API.
 * 8. Admin Send Payment: Uploads UTR & screenshot proof -> Status = PAYMENT_SENT_BY_ADMIN.
 * 9. Vendor Commission Balance remains intact until Vendor verifies and approves.
 * 10. Vendor Rejection Workflow: Rejects payment if not received, records reason, balance untouched.
 * 11. Vendor Approval Workflow: Atomic deduction of commissionBalance, increment of totalWithdrawn, and creation of WalletTransaction (WITHDRAWAL).
 * 12. Post-settlement Overview Stats: totalWithdraw reflects exact approved withdrawal amount.
 * 13. State protection: Cannot approve an already approved/rejected withdrawal.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Models
const Vendor = require('../src/models/vendorModel');
const VendorWallet = require('../src/models/vendorWalletModel');
const WalletTransaction = require('../src/models/walletTransactionModel');
const VendorWithdrawal = require('../src/models/vendorWithdrawalModel');
const SuperAdmin = require('../src/models/adminModel');
const Tier = require('../src/models/vendorTierModel');

// Services
const withdrawalService = require('../src/services/withdrawalService');
const walletService = require('../src/services/walletService');
const tierService = require('../src/services/tierService');

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

async function runVendorCommissionWithdrawalTests() {
  console.log('========================================================================');
  console.log('🧪 RUNNING VENDOR COMMISSION WITHDRAWALS & TOTAL WITHDRAW STATS TESTS');
  console.log('========================================================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/moffin_db';
  await mongoose.connect(mongoUri);

  try {
    // 0. Seed tiers if needed
    await tierService.seedDefaultTiers();

    // 1. Setup Test Admin
    let admin = await SuperAdmin.findOne({ email: 'admin@moffin.com' });
    if (!admin) {
      const passwordHash = await bcrypt.hash('Admin@123456', 10);
      admin = await SuperAdmin.create({
        name: 'Super Admin',
        email: 'admin@moffin.com',
        password: passwordHash,
        role: 'superadmin'
      });
    }

    // 2. Setup Test Vendor with linked Bank & Wallet
    const testEmail = `vendor_withdrawal_${Date.now()}@example.com`;
    const passwordHash = await bcrypt.hash('Vendor@123456', 10);
    const vendor = await Vendor.create({
      firstName: 'Vikram',
      lastName: 'WithdrawalTester',
      email: testEmail,
      mobileNumber: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: passwordHash,
      verificationStatus: 'approved',
      isActive: true,
      bankAccounts: [{
        bankName: 'HDFC Bank',
        accountNumber: '50100998877665',
        ifscCode: 'HDFC0001234',
        accountHolderName: 'Vikram WithdrawalTester',
        branchName: 'Koramangala',
        isDefault: true
      }],
      wallets: [{
        walletName: 'Google Pay',
        walletId: 'vikram@okaxis',
        isDefault: true
      }]
    });

    const bankAccountId = vendor.bankAccounts[0]._id.toString();

    // 3. Create VendorWallet with ₹100,000 commissionBalance
    let vendorWallet = await VendorWallet.findOne({ vendorId: vendor._id });
    if (!vendorWallet) {
      vendorWallet = await VendorWallet.create({
        vendorId: vendor._id,
        balance: 50000,
        reservedBalance: 0,
        commissionBalance: 100000,
        totalWithdrawn: 0,
        totalVolume: 500000
      });
    } else {
      vendorWallet.balance = 50000;
      vendorWallet.commissionBalance = 100000;
      vendorWallet.totalWithdrawn = 0;
      await vendorWallet.save();
    }

    // =========================================================================
    // SECTION 1: OVERVIEW STATS CHECK (TOTAL WITHDRAW = 0)
    // =========================================================================
    console.log('--- SECTION 1: Total Withdraw Stats Initial Check ---');
    const initialStats = await walletService.getVendorOverviewStats(vendor._id);
    assert(initialStats.totalWithdraw === 0, 'Initial totalWithdraw is ₹ 0.00 before any withdrawal requests are settled');
    assert(initialStats.commissionEarned === 100000 || initialStats.commissionBalance === 100000, 'Commission balance shows ₹ 100,000');

    // =========================================================================
    // SECTION 2: VALIDATION RULES (MIN ₹25,000 & BALANCE CHECKS)
    // =========================================================================
    console.log('\n--- SECTION 2: Withdrawal Request Validations ---');

    // Test: Rejects < ₹25,000
    try {
      await withdrawalService.createWithdrawalRequest({
        vendorId: vendor._id,
        amount: 20000, // Below min limit
        destinationType: 'bank',
        selectedAccountId: bankAccountId
      });
      assert(false, 'Should have rejected amount below ₹25,000');
    } catch (err) {
      assert(err.message.includes('25,000') || err.message.includes('Minimum'), `Rejected ₹20,000 (< ₹25,000 min): "${err.message}"`);
    }

    // Test: Rejects amount exceeding commission balance
    try {
      await withdrawalService.createWithdrawalRequest({
        vendorId: vendor._id,
        amount: 150000, // Exceeds 100k balance
        destinationType: 'bank',
        selectedAccountId: bankAccountId
      });
      assert(false, 'Should have rejected amount exceeding commission balance');
    } catch (err) {
      assert(err.message.includes('Insufficient') || err.message.includes('commission'), `Rejected ₹150,000 (> ₹100,000 commission balance): "${err.message}"`);
    }

    // Test: Rejects missing destination details
    try {
      await withdrawalService.createWithdrawalRequest({
        vendorId: vendor._id,
        amount: 30000,
        destinationType: 'bank',
        isManualDestination: true,
        destinationDetails: {} // Missing bank info
      });
      assert(false, 'Should have rejected empty manual bank details');
    } catch (err) {
      assert(err.message.includes('Bank') || err.message.includes('account'), `Rejected empty manual bank details: "${err.message}"`);
    }

    // =========================================================================
    // SECTION 3: CREATE WITHDRAWAL REQUESTS (LINKED & MANUAL)
    // =========================================================================
    console.log('\n--- SECTION 3: Create Withdrawal Requests ---');

    // Request 1: Using Linked Bank Account (₹30,000)
    const req1Res = await withdrawalService.createWithdrawalRequest({
      vendorId: vendor._id,
      amount: 30000,
      destinationType: 'bank',
      selectedAccountId: bankAccountId,
      notes: 'Monthly profit commission withdrawal'
    });
    const w1 = req1Res.withdrawal;
    assert(w1 && w1.withdrawalId.startsWith('WTH-'), `Request 1 created successfully with ID: ${w1.withdrawalId}`);
    assert(w1.amount === 30000, 'Request 1 amount is ₹30,000');
    assert(w1.destinationType === 'bank' && w1.destinationDetails.accountNumber === '50100998877665', 'Request 1 snapshot linked bank account details');
    assert(w1.status === 'PENDING_ADMIN_PAYMENT', 'Request 1 status is PENDING_ADMIN_PAYMENT');

    // Request 2: Using Manual New Wallet / UPI (₹25,000)
    const req2Res = await withdrawalService.createWithdrawalRequest({
      vendorId: vendor._id,
      amount: 25000,
      destinationType: 'wallet',
      isManualDestination: true,
      destinationDetails: {
        walletName: 'Paytm UPI',
        walletId: 'vikram.partner@paytm'
      },
      notes: 'Manual UPI payout request'
    });
    const w2 = req2Res.withdrawal;
    assert(w2 && w2.withdrawalId.startsWith('WTH-'), `Request 2 created with ID: ${w2.withdrawalId}`);
    assert(w2.amount === 25000 && w2.isManualDestination === true, 'Request 2 is manual destination of ₹25,000');
    assert(w2.destinationDetails.walletId === 'vikram.partner@paytm', 'Request 2 recorded manual UPI ID correctly');

    // =========================================================================
    // SECTION 4: VENDOR & ADMIN LIST APIS
    // =========================================================================
    console.log('\n--- SECTION 4: Query Withdrawal Requests ---');

    // Vendor query
    const vendorWithdrawals = await withdrawalService.getVendorWithdrawals(vendor._id);
    assert(vendorWithdrawals.withdrawals.length === 2, `Vendor retrieved 2 active withdrawal requests`);

    // Admin query
    const adminWithdrawals = await withdrawalService.adminGetWithdrawals({ status: 'PENDING_ADMIN_PAYMENT' });
    assert(adminWithdrawals.withdrawals.length >= 2, `Admin retrieved pending withdrawal requests`);
    assert(adminWithdrawals.stats.pendingAdminPaymentCount >= 2, `Admin stats shows >= 2 pendingAdminPaymentCount`);

    // =========================================================================
    // SECTION 5: ADMIN SENDS PAYMENT (UTR + PROOF)
    // =========================================================================
    console.log('\n--- SECTION 5: Admin Sends Payout Proof ---');

    // Admin pays Request 1
    const adminPayRes1 = await withdrawalService.adminSendWithdrawalPayment({
      withdrawalId: w1._id,
      adminId: admin._id,
      transactionId: 'UTR-HDFC-9988776655',
      paymentProof: 'https://res.cloudinary.com/moffin/image/upload/v1234/wdr_proof_1.jpg',
      adminNotes: 'Transferred via IMPS from Primary HDFC Current A/C'
    });
    const updatedW1 = adminPayRes1.withdrawal;
    assert(updatedW1.status === 'PAYMENT_SENT_BY_ADMIN', 'Request 1 status updated to PAYMENT_SENT_BY_ADMIN');
    assert(updatedW1.adminPaymentDetails.transactionId === 'UTR-HDFC-9988776655', 'Admin UTR recorded');
    assert(updatedW1.adminPaymentDetails.paymentProof.includes('wdr_proof_1.jpg'), 'Admin payment screenshot proof recorded');

    // Verify vendor commission is NOT deducted yet
    const walletMid = await VendorWallet.findOne({ vendorId: vendor._id });
    assert(walletMid.commissionBalance === 100000, 'Commission balance is NOT deducted before vendor confirmation (remains ₹100,000)');

    // Admin pays Request 2
    const adminPayRes2 = await withdrawalService.adminSendWithdrawalPayment({
      withdrawalId: w2._id,
      adminId: admin._id,
      transactionId: 'UPI-TXN-44332211',
      paymentProof: 'https://res.cloudinary.com/moffin/image/upload/v1234/wdr_proof_2.jpg'
    });
    assert(adminPayRes2.withdrawal.status === 'PAYMENT_SENT_BY_ADMIN', 'Request 2 status updated to PAYMENT_SENT_BY_ADMIN');

    // =========================================================================
    // SECTION 6: VENDOR REJECTION WORKFLOW (REQUEST 2)
    // =========================================================================
    console.log('\n--- SECTION 6: Vendor Rejection Workflow ---');

    const rejectRes = await withdrawalService.vendorRejectWithdrawal(
      w2._id,
      vendor._id,
      'Funds not credited in my Paytm account. UTR reference not found.'
    );
    const rejectedW2 = rejectRes.withdrawal;
    assert(rejectedW2.status === 'REJECTED', 'Request 2 marked as REJECTED by vendor');
    assert(rejectedW2.vendorConfirmation.isApproved === false, 'vendorConfirmation.isApproved is false');
    assert(rejectedW2.vendorConfirmation.rejectionReason.includes('Funds not credited'), 'Rejection reason stored');

    // Verify commission balance untouched
    const walletAfterReject = await VendorWallet.findOne({ vendorId: vendor._id });
    assert(walletAfterReject.commissionBalance === 100000, 'Commission balance remains intact at ₹100,000 after rejection');

    // =========================================================================
    // SECTION 7: VENDOR APPROVAL & ATOMIC SETTLEMENT WORKFLOW (REQUEST 1)
    // =========================================================================
    console.log('\n--- SECTION 7: Vendor Approval & Atomic Settlement ---');

    const approveRes = await withdrawalService.vendorApproveWithdrawal(
      w1._id,
      vendor._id,
      '127.0.0.1'
    );
    
    const approvedW1 = await VendorWithdrawal.findById(w1._id);
    assert(approvedW1.status === 'APPROVED', 'Request 1 marked as APPROVED by vendor');
    assert(approvedW1.vendorConfirmation && approvedW1.vendorConfirmation.isApproved === true, 'vendorConfirmation.isApproved is true');
    assert(approvedW1.financialSettlement && approvedW1.financialSettlement.totalWithdrawnAfter === 30000, 'Financial settlement totalWithdrawnAfter is ₹30,000');

    // Check Wallet deduction & Total Withdrawn increment
    const walletFinal = await VendorWallet.findOne({ vendorId: vendor._id });
    assert(walletFinal.commissionBalance === 70000, `Vendor commissionBalance deducted atomically from ₹100,000 to ₹70,000 (Current: ₹${walletFinal.commissionBalance})`);
    assert(walletFinal.totalWithdrawn === 30000, `Vendor totalWithdrawn incremented to ₹30,000 (Current: ₹${walletFinal.totalWithdrawn})`);

    // Check immutable ledger transaction
    const ledgerTx = await WalletTransaction.findOne({
      vendorId: vendor._id,
      transactionType: 'WITHDRAWAL',
      referenceId: w1.withdrawalId
    });
    assert(ledgerTx !== null, 'Immutable WalletTransaction entry created with transactionType WITHDRAWAL');
    assert(ledgerTx.amount === 30000 && ledgerTx.balanceAfter === 70000, `Ledger recorded withdrawal amount ₹30,000 and closing commission balance ₹70,000`);

    // =========================================================================
    // SECTION 8: FINAL OVERVIEW STATS CHECK
    // =========================================================================
    console.log('\n--- SECTION 8: Final Overview Stats Verification ---');
    const finalStats = await walletService.getVendorOverviewStats(vendor._id);
    assert(finalStats.totalWithdraw === 30000, `getVendorOverviewStats now accurately reflects totalWithdraw = ₹30,000 (was 0)`);
    assert(finalStats.commissionBalance === 70000, `getVendorOverviewStats reflects remaining commissionBalance = ₹70,000`);

    // =========================================================================
    // SECTION 9: REPEAT OPERATION PROTECTION
    // =========================================================================
    console.log('\n--- SECTION 9: State Conflict Protection ---');
    try {
      await withdrawalService.vendorApproveWithdrawal(w1._id, vendor._id);
      assert(false, 'Should prevent approving an already approved withdrawal');
    } catch (err) {
      assert(err.message.includes('already been approved') || err.message.includes('PAYMENT_SENT_BY_ADMIN'), `Blocked double approval: "${err.message}"`);
    }

    try {
      await withdrawalService.vendorRejectWithdrawal(w1._id, vendor._id, 'Duplicate reject attempt');
      assert(false, 'Should prevent rejecting an already approved withdrawal');
    } catch (err) {
      assert(err.message.includes('already been approved') || err.message.includes('PAYMENT_SENT_BY_ADMIN'), `Blocked rejecting an approved request: "${err.message}"`);
    }

    console.log('\n========================================================================');
    console.log(`📊 TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
    console.log('========================================================================\n');

  } catch (error) {
    console.error('Test Suite Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

runVendorCommissionWithdrawalTests();
