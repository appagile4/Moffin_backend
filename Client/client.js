/**
 * Moffin 2 - Client Portal Frontend Logic
 */

const API_BASE = '/api';
const TOKEN_KEY = 'moffin_client_token';

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
  document.getElementById('clientAuthSection').classList.add('hidden');
  document.getElementById('clientDashboardSection').classList.remove('hidden');
  document.getElementById('clientLogoutBtn').classList.remove('hidden');
  document.getElementById('clientGreeting').textContent = `Hello, ${client.firstName || 'Client'}!`;

  // Populate Profile
  document.getElementById('profileFullName').textContent = `${client.firstName} ${client.lastName}`;
  document.getElementById('profileEmail').textContent = client.email;
  document.getElementById('profileMobile').textContent = client.mobile || '--';
  document.getElementById('profileRole').textContent = client.role || 'client';
  document.getElementById('profileClientId').textContent = client._id || client.id || '--';
  
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

  // Last Login
  const lastLoginElem = document.getElementById('profileLastLogin');
  if (client.lastLoginAt) {
    lastLoginElem.textContent = new Date(client.lastLoginAt).toLocaleString();
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
  const mobile = document.getElementById('clientRegMobile').value.trim();
  const password = document.getElementById('clientRegPassword').value;

  if (password.length < 6) {
    showToast('Password must be at least 6 characters long', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/client/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, email, mobile, password })
    });

    const data = await res.json();

    if (data.success) {
      showToast('Registration successful! Welcome to Moffin.', 'success');
      localStorage.setItem(TOKEN_KEY, data.data.token);
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
      // If token expired or invalid, log out
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
// CLIENT LOGOUT
// =============================================================================
function clientLogout() {
  localStorage.removeItem(TOKEN_KEY);
  showToast('Logged out successfully', 'info');
  showAuthSection();
}
