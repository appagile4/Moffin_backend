// Moffin 2 Client JavaScript
const API_BASE = window.location.origin && window.location.origin.startsWith('http')
  ? `${window.location.origin}/api`
  : 'http://localhost:5000/api';

// State Management
let currentToken = localStorage.getItem('moffin_token') || null;
let currentVendor = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  checkServerHealth();
  if (currentToken) {
    loadVendorProfile();
  } else {
    showAuthSection();
  }
});

/**
 * Toast Notification Utility
 */
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}

/**
 * Server Health Check
 */
async function checkServerHealth() {
  const badge = document.getElementById('serverStatusBadge');
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    if (data.status === 'healthy') {
      badge.textContent = `Server: Connected (DB: ${data.dbState})`;
      badge.className = 'badge badge-approved';
    } else {
      badge.textContent = 'Server: Degraded';
      badge.className = 'badge badge-pending';
    }
  } catch (err) {
    badge.textContent = 'Server: Offline';
    badge.className = 'badge badge-rejected';
  }
}

/**
 * UI State Switching
 */
function showAuthSection() {
  document.getElementById('authSection').classList.remove('hidden');
  document.getElementById('dashboardSection').classList.add('hidden');
  document.getElementById('logoutBtn').classList.add('hidden');
  document.getElementById('userGreeting').textContent = '';
}

function showDashboardSection() {
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('dashboardSection').classList.remove('hidden');
  document.getElementById('logoutBtn').classList.remove('hidden');
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

  document.getElementById(tabId).classList.remove('hidden');
  event.target.classList.add('active');

  if (tabId === 'banksTab') fetchBankAccounts();
  if (tabId === 'walletsTab') fetchWallets();
}

/**
 * 1. Register Vendor (Supports Cloudinary Profile Photo)
 */
async function handleRegister(event) {
  event.preventDefault();

  const formData = new FormData();
  formData.append('firstName', document.getElementById('regFirstName').value.trim());
  formData.append('lastName', document.getElementById('regLastName').value.trim());
  formData.append('email', document.getElementById('regEmail').value.trim());
  formData.append('password', document.getElementById('regPassword').value);
  formData.append('mobileNumber', document.getElementById('regMobile').value.trim());

  const whatsapp = document.getElementById('regWhatsapp').value.trim();
  if (whatsapp) formData.append('whatsappNumber', whatsapp);

  const telegram = document.getElementById('regTelegram').value.trim();
  if (telegram) formData.append('telegramId', telegram);

  const photoFile = document.getElementById('regProfilePhoto').files[0];
  if (photoFile) {
    formData.append('profilePhoto', photoFile);
  }

  try {
    const res = await fetch(`${API_BASE}/vendors/register`, {
      method: 'POST',
      body: formData // Browser sets multipart/form-data with boundary automatically
    });

    const data = await res.json();
    if (data.success) {
      showToast('Registration successful! Please sign in.', 'success');
      document.getElementById('registerForm').reset();
      document.getElementById('loginEmail').value = document.getElementById('regEmail').value.trim();
    } else {
      showToast(data.message || 'Registration failed', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to server', 'error');
  }
}

/**
 * 2. Login Vendor
 */
async function handleLogin(event) {
  event.preventDefault();

  const payload = {
    email: document.getElementById('loginEmail').value.trim(),
    password: document.getElementById('loginPassword').value
  };

  try {
    const res = await fetch(`${API_BASE}/vendors/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success && data.data?.token) {
      currentToken = data.data.token;
      localStorage.setItem('moffin_token', currentToken);
      showToast('Login successful!', 'success');
      document.getElementById('loginForm').reset();
      loadVendorProfile();
    } else {
      showToast(data.message || 'Invalid credentials', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to server', 'error');
  }
}

/**
 * 3. Load Vendor Profile
 */
async function loadVendorProfile() {
  try {
    const res = await fetch(`${API_BASE}/vendors/me`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    const data = await res.json();
    if (data.success && data.data?.vendor) {
      currentVendor = data.data.vendor;
      renderDashboardOverview();
      showDashboardSection();
      fetchBankAccounts();
      fetchWallets();
    } else {
      logout();
    }
  } catch (err) {
    console.error(err);
    logout();
  }
}

/**
 * 4. Render Dashboard Info (Avatar / Profile Photo)
 */
function renderDashboardOverview() {
  if (!currentVendor) return;

  document.getElementById('userGreeting').textContent = `Hi, ${currentVendor.firstName}`;
  document.getElementById('dashVendorName').textContent = `${currentVendor.firstName} ${currentVendor.lastName}`;
  document.getElementById('dashVendorEmail').textContent = currentVendor.email;

  const avatarImg = document.getElementById('dashAvatarImg');
  const avatarText = document.getElementById('dashAvatarText');

  if (currentVendor.profilePhoto) {
    avatarImg.src = currentVendor.profilePhoto;
    avatarImg.classList.remove('hidden');
    avatarText.classList.add('hidden');
  } else {
    avatarText.textContent = (currentVendor.firstName[0] || 'V').toUpperCase();
    avatarText.classList.remove('hidden');
    avatarImg.classList.add('hidden');
  }

  const statusBadge = document.getElementById('dashStatusBadge');
  statusBadge.textContent = currentVendor.verificationStatus;
  statusBadge.className = `badge badge-${currentVendor.verificationStatus}`;

  const activeBadge = document.getElementById('dashActiveBadge');
  activeBadge.textContent = currentVendor.isActive ? 'Active' : 'Deactivated';
  activeBadge.className = `badge ${currentVendor.isActive ? 'badge-active' : 'badge-rejected'}`;

  // Pre-fill profile fields
  document.getElementById('profFirstName').value = currentVendor.firstName || '';
  document.getElementById('profLastName').value = currentVendor.lastName || '';
  document.getElementById('profMobile').value = currentVendor.mobileNumber || '';
  document.getElementById('profWhatsapp').value = currentVendor.whatsappNumber || '';
  document.getElementById('profTelegram').value = currentVendor.telegramId || '';
  
  const photoUrlEl = document.getElementById('profPhotoUrlText');
  if (photoUrlEl) {
    photoUrlEl.innerHTML = currentVendor.profilePhoto
      ? `Cloudinary URL: <a href="${currentVendor.profilePhoto}" target="_blank" style="color: var(--primary); text-decoration: underline;">${currentVendor.profilePhoto}</a>`
      : 'No photo uploaded yet.';
  }
}

/**
 * 5. Update Profile (Supports uploading new photo to Cloudinary)
 */
async function handleUpdateProfile(event) {
  event.preventDefault();

  const formData = new FormData();
  formData.append('firstName', document.getElementById('profFirstName').value.trim());
  formData.append('lastName', document.getElementById('profLastName').value.trim());
  formData.append('mobileNumber', document.getElementById('profMobile').value.trim());

  const whatsapp = document.getElementById('profWhatsapp').value.trim();
  formData.append('whatsappNumber', whatsapp || '');

  const telegram = document.getElementById('profTelegram').value.trim();
  formData.append('telegramId', telegram || '');

  const photoFile = document.getElementById('profPhotoFile').files[0];
  if (photoFile) {
    formData.append('profilePhoto', photoFile);
  }

  try {
    const res = await fetch(`${API_BASE}/vendors/me`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${currentToken}`
      },
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      showToast('Profile and photo updated successfully on Cloudinary & MongoDB!', 'success');
      currentVendor = data.data.vendor;
      renderDashboardOverview();
      document.getElementById('profPhotoFile').value = '';
    } else {
      showToast(data.message || 'Update failed', 'error');
    }
  } catch (err) {
    showToast('Failed to update profile', 'error');
  }
}

/**
 * 6. Change Password
 */
async function handleChangePassword(event) {
  event.preventDefault();

  const currentPassword = document.getElementById('currPassword').value;
  const newPassword = document.getElementById('newPassword').value;

  try {
    const res = await fetch(`${API_BASE}/vendors/change-password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Password changed successfully!', 'success');
      document.getElementById('changePasswordForm').reset();
    } else {
      showToast(data.message || 'Password update failed', 'error');
    }
  } catch (err) {
    showToast('Failed to change password', 'error');
  }
}

let cachedBankAccounts = [];
let cachedWallets = [];

/**
 * 7. Bank Accounts CRUD
 */
async function fetchBankAccounts() {
  try {
    const res = await fetch(`${API_BASE}/vendors/bank-accounts`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    const data = await res.json();
    const listEl = document.getElementById('banksList');

    if (data.success && data.data?.bankAccounts?.length > 0) {
      cachedBankAccounts = data.data.bankAccounts;
      listEl.innerHTML = data.data.bankAccounts.map(acc => `
        <div class="item-card ${acc.isDefault ? 'is-default' : ''}">
          <div class="item-info">
            <h4>${acc.bankName} - ${acc.accountNumber}</h4>
            <p>IFSC: <strong>${acc.ifscCode}</strong> | Holder: ${acc.accountHolderName} | Branch: ${acc.branchName}</p>
            <div style="margin-top: 0.35rem;">
              ${acc.isDefault ? '<span class="badge badge-default">Default</span>' : ''}
            </div>
          </div>
          <div class="item-actions">
            <button class="btn btn-sm btn-secondary" onclick="openEditBankModal('${acc._id}')">✏️ Edit</button>
            ${!acc.isDefault ? `<button class="btn btn-sm btn-secondary" onclick="setDefaultBankAccount('${acc._id}')">Set Default</button>` : ''}
            <button class="btn btn-sm btn-danger" onclick="deleteBankAccount('${acc._id}')">Delete</button>
          </div>
        </div>
      `).join('');
    } else {
      cachedBankAccounts = [];
      listEl.innerHTML = '<p class="empty-state">No bank accounts added yet.</p>';
    }
  } catch (err) {
    console.error('fetchBankAccounts error:', err);
  }
}

async function handleAddBankAccount(event) {
  event.preventDefault();

  const payload = {
    bankName: document.getElementById('bankName').value.trim(),
    accountNumber: document.getElementById('bankAccountNumber').value.trim(),
    ifscCode: document.getElementById('bankIfsc').value.trim().toUpperCase(),
    branchName: document.getElementById('bankBranch').value.trim(),
    accountHolderName: document.getElementById('bankHolderName').value.trim(),
    isDefault: document.getElementById('bankIsDefault').checked
  };

  try {
    const res = await fetch(`${API_BASE}/vendors/bank-accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      showToast('Bank account added!', 'success');
      document.getElementById('addBankForm').reset();
      fetchBankAccounts();
    } else {
      showToast(data.message || 'Error adding bank account', 'error');
    }
  } catch (err) {
    showToast('Failed to add bank account', 'error');
  }
}

function openEditBankModal(id) {
  const acc = cachedBankAccounts.find(a => a._id === id);
  if (!acc) return;

  document.getElementById('editBankId').value = acc._id;
  document.getElementById('editBankName').value = acc.bankName || '';
  document.getElementById('editBankAccountNumber').value = acc.accountNumber || '';
  document.getElementById('editBankIfsc').value = acc.ifscCode || '';
  document.getElementById('editBankBranch').value = acc.branchName || '';
  document.getElementById('editBankHolderName').value = acc.accountHolderName || '';
  document.getElementById('editBankIsDefault').checked = Boolean(acc.isDefault);

  document.getElementById('editBankModal').classList.remove('hidden');
}

function closeEditBankModal() {
  document.getElementById('editBankModal').classList.add('hidden');
}

async function handleUpdateBankAccount(event) {
  event.preventDefault();

  const bankAccountId = document.getElementById('editBankId').value;
  const payload = {
    bankName: document.getElementById('editBankName').value.trim(),
    accountNumber: document.getElementById('editBankAccountNumber').value.trim(),
    ifscCode: document.getElementById('editBankIfsc').value.trim().toUpperCase(),
    branchName: document.getElementById('editBankBranch').value.trim(),
    accountHolderName: document.getElementById('editBankHolderName').value.trim(),
    isDefault: document.getElementById('editBankIsDefault').checked
  };

  try {
    const res = await fetch(`${API_BASE}/vendors/bank-accounts/${bankAccountId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      showToast('Bank account updated successfully!', 'success');
      closeEditBankModal();
      fetchBankAccounts();
    } else {
      showToast(data.message || 'Update failed', 'error');
    }
  } catch (err) {
    showToast('Failed to update bank account', 'error');
  }
}

async function setDefaultBankAccount(id) {
  try {
    const res = await fetch(`${API_BASE}/vendors/bank-accounts/${id}/default`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Default bank account updated', 'success');
      fetchBankAccounts();
    }
  } catch (err) {
    showToast('Failed to update default bank', 'error');
  }
}

async function deleteBankAccount(id) {
  if (!confirm('Are you sure you want to delete this bank account?')) return;
  try {
    const res = await fetch(`${API_BASE}/vendors/bank-accounts/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Bank account deleted', 'success');
      fetchBankAccounts();
    }
  } catch (err) {
    showToast('Failed to delete bank account', 'error');
  }
}

/**
 * 8. Wallets CRUD
 */
async function fetchWallets() {
  try {
    const res = await fetch(`${API_BASE}/vendors/wallets`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    const data = await res.json();
    const listEl = document.getElementById('walletsList');

    if (data.success && data.data?.wallets?.length > 0) {
      cachedWallets = data.data.wallets;
      listEl.innerHTML = data.data.wallets.map(w => `
        <div class="item-card ${w.isDefault ? 'is-default' : ''}">
          <div class="item-info">
            <h4>${w.walletName}</h4>
            <p>ID / VPA: <strong>${w.walletId}</strong></p>
            <div style="margin-top: 0.35rem;">
              ${w.isDefault ? '<span class="badge badge-default">Default</span>' : ''}
            </div>
          </div>
          <div class="item-actions">
            <button class="btn btn-sm btn-secondary" onclick="openEditWalletModal('${w._id}')">✏️ Edit</button>
            ${!w.isDefault ? `<button class="btn btn-sm btn-secondary" onclick="setDefaultWallet('${w._id}')">Set Default</button>` : ''}
            <button class="btn btn-sm btn-danger" onclick="deleteWallet('${w._id}')">Delete</button>
          </div>
        </div>
      `).join('');
    } else {
      cachedWallets = [];
      listEl.innerHTML = '<p class="empty-state">No wallets added yet.</p>';
    }
  } catch (err) {
    console.error('fetchWallets error:', err);
  }
}

async function handleAddWallet(event) {
  event.preventDefault();

  const payload = {
    walletName: document.getElementById('walletName').value.trim(),
    walletId: document.getElementById('walletId').value.trim(),
    qrCode: document.getElementById('walletQr').value.trim() || undefined,
    isDefault: document.getElementById('walletIsDefault').checked
  };

  try {
    const res = await fetch(`${API_BASE}/vendors/wallets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      showToast('Wallet added!', 'success');
      document.getElementById('addWalletForm').reset();
      fetchWallets();
    } else {
      showToast(data.message || 'Error adding wallet', 'error');
    }
  } catch (err) {
    showToast('Failed to add wallet', 'error');
  }
}

function openEditWalletModal(id) {
  const wallet = cachedWallets.find(w => w._id === id);
  if (!wallet) return;

  document.getElementById('editWalletSubId').value = wallet._id;
  document.getElementById('editWalletName').value = wallet.walletName || '';
  document.getElementById('editWalletId').value = wallet.walletId || '';
  document.getElementById('editWalletQr').value = wallet.qrCode || '';
  document.getElementById('editWalletIsDefault').checked = Boolean(wallet.isDefault);

  document.getElementById('editWalletModal').classList.remove('hidden');
}

function closeEditWalletModal() {
  document.getElementById('editWalletModal').classList.add('hidden');
}

async function handleUpdateWallet(event) {
  event.preventDefault();

  const walletSubId = document.getElementById('editWalletSubId').value;
  const payload = {
    walletName: document.getElementById('editWalletName').value.trim(),
    walletId: document.getElementById('editWalletId').value.trim(),
    qrCode: document.getElementById('editWalletQr').value.trim() || null,
    isDefault: document.getElementById('editWalletIsDefault').checked
  };

  try {
    const res = await fetch(`${API_BASE}/vendors/wallets/${walletSubId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      showToast('Wallet updated successfully!', 'success');
      closeEditWalletModal();
      fetchWallets();
    } else {
      showToast(data.message || 'Update failed', 'error');
    }
  } catch (err) {
    showToast('Failed to update wallet', 'error');
  }
}

async function setDefaultWallet(id) {
  try {
    const res = await fetch(`${API_BASE}/vendors/wallets/${id}/default`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Default wallet updated', 'success');
      fetchWallets();
    }
  } catch (err) {
    showToast('Failed to update default wallet', 'error');
  }
}

async function deleteWallet(id) {
  if (!confirm('Are you sure you want to delete this wallet?')) return;
  try {
    const res = await fetch(`${API_BASE}/vendors/wallets/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Wallet deleted', 'success');
      fetchWallets();
    }
  } catch (err) {
    showToast('Failed to delete wallet', 'error');
  }
}

/**
 * 9. SuperAdmin Simulator
 */
async function fetchAdminVendors() {
  // For quick local testing: Create a test admin token
  const testAdminToken = currentToken; 
  try {
    const res = await fetch(`${API_BASE}/admin/vendors`, {
      headers: { 'Authorization': `Bearer ${testAdminToken}` }
    });
    const data = await res.json();
    const listEl = document.getElementById('adminVendorsList');

    if (data.success && data.data?.vendors?.length > 0) {
      listEl.innerHTML = data.data.vendors.map(v => `
        <div class="item-card">
          <div class="item-info">
            <h4>${v.firstName} ${v.lastName} (${v.email})</h4>
            <p>Mobile: ${v.mobileNumber} | Status: <strong class="badge badge-${v.verificationStatus}">${v.verificationStatus}</strong> | Active: ${v.isActive ? 'Yes' : 'No'}</p>
          </div>
          <div class="item-actions">
            <button class="btn btn-sm btn-success" onclick="adminApproveVendor('${v._id}')">Approve</button>
            <button class="btn btn-sm btn-danger" onclick="adminRejectVendor('${v._id}')">Reject</button>
            <button class="btn btn-sm btn-secondary" onclick="adminToggleActive('${v._id}', ${!v.isActive})">${v.isActive ? 'Deactivate' : 'Activate'}</button>
          </div>
        </div>
      `).join('');
    } else {
      listEl.innerHTML = `<p class="empty-state">${data.message || 'No vendors found or admin permission required.'}</p>`;
    }
  } catch (err) {
    showToast('Error connecting to admin endpoint', 'error');
  }
}

async function adminApproveVendor(id) {
  try {
    const res = await fetch(`${API_BASE}/admin/vendors/${id}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    showToast(data.message || 'Vendor approved', data.success ? 'success' : 'error');
    fetchAdminVendors();
    loadVendorProfile();
  } catch (err) {
    showToast('Admin action failed', 'error');
  }
}

async function adminRejectVendor(id) {
  const reason = prompt('Please enter rejection reason:');
  if (!reason) return;
  try {
    const res = await fetch(`${API_BASE}/admin/vendors/${id}/reject`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ rejectionReason: reason })
    });
    const data = await res.json();
    showToast(data.message || 'Vendor rejected', data.success ? 'success' : 'error');
    fetchAdminVendors();
    loadVendorProfile();
  } catch (err) {
    showToast('Admin action failed', 'error');
  }
}

async function adminToggleActive(id, activate) {
  try {
    const action = activate ? 'activate' : 'deactivate';
    const res = await fetch(`${API_BASE}/admin/vendors/${id}/${action}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    showToast(data.message || `Vendor ${action}d`, data.success ? 'success' : 'error');
    fetchAdminVendors();
    loadVendorProfile();
  } catch (err) {
    showToast('Admin action failed', 'error');
  }
}

/**
 * 10. Logout
 */
function logout() {
  currentToken = null;
  currentVendor = null;
  localStorage.removeItem('moffin_token');
  showAuthSection();
  showToast('Logged out', 'success');
}
