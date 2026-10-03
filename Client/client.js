/**
 * Moffin 2 - Client Portal Frontend Logic
 */

const API_BASE = '/api';
const TOKEN_KEY = 'moffin_client_token';

let currentClientData = null;
let regTelegramIds = [];
let editTelegramIds = [];

// =============================================================================
// TOAST NOTIFICATIONS
// =============================================================================
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast show ${type}`;

  setTimeout(() => {
    toast.className = 'toast hidden';
  }, 4000);
}

// =============================================================================
// AUTHENTICATION HEADERS
// =============================================================================
function getAuthHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

// =============================================================================
// DYNAMIC TELEGRAM ID CHIPS MANAGEMENT
// =============================================================================
function handleTelegramKeyDown(event, mode) {
  if (event.key === 'Enter') {
    event.preventDefault();
    addTelegramId(mode);
  }
}

function addTelegramId(mode) {
  const inputId = mode === 'reg' ? 'clientRegTelegramInput' : 'editTelegramInput';
  const input = document.getElementById(inputId);
  if (!input) return;

  let val = input.value.trim();
  if (!val) return;

  if (!val.startsWith('@') && !val.startsWith('http')) {
    val = `@${val}`;
  }

  const targetArr = mode === 'reg' ? regTelegramIds : editTelegramIds;
  if (!targetArr.includes(val)) {
    targetArr.push(val);
  }

  input.value = '';
  renderTelegramChips(mode);
}

function removeTelegramId(index, mode) {
  const targetArr = mode === 'reg' ? regTelegramIds : editTelegramIds;
  targetArr.splice(index, 1);
  renderTelegramChips(mode);
}

function renderTelegramChips(mode) {
  const containerId = mode === 'reg' ? 'clientRegTelegramChips' : 'editTelegramChips';
  const container = document.getElementById(containerId);
  if (!container) return;

  const targetArr = mode === 'reg' ? regTelegramIds : editTelegramIds;

  container.innerHTML = targetArr
    .map(
      (id, idx) => `
    <span class="telegram-chip">
      ✈️ ${id}
      <span class="remove-btn" onclick="removeTelegramId(${idx}, '${mode}')" title="Remove">✕</span>
    </span>
  `
    )
    .join('');
}

// =============================================================================
// APP INITIALIZATION
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    fetchClientProfile();
  } else {
    showAuthSection();
  }
});

function showAuthSection() {
  document.getElementById('clientAuthSection').classList.remove('hidden');
  document.getElementById('clientDashboardSection').classList.add('hidden');
  document.getElementById('clientLogoutBtn').classList.add('hidden');
  document.getElementById('clientGreeting').textContent = '';
}

function showDashboardSection(client) {
  currentClientData = client;

  document.getElementById('clientAuthSection').classList.add('hidden');
  document.getElementById('clientDashboardSection').classList.remove('hidden');
  document.getElementById('clientLogoutBtn').classList.remove('hidden');
  document.getElementById('clientGreeting').textContent = `Hello, ${client.firstName || 'Client'}!`;

  // 1. Personal Information Grid
  document.getElementById('profileFullName').textContent = `${client.firstName} ${client.lastName}`;
  document.getElementById('profileEmail').textContent = client.email || '--';
  document.getElementById('profileMobile').textContent = client.mobile || '--';
  document.getElementById('profileWhatsapp').textContent = client.whatsappNumber || '--';
  document.getElementById('profileAltMobile').textContent = client.alternativeMobileNumber || '--';
  
  // Platform URL
  const platformUrlElem = document.getElementById('profilePlatformUrl');
  if (client.platformUrl) {
    platformUrlElem.innerHTML = `<a href="${client.platformUrl}" target="_blank" style="color: #0284c7; text-decoration: underline;">${client.platformUrl} ↗</a>`;
  } else {
    platformUrlElem.textContent = '--';
  }

  // Business Type
  document.getElementById('profileBusinessType').textContent = client.businessType || '--';

  // Telegram IDs
  const telegramContainer = document.getElementById('profileTelegramIds');
  if (client.telegramIds && client.telegramIds.length > 0) {
    telegramContainer.innerHTML = client.telegramIds
      .map((id) => `<span class="telegram-chip">✈️ ${id}</span>`)
      .join(' ');
  } else {
    telegramContainer.innerHTML = '<span class="text-muted" style="font-size: 0.9rem;">None registered</span>';
  }

  // Status badge
  const statusBadge = document.getElementById('profileStatusBadge');
  const status = (client.status || 'active').toLowerCase();
  statusBadge.textContent = status.toUpperCase();
  statusBadge.className = `status-pill ${status}`;

  // Verification badge
  const verifiedBadge = document.getElementById('profileVerifiedBadge');
  if (client.isVerified) {
    verifiedBadge.textContent = 'Verified';
    verifiedBadge.className = 'badge badge-success';
  } else {
    verifiedBadge.textContent = 'Unverified';
    verifiedBadge.className = 'badge badge-warning';
  }

  // Client ID
  document.getElementById('profileClientId').textContent = client._id || client.id || '--';

  // Last Login
  const lastLoginElem = document.getElementById('profileLastLogin');
  if (client.lastLoginAt) {
    lastLoginElem.textContent = new Date(client.lastLoginAt).toLocaleString('en-IN');
  } else {
    lastLoginElem.textContent = 'First session';
  }
}

// =============================================================================
// CLIENT REGISTRATION
// =============================================================================
async function handleClientRegister(e) {
  e.preventDefault();

  const firstName = document.getElementById('clientRegFirstName').value.trim();
  const lastName = document.getElementById('clientRegLastName').value.trim();
  const email = document.getElementById('clientRegEmail').value.trim();
  const password = document.getElementById('clientRegPassword').value;
  const mobile = document.getElementById('clientRegMobile').value.trim();
  const whatsappNumber = document.getElementById('clientRegWhatsapp').value.trim();
  const alternativeMobileNumber = document.getElementById('clientRegAltMobile').value.trim();
  const platformUrl = document.getElementById('clientRegPlatformUrl').value.trim();
  const businessType = document.getElementById('clientRegBusinessType').value;

  if (password.length < 6) {
    showToast('Password must be at least 6 characters long', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/client/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        password,
        mobile,
        whatsappNumber,
        alternativeMobileNumber,
        platformUrl,
        businessType,
        telegramIds: regTelegramIds
      })
    });

    const data = await res.json();

    if (data.success) {
      showToast('Registration successful! Welcome to Moffin.', 'success');
      localStorage.setItem(TOKEN_KEY, data.data.token);
      regTelegramIds = [];
      renderTelegramChips('reg');
      showDashboardSection(data.data.client);
    } else {
      showToast(data.message || 'Registration failed', 'error');
    }
  } catch (err) {
    console.error('Registration Error:', err);
    showToast('Server error during registration. Please try again.', 'error');
  }
}

// =============================================================================
// CLIENT LOGIN
// =============================================================================
async function handleClientLogin(e) {
  e.preventDefault();

  const email = document.getElementById('clientLoginEmail').value.trim();
  const password = document.getElementById('clientLoginPassword').value;

  try {
    const res = await fetch(`${API_BASE}/auth/client/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (data.success) {
      showToast('Login successful!', 'success');
      localStorage.setItem(TOKEN_KEY, data.data.token);
      showDashboardSection(data.data.client);
    } else {
      showToast(data.message || 'Invalid login credentials', 'error');
    }
  } catch (err) {
    console.error('Login Error:', err);
    showToast('Server error during login. Please try again.', 'error');
  }
}

// =============================================================================
// FETCH CLIENT PROFILE
// =============================================================================
async function fetchClientProfile() {
  try {
    const res = await fetch(`${API_BASE}/client/profile`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (data.success && data.data && data.data.client) {
      showDashboardSection(data.data.client);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      showAuthSection();
      if (res.status === 401 || res.status === 403) {
        showToast(data.message || 'Session expired. Please log in again.', 'warning');
      }
    }
  } catch (err) {
    console.error('Fetch Profile Error:', err);
    localStorage.removeItem(TOKEN_KEY);
    showAuthSection();
  }
}

// =============================================================================
// EDIT CLIENT PROFILE
// =============================================================================
function openEditProfileModal() {
  if (!currentClientData) return;

  document.getElementById('editFirstName').value = currentClientData.firstName || '';
  document.getElementById('editLastName').value = currentClientData.lastName || '';
  document.getElementById('editWhatsapp').value = currentClientData.whatsappNumber || '';
  document.getElementById('editAltMobile').value = currentClientData.alternativeMobileNumber || '';
  document.getElementById('editPlatformUrl').value = currentClientData.platformUrl || '';
  document.getElementById('editBusinessType').value = currentClientData.businessType || '';

  editTelegramIds = Array.isArray(currentClientData.telegramIds) ? [...currentClientData.telegramIds] : [];
  renderTelegramChips('edit');

  document.getElementById('clientEditModal').classList.remove('hidden');
}

function closeEditProfileModal() {
  document.getElementById('clientEditModal').classList.add('hidden');
}

async function handleSaveClientProfile(e) {
  e.preventDefault();

  const firstName = document.getElementById('editFirstName').value.trim();
  const lastName = document.getElementById('editLastName').value.trim();
  const whatsappNumber = document.getElementById('editWhatsapp').value.trim();
  const alternativeMobileNumber = document.getElementById('editAltMobile').value.trim();
  const platformUrl = document.getElementById('editPlatformUrl').value.trim();
  const businessType = document.getElementById('editBusinessType').value;

  try {
    const res = await fetch(`${API_BASE}/client/profile`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        firstName,
        lastName,
        whatsappNumber,
        alternativeMobileNumber,
        platformUrl,
        businessType,
        telegramIds: editTelegramIds
      })
    });

    const data = await res.json();
    if (data.success && data.data && data.data.client) {
      showToast('Personal information updated successfully!', 'success');
      closeEditProfileModal();
      showDashboardSection(data.data.client);
    } else {
      showToast(data.message || 'Failed to update profile', 'error');
    }
  } catch (err) {
    console.error('Update Profile Error:', err);
    showToast('Server error updating profile', 'error');
  }
}

// =============================================================================
// CLIENT LOGOUT
// =============================================================================
function clientLogout() {
  localStorage.removeItem(TOKEN_KEY);
  showToast('Logged out successfully', 'info');
  showAuthSection();
}
