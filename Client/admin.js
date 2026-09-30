// Moffin 2 SuperAdmin Controller JavaScript
const API_BASE = window.location.origin && window.location.origin.startsWith('http')
  ? `${window.location.origin}/api`
  : 'http://localhost:5000/api';

// Admin State
let adminToken = localStorage.getItem('moffin_admin_token') || null;
let currentAdmin = null;
let allVendorsCache = [];
let currentFilter = 'all';

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  if (adminToken) {
    loadAdminProfile();
  } else {
    showAdminLoginSection();
  }
});

/**
 * Toast Notifications
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
 * UI State Toggling
 */
function showAdminLoginSection() {
  document.getElementById('adminLoginSection').classList.remove('hidden');
  document.getElementById('adminDashboardSection').classList.add('hidden');
  document.getElementById('adminLogoutBtn').classList.add('hidden');
  document.getElementById('adminGreeting').textContent = '';
}

function showAdminDashboardSection() {
  document.getElementById('adminLoginSection').classList.add('hidden');
  document.getElementById('adminDashboardSection').classList.remove('hidden');
  document.getElementById('adminLogoutBtn').classList.remove('hidden');
}

/**
 * 1. Admin Login
 */
async function handleAdminLogin(event) {
  event.preventDefault();

  const payload = {
    email: document.getElementById('adminEmail').value.trim(),
    password: document.getElementById('adminPassword').value
  };

  try {
    const res = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success && data.data?.token) {
      adminToken = data.data.token;
      currentAdmin = data.data.admin;
      localStorage.setItem('moffin_admin_token', adminToken);
      showToast('SuperAdmin login successful!', 'success');
      showAdminDashboardSection();
      document.getElementById('adminGreeting').textContent = `Admin: ${currentAdmin.name}`;
      fetchAdminVendors();
    } else {
      showToast(data.message || 'Login failed', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to server', 'error');
  }
}

/**
 * 2. Load Admin Profile
 */
async function loadAdminProfile() {
  try {
    const res = await fetch(`${API_BASE}/admin/me`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const data = await res.json();
    if (data.success && data.data?.admin) {
      currentAdmin = data.data.admin;
      document.getElementById('adminGreeting').textContent = `Admin: ${currentAdmin.name}`;
      showAdminDashboardSection();
      fetchAdminVendors();
    } else {
      adminLogout();
    }
  } catch (err) {
    console.error(err);
    adminLogout();
  }
}

/**
 * 3. Fetch Vendors & Update Stats
 */
async function fetchAdminVendors() {
  try {
    const res = await fetch(`${API_BASE}/admin/vendors?limit=100`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const data = await res.json();
    if (data.success && data.data?.vendors) {
      allVendorsCache = data.data.vendors;
      updateAdminStats(allVendorsCache);
      renderVendorsTable();
    } else {
      showToast(data.message || 'Error fetching vendors', 'error');
    }
  } catch (err) {
    showToast('Error connecting to vendor API', 'error');
  }
}

/**
 * 4. Update KPI Metrics
 */
function updateAdminStats(vendors) {
  const total = vendors.length;
  const pending = vendors.filter(v => v.verificationStatus === 'pending').length;
  const approved = vendors.filter(v => v.verificationStatus === 'approved').length;
  const rejected = vendors.filter(v => v.verificationStatus === 'rejected').length;

  document.getElementById('statTotalVendors').textContent = total;
  document.getElementById('statPendingVendors').textContent = pending;
  document.getElementById('statApprovedVendors').textContent = approved;
  document.getElementById('statRejectedVendors').textContent = rejected;
}

/**
 * 5. Filter & Search Handlers
 */
function setAdminFilter(filter, event) {
  currentFilter = filter;
  document.querySelectorAll('.tabs .tab-btn').forEach(b => b.classList.remove('active'));
  if (event && event.target) {
    event.target.classList.add('active');
  }
  renderVendorsTable();
}

function handleAdminSearch() {
  renderVendorsTable();
}

/**
 * 6. Render Vendors Table
 */
function renderVendorsTable() {
  const searchTerm = document.getElementById('adminSearchInput').value.trim().toLowerCase();
  const tbody = document.getElementById('adminVendorsTbody');

  let filtered = allVendorsCache;

  // Apply Status Filter
  if (currentFilter !== 'all') {
    filtered = filtered.filter(v => v.verificationStatus === currentFilter);
  }

  // Apply Search
  if (searchTerm) {
    filtered = filtered.filter(v =>
      (v.firstName && v.firstName.toLowerCase().includes(searchTerm)) ||
      (v.lastName && v.lastName.toLowerCase().includes(searchTerm)) ||
      (v.email && v.email.toLowerCase().includes(searchTerm)) ||
      (v.mobileNumber && v.mobileNumber.toLowerCase().includes(searchTerm))
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No vendors match the selected filter/search.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(v => {
    const avatarHtml = v.profilePhoto
      ? `<img src="${v.profilePhoto}" class="table-avatar" alt="${v.firstName}">`
      : `<div class="table-avatar">${(v.firstName[0] || 'V').toUpperCase()}</div>`;

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            ${avatarHtml}
            <div>
              <strong>${v.firstName} ${v.lastName}</strong><br>
              <span class="text-muted" style="font-size: 0.8rem;">${v.email}</span>
            </div>
          </div>
        </td>
        <td>
          <strong>${v.mobileNumber}</strong>
          ${v.telegramId ? `<br><span class="text-muted" style="font-size: 0.8rem;">TG: ${v.telegramId}</span>` : ''}
        </td>
        <td>
          <span class="badge ${v.bankAccounts?.length > 0 ? 'badge-default' : 'badge-pending'}">
            ${v.bankAccounts?.length || 0} Account(s)
          </span>
        </td>
        <td>
          <span class="badge ${v.wallets?.length > 0 ? 'badge-default' : 'badge-pending'}">
            ${v.wallets?.length || 0} Wallet(s)
          </span>
        </td>
        <td>
          <span class="badge badge-${v.verificationStatus}">
            ${v.verificationStatus}
          </span>
        </td>
        <td>
          <span class="badge ${v.isActive ? 'badge-approved' : 'badge-rejected'}">
            ${v.isActive ? 'Active' : 'Deactivated'}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
            <button class="btn btn-sm btn-secondary" onclick="viewVendorDetails('${v._id}')">👁️ View</button>
            ${v.verificationStatus !== 'approved' ? `<button class="btn btn-sm btn-success" onclick="adminApproveVendor('${v._id}')">✅ Approve</button>` : ''}
            ${v.verificationStatus !== 'rejected' ? `<button class="btn btn-sm btn-danger" onclick="openRejectionModal('${v._id}')">❌ Reject</button>` : ''}
            <button class="btn btn-sm ${v.isActive ? 'btn-warning' : 'btn-primary'}" onclick="adminToggleActive('${v._id}', ${!v.isActive})">
              ${v.isActive ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * 7. Vendor Review & Details Modal
 */
function viewVendorDetails(vendorId) {
  const v = allVendorsCache.find(x => x._id === vendorId);
  if (!v) return;

  const contentEl = document.getElementById('modalVendorContent');
  const actionsEl = document.getElementById('modalVendorActions');

  const banksHtml = v.bankAccounts && v.bankAccounts.length > 0
    ? v.bankAccounts.map(b => `
        <div style="background: #f8fafc; border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem 0.8rem; margin-top: 0.35rem; font-size: 0.85rem;">
          <strong>${b.bankName}</strong> - A/C: <code>${b.accountNumber}</code> (IFSC: ${b.ifscCode})<br>
          <span class="text-muted">Holder: ${b.accountHolderName} | Branch: ${b.branchName} ${b.isDefault ? '| <strong style="color: var(--primary);">[Primary Default]</strong>' : ''}</span>
        </div>
      `).join('')
    : '<p class="text-muted" style="font-size: 0.85rem;">No bank accounts added.</p>';

  const walletsHtml = v.wallets && v.wallets.length > 0
    ? v.wallets.map(w => `
        <div style="background: #f8fafc; border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem 0.8rem; margin-top: 0.35rem; font-size: 0.85rem;">
          <strong>${w.walletName}</strong> - ID: <code>${w.walletId}</code> ${w.isDefault ? '| <strong style="color: var(--primary);">[Primary Default]</strong>' : ''}
          ${w.qrCode ? `<br><a href="${w.qrCode}" target="_blank" style="color: var(--primary); font-size: 0.8rem;">View QR Code</a>` : ''}
        </div>
      `).join('')
    : '<p class="text-muted" style="font-size: 0.85rem;">No wallets added.</p>';

  contentEl.innerHTML = `
    <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
      ${v.profilePhoto ? `<img src="${v.profilePhoto}" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border);">` : `<div style="width: 70px; height: 70px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 1.75rem; font-weight: 700;">${v.firstName[0]}</div>`}
      <div>
        <h3 style="font-size: 1.2rem;">${v.firstName} ${v.lastName}</h3>
        <p class="text-muted">${v.email}</p>
        <div style="margin-top: 0.25rem;">
          <span class="badge badge-${v.verificationStatus}">${v.verificationStatus}</span>
          <span class="badge ${v.isActive ? 'badge-approved' : 'badge-rejected'}">${v.isActive ? 'Active' : 'Deactivated'}</span>
        </div>
      </div>
    </div>

    ${v.rejectionReason ? `
      <div style="background: #fee2e2; border-left: 4px solid #ef4444; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.85rem; color: #991b1b;">
        <strong>Rejection Reason:</strong> ${v.rejectionReason}
      </div>
    ` : ''}

    <div class="detail-section">
      <h4>Personal & Contact Details</h4>
      <div class="detail-grid">
        <div><span class="label">Mobile Number:</span> ${v.mobileNumber}</div>
        <div><span class="label">WhatsApp Number:</span> ${v.whatsappNumber || 'N/A'}</div>
        <div><span class="label">Telegram ID:</span> ${v.telegramId || 'N/A'}</div>
        <div><span class="label">Registered At:</span> ${new Date(v.createdAt).toLocaleString()}</div>
        ${v.profilePhoto ? `<div style="grid-column: span 2;"><span class="label">Cloudinary Photo:</span> <a href="${v.profilePhoto}" target="_blank" style="color: var(--primary);">${v.profilePhoto}</a></div>` : ''}
      </div>
    </div>

    <div class="detail-section">
      <h4>🏦 Bank Accounts (${v.bankAccounts?.length || 0})</h4>
      ${banksHtml}
    </div>

    <div class="detail-section">
      <h4>👛 Wallets & UPI (${v.wallets?.length || 0})</h4>
      ${walletsHtml}
    </div>
  `;

  actionsEl.innerHTML = `
    <button type="button" class="btn btn-secondary" onclick="closeVendorDetailModal()">Close</button>
    ${v.verificationStatus !== 'approved' ? `<button type="button" class="btn btn-success" onclick="adminApproveVendor('${v._id}'); closeVendorDetailModal();">Approve Vendor</button>` : ''}
    ${v.verificationStatus !== 'rejected' ? `<button type="button" class="btn btn-danger" onclick="closeVendorDetailModal(); openRejectionModal('${v._id}');">Reject Vendor</button>` : ''}
  `;

  document.getElementById('vendorDetailModal').classList.remove('hidden');
}

function closeVendorDetailModal() {
  document.getElementById('vendorDetailModal').classList.add('hidden');
}

/**
 * 8. Approve Vendor Action
 */
async function adminApproveVendor(vendorId) {
  if (!confirm('Are you sure you want to approve this vendor?')) return;

  try {
    const res = await fetch(`${API_BASE}/admin/vendors/${vendorId}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const data = await res.json();
    if (data.success) {
      showToast('Vendor approved successfully!', 'success');
      fetchAdminVendors();
    } else {
      showToast(data.message || 'Approval failed', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to server', 'error');
  }
}

/**
 * 9. Rejection Modal & Action
 */
function openRejectionModal(vendorId) {
  document.getElementById('rejectVendorId').value = vendorId;
  document.getElementById('rejectionReasonInput').value = '';
  document.getElementById('rejectionModal').classList.remove('hidden');
}

function closeRejectionModal() {
  document.getElementById('rejectionModal').classList.add('hidden');
}

async function submitVendorRejection(event) {
  event.preventDefault();

  const vendorId = document.getElementById('rejectVendorId').value;
  const reason = document.getElementById('rejectionReasonInput').value.trim();

  if (!reason) {
    showToast('Please enter a rejection reason', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/admin/vendors/${vendorId}/reject`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ rejectionReason: reason })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Vendor verification rejected', 'success');
      closeRejectionModal();
      fetchAdminVendors();
    } else {
      showToast(data.message || 'Rejection failed', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to server', 'error');
  }
}

/**
 * 10. Toggle Active/Deactivate Account
 */
async function adminToggleActive(vendorId, activate) {
  const action = activate ? 'activate' : 'deactivate';
  if (!confirm(`Are you sure you want to ${action} this vendor account?`)) return;

  try {
    const res = await fetch(`${API_BASE}/admin/vendors/${vendorId}/${action}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Vendor account ${action}d successfully`, 'success');
      fetchAdminVendors();
    } else {
      showToast(data.message || `${action} failed`, 'error');
    }
  } catch (err) {
    showToast('Failed to connect to server', 'error');
  }
}

/**
 * 11. Admin Logout
 */
function adminLogout() {
  adminToken = null;
  currentAdmin = null;
  localStorage.removeItem('moffin_admin_token');
  showAdminLoginSection();
  showToast('Admin logged out', 'success');
}
