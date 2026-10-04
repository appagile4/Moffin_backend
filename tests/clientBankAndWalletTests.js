/**
 * Automated Test Suite for:
 * Client Bank Accounts & Wallets with QR Management
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Models
const Client = require('../src/models/clientModel');

// Controller logic directly or via mocked req/res
const {
  getClientBankAccounts,
  addClientBankAccount,
  updateClientBankAccount,
  deleteClientBankAccount,
  setDefaultClientBankAccount,
  toggleClientBankAccount,
  getClientWallets,
  addClientWallet,
  updateClientWallet,
  deleteClientWallet,
  setDefaultClientWallet,
  toggleClientWallet
} = require('../src/controllers/clientBankWalletController');

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

// Helper mock response
const mockResponse = () => {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.jsonData = data;
    return res;
  };
  return res;
};

async function runClientBankAndWalletTests() {
  console.log('========================================================================');
  console.log('🧪 RUNNING CLIENT BANK ACCOUNTS & WALLETS (WITH QR) TEST SUITE');
  console.log('========================================================================\n');

  if (mongoose.connection.readyState === 0) {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/moffin_db';
    await mongoose.connect(mongoUri);
  }

  const timestamp = Date.now();
  const passwordHash = await bcrypt.hash('ClientPass@123', 10);

  // Setup Test Client A & Client B
  const clientA = await Client.create({
    firstName: 'Rohan',
    lastName: 'Client',
    email: `rohan_client_${timestamp}@test.com`,
    password: passwordHash,
    mobile: `9800000001_${timestamp}`.substring(0, 15),
    role: 'client',
    status: 'active'
  });

  const clientB = await Client.create({
    firstName: 'Aakash',
    lastName: 'ClientB',
    email: `aakash_client_${timestamp}@test.com`,
    password: passwordHash,
    mobile: `9800000002_${timestamp}`.substring(0, 15),
    role: 'client',
    status: 'active'
  });

  try {
    // =========================================================================
    // 1. CLIENT BANK ACCOUNTS TESTS
    // =========================================================================
    console.log('--- 1. CLIENT BANK ACCOUNTS TESTS ---');

    // Test 1: Validation failure on missing fields
    const req1 = {
      user: { id: clientA._id },
      body: { accountNumber: '1234567890' } // missing ifsc, bankName, holderName
    };
    const res1 = mockResponse();
    await addClientBankAccount(req1, res1);
    assert(res1.statusCode === 400, 'Validation rejects adding bank account with missing required fields');

    // Test 2: Add first bank account (automatically marked default)
    const req2 = {
      user: { id: clientA._id },
      body: {
        bankName: 'HDFC Bank',
        accountNumber: '50100456789012',
        ifscCode: 'HDFC0001234',
        accountHolderName: 'Rohan Enterprises',
        branchName: 'Mumbai Fort'
      }
    };
    const res2 = mockResponse();
    await addClientBankAccount(req2, res2);
    assert(
      res2.statusCode === 201 &&
      res2.jsonData.success === true &&
      res2.jsonData.data.bankAccount.isDefault === true &&
      res2.jsonData.data.bankAccount.bankName === 'HDFC Bank',
      'Client adds first bank account successfully; automatically assigned as default'
    );
    const bank1Id = res2.jsonData.data.bankAccount._id;

    // Test 3: Add second bank account with explicit isDefault = true
    const req3 = {
      user: { id: clientA._id },
      body: {
        bankName: 'ICICI Bank',
        accountNumber: '001105009988',
        ifscCode: 'ICIC0000011',
        accountHolderName: 'Rohan Enterprises',
        branchName: 'Nariman Point',
        isDefault: true
      }
    };
    const res3 = mockResponse();
    await addClientBankAccount(req3, res3);
    assert(
      res3.statusCode === 201 &&
      res3.jsonData.data.bankAccount.isDefault === true,
      'Client adds second bank account with isDefault=true'
    );
    const bank2Id = res3.jsonData.data.bankAccount._id;

    // Test 4: Verify previous bank account is no longer default
    const req4 = { user: { id: clientA._id } };
    const res4 = mockResponse();
    await getClientBankAccounts(req4, res4);
    const accounts = res4.jsonData.data.bankAccounts;
    const account1 = accounts.find(a => a._id.toString() === bank1Id.toString());
    const account2 = accounts.find(a => a._id.toString() === bank2Id.toString());
    assert(
      accounts.length === 2 && account1.isDefault === false && account2.isDefault === true,
      'Adding default bank account unsets default on previous accounts'
    );

    // Test 5: Update bank account details
    const req5 = {
      user: { id: clientA._id },
      params: { bankAccountId: bank1Id },
      body: {
        branchName: 'Bandra Kurla Complex'
      }
    };
    const res5 = mockResponse();
    await updateClientBankAccount(req5, res5);
    assert(
      res5.statusCode === 200 &&
      res5.jsonData.data.bankAccount.branchName === 'Bandra Kurla Complex',
      'Client updates bank account branch name successfully'
    );

    // Test 6: Set bank1 back as default
    const req6 = {
      user: { id: clientA._id },
      params: { bankAccountId: bank1Id }
    };
    const res6 = mockResponse();
    await setDefaultClientBankAccount(req6, res6);
    assert(
      res6.statusCode === 200 &&
      res6.jsonData.data.bankAccount.isDefault === true,
      'Client switches default bank account via setDefaultClientBankAccount'
    );

    // Test 7: Toggle active status
    const req7 = {
      user: { id: clientA._id },
      params: { bankAccountId: bank2Id }
    };
    const res7 = mockResponse();
    await toggleClientBankAccount(req7, res7);
    assert(
      res7.statusCode === 200 &&
      res7.jsonData.data.bankAccount.isActive === false,
      'Client deactivates bank account via toggle'
    );

    // Test 8: Client B cannot delete or modify Client A's bank account
    const req8 = {
      user: { id: clientB._id },
      params: { bankAccountId: bank1Id }
    };
    const res8 = mockResponse();
    await deleteClientBankAccount(req8, res8);
    assert(
      res8.statusCode === 404,
      'Client isolation: Client B cannot delete Client A bank account'
    );

    // Test 9: Client deletes bank2
    const req9 = {
      user: { id: clientA._id },
      params: { bankAccountId: bank2Id }
    };
    const res9 = mockResponse();
    await deleteClientBankAccount(req9, res9);
    assert(
      res9.statusCode === 200 &&
      res9.jsonData.data.bankAccounts.length === 1,
      'Client deletes bank account successfully'
    );

    // =========================================================================
    // 2. CLIENT WALLETS & QR CODE TESTS
    // =========================================================================
    console.log('\n--- 2. CLIENT WALLETS & QR CODE TESTS ---');

    // Test 10: Validation failure on missing wallet fields
    const req10 = {
      user: { id: clientA._id },
      body: { walletName: 'Google Pay' } // missing walletId
    };
    const res10 = mockResponse();
    await addClientWallet(req10, res10);
    assert(res10.statusCode === 400, 'Validation rejects adding wallet without walletId/UPI ID');

    // Test 11: Add wallet with QR code URL
    const req11 = {
      user: { id: clientA._id },
      body: {
        walletName: 'Google Pay',
        walletId: 'rohan@okhdfcbank',
        qrCode: 'https://res.cloudinary.com/test/image/upload/sample_client_gpay_qr.png'
      }
    };
    const res11 = mockResponse();
    await addClientWallet(req11, res11);
    assert(
      res11.statusCode === 201 &&
      res11.jsonData.data.wallet.walletName === 'Google Pay' &&
      res11.jsonData.data.wallet.walletId === 'rohan@okhdfcbank' &&
      res11.jsonData.data.wallet.qrCode.includes('sample_client_gpay_qr') &&
      res11.jsonData.data.wallet.isDefault === true,
      'Client adds first wallet with QR code; automatically assigned as default'
    );
    const wallet1Id = res11.jsonData.data.wallet._id;

    // Test 12: Add second wallet (PhonePe) with isDefault = true
    const req12 = {
      user: { id: clientA._id },
      body: {
        walletName: 'PhonePe',
        walletId: '9876543210@ybl',
        qrCode: 'https://res.cloudinary.com/test/image/upload/sample_client_phonepe_qr.png',
        isDefault: true
      }
    };
    const res12 = mockResponse();
    await addClientWallet(req12, res12);
    assert(
      res12.statusCode === 201 &&
      res12.jsonData.data.wallet.isDefault === true,
      'Client adds second wallet with isDefault=true'
    );
    const wallet2Id = res12.jsonData.data.wallet._id;

    // Test 13: Verify previous wallet is no longer default
    const req13 = { user: { id: clientA._id } };
    const res13 = mockResponse();
    await getClientWallets(req13, res13);
    const wallets = res13.jsonData.data.wallets;
    const w1 = wallets.find(w => w._id.toString() === wallet1Id.toString());
    const w2 = wallets.find(w => w._id.toString() === wallet2Id.toString());
    assert(
      wallets.length === 2 && w1.isDefault === false && w2.isDefault === true,
      'Adding default wallet unsets default on other wallets'
    );

    // Test 14: Update wallet QR code and name
    const req14 = {
      user: { id: clientA._id },
      params: { walletId: wallet1Id },
      body: {
        walletName: 'GPay Business',
        qrCode: 'https://res.cloudinary.com/test/image/upload/updated_gpay_qr.png'
      }
    };
    const res14 = mockResponse();
    await updateClientWallet(req14, res14);
    assert(
      res14.statusCode === 200 &&
      res14.jsonData.data.wallet.walletName === 'GPay Business' &&
      res14.jsonData.data.wallet.qrCode.includes('updated_gpay_qr'),
      'Client updates wallet name and QR code successfully'
    );

    // Test 15: Set wallet1 back as default
    const req15 = {
      user: { id: clientA._id },
      params: { walletId: wallet1Id }
    };
    const res15 = mockResponse();
    await setDefaultClientWallet(req15, res15);
    assert(
      res15.statusCode === 200 &&
      res15.jsonData.data.wallet.isDefault === true,
      'Client switches default wallet via setDefaultClientWallet'
    );

    // Test 16: Toggle wallet active status
    const req16 = {
      user: { id: clientA._id },
      params: { walletId: wallet2Id }
    };
    const res16 = mockResponse();
    await toggleClientWallet(req16, res16);
    assert(
      res16.statusCode === 200 &&
      res16.jsonData.data.wallet.isActive === false,
      'Client deactivates wallet via toggle'
    );

    // Test 17: Client B cannot delete Client A's wallet
    const req17 = {
      user: { id: clientB._id },
      params: { walletId: wallet1Id }
    };
    const res17 = mockResponse();
    await deleteClientWallet(req17, res17);
    assert(
      res17.statusCode === 404,
      'Client isolation: Client B cannot delete Client A wallet'
    );

    // Test 18: Client deletes wallet2
    const req18 = {
      user: { id: clientA._id },
      params: { walletId: wallet2Id }
    };
    const res18 = mockResponse();
    await deleteClientWallet(req18, res18);
    assert(
      res18.statusCode === 200 &&
      res18.jsonData.data.wallets.length === 1,
      'Client deletes wallet successfully'
    );

    console.log('\n========================================================================');
    console.log(`📊 TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
    console.log('========================================================================\n');

  } catch (err) {
    console.error('Client Bank & Wallet Test Suite Error:', err);
  } finally {
    // Cleanup
    await Client.deleteMany({ _id: { $in: [clientA._id, clientB._id] } });
    if (require.main === module) {
      await mongoose.disconnect();
    }
  }
}

module.exports = { runClientBankAndWalletTests };

if (require.main === module) {
  runClientBankAndWalletTests();
}
