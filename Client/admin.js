// Moffin 2 SuperAdmin Controller JavaScript
const API_BASE = window.location.origin && window.location.origin.startsWith('http')
  ? `${window.location.origin}/api`
  : 'http://localhost:5000/api';

// Admin State
let adminToken = localStorage.getItem('moffin_admin_token') || null;
let currentAdmin = null;
let allVendorsCache = [];
let pendingTopUpsCache = [];
let confirmationsCache = [];
let destinationsCache = [];
let fcfsQueueCache = [];
let allRequestsHistoryCache = [];
let currentVendorFilter = 'all';
let currentHistoryFilter = 'all';

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

function switchAdminTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

  const targetEl = document.getElementById(tabId);
  if (targetEl) targetEl.classList.remove('hidden');
  if (event && event.target) event.target.classList.add('active');

  if (tabId === 'topupsApprovalTab') {
    fetchAdminTopUps();
    fetchAdminPaymentConfirmations();
  } else if (tabId === 'historyTab') {
    fetchAdminRequestHistory();
  } else if (tabId === 'vendorsTab') {
    fetchAdminVendors();
  } else if (tabId === 'destinationsTab') {
    fetchAdminDestinations();
  } else if (tabId === 'fcfsTab') {
    fetchAdminFcfsQueue();
    fetchAdminTiers();
  } else if (tabId === 'auditTab') {
    fetchAdminAuditLogs();
  }
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
      refreshAllDashboardData();
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
      refreshAllDashboardData();
    } else {
      adminLogout();
    }
  } catch (err) {
    console.error(err);
    adminLogout();
  }
}

function refreshAllDashboardData() {
  fetchAdminVendors();
  fetchAdminTopUps();
  fetchAdminPaymentConfirmations();
  fetchAdminDestinations();
  fetchAdminRequestHistory();
}

/**
 * 3. Top-Up Requests Management & Approvals
 */
async function fetchAdminTopUps() {
  if (!adminToken) return;

  try {
    const res = await fetch(`${API_BASE}/admin/topups?status=PENDING_ADMIN_RESPONSE`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    const tbody = document.getElementById('adminPendingTopUpsTbody');

    if (data.success && data.data?.topUps?.length > 0) {
      pendingTopUpsCache = data.data.topUps;
      document.getElementById('statPendingTopUps').textContent = data.data.topUps.length;

      tbody.innerHTML = data.data.topUps.map(t => {
        const vendorName = t.vendorId ? `${t.vendorId.firstName} ${t.vendorId.lastName} (${t.vendorId.email})` : 'Vendor';
        const dateStr = new Date(t.createdAt).toLocaleString('en-IN');
        const amountStr = `₹${(t.requestedAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

        return `
          <tr>
            <td><code>${t.topUpId || t._id.slice(-8)}</code></td>
            <td><strong>${vendorName}</strong></td>
            <td style="font-weight: 700; color: #4338ca;">${amountStr}</td>
            <td><span class="badge badge-info">${t.preferredPaymentMethod.toUpperCase()}</span></td>
            <td>${dateStr}</td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="openRespondTopUpModal('${t._id}')">⚡ Assign Destination</button>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      pendingTopUpsCache = [];
      document.getElementById('statPendingTopUps').textContent = '0';
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No pending top-up requests waiting for destination.</td></tr>';
    }
  } catch (err) {
    console.error('fetchAdminTopUps error:', err);
  }
}

async function openRespondTopUpModal(topUpId) {
  const topUp = pendingTopUpsCache.find(t => t._id === topUpId);
  if (!topUp) return;

  document.getElementById('respondTopUpId').value = topUp._id;
  const requestedAmount = topUp.requestedAmount || 0;
  const preferredMethod = topUp.preferredPaymentMethod || 'bank';
  document.getElementById('respondApprovedAmount').value = requestedAmount;
  document.getElementById('respondNote').value = '';

  const vendorName = topUp.vendorId ? `${topUp.vendorId.firstName} ${topUp.vendorId.lastName}` : 'Vendor';
  
  let vendorAccountsInfo = '';
  if (Array.isArray(topUp.vendorBankDetails) && topUp.vendorBankDetails.length > 0) {
    vendorAccountsInfo += `<strong>Vendor Banks (${topUp.vendorBankDetails.length}):</strong> ` + topUp.vendorBankDetails.map(b => `${b.bankName} (${b.accountNumber})`).join(', ') + `<br>`;
  } else if (topUp.vendorBankDetails?.bankName) {
    vendorAccountsInfo += `<strong>Vendor Bank:</strong> ${topUp.vendorBankDetails.bankName} - ${topUp.vendorBankDetails.accountNumber} (${topUp.vendorBankDetails.ifscCode})<br>`;
  }

  if (Array.isArray(topUp.vendorWalletDetails) && topUp.vendorWalletDetails.length > 0) {
    vendorAccountsInfo += `<strong>Vendor Wallets (${topUp.vendorWalletDetails.length}):</strong> ` + topUp.vendorWalletDetails.map(w => `${w.walletName} (${w.walletId})`).join(', ') + `<br>`;
  } else if (topUp.vendorWalletDetails?.walletName) {
    vendorAccountsInfo += `<strong>Vendor Wallet:</strong> ${topUp.vendorWalletDetails.walletName} - ${topUp.vendorWalletDetails.walletId}<br>`;
  }

  document.getElementById('modalTopUpInfo').innerHTML = `
    <strong>Vendor:</strong> ${vendorName}<br>
    <strong>Requested Amount:</strong> <span style="font-size: 1.1rem; font-weight: 700; color: #4338ca;">₹${requestedAmount.toLocaleString('en-IN')}</span><br>
    <strong>Preferred Method:</strong> <span class="badge badge-info">${preferredMethod.toUpperCase()}</span><br>
    ${vendorAccountsInfo}
    ${topUp.notes ? `<strong>Vendor Note:</strong> <em>${topUp.notes}</em>` : ''}
  `;

  // Fetch active company destinations
  await fetchAdminDestinations();
  const container = document.getElementById('respondDestCheckboxes');
  const activeDestinations = destinationsCache.filter(d => d.isActive);

  if (activeDestinations.length > 0) {
    // Categorize by limits and method match
    const inLimitDestinations = [];
    const otherDestinations = [];

    activeDestinations.forEach(d => {
      const isBank = d.type === 'bank' || d.destinationType === 'bank';
      const methodMatches = preferredMethod === 'both' || (preferredMethod === 'bank' && isBank) || (preferredMethod === 'wallet' && !isBank);
      const min = d.minAmount !== undefined ? d.minAmount : 0;
      const max = d.maxAmount !== undefined ? d.maxAmount : 50000000;
      const dailyLimit = d.dailyLimit !== undefined ? d.dailyLimit : 10000000;
      const todayCollected = d.todayCollected || 0;
      const remainingDaily = dailyLimit - todayCollected;

      const withinAmountRange = requestedAmount >= min && requestedAmount <= max;
      const withinDailyLimit = remainingDaily >= requestedAmount;

      const isInLimit = methodMatches && withinAmountRange && withinDailyLimit;

      const destObj = {
        ...d,
        isBank,
        methodMatches,
        isInLimit,
        min,
        max,
        dailyLimit,
        remainingDaily
      };

      if (isInLimit) {
        inLimitDestinations.push(destObj);
      } else {
        otherDestinations.push(destObj);
      }
    });

    let html = '';

    if (inLimitDestinations.length > 0) {
      html += `<div style="font-size: 0.8rem; font-weight: 700; color: #059669; text-transform: uppercase; margin-bottom: 0.25rem;">🎯 Recommended & In-Limit Accounts (${inLimitDestinations.length})</div>`;
      html += inLimitDestinations.map((d, i) => `
        <label style="display: flex; align-items: flex-start; gap: 0.65rem; padding: 0.65rem; border: 2px solid #10b981; border-radius: 8px; background: #f0fdf4; cursor: pointer;">
          <input type="checkbox" name="respondDestCheckbox" value="${d._id}" checked style="margin-top: 0.25rem;">
          <div style="font-size: 0.85rem; flex: 1;">
            <strong>${d.isBank ? '🏦 Bank' : '👛 UPI'}: ${d.name || (d.isBank ? d.bankName : d.walletName)}</strong>
            <span class="badge badge-approved" style="margin-left: 0.35rem; font-size: 0.7rem;">In Limit</span><br>
            <span class="text-muted">${d.isBank ? `A/C: ${d.accountNumber} | IFSC: ${d.ifscCode} | Holder: ${d.accountHolderName}` : `UPI ID: ${d.walletId}`}</span><br>
            <small style="color: #047857;">Limits: ₹${d.min.toLocaleString('en-IN')} - ₹${d.max.toLocaleString('en-IN')} | Daily Cap: ₹${d.dailyLimit.toLocaleString('en-IN')}</small>
          </div>
        </label>
      `).join('');
    }

    if (otherDestinations.length > 0) {
      html += `<div style="font-size: 0.8rem; font-weight: 700; color: #475569; text-transform: uppercase; margin-top: 0.75rem; margin-bottom: 0.25rem;">Other Active Company Accounts (${otherDestinations.length})</div>`;
      html += otherDestinations.map(d => `
        <label style="display: flex; align-items: flex-start; gap: 0.65rem; padding: 0.65rem; border: 1px solid var(--border); border-radius: 8px; background: #ffffff; cursor: pointer;">
          <input type="checkbox" name="respondDestCheckbox" value="${d._id}" ${inLimitDestinations.length === 0 ? 'checked' : ''} style="margin-top: 0.25rem;">
          <div style="font-size: 0.85rem; flex: 1;">
            <strong>${d.isBank ? '🏦 Bank' : '👛 UPI'}: ${d.name || (d.isBank ? d.bankName : d.walletName)}</strong><br>
            <span class="text-muted">${d.isBank ? `A/C: ${d.accountNumber} | IFSC: ${d.ifscCode} | Holder: ${d.accountHolderName}` : `UPI ID: ${d.walletId}`}</span><br>
            <small class="text-muted">Limits: ₹${d.min.toLocaleString('en-IN')} - ₹${d.max.toLocaleString('en-IN')} | Daily Cap: ₹${d.dailyLimit.toLocaleString('en-IN')}</small>
          </div>
        </label>
      `).join('');
    }

    container.innerHTML = html;
  } else {
    container.innerHTML = '<p class="empty-state">No active company destinations found. Please add company bank accounts or wallets in the Destinations tab.</p>';
  }

  document.getElementById('respondTopUpModal').classList.remove('hidden');
}

function autoSelectInLimitDestinations() {
  const checkboxes = document.querySelectorAll('input[name="respondDestCheckbox"]');
  checkboxes.forEach(cb => {
    const parent = cb.closest('label');
    if (parent && parent.innerHTML.includes('In Limit')) {
      cb.checked = true;
    } else {
      cb.checked = false;
    }
  });
  showToast('In-limit matching accounts auto-selected', 'success');
}

function closeRespondTopUpModal() {
  document.getElementById('respondTopUpModal').classList.add('hidden');
}

async function submitRespondTopUp(event) {
  event.preventDefault();

  const topUpId = document.getElementById('respondTopUpId').value;
  const selectedDestinationIds = Array.from(document.querySelectorAll('input[name="respondDestCheckbox"]:checked')).map(cb => cb.value);
  const approvedAmount = Number(document.getElementById('respondApprovedAmount').value) || undefined;
  const adminMessage = document.getElementById('respondNote').value.trim();

  if (!selectedDestinationIds || selectedDestinationIds.length === 0) {
    showToast('Please select at least one company bank account or wallet destination', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/admin/topups/${topUpId}/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        selectedDestinationIds,
        approvedAmount,
        adminMessage: adminMessage || undefined
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Assigned ${selectedDestinationIds.length} destination(s) to vendor!`, 'success');
      closeRespondTopUpModal();
      fetchAdminTopUps();
    } else {
      showToast(data.message || 'Failed to assign destinations', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to server', 'error');
  }
}

/**
 * 4. Payment Confirmations & Atomic Verification
 */
async function fetchAdminPaymentConfirmations() {
  if (!adminToken) return;

  try {
    const res = await fetch(`${API_BASE}/admin/payment-confirmations?status=PAYMENT_SUBMITTED`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    const tbody = document.getElementById('adminConfirmationsTbody');

    if (data.success && data.data?.confirmations?.length > 0) {
      confirmationsCache = data.data.confirmations;
      document.getElementById('statPendingConfirmations').textContent = data.data.confirmations.length;

      tbody.innerHTML = data.data.confirmations.map(c => {
        const vendorName = c.vendorId ? `${c.vendorId.firstName} ${c.vendorId.lastName}` : 'Vendor';
        const dateStr = new Date(c.createdAt).toLocaleString('en-IN');
        const amountStr = `₹${(c.amountPaid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

        return `
          <tr>
            <td><code>${c.confirmationId || c._id.slice(-8)}</code></td>
            <td><strong>${vendorName}</strong></td>
            <td style="font-weight: 700; color: #059669;">${amountStr}</td>
            <td><span class="badge badge-info">${(c.paymentMethod || 'BANK').toUpperCase()}</span></td>
            <td><code>${c.transactionId}</code></td>
            <td>${dateStr}</td>
            <td>
              <a href="${c.paymentProof}" target="_blank" style="color: var(--primary); text-decoration: underline; font-size: 0.8rem;">
                🖼️ View Proof
              </a>
            </td>
            <td>
              <button class="btn btn-sm btn-success" onclick="openReviewProofModal('${c._id}')">🔍 Review & Verify</button>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      confirmationsCache = [];
      document.getElementById('statPendingConfirmations').textContent = '0';
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No payment proofs currently awaiting review.</td></tr>';
    }
  } catch (err) {
    console.error('fetchAdminPaymentConfirmations error:', err);
  }
}

function openReviewProofModal(confirmationId) {
  const c = confirmationsCache.find(x => x._id === confirmationId);
  if (!c) return;

  const vendorName = c.vendorId ? `${c.vendorId.firstName} ${c.vendorId.lastName} (${c.vendorId.email})` : 'Vendor';
  const destInfo = c.paymentDestinationId ? `Destination: ${c.paymentDestinationId.bankName || c.paymentDestinationId.walletName || 'Company Account'}` : '';

  document.getElementById('modalProofDetails').innerHTML = `
    <div class="info-box mb-3">
      <strong>Vendor:</strong> ${vendorName}<br>
      <strong>Amount Paid:</strong> ₹${(c.amountPaid || 0).toLocaleString('en-IN')}<br>
      <strong>UTR / Transaction Reference:</strong> <code>${c.transactionId}</code><br>
      <strong>Payment Method:</strong> ${(c.paymentMethod || 'BANK').toUpperCase()}<br>
      ${destInfo ? `<strong>${destInfo}</strong><br>` : ''}
      ${c.note ? `<strong>Vendor Note:</strong> <em>${c.note}</em>` : ''}
    </div>
    <div>
      <label>Uploaded Payment Screenshot (Cloudinary):</label>
      <a href="${c.paymentProof}" target="_blank">
        <img src="${c.paymentProof}" alt="Payment Proof" class="proof-preview-img">
      </a>
    </div>
  `;

  document.getElementById('modalProofActions').innerHTML = `
    <button type="button" class="btn btn-secondary" onclick="closeReviewProofModal()">Close</button>
    <button type="button" class="btn btn-danger" onclick="promptRejectPayment('${c._id}')">❌ Reject Payment</button>
    <button type="button" class="btn btn-success" onclick="approvePaymentConfirmation('${c._id}')">✅ Approve & Credit Wallet</button>
  `;

  document.getElementById('reviewProofModal').classList.remove('hidden');
}

function closeReviewProofModal() {
  document.getElementById('reviewProofModal').classList.add('hidden');
}

async function approvePaymentConfirmation(confirmationId) {
  if (!confirm('Are you sure you want to APPROVE this payment and atomically CREDIT the vendor wallet?')) return;

  try {
    const res = await fetch(`${API_BASE}/admin/payment-confirmations/${confirmationId}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const data = await res.json();
    if (data.success) {
      showToast('Payment approved and vendor wallet credited successfully!', 'success');
      closeReviewProofModal();
      fetchAdminPaymentConfirmations();
      fetchAdminTopUps();
      fetchAdminVendors();
    } else {
      showToast(data.message || 'Payment approval failed', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to server', 'error');
  }
}

function promptRejectPayment(confirmationId) {
  closeReviewProofModal();
  document.getElementById('rejectionModalTitle').textContent = '❌ Reject Payment Proof';
  document.getElementById('rejectionType').value = 'payment';
  document.getElementById('rejectionTargetId').value = confirmationId;
  document.getElementById('rejectionReasonInput').value = '';
  document.getElementById('rejectionModal').classList.remove('hidden');
}

/**
 * 5. Vendor KYC & Account Management
 */
async function fetchAdminVendors() {
  if (!adminToken) return;

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
    console.error('fetchAdminVendors error:', err);
  }
}

function updateAdminStats(vendors) {
  const total = vendors.length;
  const pending = vendors.filter(v => v.verificationStatus === 'pending').length;
  const approved = vendors.filter(v => v.verificationStatus === 'approved').length;

  document.getElementById('statTotalVendors').textContent = total;
  document.getElementById('statPendingVendors').textContent = pending;
  document.getElementById('statApprovedVendors').textContent = approved;
}

function setAdminVendorFilter(filter, event) {
  currentVendorFilter = filter;
  document.querySelectorAll('#vendorsTab .tabs .tab-btn').forEach(b => b.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  renderVendorsTable();
}

function handleAdminVendorSearch() {
  renderVendorsTable();
}

function renderVendorsTable() {
  const query = document.getElementById('adminSearchInput')?.value.toLowerCase().trim() || '';
  let list = [...allVendorsCache];

  if (currentVendorFilter !== 'all') {
    list = list.filter(v => v.verificationStatus === currentVendorFilter);
  }

  if (query) {
    list = list.filter(v =>
      `${v.firstName} ${v.lastName}`.toLowerCase().includes(query) ||
      v.email.toLowerCase().includes(query) ||
      (v.mobileNumber && v.mobileNumber.includes(query))
    );
  }

  const tbody = document.getElementById('adminVendorsTbody');
  if (list.length > 0) {
    tbody.innerHTML = list.map(v => {
      const avatarHtml = v.profilePhoto
        ? `<img src="${v.profilePhoto}" class="table-avatar" alt="Avatar">`
        : `<div class="table-avatar">${(v.firstName[0] || 'V').toUpperCase()}</div>`;

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              ${avatarHtml}
              <div>
                <strong>${v.firstName} ${v.lastName}</strong><br>
                <small class="text-muted">${v.email}</small>
              </div>
            </div>
          </td>
          <td>
            <div>📱 ${v.mobileNumber}</div>
            ${v.whatsappNumber ? `<small class="text-muted">💬 ${v.whatsappNumber}</small>` : ''}
          </td>
          <td><span class="badge badge-default">${v.bankAccounts?.length || 0} Banks</span></td>
          <td><span class="badge badge-default">${v.wallets?.length || 0} Wallets</span></td>
          <td><span class="badge badge-${v.verificationStatus}">${v.verificationStatus}</span></td>
          <td><span class="badge ${v.isActive ? 'badge-active' : 'badge-rejected'}">${v.isActive ? 'Active' : 'Disabled'}</span></td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="openVendorDetailModal('${v._id}')">🔍 Review</button>
          </td>
        </tr>
      `;
    }).join('');
  } else {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No matching vendors found.</td></tr>';
  }
}

function openVendorDetailModal(vendorId) {
  const v = allVendorsCache.find(x => x._id === vendorId);
  if (!v) return;

  const banksHtml = v.bankAccounts?.length > 0
    ? v.bankAccounts.map(b => `
        <div class="item-card mb-2" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <p><strong>${b.bankName}</strong> | A/C: <code>${b.accountNumber}</code> | IFSC: <code>${b.ifscCode}</code> | Holder: ${b.accountHolderName}</p>
            <div style="margin-top: 0.25rem;">
              ${b.isDefault ? '<span class="badge badge-default">Default</span>' : ''}
              ${b.branchName ? `<small class="text-muted">Branch: ${b.branchName}</small>` : ''}
            </div>
          </div>
        </div>
      `).join('')
    : '<p class="text-muted">No bank accounts linked.</p>';

  const walletsHtml = v.wallets?.length > 0
    ? v.wallets.map(w => `
        <div class="item-card mb-2" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            ${w.qrCode ? `
              <a href="${w.qrCode}" target="_blank" title="Click to view QR">
                <img src="${w.qrCode}" alt="QR" style="width: 45px; height: 45px; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 4px; padding: 2px; background: #fff;">
              </a>
            ` : ''}
            <div>
              <p><strong>${w.walletName}</strong> | VPA/ID: <code>${w.walletId}</code></p>
              <div style="margin-top: 0.25rem;">
                ${w.isDefault ? '<span class="badge badge-default">Default</span>' : ''}
              </div>
            </div>
          </div>
        </div>
      `).join('')
    : '<p class="text-muted">No wallets linked.</p>';

  document.getElementById('modalVendorContent').innerHTML = `
    <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
      ${v.profilePhoto ? `<img src="${v.profilePhoto}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;">` : ''}
      <div>
        <h3>${v.firstName} ${v.lastName}</h3>
        <p class="text-muted">${v.email} | Mobile: ${v.mobileNumber}</p>
        <div style="margin-top: 0.25rem;">
          <span class="badge badge-${v.verificationStatus}">KYC: ${v.verificationStatus}</span>
          <span class="badge ${v.isActive ? 'badge-active' : 'badge-rejected'}">${v.isActive ? 'Active' : 'Disabled'}</span>
        </div>
      </div>
    </div>
    <div class="detail-section">
      <h4>🏦 Bank Accounts (${v.bankAccounts?.length || 0})</h4>
      ${banksHtml}
    </div>
    <div class="detail-section">
      <h4>👛 Wallets / UPI (${v.wallets?.length || 0})</h4>
      ${walletsHtml}
    </div>
    <div class="detail-section">
      <h4>📋 Top-Up Request History</h4>
      <div id="modalVendorTopUpsList" style="max-height: 180px; overflow-y: auto;">
        <p class="text-muted" style="font-size: 0.85rem;">Loading vendor request history...</p>
      </div>
    </div>
  `;

  // Fetch this vendor's topup history
  loadVendorTopUpHistory(v._id);

  document.getElementById('modalVendorActions').innerHTML = `
    <button type="button" class="btn btn-secondary" onclick="closeVendorDetailModal()">Close</button>
    ${v.isActive 
      ? `<button type="button" class="btn btn-warning" onclick="adminToggleActive('${v._id}', false)">Deactivate</button>` 
      : `<button type="button" class="btn btn-success" onclick="adminToggleActive('${v._id}', true)">Activate</button>`}
    ${v.verificationStatus !== 'approved' ? `<button type="button" class="btn btn-success" onclick="adminApproveVendor('${v._id}')">✅ Approve KYC</button>` : ''}
    ${v.verificationStatus !== 'rejected' ? `<button type="button" class="btn btn-danger" onclick="promptRejectVendor('${v._id}')">❌ Reject KYC</button>` : ''}
  `;

  document.getElementById('vendorDetailModal').classList.remove('hidden');
}

async function loadVendorTopUpHistory(vendorId) {
  try {
    const res = await fetch(`${API_BASE}/admin/topups?vendorId=${vendorId}&limit=50`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    const container = document.getElementById('modalVendorTopUpsList');
    if (!container) return;

    if (data.success && data.data?.topUps?.length > 0) {
      container.innerHTML = data.data.topUps.map(t => {
        const dateStr = new Date(t.createdAt).toLocaleDateString('en-IN');
        const amountStr = `₹${(t.requestedAmount || 0).toLocaleString('en-IN')}`;
        return `
          <div class="item-card mb-2" style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem;">
            <div>
              <strong>${t.topUpId || t._id.slice(-8)}</strong> — ${amountStr}
              <br><small class="text-muted">${(t.preferredPaymentMethod || 'BANK').toUpperCase()} | ${dateStr}</small>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="badge badge-${t.status}">${t.status.replace(/_/g, ' ')}</span>
              <button class="btn btn-sm btn-secondary" onclick="openTopUpDetailModal('${t._id}')">🔍</button>
            </div>
          </div>
        `;
      }).join('');
    } else {
      container.innerHTML = '<p class="text-muted" style="font-size: 0.85rem;">No top-up requests found for this vendor.</p>';
    }
  } catch (err) {
    console.error('loadVendorTopUpHistory error:', err);
  }
}

/**
 * 4B. Complete Top-Up Request History
 */
async function fetchAdminRequestHistory() {
  if (!adminToken) return;

  try {
    const res = await fetch(`${API_BASE}/admin/topups?limit=100`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const data = await res.json();
    if (data.success && data.data?.topUps) {
      allRequestsHistoryCache = data.data.topUps;
      renderAdminHistoryTable();
    }
  } catch (err) {
    console.error('fetchAdminRequestHistory error:', err);
  }
}

function setAdminHistoryFilter(filter, event) {
  currentHistoryFilter = filter;
  document.querySelectorAll('#historyTab .tabs .tab-btn').forEach(b => b.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  renderAdminHistoryTable();
}

function handleAdminHistorySearch() {
  renderAdminHistoryTable();
}

function renderAdminHistoryTable() {
  const query = document.getElementById('adminHistorySearchInput')?.value.toLowerCase().trim() || '';
  let list = [...allRequestsHistoryCache];

  if (currentHistoryFilter !== 'all') {
    list = list.filter(t => t.status === currentHistoryFilter);
  }

  if (query) {
    list = list.filter(t => {
      const vendorName = t.vendorId ? `${t.vendorId.firstName} ${t.vendorId.lastName}`.toLowerCase() : '';
      const vendorEmail = t.vendorId?.email?.toLowerCase() || '';
      const topUpId = (t.topUpId || t._id).toLowerCase();
      const utr = t.paymentConfirmationId?.transactionId?.toLowerCase() || '';
      return vendorName.includes(query) || vendorEmail.includes(query) || topUpId.includes(query) || utr.includes(query);
    });
  }

  const tbody = document.getElementById('adminHistoryTbody');
  if (list.length > 0) {
    tbody.innerHTML = list.map(t => {
      const vendorName = t.vendorId ? `${t.vendorId.firstName} ${t.vendorId.lastName}` : 'Vendor';
      const vendorEmail = t.vendorId?.email || '';
      const dateStr = new Date(t.createdAt).toLocaleString('en-IN');
      const reqAmountStr = `₹${(t.requestedAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      const assignedDests = t.adminResponse?.selectedDestinations || [];
      const destSummary = assignedDests.length > 0
        ? assignedDests.map(d => d ? (d.name || d.bankName || d.walletName) : '').filter(Boolean).join(', ')
        : (t.status === 'PENDING_ADMIN_RESPONSE' ? '<span class="text-muted">Awaiting Assignment</span>' : 'None');

      return `
        <tr>
          <td><code>${t.topUpId || t._id.slice(-8)}</code></td>
          <td>
            <strong>${vendorName}</strong><br>
            <small class="text-muted">${vendorEmail}</small>
          </td>
          <td style="font-weight: 700; color: #1e293b;">${reqAmountStr}</td>
          <td><span class="badge badge-info">${(t.preferredPaymentMethod || 'BANK').toUpperCase()}</span></td>
          <td><span class="badge badge-${t.status}">${t.status.replace(/_/g, ' ')}</span></td>
          <td><small>${destSummary}</small></td>
          <td><small>${dateStr}</small></td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="openTopUpDetailModal('${t._id}')">🔍 Details</button>
          </td>
        </tr>
      `;
    }).join('');
  } else {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No matching top-up requests found in history.</td></tr>';
  }
}

function openTopUpDetailModal(topUpId) {
  const t = allRequestsHistoryCache.find(x => x._id === topUpId) ||
            pendingTopUpsCache.find(x => x._id === topUpId);
  if (!t) return;

  const vendorName = t.vendorId ? `${t.vendorId.firstName} ${t.vendorId.lastName}` : 'Vendor';
  const vendorEmail = t.vendorId?.email || 'N/A';
  const vendorMobile = t.vendorId?.mobileNumber || 'N/A';
  const dateStr = new Date(t.createdAt).toLocaleString('en-IN');
  const reqAmountStr = `₹${(t.requestedAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  const approvedAmountStr = t.adminResponse?.approvedAmount ? `₹${t.adminResponse.approvedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : reqAmountStr;

  const assignedDests = t.adminResponse?.selectedDestinations || [];
  const destsHtml = assignedDests.length > 0
    ? assignedDests.map(d => {
        if (!d) return '';
        const isBank = d.type === 'bank' || d.destinationType === 'bank';
        return `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.5rem; margin-top: 0.35rem; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>${isBank ? '🏦 ' + (d.bankName || d.name) : '👛 ' + (d.walletName || d.name)}</strong><br>
              <small>${isBank ? `A/C: ${d.accountNumber} | IFSC: ${d.ifscCode} | Holder: ${d.accountHolderName}` : `UPI ID: ${d.walletId}`}</small>
            </div>
            ${d.qrCode ? `<a href="${d.qrCode}" target="_blank"><img src="${d.qrCode}" style="width: 40px; height: 40px; object-fit: contain; border-radius: 4px;" alt="QR"></a>` : ''}
          </div>
        `;
      }).join('')
    : '<p class="text-muted">No destinations assigned.</p>';

  const confirmation = t.paymentConfirmationId;
  const proofHtml = confirmation
    ? `
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 0.65rem; margin-top: 0.5rem;">
        <strong>UTR / Transaction ID:</strong> <code>${confirmation.transactionId}</code><br>
        <strong>Amount Paid:</strong> ₹${(confirmation.amountPaid || 0).toLocaleString('en-IN')}<br>
        <strong>Submitted:</strong> ${new Date(confirmation.createdAt).toLocaleString('en-IN')}<br>
        ${confirmation.note ? `<strong>Vendor Note:</strong> <em>${confirmation.note}</em><br>` : ''}
        ${confirmation.paymentProof ? `
          <div style="margin-top: 0.5rem;">
            <label>Payment Receipt:</label><br>
            <a href="${confirmation.paymentProof}" target="_blank">
              <img src="${confirmation.paymentProof}" style="max-height: 140px; border-radius: 6px; border: 1px solid #cbd5e1; margin-top: 0.25rem;">
            </a>
          </div>
        ` : ''}
      </div>
    `
    : '<p class="text-muted">Payment proof not submitted yet.</p>';

  document.getElementById('topUpDetailContent').innerHTML = `
    <div class="info-box mb-3">
      <div class="flex-between">
        <h4>Top-Up ${t.topUpId || t._id}</h4>
        <span class="badge badge-${t.status}">${t.status.replace(/_/g, ' ')}</span>
      </div>
      <p style="margin-top: 0.35rem;"><strong>Vendor:</strong> ${vendorName} (${vendorEmail} | 📱 ${vendorMobile})</p>
      <p><strong>Requested Amount:</strong> ${reqAmountStr} | <strong>Approved Amount:</strong> ${approvedAmountStr}</p>
      <p><strong>Preferred Method:</strong> ${(t.preferredPaymentMethod || 'BANK').toUpperCase()} | <strong>Created:</strong> ${dateStr}</p>
      ${t.notes ? `<p><strong>Vendor Request Note:</strong> <em>${t.notes}</em></p>` : ''}
      ${t.rejectionReason ? `<p style="color: #dc2626;"><strong>Rejection Reason:</strong> <em>${t.rejectionReason}</em></p>` : ''}
    </div>

    <div class="detail-section">
      <h4>🏢 Assigned Company Destinations (${assignedDests.length})</h4>
      ${destsHtml}
      ${t.adminResponse?.adminMessage ? `<p style="margin-top: 0.35rem;"><strong>Admin Instructions:</strong> <em>${t.adminResponse.adminMessage}</em></p>` : ''}
    </div>

    <div class="detail-section">
      <h4>💳 Payment Proof & Verification</h4>
      ${proofHtml}
    </div>
  `;

  document.getElementById('topUpDetailModal').classList.remove('hidden');
}

function closeTopUpDetailModal() {
  document.getElementById('topUpDetailModal').classList.add('hidden');
}

function closeVendorDetailModal() {
  document.getElementById('vendorDetailModal').classList.add('hidden');
}

async function adminApproveVendor(id) {
  try {
    const res = await fetch(`${API_BASE}/admin/vendors/${id}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    showToast(data.message || 'Vendor approved', data.success ? 'success' : 'error');
    closeVendorDetailModal();
    fetchAdminVendors();
  } catch (err) {
    showToast('Action failed', 'error');
  }
}

function promptRejectVendor(vendorId) {
  closeVendorDetailModal();
  document.getElementById('rejectionModalTitle').textContent = '❌ Reject Vendor KYC';
  document.getElementById('rejectionType').value = 'vendor';
  document.getElementById('rejectionTargetId').value = vendorId;
  document.getElementById('rejectionReasonInput').value = '';
  document.getElementById('rejectionModal').classList.remove('hidden');
}

async function adminToggleActive(id, activate) {
  try {
    const action = activate ? 'activate' : 'deactivate';
    const res = await fetch(`${API_BASE}/admin/vendors/${id}/${action}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    showToast(data.message || `Vendor ${action}d`, data.success ? 'success' : 'error');
    closeVendorDetailModal();
    fetchAdminVendors();
  } catch (err) {
    showToast('Action failed', 'error');
  }
}

/**
 * 6. Generic Rejection Handler
 */
function closeRejectionModal() {
  document.getElementById('rejectionModal').classList.add('hidden');
}

async function submitGenericRejection(event) {
  event.preventDefault();

  const type = document.getElementById('rejectionType').value;
  const targetId = document.getElementById('rejectionTargetId').value;
  const reason = document.getElementById('rejectionReasonInput').value.trim();

  if (type === 'payment') {
    try {
      const res = await fetch(`${API_BASE}/admin/payment-confirmations/${targetId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ rejectionReason: reason })
      });
      const data = await res.json();
      showToast(data.message || 'Payment confirmation rejected', data.success ? 'success' : 'error');
      closeRejectionModal();
      fetchAdminPaymentConfirmations();
      fetchAdminTopUps();
    } catch (err) {
      showToast('Rejection failed', 'error');
    }
  } else if (type === 'vendor') {
    try {
      const res = await fetch(`${API_BASE}/admin/vendors/${targetId}/reject`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ rejectionReason: reason })
      });
      const data = await res.json();
      showToast(data.message || 'Vendor KYC rejected', data.success ? 'success' : 'error');
      closeRejectionModal();
      fetchAdminVendors();
    } catch (err) {
      showToast('Rejection failed', 'error');
    }
  }
}

/**
 * 7. Payment Destinations CRUD
 */
async function fetchAdminDestinations() {
  if (!adminToken) return;

  try {
    const res = await fetch(`${API_BASE}/admin/payment-destinations`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    const listEl = document.getElementById('adminDestinationsList');

    if (data.success && data.data?.destinations?.length > 0) {
      destinationsCache = data.data.destinations;
      if (listEl) {
        listEl.innerHTML = data.data.destinations.map(d => `
          <div class="item-card">
            <div class="item-info">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;">
                <div>
                  <h4>${d.destinationType === 'bank' ? `🏦 ${d.bankName || d.name} (${d.accountNumber})` : `👛 ${d.walletName || d.name} (${d.walletId})`}</h4>
                  <p>${d.destinationType === 'bank' ? `IFSC: <strong>${d.ifscCode}</strong> | Holder: ${d.accountHolderName}` : `UPI ID: <strong>${d.walletId}</strong>`}</p>
                  <div style="margin-top: 0.35rem;">
                    <span class="badge ${d.isActive ? 'badge-approved' : 'badge-rejected'}">${d.isActive ? 'Active' : 'Inactive'}</span>
                    ${d.dailyLimit ? `<small class="text-muted" style="margin-left: 0.5rem;">Daily: ₹${d.dailyLimit.toLocaleString('en-IN')}</small>` : ''}
                  </div>
                </div>
                ${d.qrCode ? `
                  <div style="text-align: center;">
                    <a href="${d.qrCode}" target="_blank" title="Click to view full QR">
                      <img src="${d.qrCode}" alt="Destination QR" style="width: 50px; height: 50px; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 6px; padding: 2px; background: #fff;">
                    </a>
                    <br><small style="font-size: 0.7rem; color: #6b7280;">QR Code</small>
                  </div>
                ` : ''}
              </div>
            </div>
            <div class="item-actions" style="display: flex; gap: 0.35rem; align-items: center;">
              <button class="btn btn-sm btn-secondary" onclick="openEditDestinationModal('${d._id}')">✏️ Edit</button>
              <button class="btn btn-sm ${d.isActive ? 'btn-warning' : 'btn-success'}" onclick="toggleDestinationActive('${d._id}')">
                ${d.isActive ? '⏸️ Deactivate' : '✅ Activate'}
              </button>
              <button class="btn btn-sm btn-danger" onclick="deleteDestination('${d._id}')">🗑️ Delete</button>
            </div>
          </div>
        `).join('');
      }
    } else {
      destinationsCache = [];
      if (listEl) listEl.innerHTML = '<p class="empty-state">No company payment destinations added yet.</p>';
    }
  } catch (err) {
    console.error('fetchAdminDestinations error:', err);
  }
}

function toggleDestTypeFields() {
  const type = document.getElementById('destType').value;
  if (type === 'bank') {
    document.getElementById('destBankFields').classList.remove('hidden');
    document.getElementById('destWalletFields').classList.add('hidden');
  } else {
    document.getElementById('destBankFields').classList.add('hidden');
    document.getElementById('destWalletFields').classList.remove('hidden');
  }
}

async function handleAddDestination(event) {
  event.preventDefault();

  const type = document.getElementById('destType').value;
  const displayName = document.getElementById('destDisplayName')?.value.trim() ||
    (type === 'bank' ? document.getElementById('destBankName').value.trim() : document.getElementById('destWalletName').value.trim());

  const formData = new FormData();
  formData.append('type', type);
  formData.append('destinationType', type);
  formData.append('name', displayName);
  
  const instructions = document.getElementById('destInstructions').value.trim();
  if (instructions) formData.append('instructions', instructions);
  
  formData.append('isActive', document.getElementById('destIsActive').checked);

  const dailyLimit = document.getElementById('destDailyLimit').value.trim();
  if (dailyLimit) formData.append('dailyLimit', dailyLimit);

  if (type === 'bank') {
    formData.append('bankName', document.getElementById('destBankName').value.trim());
    formData.append('accountNumber', document.getElementById('destAccountNumber').value.trim());
    formData.append('ifscCode', document.getElementById('destIfsc').value.trim().toUpperCase());
    formData.append('branchName', document.getElementById('destBranch').value.trim());
    formData.append('accountHolderName', document.getElementById('destHolderName').value.trim());
  } else {
    formData.append('walletName', document.getElementById('destWalletName').value.trim());
    formData.append('walletId', document.getElementById('destWalletId').value.trim());
    const qrFile = document.getElementById('destWalletQr')?.files[0];
    if (qrFile) {
      formData.append('qrCode', qrFile);
    }
  }

  try {
    const res = await fetch(`${API_BASE}/admin/payment-destinations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      },
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      showToast('Payment destination created with QR code!', 'success');
      document.getElementById('addDestinationForm').reset();
      toggleDestTypeFields();
      fetchAdminDestinations();
    } else {
      showToast(data.message || 'Error creating destination', 'error');
    }
  } catch (err) {
    showToast('Failed to add destination', 'error');
  }
}

function openEditDestinationModal(id) {
  const d = destinationsCache.find(x => x._id === id);
  if (!d) return;

  const isBank = d.destinationType === 'bank' || d.type === 'bank';
  document.getElementById('editDestId').value = d._id;
  document.getElementById('editDestType').value = isBank ? 'bank' : 'wallet';
  document.getElementById('editDestDisplayName').value = d.name || '';
  document.getElementById('editDestDailyLimit').value = d.dailyLimit || '';
  document.getElementById('editDestInstructions').value = d.instructions || '';
  document.getElementById('editDestIsActive').checked = Boolean(d.isActive);

  if (isBank) {
    document.getElementById('editDestBankFields').classList.remove('hidden');
    document.getElementById('editDestWalletFields').classList.add('hidden');
    document.getElementById('editDestBankName').value = d.bankName || '';
    document.getElementById('editDestAccountNumber').value = d.accountNumber || '';
    document.getElementById('editDestIfsc').value = d.ifscCode || '';
    document.getElementById('editDestBranch').value = d.branchName || '';
    document.getElementById('editDestHolderName').value = d.accountHolderName || '';
  } else {
    document.getElementById('editDestBankFields').classList.add('hidden');
    document.getElementById('editDestWalletFields').classList.remove('hidden');
    document.getElementById('editDestWalletName').value = d.walletName || '';
    document.getElementById('editDestWalletId').value = d.walletId || '';
    const qrInput = document.getElementById('editDestWalletQr');
    if (qrInput) qrInput.value = '';
    const qrCurrent = document.getElementById('editDestWalletQrCurrent');
    if (qrCurrent) {
      qrCurrent.innerHTML = d.qrCode 
        ? `Current QR: <a href="${d.qrCode}" target="_blank" style="color: var(--primary); text-decoration: underline;">View Current</a> (Upload new image to replace)`
        : 'No QR code currently set.';
    }
  }

  document.getElementById('editDestinationModal').classList.remove('hidden');
}

function closeEditDestinationModal() {
  document.getElementById('editDestinationModal').classList.add('hidden');
}

async function handleUpdateDestination(event) {
  event.preventDefault();

  const id = document.getElementById('editDestId').value;
  const isBank = document.getElementById('editDestType').value === 'bank';

  const formData = new FormData();
  formData.append('name', document.getElementById('editDestDisplayName').value.trim());
  formData.append('isActive', document.getElementById('editDestIsActive').checked);

  const dailyLimit = document.getElementById('editDestDailyLimit').value.trim();
  if (dailyLimit) formData.append('dailyLimit', dailyLimit);

  const instructions = document.getElementById('editDestInstructions').value.trim();
  formData.append('instructions', instructions);

  if (isBank) {
    formData.append('bankName', document.getElementById('editDestBankName').value.trim());
    formData.append('accountNumber', document.getElementById('editDestAccountNumber').value.trim());
    formData.append('ifscCode', document.getElementById('editDestIfsc').value.trim().toUpperCase());
    formData.append('branchName', document.getElementById('editDestBranch').value.trim());
    formData.append('accountHolderName', document.getElementById('editDestHolderName').value.trim());
  } else {
    formData.append('walletName', document.getElementById('editDestWalletName').value.trim());
    formData.append('walletId', document.getElementById('editDestWalletId').value.trim());
    const qrFile = document.getElementById('editDestWalletQr')?.files[0];
    if (qrFile) {
      formData.append('qrCode', qrFile);
    }
  }

  try {
    const res = await fetch(`${API_BASE}/admin/payment-destinations/${id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      },
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      showToast('Destination updated successfully!', 'success');
      closeEditDestinationModal();
      fetchAdminDestinations();
    } else {
      showToast(data.message || 'Update failed', 'error');
    }
  } catch (err) {
    showToast('Failed to update destination', 'error');
  }
}

async function toggleDestinationActive(id) {
  try {
    const res = await fetch(`${API_BASE}/admin/payment-destinations/${id}/toggle`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Destination status updated', 'success');
      fetchAdminDestinations();
    } else {
      showToast(data.message || 'Toggle failed', 'error');
    }
  } catch (err) {
    showToast('Failed to toggle status', 'error');
  }
}

async function deleteDestination(id) {
  if (!confirm('Are you sure you want to delete this payment destination?')) return;
  try {
    const res = await fetch(`${API_BASE}/admin/payment-destinations/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Destination deleted', 'success');
      fetchAdminDestinations();
    }
  } catch (err) {
    showToast('Failed to delete destination', 'error');
  }
}

/**
 * 8. FCFS Queue & Tiers
 */
async function fetchAdminFcfsQueue() {
  if (!adminToken) return;

  try {
    const res = await fetch(`${API_BASE}/admin/fcfs/vendors`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    const tbody = document.getElementById('adminFcfsTbody');

    if (data.success && data.data?.queue?.length > 0) {
      fcfsQueueCache = data.data.queue;
      tbody.innerHTML = data.data.queue.map(q => {
        const v = q.vendorId;
        const vendorName = v ? `${v.firstName} ${v.lastName}` : 'Unknown';
        const balance = q.vendorWallet?.balance || 0;

        return `
          <tr>
            <td><strong>#${q.priority}</strong></td>
            <td>${vendorName}</td>
            <td style="font-weight: 700; color: ${balance > 0 ? '#059669' : '#dc2626'};">₹${balance.toLocaleString('en-IN')}</td>
            <td>${q.consecutiveSkips || 0}</td>
            <td><span class="badge ${q.isActive ? 'badge-approved' : 'badge-rejected'}">${q.isActive ? 'Active' : 'Inactive'}</span></td>
            <td>
              <button class="btn btn-sm btn-secondary" onclick="moveQueuePriority('${q.vendorId?._id || q.vendorId}', 'up')">⬆️ Up</button>
              <button class="btn btn-sm btn-secondary" onclick="moveQueuePriority('${q.vendorId?._id || q.vendorId}', 'down')">⬇️ Down</button>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No vendors in FCFS queue.</td></tr>';
    }
  } catch (err) {
    console.error('fetchAdminFcfsQueue error:', err);
  }
}

async function moveQueuePriority(vendorId, direction) {
  if (!fcfsQueueCache.length) return;
  const index = fcfsQueueCache.findIndex(q => (q.vendorId?._id || q.vendorId).toString() === vendorId.toString());
  if (index === -1) return;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= fcfsQueueCache.length) return;

  const newOrder = [...fcfsQueueCache];
  const [moved] = newOrder.splice(index, 1);
  newOrder.splice(targetIndex, 0, moved);

  const vendorOrder = newOrder.map(q => q.vendorId?._id || q.vendorId);

  try {
    const res = await fetch(`${API_BASE}/admin/fcfs/reorder`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ vendorOrder })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Queue reordered successfully', 'success');
      fetchAdminFcfsQueue();
    }
  } catch (err) {
    showToast('Failed to reorder queue', 'error');
  }
}

async function fetchAdminTiers() {
  if (!adminToken) return;

  try {
    const res = await fetch(`${API_BASE}/admin/tiers`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    const listEl = document.getElementById('adminTiersList');

    if (data.success && data.data?.tiers?.length > 0) {
      listEl.innerHTML = data.data.tiers.map(t => `
        <div class="item-card">
          <div class="item-info">
            <h4>${t.tierName} Tier (Priority Level ${t.priorityLevel})</h4>
            <p>Commission Fee: <strong>${t.commissionPercentage}%</strong> | Min Balance: ₹${(t.minBalanceRequired || 0).toLocaleString('en-IN')}</p>
          </div>
          <span class="badge badge-tier">${t.commissionPercentage}% Fee</span>
        </div>
      `).join('');
    } else {
      listEl.innerHTML = '<p class="empty-state">No tiers loaded.</p>';
    }
  } catch (err) {
    console.error('fetchAdminTiers error:', err);
  }
}

/**
 * 9. Audit Logs
 */
async function fetchAdminAuditLogs() {
  if (!adminToken) return;

  try {
    const res = await fetch(`${API_BASE}/admin/audit-logs`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    const tbody = document.getElementById('adminAuditTbody');

    if (data.success && data.data?.logs?.length > 0) {
      tbody.innerHTML = data.data.logs.map(log => {
        const dateStr = new Date(log.createdAt).toLocaleString('en-IN');
        return `
          <tr>
            <td><small>${dateStr}</small></td>
            <td><strong>${log.action}</strong></td>
            <td><span class="badge badge-default">${log.resourceType}</span></td>
            <td><small>${log.performedByModel || 'User'}</small></td>
            <td><span class="badge badge-${log.status === 'SUCCESS' ? 'approved' : 'rejected'}">${log.status}</span></td>
            <td><small class="text-muted">${log.details ? JSON.stringify(log.details).slice(0, 50) + '...' : 'N/A'}</small></td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No audit logs recorded yet.</td></tr>';
    }
  } catch (err) {
    console.error('fetchAdminAuditLogs error:', err);
  }
}

/**
 * 10. Admin Logout
 */
function adminLogout() {
  adminToken = null;
  currentAdmin = null;
  localStorage.removeItem('moffin_admin_token');
  showAdminLoginSection();
  showToast('SuperAdmin logged out', 'success');
}
