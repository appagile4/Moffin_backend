const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Models
const Client = require('../src/models/clientModel');
const Vendor = require('../src/models/vendorModel');
const Admin = require('../src/models/adminModel');
const ClientWithdrawal = require('../src/models/clientWithdrawalModel');
const ClientTransaction = require('../src/models/clientTransactionModel');

// Services
const clientWithdrawalService = require('../src/services/clientWithdrawalService');
const { getClientBalanceAndHistory } = require('../src/services/paymentSubmissionService');

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

async function runClientWithdrawalTests() {
  console.log('\n========================================================================');
  console.log('🧪 RUNNING TEST SUITE: CLIENT WITHDRAWAL & ADMIN COMMISSION SETTLEMENT');
  console.log('========================================================================\n');

  const timestamp = Date.now();
  const passwordHash = await bcrypt.hash('ClientPass@123', 10);

  // Setup Test Admin
  const testAdmin = await Admin.create({
    name: 'Withdrawal SuperAdmin',
    email: `admin_wth_${timestamp}@test.com`,
    password: passwordHash,
    role: 'super_admin'
  });

  // Setup Test Vendor
  const testVendor = await Vendor.create({
    firstName: 'Payout',
    lastName: 'Vendor',
    email: `vendor_payout_${timestamp}@test.com`,
    password: passwordHash,
    mobileNumber: `9800000001_${timestamp}`.substring(0, 15),
    verificationStatus: 'approved',
    isActive: true,
    currentTier: 'Tier-Silver',
    currentTierDisplayName: 'Silver Tier',
    effectiveCommissionRate: 2.5
  });

  // Setup Test Client with Saved Bank and Saved Wallet with QR
  const testClient = await Client.create({
    firstName: 'Arjun',
    lastName: 'Sharma',
    email: `arjun_wth_${timestamp}@client.com`,
    password: passwordHash,
    mobile: `998811${timestamp}`.substring(0, 15),
    role: 'client',
    status: 'active',
    isActive: true,
    isVerified: true,
    balance: 150000, // ₹1,50,000 platform balance
    bankAccounts: [
      {
        bankName: 'HDFC Bank',
        accountHolderName: 'Arjun Sharma',
        accountNumber: '50100987654321',
        ifscCode: 'HDFC0001234',
        branchName: 'Connaught Place',
        isDefault: true,
        isActive: true
      }
    ],
    wallets: [
      {
        walletName: 'GooglePay UPI',
        walletId: 'arjun@okhdfcbank',
        qrCode: 'https://res.cloudinary.com/demo/image/upload/qr_sample.png',
        isDefault: true,
        isActive: true
      }
    ]
  });

  // Setup completed client-to-vendor transactions to generate historical vendor commissions
  await ClientTransaction.create([
    {
      transactionId: `CTX-${timestamp}-001`,
      clientId: testClient._id,
      vendorId: testVendor._id,
      requestedAmount: 20000,
      allocatedAmount: 20000,
      submittedAmount: 20000,
      approvedAmount: 20000,
      paymentMethod: 'wallet',
      status: 'APPROVED',
      tierAtTransaction: 'Silver Tier',
      commissionPercentage: 2.5,
      commissionAmount: 500, // 2.5% of 20,000 = ₹500
      externalTransactionId: `UTR-${timestamp}-01`
    },
    {
      transactionId: `CTX-${timestamp}-002`,
      clientId: testClient._id,
      vendorId: testVendor._id,
      requestedAmount: 30000,
      allocatedAmount: 30000,
      submittedAmount: 30000,
      approvedAmount: 30000,
      paymentMethod: 'bank',
      status: 'APPROVED',
      tierAtTransaction: 'Silver Tier',
      commissionPercentage: 2.5,
      commissionAmount: 750, // 2.5% of 30,000 = ₹750
      externalTransactionId: `UTR-${timestamp}-02`
    }
  ]);

  console.log('--- 1. CLIENT WITHDRAWAL REQUEST CREATION & VALIDATION ---');

  // TEST 1: Cannot withdraw more than available balance
  let overbalanceError = false;
  try {
    await clientWithdrawalService.createClientWithdrawalRequest({
      clientId: testClient._id,
      amount: 200000, // Available is 150,000
      destinationType: 'bank',
      selectedAccountId: testClient.bankAccounts[0]._id
    });
  } catch (err) {
    overbalanceError = true;
  }
  assert(overbalanceError, 'Client cannot request withdrawal exceeding available platform balance');

  // TEST 2: Cannot withdraw less than ₹25,000 (disallows random amounts < 25000)
  let belowMinError = false;
  try {
    await clientWithdrawalService.createClientWithdrawalRequest({
      clientId: testClient._id,
      amount: 15000, // Below minimum threshold of ₹25,000
      destinationType: 'bank'
    });
  } catch (err) {
    belowMinError = true;
  }
  assert(belowMinError, 'Client cannot request withdrawal below ₹25,000 (no random amounts below min limit)');

  // TEST 3: Client creates withdrawal of minimum ₹25,000 to saved Bank Account
  const wthBankRes = await clientWithdrawalService.createClientWithdrawalRequest({
    clientId: testClient._id,
    amount: 25000,
    destinationType: 'bank',
    selectedAccountId: testClient.bankAccounts[0]._id,
    notes: 'Withdrawal of ₹25,000 to primary HDFC'
  });
  const wthBank = wthBankRes.withdrawal;
  assert(
    wthBank &&
      wthBank.amount === 25000 &&
      wthBank.destinationType === 'bank' &&
      wthBank.status === 'PENDING_ADMIN_PAYMENT' &&
      wthBank.destinationDetails?.accountNumber === '50100987654321',
    'Client successfully creates minimum ₹25,000 withdrawal request to saved Bank Account'
  );

  // TEST 4: Client creates withdrawal of ₹50,000 to saved Wallet / UPI with QR
  const wthWalletRes = await clientWithdrawalService.createClientWithdrawalRequest({
    clientId: testClient._id,
    amount: 50000,
    destinationType: 'wallet',
    selectedAccountId: testClient.wallets[0]._id,
    notes: 'Withdrawal of ₹50,000 to UPI'
  });
  const wthWallet = wthWalletRes.withdrawal;
  assert(
    wthWallet &&
      wthWallet.amount === 50000 &&
      wthWallet.destinationType === 'wallet' &&
      wthWallet.destinationDetails?.walletId === 'arjun@okhdfcbank' &&
      wthWallet.destinationDetails?.qrCode !== null,
    'Client successfully creates withdrawal request of ₹50,000 to saved Wallet/UPI with QR code'
  );

  // TEST 5: Client creates withdrawal with custom Manual details for full remaining balance (₹75,000)
  const wthManualRes = await clientWithdrawalService.createClientWithdrawalRequest({
    clientId: testClient._id,
    amount: 75000,
    destinationType: 'bank',
    isManualDestination: true,
    destinationDetails: {
      bankName: 'Axis Bank',
      accountNumber: '912010045678901',
      ifscCode: 'UTIB0000123',
      accountHolderName: 'Arjun Business',
      branchName: 'Noida Sector 18'
    }
  });
  assert(
    wthManualRes.withdrawal.isManualDestination === true &&
      wthManualRes.withdrawal.amount === 75000 &&
      wthManualRes.withdrawal.destinationDetails?.bankName === 'Axis Bank' &&
      wthManualRes.withdrawal.destinationDetails?.accountNumber === '912010045678901',
    'Client successfully creates full remaining balance withdrawal request with manual custom bank details'
  );

  console.log('\n--- 2. ADMIN REVIEW, TRANSACTION HISTORY & COMMISSION CUT ---');

  // TEST 6: Admin retrieves all client withdrawals with statistical aggregation
  const adminWithdrawals = await clientWithdrawalService.adminGetClientWithdrawals({});
  assert(
    adminWithdrawals &&
      adminWithdrawals.withdrawals.length >= 3 &&
      adminWithdrawals.stats.pendingAdminPaymentCount >= 3,
    'Admin retrieves all client withdrawal requests with pending status stats'
  );

  // TEST 7: Admin views withdrawal details including Client Transaction History & Vendor Commissions
  const withdrawalDetail = await clientWithdrawalService.adminGetClientWithdrawalDetails(wthBank._id);
  assert(
    withdrawalDetail &&
      withdrawalDetail.clientFinancials.totalVendorCommission === 1250 && // 500 + 750 = 1250
      withdrawalDetail.transactionHistory.length === 2 &&
      withdrawalDetail.transactionHistory[0].vendorTier === 'Silver Tier',
    'Admin views withdrawal with aggregated Client Transaction history (Total Vendor Commission: ₹1,250)'
  );

  // TEST 8: Admin cannot deduct total commission >= requested amount
  let invalidCommError = false;
  try {
    await clientWithdrawalService.adminSendClientWithdrawalPayment({
      withdrawalId: wthBank._id,
      adminId: testAdmin._id,
      adminCommission: 24000, // 24000 + 1250 vendor comm = 25250 >= 25000 requested
      transactionId: 'UTR99887766'
    });
  } catch (err) {
    invalidCommError = true;
  }
  assert(invalidCommError, 'Total deductions (Vendor Comm + Admin Comm) cannot exceed or equal requested amount');

  // TEST 9: Admin submits payment proof with percentage admin commission (2%) and vendor commission deduction
  // Gross: ₹25,000, Vendor Comm: ₹1,250, Admin Comm: 2% (₹500), Net Paid: ₹23,250
  const adminPayRes = await clientWithdrawalService.adminSendClientWithdrawalPayment({
    withdrawalId: wthBank._id,
    adminId: testAdmin._id,
    adminCommissionPercentage: 2,
    vendorCommissionDeducted: 1250,
    transactionId: `UTR-${timestamp}-BANK-PAYOUT`,
    paymentProof: 'https://res.cloudinary.com/demo/image/upload/admin_proof_payout.png',
    adminNotes: 'Transferred via IMPS Corporate Banking'
  });
  const paidWth = adminPayRes.withdrawal;
  assert(
    paidWth.status === 'PAYMENT_SENT_BY_ADMIN' &&
      paidWth.adminPaymentDetails.adminCommissionPercentage === 2 &&
      paidWth.adminPaymentDetails.adminCommission === 500 &&
      paidWth.adminPaymentDetails.totalVendorCommissionDeducted === 1250 &&
      paidWth.adminPaymentDetails.paidAmount === 23250 &&
      paidWth.adminPaymentDetails.transactionId === `UTR-${timestamp}-BANK-PAYOUT`,
    'Admin submits payout proof with 2% Admin Commission (₹500) and Vendor Comm (₹1,250) deducted (Net Paid: ₹23,250)'
  );

  console.log('\n--- 3. CLIENT CONFIRMATION, LEDGER SETTLEMENT & RECEIPT GENERATION ---');

  // TEST 10: Client confirms & approves received withdrawal ("Han Paisa Aa Gaya Hai")
  const approveResult = await clientWithdrawalService.clientApproveWithdrawal(wthBank._id, testClient._id);
  assert(
    approveResult.success === true &&
      approveResult.data.withdrawal.status === 'APPROVED' &&
      approveResult.data.receipt !== undefined,
    'Client confirms received withdrawal and status becomes APPROVED'
  );

  // TEST 11: Client platform balance is atomically deducted upon approval
  const updatedClient = await Client.findById(testClient._id);
  assert(
    updatedClient.balance === 125000, // 150,000 - 25,000 = 125,000
    'Client platform balance is accurately deducted by ₹25,000 (New balance: ₹1,25,000)'
  );

  // TEST 12: Receipt contains complete breakdown of Vendor Commission + Admin Commission
  const receipt = approveResult.data.receipt;
  assert(
    receipt.receiptNumber === `REC-${wthBank.withdrawalId}` &&
      receipt.requestedAmount === 25000 &&
      receipt.adminCommissionDeducted === 500 &&
      receipt.totalVendorCommission === 1250 &&
      receipt.totalCombinedCommission === 1750 && // 1250 + 500 = 1750
      receipt.netAmountReceived === 23250 && // 25000 - 1250 - 500 = 23250
      receipt.transactionId === `UTR-${timestamp}-BANK-PAYOUT`,
    'Receipt contains complete itemized breakdown: Vendor Comm ₹1,250 + Admin Comm ₹500 (2%) = Combined Comm ₹1,750, Net Received ₹23,250'
  );

  // TEST 13: Client cannot approve already approved withdrawal
  let duplicateApproveError = false;
  try {
    await clientWithdrawalService.clientApproveWithdrawal(wthBank._id, testClient._id);
  } catch (err) {
    duplicateApproveError = true;
  }
  assert(duplicateApproveError, 'Duplicate approval on settled withdrawal is prevented');

  // TEST 14: Admin sends payment for wallet withdrawal with percentage admin commission (1.5%)
  // Gross: ₹50,000, Vendor Comm: ₹0 (since CTX was already calculated or 0), Admin Comm: 1.5% (₹750), Net Paid: ₹49,250
  await clientWithdrawalService.adminSendClientWithdrawalPayment({
    withdrawalId: wthWallet._id,
    adminId: testAdmin._id,
    adminCommissionPercentage: 1.5,
    vendorCommissionDeducted: 0,
    transactionId: `UTR-${timestamp}-WALLET-PAYOUT`,
    paymentProof: 'https://res.cloudinary.com/demo/image/upload/wallet_payout.png'
  });

  // TEST 15: Client rejects withdrawal (funds not received)
  const rejectRes = await clientWithdrawalService.clientRejectWithdrawal(
    wthWallet._id,
    testClient._id,
    'Funds not reflected in UPI app bank statement'
  );
  assert(
    rejectRes.withdrawal.status === 'REJECTED' &&
      rejectRes.withdrawal.clientConfirmation?.isApproved === false &&
      rejectRes.withdrawal.clientConfirmation?.rejectionReason === 'Funds not reflected in UPI app bank statement',
    'Client rejects withdrawal with rejection reason and status becomes REJECTED'
  );

  // TEST 15: Client balance is NOT deducted for rejected withdrawal
  const clientAfterReject = await Client.findById(testClient._id);
  assert(
    clientAfterReject.balance === 125000,
    'Client platform balance is preserved and not deducted for rejected withdrawal'
  );

  // --- 4. ADMIN PROFIT ANALYTICS & PER-CLIENT PROFIT LEDGER ---
  console.log('\n--- 4. ADMIN PROFIT ANALYTICS & PER-CLIENT PROFIT LEDGER ---');

  const profitAnalytics = await clientWithdrawalService.adminGetProfitAnalytics({
    page: 1,
    limit: 10,
    clientId: testClient._id.toString()
  });

  // TEST 16: Admin Profit Summary aggregates realized profit accurately
  assert(
    profitAnalytics.summary &&
      profitAnalytics.summary.totalRealizedProfit === 500 &&
      profitAnalytics.summary.totalSettledVolume === 25000 &&
      profitAnalytics.summary.totalSettledCount === 1,
    'Admin profit analytics accurately computes total realized profit (₹500) and settled volume (₹25,000)'
  );

  // TEST 17: Per-client profit breakdown accurately attributes profit to specific client
  const clientSummary = (profitAnalytics.clientBreakdown || []).find(
    (c) => c.clientId.toString() === testClient._id.toString()
  );
  assert(
    clientSummary &&
      clientSummary.clientName === 'Arjun Sharma' &&
      clientSummary.totalRealizedProfit === 500 &&
      clientSummary.avgProfitMargin === 2.0 &&
      clientSummary.totalVolume === 25000,
    'Per-client breakdown groups profit by client (Arjun Sharma: ₹500 profit, 2% avg margin)'
  );

  // TEST 18: Profit ledger itemizes settlement breakdown with deductions
  const ledgerItem = (profitAnalytics.profitLedger || []).find(
    (l) => l.withdrawalId === wthBank.withdrawalId
  );
  assert(
    ledgerItem &&
      ledgerItem.adminProfitAmount === 500 &&
      ledgerItem.adminCommissionPercentage === 2.0 &&
      ledgerItem.vendorCommissionDeducted === 1250 &&
      ledgerItem.netPaidAmount === 23250 &&
      ledgerItem.status === 'APPROVED',
    'Profit ledger itemizes withdrawal settlement (Gross ₹25,000, Vendor Comm ₹1,250, Admin Profit ₹500, Net Paid ₹23,250)'
  );

  // TEST 19: Client portal balance & financial KPI summary returns totalEarnings and totalWithdrawn
  const clientFinancialSummary = await getClientBalanceAndHistory(testClient._id);
  assert(
    clientFinancialSummary.balance === 125000 &&
      clientFinancialSummary.totalEarnings === 50000 &&
      clientFinancialSummary.totalWithdrawn === 25000,
    `Client financial overview correctly calculates Total Earning (₹50,000), Total Withdrawal (₹25,000), and Platform Balance (₹1,25,000)`
  );

  // Cleanup test documents
  await ClientWithdrawal.deleteMany({ clientId: testClient._id });
  await ClientTransaction.deleteMany({ clientId: testClient._id });
  await Client.deleteMany({ _id: testClient._id });
  await Vendor.deleteMany({ _id: testVendor._id });
  await Admin.deleteMany({ _id: testAdmin._id });

  console.log('\n========================================================================');
  console.log(`📊 TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('========================================================================\n');

  return { passedTests, totalTests };
}

if (require.main === module) {
  require('dotenv').config();
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/moffin_db';
  mongoose
    .connect(mongoUri)
    .then(() => runClientWithdrawalTests())
    .then(() => mongoose.disconnect())
    .catch((err) => {
      console.error('Test Runner Error:', err);
      process.exit(1);
    });
}

module.exports = { runClientWithdrawalTests };
