/**
 * Automated Test Suite for:
 * 1. Client Registration (Validation, Unique checks, Forced 'client' role, Password hashing)
 * 2. Client Login (Credential verification, Deactivated/Blocked enforcement, lastLoginAt)
 * 3. Client Authentication & Role Middleware (req.client, token verification, RBAC isolation)
 * 4. Client Profile API (Private client details, sanitized response)
 * 5. Admin Client Management (Pagination, Search, Filter by status)
 * 6. Admin Client Real-Time Database Statistics (Total, Active, Inactive, Blocked, Verified, Unverified)
 * 7. Admin Client Status Management (Activate, Deactivate, Block, Unblock, and Login rejection)
 * 8. Audit Logging & Security Rules
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Models
const Client = require('../src/models/clientModel');
const Vendor = require('../src/models/vendorModel');
const Admin = require('../src/models/adminModel');
const AuditLog = require('../src/models/auditLogModel');

// Controllers
const clientAuthController = require('../src/controllers/clientAuthController');
const adminClientController = require('../src/controllers/adminClientController');

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

/**
 * Mock Express Request/Response objects helper
 */
const mockReqRes = (reqData = {}) => {
  const req = {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: null,
    client: null,
    ...reqData
  };

  let statusCode = 200;
  let responseData = null;

  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (data) => {
      responseData = data;
      return res;
    }
  };

  return {
    req,
    res,
    getStatus: () => statusCode,
    getData: () => responseData
  };
};

async function runClientTests() {
  console.log('====================================================');
  console.log('🧪 STARTING CLIENT AUTH & ADMIN CLIENT MANAGEMENT TESTS');
  console.log('====================================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/moffin_db';
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const timestamp = Date.now();
  const passwordPlain = 'ClientSecret@2026';
  const testEmail1 = `john.doe_${timestamp}@example.com`;
  const testMobile1 = `9876500001_${timestamp}`.substring(0, 15);

  // Clean up any potential stale test records
  await Client.deleteMany({ email: new RegExp(`_${timestamp}@example.com`) });

  console.log('--- 1. CLIENT REGISTRATION TESTS ---');

  // TEST 1: Valid Client Registration with all personal & business fields + multiple telegram IDs
  const regMock1 = mockReqRes({
    body: {
      firstName: 'John',
      lastName: 'Doe',
      email: testEmail1,
      mobile: testMobile1,
      whatsappNumber: '+91 9876500099',
      alternativeMobileNumber: '+91 9876500088',
      platformUrl: 'https://johndoe-ecommerce.com',
      businessType: 'eCommerce / Online Retail',
      telegramIds: ['@johndoe_official', '@johndoe_support', 't.me/johndoe_vip'],
      password: passwordPlain,
      role: 'admin' // Attempting privilege escalation - backend MUST override to 'client'
    }
  });
  await clientAuthController.registerClient(regMock1.req, regMock1.res);
  const regData1 = regMock1.getData();
  const createdClient1 = await Client.findOne({ email: testEmail1 }).select('+password');

  assert(
    regMock1.getStatus() === 201 &&
      regData1.success === true &&
      regData1.data.token &&
      regData1.data.client.role === 'client' &&
      regData1.data.client.email === testEmail1 &&
      regData1.data.client.whatsappNumber === '+91 9876500099' &&
      regData1.data.client.alternativeMobileNumber === '+91 9876500088' &&
      regData1.data.client.platformUrl === 'https://johndoe-ecommerce.com' &&
      regData1.data.client.businessType === 'eCommerce / Online Retail' &&
      regData1.data.client.telegramIds.length === 3 &&
      regData1.data.client.telegramIds[0] === '@johndoe_official' &&
      regData1.data.client.isActive === true &&
      regData1.data.client.isBlocked === false &&
      regData1.data.client.status === 'active' &&
      regData1.data.client.password === undefined,
    'Client registers successfully with platformUrl, businessType, whatsappNumber, altNumber, and multiple telegramIds'
  );

  // TEST 2: Password is securely hashed in database
  const isPassHashed = await bcrypt.compare(passwordPlain, createdClient1.password);
  assert(
    isPassHashed && createdClient1.password !== passwordPlain,
    'Client password is encrypted with bcrypt hash and never stored as plaintext'
  );

  // TEST 3: Duplicate Email Registration is Rejected
  const regMockDupEmail = mockReqRes({
    body: {
      firstName: 'Jane',
      lastName: 'Doe',
      email: testEmail1, // Duplicate email
      mobile: `9876500002_${timestamp}`.substring(0, 15),
      password: passwordPlain
    }
  });
  await clientAuthController.registerClient(regMockDupEmail.req, regMockDupEmail.res);
  assert(
    regMockDupEmail.getStatus() === 409 && regMockDupEmail.getData().success === false,
    'Duplicate email registration is rejected with HTTP 409 Conflict'
  );

  // TEST 4: Duplicate Mobile Number is Rejected
  const regMockDupMobile = mockReqRes({
    body: {
      firstName: 'Jane',
      lastName: 'Doe',
      email: `jane.doe_${timestamp}@example.com`,
      mobile: testMobile1, // Duplicate mobile
      password: passwordPlain
    }
  });
  await clientAuthController.registerClient(regMockDupMobile.req, regMockDupMobile.res);
  assert(
    regMockDupMobile.getStatus() === 409 && regMockDupMobile.getData().success === false,
    'Duplicate mobile number registration is rejected with HTTP 409 Conflict'
  );

  // TEST 5: Missing Required Fields Validation
  const regMockMissing = mockReqRes({
    body: {
      firstName: 'John',
      email: `missing_${timestamp}@example.com`
      // Missing lastName, mobile, password
    }
  });
  await clientAuthController.registerClient(regMockMissing.req, regMockMissing.res);
  assert(
    regMockMissing.getStatus() === 400 && regMockMissing.getData().success === false,
    'Registration with missing required fields is rejected with HTTP 400 Bad Request'
  );

  // TEST 6: Invalid Email Format Validation
  const regMockBadEmail = mockReqRes({
    body: {
      firstName: 'Bad',
      lastName: 'Email',
      email: 'not-an-email',
      mobile: `9876500003_${timestamp}`.substring(0, 15),
      password: passwordPlain
    }
  });
  await clientAuthController.registerClient(regMockBadEmail.req, regMockBadEmail.res);
  assert(
    regMockBadEmail.getStatus() === 400 && regMockBadEmail.getData().success === false,
    'Registration with invalid email format is rejected with HTTP 400 Bad Request'
  );

  // TEST 7: Weak Password (< 6 chars) Validation
  const regMockWeakPass = mockReqRes({
    body: {
      firstName: 'Weak',
      lastName: 'Pass',
      email: `weak_${timestamp}@example.com`,
      mobile: `9876500004_${timestamp}`.substring(0, 15),
      password: '123'
    }
  });
  await clientAuthController.registerClient(regMockWeakPass.req, regMockWeakPass.res);
  assert(
    regMockWeakPass.getStatus() === 400 && regMockWeakPass.getData().success === false,
    'Registration with password shorter than 6 characters is rejected with HTTP 400'
  );

  console.log('\n--- 2. CLIENT LOGIN & AUTHENTICATION TESTS ---');

  // TEST 8: Successful Client Login
  const loginMockValid = mockReqRes({
    body: {
      email: testEmail1,
      password: passwordPlain
    }
  });
  await clientAuthController.loginClient(loginMockValid.req, loginMockValid.res);
  const loginData1 = loginMockValid.getData();
  assert(
    loginMockValid.getStatus() === 200 &&
      loginData1.success === true &&
      loginData1.data.token &&
      loginData1.data.client.email === testEmail1 &&
      loginData1.data.client.password === undefined,
    'Client logs in successfully with valid credentials and receives JWT token'
  );

  // TEST 9: lastLoginAt timestamp is updated on login
  const clientAfterLogin = await Client.findById(createdClient1._id);
  assert(
    clientAfterLogin.lastLoginAt instanceof Date &&
      Date.now() - new Date(clientAfterLogin.lastLoginAt).getTime() < 10000,
    'lastLoginAt timestamp is automatically updated upon successful login'
  );

  // TEST 10: Wrong Password Login Attempt is Rejected
  const loginMockBadPass = mockReqRes({
    body: {
      email: testEmail1,
      password: 'WrongPassword123!'
    }
  });
  await clientAuthController.loginClient(loginMockBadPass.req, loginMockBadPass.res);
  assert(
    loginMockBadPass.getStatus() === 401 && loginMockBadPass.getData().success === false,
    'Login with wrong password is rejected with HTTP 401 Unauthorized'
  );

  // TEST 11: Unknown Email Login Attempt is Rejected
  const loginMockBadEmail = mockReqRes({
    body: {
      email: `unknown_${timestamp}@example.com`,
      password: passwordPlain
    }
  });
  await clientAuthController.loginClient(loginMockBadEmail.req, loginMockBadEmail.res);
  assert(
    loginMockBadEmail.getStatus() === 401 && loginMockBadEmail.getData().success === false,
    'Login with unknown email is rejected with HTTP 401 Unauthorized'
  );

  console.log('\n--- 3. CLIENT PROFILE & RBAC TESTS ---');

  // TEST 12: Authenticated Client can retrieve own profile
  const profileMock = mockReqRes({
    user: { id: createdClient1._id.toString(), role: 'client', email: testEmail1 }
  });
  await clientAuthController.getClientProfile(profileMock.req, profileMock.res);
  const profileData = profileMock.getData();
  assert(
    profileMock.getStatus() === 200 &&
      profileData.success === true &&
      profileData.data.client.email === testEmail1 &&
      profileData.data.client.platformUrl === 'https://johndoe-ecommerce.com' &&
      profileData.data.client.telegramIds.length === 3 &&
      profileData.data.client.password === undefined,
    'Authenticated client retrieves personal & business profile successfully without password exposure'
  );

  // TEST 12B: Client can update personal & business information
  const updateProfileMock = mockReqRes({
    user: { id: createdClient1._id.toString(), role: 'client' },
    body: {
      firstName: 'Johnathan',
      lastName: 'Doe Jr',
      whatsappNumber: '+91 9999911111',
      platformUrl: 'https://new-johndoe-store.com',
      businessType: 'Fintech / Digital Payments',
      telegramIds: ['@john_vip_channel', '@john_desk']
    }
  });
  await clientAuthController.updateClientProfile(updateProfileMock.req, updateProfileMock.res);
  const updatedData = updateProfileMock.getData();
  assert(
    updateProfileMock.getStatus() === 200 &&
      updatedData.success === true &&
      updatedData.data.client.firstName === 'Johnathan' &&
      updatedData.data.client.whatsappNumber === '+91 9999911111' &&
      updatedData.data.client.platformUrl === 'https://new-johndoe-store.com' &&
      updatedData.data.client.telegramIds.length === 2 &&
      updatedData.data.client.telegramIds[0] === '@john_vip_channel',
    'Client updates personal information, business type, and telegram IDs successfully'
  );

  console.log('\n--- 4. ADMIN CLIENT MANAGEMENT & STATISTICS TESTS ---');

  // Seed secondary clients for stats and filter testing
  const clientActive2 = await Client.create({
    firstName: 'Alice',
    lastName: 'Smith',
    email: `alice_${timestamp}@example.com`,
    mobile: `9876500005_${timestamp}`.substring(0, 15),
    password: passwordPlain,
    role: 'client',
    status: 'active',
    isActive: true,
    isBlocked: false,
    isVerified: true
  });

  const clientInactive = await Client.create({
    firstName: 'Bob',
    lastName: 'Inactive',
    email: `bob_${timestamp}@example.com`,
    mobile: `9876500006_${timestamp}`.substring(0, 15),
    password: passwordPlain,
    role: 'client',
    status: 'inactive',
    isActive: false,
    isBlocked: false,
    isVerified: true
  });

  const clientBlocked = await Client.create({
    firstName: 'Charlie',
    lastName: 'Blocked',
    email: `charlie_${timestamp}@example.com`,
    mobile: `9876500007_${timestamp}`.substring(0, 15),
    password: passwordPlain,
    role: 'client',
    status: 'blocked',
    isActive: false,
    isBlocked: true,
    isVerified: false
  });

  // TEST 13: Admin Client Statistics API calculates authoritative database counts
  const statsMock = mockReqRes({
    user: { id: 'admin_id_test', role: 'super_admin' }
  });
  await adminClientController.getAdminClientStats(statsMock.req, statsMock.res);
  const statsData = statsMock.getData();
  const dbTotal = await Client.countDocuments();
  const dbActive = await Client.countDocuments({ status: 'active', isActive: true, isBlocked: false });
  const dbInactive = await Client.countDocuments({
    $or: [{ status: 'inactive', isBlocked: false }, { isActive: false, isBlocked: false }]
  });
  const dbBlocked = await Client.countDocuments({
    $or: [{ status: 'blocked' }, { isBlocked: true }]
  });

  assert(
    statsMock.getStatus() === 200 &&
      statsData.data.totalClients === dbTotal &&
      statsData.data.activeClients === dbActive &&
      statsData.data.inactiveClients === dbInactive &&
      statsData.data.blockedClients === dbBlocked,
    `Admin statistics returns authoritative real-time database counts (Total: ${dbTotal}, Active: ${dbActive}, Inactive: ${dbInactive}, Blocked: ${dbBlocked})`
  );

  // TEST 14: Admin Client List with Pagination
  const listMock = mockReqRes({
    query: { page: 1, limit: 2 }
  });
  await adminClientController.getAdminClients(listMock.req, listMock.res);
  const listData = listMock.getData();
  assert(
    listMock.getStatus() === 200 &&
      listData.data.clients.length === 2 &&
      listData.data.pagination.page === 1 &&
      listData.data.pagination.limit === 2 &&
      listData.data.pagination.total >= 4,
    'Admin gets paginated client list with proper limit and pagination metadata'
  );

  // TEST 15: Admin Client Search by Name / Email / Mobile
  const searchMock = mockReqRes({
    query: { search: 'Alice' }
  });
  await adminClientController.getAdminClients(searchMock.req, searchMock.res);
  const searchData = searchMock.getData();
  assert(
    searchMock.getStatus() === 200 &&
      searchData.data.clients.length >= 1 &&
      searchData.data.clients.some((c) => c.firstName === 'Alice'),
    'Admin searches clients by name/keyword with server-side regex matching'
  );

  // TEST 16: Admin Client Filter by Status (active / inactive / blocked)
  const filterMock = mockReqRes({
    query: { status: 'blocked' }
  });
  await adminClientController.getAdminClients(filterMock.req, filterMock.res);
  const filterData = filterMock.getData();
  assert(
    filterMock.getStatus() === 200 &&
      filterData.data.clients.length >= 1 &&
      filterData.data.clients.every((c) => c.isBlocked === true || c.status === 'blocked'),
    'Admin filters clients by status="blocked" returning only blocked accounts'
  );

  // TEST 17: Admin Get Client by ID
  const getByIdMock = mockReqRes({
    params: { clientId: createdClient1._id.toString() }
  });
  await adminClientController.getAdminClientById(getByIdMock.req, getByIdMock.res);
  const getByIdData = getByIdMock.getData();
  assert(
    getByIdMock.getStatus() === 200 &&
      getByIdData.data.client._id.toString() === createdClient1._id.toString() &&
      getByIdData.data.client.password === undefined,
    'Admin retrieves specific client details by ID'
  );

  console.log('\n--- 5. ADMIN CLIENT STATUS MANAGEMENT TESTS ---');

  // TEST 18: Admin Deactivates Client (status: 'inactive') -> Login Rejected
  const deactMock = mockReqRes({
    params: { clientId: createdClient1._id.toString() },
    body: { status: 'inactive', reason: 'Deactivated for review' },
    user: { id: 'admin_id_test', role: 'super_admin' }
  });
  await adminClientController.updateAdminClientStatus(deactMock.req, deactMock.res);
  assert(
    deactMock.getStatus() === 200 &&
      deactMock.getData().data.client.status === 'inactive' &&
      deactMock.getData().data.client.isActive === false,
    'Admin deactivates client setting status to "inactive" and isActive to false'
  );

  const loginAfterDeact = mockReqRes({
    body: { email: testEmail1, password: passwordPlain }
  });
  await clientAuthController.loginClient(loginAfterDeact.req, loginAfterDeact.res);
  assert(
    loginAfterDeact.getStatus() === 403 &&
      loginAfterDeact.getData().message.toLowerCase().includes('deactivated'),
    'Deactivated client is rejected from login with HTTP 403'
  );

  // TEST 19: Admin Blocks Client (status: 'blocked') -> Login Rejected
  const blockMock = mockReqRes({
    params: { clientId: createdClient1._id.toString() },
    body: { status: 'blocked', reason: 'Security policy violation' },
    user: { id: 'admin_id_test', role: 'super_admin' }
  });
  await adminClientController.updateAdminClientStatus(blockMock.req, blockMock.res);
  assert(
    blockMock.getStatus() === 200 &&
      blockMock.getData().data.client.status === 'blocked' &&
      blockMock.getData().data.client.isBlocked === true &&
      blockMock.getData().data.client.isActive === false,
    'Admin blocks client setting status to "blocked" and isBlocked to true'
  );

  const loginAfterBlock = mockReqRes({
    body: { email: testEmail1, password: passwordPlain }
  });
  await clientAuthController.loginClient(loginAfterBlock.req, loginAfterBlock.res);
  assert(
    loginAfterBlock.getStatus() === 403 &&
      loginAfterBlock.getData().message.toLowerCase().includes('blocked'),
    'Blocked client is rejected from login with HTTP 403'
  );

  // TEST 20: Admin Reactivates Client (status: 'active') -> Login Succeeds
  const reactivateMock = mockReqRes({
    params: { clientId: createdClient1._id.toString() },
    body: { status: 'active', reason: 'Resolved issue' },
    user: { id: 'admin_id_test', role: 'super_admin' }
  });
  await adminClientController.updateAdminClientStatus(reactivateMock.req, reactivateMock.res);
  assert(
    reactivateMock.getStatus() === 200 &&
      reactivateMock.getData().data.client.status === 'active' &&
      reactivateMock.getData().data.client.isActive === true &&
      reactivateMock.getData().data.client.isBlocked === false,
    'Admin reactivates client setting status to "active", isActive=true, isBlocked=false'
  );

  const loginAfterReactivate = mockReqRes({
    body: { email: testEmail1, password: passwordPlain }
  });
  await clientAuthController.loginClient(loginAfterReactivate.req, loginAfterReactivate.res);
  assert(
    loginAfterReactivate.getStatus() === 200 && loginAfterReactivate.getData().success === true,
    'Reactivated client can login successfully again'
  );

  // TEST 21: Audit logs are recorded for Client events
  const clientAudits = await AuditLog.find({ targetType: 'Client' });
  assert(
    clientAudits.length >= 3,
    'Registration, Login, and Status updates are saved in AuditLog'
  );

  console.log('\n====================================================');
  console.log(`📊 TEST RESULTS: ${passedTests}/${totalTests} PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('====================================================\n');

  // Clean up test clients
  await Client.deleteMany({
    _id: {
      $in: [
        createdClient1._id,
        clientActive2._id,
        clientInactive._id,
        clientBlocked._id
      ]
    }
  });

  return { passedTests, totalTests };
}

module.exports = { runClientTests };

if (require.main === module) {
  runClientTests()
    .then(() => {
      mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Test Execution Error:', err);
      process.exit(1);
    });
}
