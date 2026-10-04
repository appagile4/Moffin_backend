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
let adminWithdrawalsCache = [];
let currentWithdrawalFilter = 'all';
let withdrawalCurrentPage = 1;
let withdrawalTotalPages = 1;

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
  } else if (tabId === 'clientsTab') {
    fetchAdminClientStats();
    fetchAdminClients();
  } else if (tabId === 'withdrawalsManagementTab') {
    fetchAdminWithdrawals();
  } else if (tabId === 'tiersManagementTab') {
    fetchAdminTierAnalytics();
    fetchAdminTiersList();
  } else if (tabId === 'destinationsTab') {
    fetchAdminDestinations();
  } else if (tabId === 'fcfsTab') {
    fetchAdminFcfsQueue();
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
  fetchAdminTierAnalytics();
  fetchAdminTiersList();
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

      const isManual = v.commissionMode === 'MANUAL';
      const commRate = isManual 
        ? (v.manualCommissionRate !== undefined && v.manualCommissionRate !== null ? v.manualCommissionRate : v.effectiveCommissionRate) 
        : (v.effectiveCommissionRate !== undefined ? v.effectiveCommissionRate : (v.currentTierId?.commissionRate || 1.0));
      const tierName = v.currentTierDisplayName || v.currentTierName || v.currentTierId?.displayName || v.currentTierId?.name || (typeof v.currentTier === 'string' ? v.currentTier : 'Bronze V');
      const tierBadgeClass = getAdminTierBadgeClass('', tierName);

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
          <td>
            <div style="display: flex; flex-direction: column; gap: 0.25rem;">
              <div>
                <span class="badge ${tierBadgeClass}">${tierName}</span>
                <span class="badge ${isManual ? 'badge-mode-manual' : 'badge-mode-auto'}">${isManual ? 'MANUAL' : 'AUTO'}</span>
              </div>
              <div style="font-size: 0.85rem; font-weight: 700; color: #059669;">
                Rate: ${commRate}%
              </div>
            </div>
          </td>
          <td><span class="badge badge-default">${v.bankAccounts?.length || 0} Banks</span></td>
          <td><span class="badge badge-default">${v.wallets?.length || 0} Wallets</span></td>
          <td><span class="badge badge-${v.verificationStatus}">${v.verificationStatus}</span></td>
          <td><span class="badge ${v.isActive ? 'badge-active' : 'badge-rejected'}">${v.isActive ? 'Active' : 'Disabled'}</span></td>
          <td>
            <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
              <button class="btn btn-sm btn-secondary" onclick="openVendorDetailModal('${v._id}')">🔍 Review</button>
              <button class="btn btn-sm btn-info" onclick="openManualCommissionModal('${v._id}')" title="Set or remove manual commission override">⚙️ Override</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } else {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No matching vendors found.</td></tr>';
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
      const totalInQueue = data.data.queue.length;

      const countBadge = document.getElementById('fcfsTotalCountBadge');
      if (countBadge) {
        countBadge.textContent = `Total Vendors in Queue: ${totalInQueue}`;
      }

      tbody.innerHTML = data.data.queue.map((q, index) => {
        const v = q.vendorId;
        const vendorName = v ? `${v.firstName || ''} ${v.lastName || ''}`.trim() || 'Unnamed Vendor' : 'Unknown Vendor';
        const vendorEmail = v?.email || 'No email';
        const vendorMobile = v?.mobileNumber || 'No phone';
        const isVerified = v?.verificationStatus === 'approved';
        
        const availableBalance = Number(q.wallet?.availableBalance) || 0;
        const totalBalance = Number(q.wallet?.balance) || 0;
        const lockedBalance = Number(q.wallet?.lockedBalance) || 0;

        // Format active bank details
        const bankAccounts = q.bankAccounts || [];
        let bankHtml = '';
        if (bankAccounts.length > 0) {
          bankHtml = bankAccounts.map(b => `
            <div style="font-size: 0.8rem; line-height: 1.4; margin-bottom: 4px; padding: 4px 6px; background: #f8fafc; border-radius: 4px; border-left: 3px solid #6366f1;">
              <div style="font-weight: 600; color: #1e293b;">🏦 ${b.bankName || 'Bank'} ${b.isDefault ? '<span style="font-size:0.7rem; color:#4f46e5; font-weight:700;">(Default)</span>' : ''}</div>
              <div style="color: #475569; font-family: monospace;">A/C: ${b.accountNumber || 'N/A'}</div>
              <div style="color: #64748b; font-size: 0.75rem;">IFSC: ${b.ifscCode || 'N/A'} | ${b.accountHolderName || ''}</div>
            </div>
          `).join('');
        } else {
          bankHtml = '<span style="color: #94a3b8; font-size: 0.8rem; font-style: italic;">No active bank linked</span>';
        }

        // Format active wallet / UPI details
        const wallets = q.wallets || [];
        let walletHtml = '';
        if (wallets.length > 0) {
          walletHtml = wallets.map(w => `
            <div style="font-size: 0.8rem; line-height: 1.4; margin-bottom: 4px; padding: 4px 6px; background: #f8fafc; border-radius: 4px; border-left: 3px solid #10b981;">
              <div style="font-weight: 600; color: #1e293b;">💳 ${w.walletName || 'UPI/Wallet'} ${w.isDefault ? '<span style="font-size:0.7rem; color:#059669; font-weight:700;">(Default)</span>' : ''}</div>
              <div style="color: #475569; font-family: monospace;">${w.walletId || 'N/A'}</div>
            </div>
          `).join('');
        } else {
          walletHtml = '<span style="color: #94a3b8; font-size: 0.8rem; font-style: italic;">No active wallet/UPI</span>';
        }

        // Rank Badge
        const isTopPriority = (q.priorityPosition === 1 || index === 0);
        const rankHtml = isTopPriority
          ? `
            <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
              <span class="badge" style="background: linear-gradient(135deg, #10b981, #059669); color: white; font-weight: 800; font-size: 0.8rem; padding: 4px 8px; border-radius: 6px; box-shadow: 0 2px 4px rgba(16,185,129,0.3);">
                👑 #1 Top Priority
              </span>
              <span style="font-size: 0.7rem; color: #64748b;">Earliest Top-Up</span>
            </div>
          `
          : `
            <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
              <span class="badge" style="background: #e2e8f0; color: #334155; font-weight: 700; font-size: 0.85rem; padding: 4px 8px; border-radius: 6px;">
                #${q.priorityPosition || index + 1}
              </span>
              <span style="font-size: 0.7rem; color: #94a3b8;">Rank in Queue</span>
            </div>
          `;

        // Eligibility Status
        let statusBadge = '';
        if (!q.isActive) {
          statusBadge = '<span class="badge badge-rejected">⛔ Inactive</span>';
        } else if (!isVerified) {
          statusBadge = '<span class="badge badge-warning">⏳ KYC Pending</span>';
        } else if (availableBalance <= 0) {
          statusBadge = '<span class="badge badge-rejected">⚠️ Zero Balance</span>';
        } else if (q.isEligible) {
          statusBadge = '<span class="badge badge-approved">⚡ Eligible & Ready</span>';
        } else {
          statusBadge = `<span class="badge badge-warning">${q.eligibilityReason || 'Checking'}</span>`;
        }

        const vendorIdStr = v?._id || q.vendorId;

        return `
          <tr style="${isTopPriority ? 'background-color: rgba(16, 185, 129, 0.04);' : ''}">
            <td>${rankHtml}</td>
            <td>
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <div style="font-weight: 700; color: #1e293b; font-size: 0.95rem;">${vendorName}</div>
                <div style="font-size: 0.8rem; color: #64748b;">📧 ${vendorEmail}</div>
                <div style="font-size: 0.8rem; color: #64748b;">📱 ${vendorMobile}</div>
              </div>
            </td>
            <td>
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <div style="font-size: 1.05rem; font-weight: 800; color: ${availableBalance > 0 ? '#059669' : '#dc2626'};">
                  ₹${availableBalance.toLocaleString('en-IN')}
                </div>
                ${lockedBalance > 0 ? `<div style="font-size: 0.75rem; color: #d97706;">🔒 Locked: ₹${lockedBalance.toLocaleString('en-IN')}</div>` : ''}
                <div style="font-size: 0.75rem; color: #94a3b8;">Total: ₹${totalBalance.toLocaleString('en-IN')}</div>
              </div>
            </td>
            <td style="max-width: 200px;">${bankHtml}</td>
            <td style="max-width: 180px;">${walletHtml}</td>
            <td>
              <div style="display: flex; flex-direction: column; gap: 4px;">
                ${statusBadge}
                <div style="font-size: 0.75rem; color: #64748b;">Skips: <strong>${q.consecutiveSkips || 0}</strong></div>
              </div>
            </td>
            <td>
              <div style="display: flex; gap: 4px;">
                <button
                  class="btn btn-sm btn-secondary"
                  title="Move Up in Priority"
                  ${index === 0 ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''}
                  onclick="moveQueuePriority('${vendorIdStr}', 'up')"
                >
                  ⬆️
                </button>
                <button
                  class="btn btn-sm btn-secondary"
                  title="Move Down in Priority"
                  ${index === totalInQueue - 1 ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''}
                  onclick="moveQueuePriority('${vendorIdStr}', 'down')"
                >
                  ⬇️
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No vendors currently in the FCFS queue.</td></tr>';
    }
  } catch (err) {
    console.error('fetchAdminFcfsQueue error:', err);
    const tbody = document.getElementById('adminFcfsTbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color: #dc2626;">Failed to load FCFS queue: ${err.message}</td></tr>`;
    }
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
      showToast('Queue priority reordered successfully', 'success');
      fetchAdminFcfsQueue();
    } else {
      showToast(data.message || 'Failed to reorder queue', 'error');
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
 * 9. Tier & Commission Engine Management (SuperAdmin)
 */
let cachedAdminTiers = [];

function getAdminTierBadgeClass(divisionGroup = '', tierName = '') {
  const text = (divisionGroup || tierName || '').toUpperCase();
  if (text.includes('ACE')) return 'badge-tier-ace';
  if (text.includes('CROWN')) return 'badge-tier-crown';
  if (text.includes('DIAMOND')) return 'badge-tier-diamond';
  if (text.includes('PLATINUM')) return 'badge-tier-platinum';
  if (text.includes('GOLD')) return 'badge-tier-gold';
  if (text.includes('SILVER')) return 'badge-tier-silver';
  return 'badge-tier-bronze';
}

async function fetchAdminTierAnalytics() {
  if (!adminToken) return;

  try {
    const res = await fetch(`${API_BASE}/admin/tiers/analytics`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    if (!data.success || !data.data) return;

    const a = data.data.analytics || data.data;

    // KPI Counters
    const totalVol = a.totalMonthlyVolume !== undefined ? a.totalMonthlyVolume : (a.totalMonthVolume || 0);
    const activeVendors = a.activeVendorsCount !== undefined ? a.activeVendorsCount : (a.totalVendors || 0);
    const nearPromoCount = (a.vendorsCloseToNextTier || a.closeToNextTier || []).length;
    const manualCount = (a.manualCommissionVendors || []).length;

    const elVol = document.getElementById('adminTierTotalVolume');
    if (elVol) elVol.textContent = `₹${totalVol.toLocaleString('en-IN')}`;

    const elVendors = document.getElementById('adminTierActiveVendors');
    if (elVendors) elVendors.textContent = activeVendors;

    const elNear = document.getElementById('adminTierNearPromotionCount');
    if (elNear) elNear.textContent = nearPromoCount;

    const elManual = document.getElementById('adminTierManualCount');
    if (elManual) elManual.textContent = manualCount;

    // Tier Distribution Widget
    const distContainer = document.getElementById('adminTierDistributionContainer');
    if (distContainer) {
      if (a.tierDistribution?.length > 0) {
        distContainer.innerHTML = a.tierDistribution.map(d => {
          const badgeClass = getAdminTierBadgeClass('', d.tierName);
          return `
            <div class="dist-bar-item">
              <div class="dist-bar-label">
                <span class="badge ${badgeClass}">${d.displayName || d.tierName}</span>
              </div>
              <div class="dist-bar-track">
                <div class="dist-bar-fill" style="width: ${d.percentage}%;"></div>
              </div>
              <div class="dist-bar-count">
                <strong>${d.count}</strong> <small>(${d.percentage}%)</small>
              </div>
            </div>
          `;
        }).join('');
      } else {
        distContainer.innerHTML = '<p class="empty-state">No vendor top-up activity recorded in current month yet.</p>';
      }
    }

    // Near Promotion List
    const nearList = document.getElementById('adminNearPromotionList');
    if (nearList) {
      if (a.vendorsCloseToNextTier?.length > 0) {
        nearList.innerHTML = a.vendorsCloseToNextTier.map(v => `
          <div class="item-card mb-2" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <strong>${v.vendorName}</strong>
              <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.15rem;">
                Current: <span class="badge ${getAdminTierBadgeClass('', v.currentTierName)}">${v.currentTierName}</span> ➔ Target: <span class="badge ${getAdminTierBadgeClass('', v.nextTierName)}">${v.nextTierName}</span>
              </div>
              <div style="font-size: 0.8rem; color: #0284c7; margin-top: 0.15rem;">
                Monthly Vol: ₹${(v.totalMonthlyTopUp || 0).toLocaleString('en-IN')} | Needs: ₹${(v.amountToNextTier || 0).toLocaleString('en-IN')} (${v.progressPercentage}%)
              </div>
            </div>
            <button class="btn btn-sm btn-info" onclick="openManualCommissionModal('${v.vendorId}')">⚙️ Override</button>
          </div>
        `).join('');
      } else {
        nearList.innerHTML = '<p class="empty-state">No vendors currently in near-promotion zone (≥70%).</p>';
      }
    }

    // Manual Commission Overrides Table
    const manualTbody = document.getElementById('adminManualCommissionTbody');
    if (manualTbody) {
      if (a.manualCommissionVendors?.length > 0) {
        manualTbody.innerHTML = a.manualCommissionVendors.map(m => {
          const dateStr = m.manualCommissionAssignedAt ? new Date(m.manualCommissionAssignedAt).toLocaleDateString('en-IN') : 'N/A';
          return `
            <tr>
              <td><strong>${m.vendorName}</strong></td>
              <td><span class="badge ${getAdminTierBadgeClass('', m.currentTierName)}">${m.currentTierName}</span></td>
              <td><span class="badge badge-mode-manual">${m.manualCommissionRate}%</span></td>
              <td><small>${m.manualCommissionReason || 'Special Agreement'}</small></td>
              <td><small class="text-muted">${dateStr}</small></td>
              <td>
                <div style="display: flex; gap: 0.35rem;">
                  <button class="btn btn-sm btn-secondary" onclick="openManualCommissionModal('${m.vendorId}')">✏️ Edit</button>
                  <button class="btn btn-sm btn-warning" onclick="handleQuickRevertAuto('${m.vendorId}')">Revert to Auto</button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      } else {
        manualTbody.innerHTML = '<tr><td colspan="6" class="empty-state">No vendors with manual commission overrides. All vendors on auto tier rates.</td></tr>';
      }
    }

  } catch (err) {
    console.error('fetchAdminTierAnalytics error:', err);
  }
}

async function fetchAdminTiersList() {
  if (!adminToken) return;

  try {
    const res = await fetch(`${API_BASE}/admin/tiers`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    const tbody = document.getElementById('adminTiersTableTbody');
    if (!tbody) return;

    if (data.success && data.data?.tiers?.length > 0) {
      cachedAdminTiers = data.data.tiers;
      tbody.innerHTML = data.data.tiers.map(t => {
        const badgeClass = getAdminTierBadgeClass(t.divisionGroup, t.name);
        const maxDisplay = t.maxTopUp ? `₹${t.maxTopUp.toLocaleString('en-IN')}` : 'Unlimited (Ace)';

        return `
          <tr>
            <td>
              <span class="badge ${badgeClass}">${t.divisionGroup || 'Tier'}</span>
              <strong style="margin-left: 0.35rem;">${t.level || ''}</strong>
            </td>
            <td><strong>${t.displayName || t.name}</strong></td>
            <td>₹${(t.minTopUp || 0).toLocaleString('en-IN')}</td>
            <td>${maxDisplay}</td>
            <td style="font-weight: 700; color: #059669;">${t.commissionRate}%</td>
            <td>#${t.orderPriority || 0}</td>
            <td>
              <span class="badge ${t.isActive ? 'badge-approved' : 'badge-rejected'}">${t.isActive ? 'Active' : 'Inactive'}</span>
            </td>
            <td>
              <div style="display: flex; gap: 0.35rem;">
                <button class="btn btn-sm btn-secondary" onclick="openEditTierModal('${t._id}')">✏️ Edit</button>
                <button class="btn btn-sm ${t.isActive ? 'btn-warning' : 'btn-success'}" onclick="toggleTierActive('${t._id}', ${t.isActive})">${t.isActive ? 'Deactivate' : 'Activate'}</button>
                <button class="btn btn-sm btn-danger" onclick="handleDeleteTier('${t._id}', '${t.displayName || t.name}')">🗑️</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No tiers loaded.</td></tr>';
    }
  } catch (err) {
    console.error('fetchAdminTiersList error:', err);
  }
}

// Tier CRUD Modals
function openCreateTierModal() {
  document.getElementById('tierModalId').value = '';
  document.getElementById('tierModalTitle').textContent = '➕ Create New Tier';
  document.getElementById('tierFormName').value = '';
  document.getElementById('tierFormDisplayName').value = '';
  document.getElementById('tierFormDivision').value = 'Gold';
  document.getElementById('tierFormLevel').value = 'III';
  document.getElementById('tierFormMinTopUp').value = '';
  document.getElementById('tierFormMaxTopUp').value = '';
  document.getElementById('tierFormCommissionRate').value = '2.0';
  document.getElementById('tierFormOrderPriority').value = '10';
  document.getElementById('tierFormIsActive').checked = true;

  document.getElementById('tierModal').classList.remove('hidden');
}

function openEditTierModal(tierId) {
  const t = cachedAdminTiers.find(x => x._id === tierId);
  if (!t) return;

  document.getElementById('tierModalId').value = t._id;
  document.getElementById('tierModalTitle').textContent = `✏️ Edit Tier: ${t.displayName || t.name}`;
  document.getElementById('tierFormName').value = t.name || '';
  document.getElementById('tierFormDisplayName').value = t.displayName || '';
  document.getElementById('tierFormDivision').value = t.divisionGroup || 'Custom';
  document.getElementById('tierFormLevel').value = t.level || '';
  document.getElementById('tierFormMinTopUp').value = t.minTopUp ?? 0;
  document.getElementById('tierFormMaxTopUp').value = t.maxTopUp ?? '';
  document.getElementById('tierFormCommissionRate').value = t.commissionRate ?? 1.0;
  document.getElementById('tierFormOrderPriority').value = t.orderPriority ?? 0;
  document.getElementById('tierFormIsActive').checked = Boolean(t.isActive);

  document.getElementById('tierModal').classList.remove('hidden');
}

function closeTierModal() {
  document.getElementById('tierModal').classList.add('hidden');
}

async function handleSaveTier(event) {
  event.preventDefault();

  const tierId = document.getElementById('tierModalId').value;
  const maxVal = document.getElementById('tierFormMaxTopUp').value.trim();

  const payload = {
    name: document.getElementById('tierFormName').value.trim(),
    displayName: document.getElementById('tierFormDisplayName').value.trim(),
    divisionGroup: document.getElementById('tierFormDivision').value,
    level: document.getElementById('tierFormLevel').value.trim(),
    minTopUp: Number(document.getElementById('tierFormMinTopUp').value),
    maxTopUp: maxVal ? Number(maxVal) : null,
    commissionRate: Number(document.getElementById('tierFormCommissionRate').value),
    orderPriority: Number(document.getElementById('tierFormOrderPriority').value) || 0,
    isActive: document.getElementById('tierFormIsActive').checked
  };

  try {
    const url = tierId ? `${API_BASE}/admin/tiers/${tierId}` : `${API_BASE}/admin/tiers`;
    const method = tierId ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Tier ${tierId ? 'updated' : 'created'} successfully!`, 'success');
      closeTierModal();
      fetchAdminTiersList();
      fetchAdminTierAnalytics();
    } else {
      showToast(data.message || 'Failed to save tier', 'error');
    }
  } catch (err) {
    showToast('Network error saving tier', 'error');
  }
}

async function toggleTierActive(tierId, currentActive) {
  try {
    const res = await fetch(`${API_BASE}/admin/tiers/${tierId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ isActive: !currentActive })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Tier ${!currentActive ? 'activated' : 'deactivated'} successfully!`, 'success');
      fetchAdminTiersList();
      fetchAdminTierAnalytics();
    } else {
      showToast(data.message || 'Failed to update tier status', 'error');
    }
  } catch (err) {
    showToast('Failed to update tier status', 'error');
  }
}

async function handleDeleteTier(tierId, tierName) {
  if (!confirm(`Are you sure you want to permanently delete tier "${tierName}"?`)) return;

  try {
    const res = await fetch(`${API_BASE}/admin/tiers/${tierId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const data = await res.json();
    if (data.success) {
      showToast('Tier deleted successfully!', 'success');
      fetchAdminTiersList();
      fetchAdminTierAnalytics();
    } else {
      showToast(data.message || 'Failed to delete tier', 'error');
    }
  } catch (err) {
    showToast('Failed to delete tier', 'error');
  }
}

// Manual Commission Override Modals & Handlers
function openManualCommissionModal(vendorId) {
  const v = allVendorsCache.find(x => x._id === vendorId);
  if (!v) {
    showToast('Vendor information not found in cache. Refreshing...', 'error');
    fetchAdminVendors();
    return;
  }

  document.getElementById('manualVendorId').value = v._id;
  const isManual = v.commissionMode === 'MANUAL';
  const tierName = v.currentTierDisplayName || v.currentTierName || v.currentTierId?.displayName || v.currentTierId?.name || (typeof v.currentTier === 'string' ? v.currentTier : 'Bronze V');
  const currentRate = isManual 
    ? (v.manualCommissionRate !== undefined && v.manualCommissionRate !== null ? v.manualCommissionRate : v.effectiveCommissionRate) 
    : (v.effectiveCommissionRate !== undefined ? v.effectiveCommissionRate : (v.currentTierId?.commissionRate || 1.0));

  const infoEl = document.getElementById('manualModalVendorInfo');
  infoEl.innerHTML = `
    <div><strong>Vendor:</strong> ${v.firstName} ${v.lastName} (${v.email})</div>
    <div style="margin-top: 0.25rem;"><strong>Current Tier Rank:</strong> <span class="badge ${getAdminTierBadgeClass('', tierName)}">${tierName}</span></div>
    <div style="margin-top: 0.25rem;"><strong>Current Status:</strong> <span class="badge ${isManual ? 'badge-mode-manual' : 'badge-mode-auto'}">${isManual ? 'MANUAL OVERRIDE' : 'AUTO TIER RATE'}</span> (${currentRate}%)</div>
    ${isManual && v.manualCommissionReason ? `<div style="margin-top: 0.25rem; font-size: 0.85rem; color: #b45309;"><strong>Reason:</strong> ${v.manualCommissionReason}</div>` : ''}
  `;

  document.getElementById('manualCommissionInput').value = isManual ? (v.manualCommissionRate ?? '') : '';
  document.getElementById('manualCommissionReasonInput').value = isManual ? (v.manualCommissionReason ?? '') : '';

  const revertBtn = document.getElementById('btnRevertAutoCommission');
  if (revertBtn) {
    revertBtn.style.display = isManual ? 'inline-block' : 'none';
  }

  document.getElementById('manualCommissionModal').classList.remove('hidden');
}

function closeManualCommissionModal() {
  document.getElementById('manualCommissionModal').classList.add('hidden');
}

async function handleSaveManualCommission(event) {
  event.preventDefault();

  const vendorId = document.getElementById('manualVendorId').value;
  const commissionRate = Number(document.getElementById('manualCommissionInput').value);
  const reason = document.getElementById('manualCommissionReasonInput').value.trim();

  try {
    const res = await fetch(`${API_BASE}/admin/vendors/${vendorId}/manual-commission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ commissionRate, reason })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Manual commission override applied successfully!', 'success');
      closeManualCommissionModal();
      
      // Update vendor in local cache immediately
      const cached = allVendorsCache.find(x => x._id === vendorId);
      if (cached && data.data) {
        cached.commissionMode = 'MANUAL';
        cached.manualCommissionRate = commissionRate;
        cached.manualCommissionReason = reason;
        cached.effectiveCommissionRate = commissionRate;
        if (data.data.currentTierDisplayName || data.data.currentTierName) {
          cached.currentTierDisplayName = data.data.currentTierDisplayName || data.data.currentTierName;
          cached.currentTierName = cached.currentTierDisplayName;
        }
        renderVendorsTable();
      }
      
      fetchAdminVendors();
      fetchAdminTierAnalytics();
    } else {
      showToast(data.message || 'Failed to set manual commission', 'error');
    }
  } catch (err) {
    showToast('Network error setting commission', 'error');
  }
}

async function handleRemoveManualCommission() {
  const vendorId = document.getElementById('manualVendorId').value;
  if (!confirm('Revert this vendor back to automatic tier-based commission rate?')) return;

  try {
    const res = await fetch(`${API_BASE}/admin/vendors/${vendorId}/manual-commission`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const data = await res.json();
    if (data.success) {
      showToast('Reverted to automatic tier commission rate!', 'success');
      closeManualCommissionModal();

      const cached = allVendorsCache.find(x => x._id === vendorId);
      if (cached && data.data) {
        cached.commissionMode = 'AUTO';
        cached.manualCommissionRate = null;
        cached.manualCommissionReason = null;
        cached.effectiveCommissionRate = data.data.effectiveCommissionRate;
        if (data.data.currentTierDisplayName || data.data.currentTierName) {
          cached.currentTierDisplayName = data.data.currentTierDisplayName || data.data.currentTierName;
          cached.currentTierName = cached.currentTierDisplayName;
        }
        renderVendorsTable();
      }

      fetchAdminVendors();
      fetchAdminTierAnalytics();
    } else {
      showToast(data.message || 'Failed to revert commission mode', 'error');
    }
  } catch (err) {
    showToast('Network error reverting commission', 'error');
  }
}

async function handleQuickRevertAuto(vendorId) {
  if (!confirm('Revert this vendor back to automatic tier-based commission rate?')) return;

  try {
    const res = await fetch(`${API_BASE}/admin/vendors/${vendorId}/manual-commission`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const data = await res.json();
    if (data.success) {
      showToast('Reverted to automatic tier commission!', 'success');

      const cached = allVendorsCache.find(x => x._id === vendorId);
      if (cached && data.data) {
        cached.commissionMode = 'AUTO';
        cached.manualCommissionRate = null;
        cached.manualCommissionReason = null;
        cached.effectiveCommissionRate = data.data.effectiveCommissionRate;
        if (data.data.currentTierDisplayName || data.data.currentTierName) {
          cached.currentTierDisplayName = data.data.currentTierDisplayName || data.data.currentTierName;
          cached.currentTierName = cached.currentTierDisplayName;
        }
        renderVendorsTable();
      }

      fetchAdminVendors();
      fetchAdminTierAnalytics();
    } else {
      showToast(data.message || 'Failed to revert commission', 'error');
    }
  } catch (err) {
    showToast('Failed to revert commission', 'error');
  }
}

async function triggerMonthlyReset() {
  if (!confirm('Are you sure you want to trigger the monthly tier cycle reset now? This will finalize all current monthly records and initialize fresh month records starting at ₹0.')) return;

  try {
    const res = await fetch(`${API_BASE}/admin/tiers/run-monthly-reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Monthly reset completed successfully!', 'success');
      fetchAdminVendors();
      fetchAdminTierAnalytics();
    } else {
      showToast(data.message || 'Failed to run reset', 'error');
    }
  } catch (err) {
    showToast('Failed to execute reset', 'error');
  }
}

/**
 * 10. System Audit Logs
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
 * 11. Admin Logout
 */
function adminLogout() {
  adminToken = null;
  currentAdmin = null;
  localStorage.removeItem('moffin_admin_token');
  showAdminLoginSection();
  showToast('SuperAdmin logged out', 'success');
}

/**
 * =============================================================================
 * 12. Client Management & Statistics Functions
 * =============================================================================
 */
let clientCurrentPage = 1;
let clientLimit = 10;
let clientTotalPages = 1;
let clientSearchQuery = '';
let clientFilterStatus = '';
let clientsCache = [];

async function fetchAdminClientStats() {
  if (!adminToken) return;

  try {
    const res = await fetch(`${API_BASE}/admin/clients/stats`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();

    if (data.success && data.data) {
      document.getElementById('statTotalClients').textContent = (data.data.totalClients || 0).toLocaleString();
      document.getElementById('statActiveClients').textContent = (data.data.activeClients || 0).toLocaleString();
      document.getElementById('statInactiveClients').textContent = (data.data.inactiveClients || 0).toLocaleString();
      document.getElementById('statBlockedClients').textContent = (data.data.blockedClients || 0).toLocaleString();
      document.getElementById('statVerifiedClients').textContent = (data.data.verifiedClients || 0).toLocaleString();
      document.getElementById('statUnverifiedClients').textContent = (data.data.unverifiedClients || 0).toLocaleString();
    }
  } catch (err) {
    console.error('fetchAdminClientStats error:', err);
  }
}

async function fetchAdminClients(page = clientCurrentPage) {
  if (!adminToken) return;

  clientCurrentPage = page;
  const tbody = document.getElementById('adminClientsTbody');
  tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Loading registered clients...</td></tr>';

  try {
    let url = `${API_BASE}/admin/clients?page=${clientCurrentPage}&limit=${clientLimit}`;
    if (clientSearchQuery) url += `&search=${encodeURIComponent(clientSearchQuery)}`;
    if (clientFilterStatus) url += `&status=${encodeURIComponent(clientFilterStatus)}`;

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();

    if (data.success && data.data) {
      clientsCache = data.data.clients || [];
      const pagination = data.data.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 };
      clientTotalPages = pagination.totalPages;

      renderAdminClientsTable(clientsCache);
      updateClientPagination(pagination);
    } else {
      tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Failed to load clients.</td></tr>';
    }
  } catch (err) {
    console.error('fetchAdminClients error:', err);
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Error loading clients list.</td></tr>';
  }
}

function renderAdminClientsTable(clients) {
  const tbody = document.getElementById('adminClientsTbody');
  if (!clients || clients.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No clients match your filter criteria.</td></tr>';
    return;
  }

  tbody.innerHTML = clients.map(client => {
    const clientId = client._id || client.id;
    const fullName = `${client.firstName} ${client.lastName}`;
    const email = client.email;
    const mobile = client.mobile || '--';
    const whatsapp = client.whatsappNumber ? `<br><small style="color: #059669;">📱 WA: ${client.whatsappNumber}</small>` : '';
    
    // Business & Platform
    let businessInfo = '<span class="text-muted">--</span>';
    if (client.businessType || client.platformUrl) {
      const bType = client.businessType ? `<span class="badge badge-info" style="font-size: 0.75rem;">${client.businessType}</span>` : '';
      const pUrl = client.platformUrl ? `<br><a href="${client.platformUrl}" target="_blank" style="font-size: 0.78rem; color: #0284c7; text-decoration: underline;">${client.platformUrl} ↗</a>` : '';
      businessInfo = `${bType}${pUrl}`;
    }

    // Telegram IDs
    let telegramChips = '<span class="text-muted" style="font-size: 0.8rem;">--</span>';
    if (client.telegramIds && client.telegramIds.length > 0) {
      telegramChips = client.telegramIds
        .map(t => `<span class="telegram-chip" style="font-size: 0.75rem; padding: 0.15rem 0.45rem;">✈️ ${t}</span>`)
        .join(' ');
    }
    
    let statusBadge = '<span class="status-pill active">Active</span>';
    if (client.status === 'blocked' || client.isBlocked) {
      statusBadge = '<span class="status-pill blocked">Blocked</span>';
    } else if (client.status === 'inactive' || !client.isActive) {
      statusBadge = '<span class="status-pill inactive">Inactive</span>';
    }

    const kycBadge = client.isVerified
      ? '<span class="badge badge-success">Verified</span>'
      : '<span class="badge badge-warning">Unverified</span>';

    const registeredAt = new Date(client.createdAt).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const balanceFormatted = Number(client.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

    return `
      <tr>
        <td><code style="font-size: 0.78rem;">${clientId.substring(0, 8)}...</code></td>
        <td><strong>${fullName}</strong><br><small class="text-muted">${email}</small></td>
        <td><span style="font-weight: 800; color: #059669; font-size: 0.95rem;">₹${balanceFormatted}</span></td>
        <td><strong>${mobile}</strong>${whatsapp}</td>
        <td>${businessInfo}</td>
        <td><div style="max-width: 180px; display: flex; flex-wrap: wrap; gap: 0.25rem;">${telegramChips}</div></td>
        <td>${statusBadge}</td>
        <td>${kycBadge}</td>
        <td><small>${registeredAt}</small></td>
        <td>
          <div style="display: flex; gap: 0.35rem;">
            <button class="btn btn-sm btn-secondary" onclick="openClientDetailModal('${clientId}')" title="View Profile Details">
              👁️ View
            </button>
            <button class="btn btn-sm btn-primary" onclick="openClientStatusModal('${clientId}')" title="Manage Status">
              ⚙️ Status
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function updateClientPagination(pagination) {
  const info = document.getElementById('clientPaginationInfo');
  const indicator = document.getElementById('clientPageIndicator');
  const btnPrev = document.getElementById('btnClientPrevPage');
  const btnNext = document.getElementById('btnClientNextPage');

  const start = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(pagination.page * pagination.limit, pagination.total);

  info.textContent = `Showing ${start} to ${end} of ${pagination.total} clients`;
  indicator.textContent = `Page ${pagination.page} of ${pagination.totalPages}`;

  btnPrev.disabled = pagination.page <= 1;
  btnNext.disabled = pagination.page >= pagination.totalPages;
}

function changeClientPage(delta) {
  const newPage = clientCurrentPage + delta;
  if (newPage >= 1 && newPage <= clientTotalPages) {
    fetchAdminClients(newPage);
  }
}

function handleClientSearchKeyup(e) {
  if (e.key === 'Enter') {
    searchAdminClients();
  }
}

function searchAdminClients() {
  const input = document.getElementById('clientSearchInput');
  clientSearchQuery = input.value.trim();
  fetchAdminClients(1);
}

function handleClientFilterChange() {
  const select = document.getElementById('clientStatusFilter');
  clientFilterStatus = select.value;
  fetchAdminClients(1);
}

function openClientStatusModal(clientId) {
  const client = clientsCache.find(c => (c._id || c.id) === clientId);
  if (!client) return;

  document.getElementById('statusModalClientId').value = clientId;
  document.getElementById('modalClientStatusInfo').innerHTML = `
    <strong>Client:</strong> ${client.firstName} ${client.lastName} (${client.email})<br>
    <strong>Current Status:</strong> <span class="badge badge-info">${(client.status || 'active').toUpperCase()}</span>
  `;

  document.getElementById('statusModalSelect').value = client.status || (client.isBlocked ? 'blocked' : (client.isActive ? 'active' : 'inactive'));
  document.getElementById('statusModalReason').value = '';
  document.getElementById('clientStatusModal').classList.remove('hidden');
}

function closeClientStatusModal() {
  document.getElementById('clientStatusModal').classList.add('hidden');
}

async function submitClientStatusChange(event) {
  event.preventDefault();
  const clientId = document.getElementById('statusModalClientId').value;
  const newStatus = document.getElementById('statusModalSelect').value;
  const reason = document.getElementById('statusModalReason').value.trim();

  try {
    const res = await fetch(`${API_BASE}/admin/clients/${clientId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: newStatus, reason })
    });

    const data = await res.json();
    if (data.success) {
      showToast(data.message || `Client status updated to ${newStatus}`, 'success');
      closeClientStatusModal();
      fetchAdminClients(clientCurrentPage);
      fetchAdminClientStats();
    } else {
      showToast(data.message || 'Failed to update client status', 'error');
    }
  } catch (err) {
    console.error('submitClientStatusChange error:', err);
    showToast('Server error updating client status', 'error');
  }
}

async function openClientDetailModal(clientId) {
  const content = document.getElementById('modalClientDetailContent');
  if (!content) return;

  // Show loading state while fetching live financial summary
  content.innerHTML = `
    <div style="text-align: center; padding: 2rem;">
      <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">⏳</div>
      <p class="text-muted">Loading live financial overview & client profile...</p>
    </div>
  `;
  document.getElementById('clientDetailModal').classList.remove('hidden');

  try {
    const res = await fetch(`${API_BASE}/admin/clients/${clientId}`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const data = await res.json();
    if (!data.success || !data.data?.client) {
      content.innerHTML = `<p class="empty-state" style="color: #dc2626;">Failed to load client details: ${data.message || 'Unknown error'}</p>`;
      return;
    }

    const client = data.data.client;
    const fin = data.data.financialSummary || {
      currentBalance: Number(client.balance) || 0,
      withdrawableBalance: Number(client.balance) || 0,
      totalApprovedAmount: 0,
      totalApprovedCount: 0,
      totalPendingAmount: 0,
      totalPendingCount: 0,
      totalRejectedAmount: 0,
      totalRejectedCount: 0
    };

    const recentTx = data.data.recentTransactions || [];

    const telegramList = client.telegramIds && client.telegramIds.length > 0
      ? client.telegramIds.map(t => `<span class="telegram-chip">✈️ ${t}</span>`).join(' ')
      : '<span class="text-muted">None registered</span>';

    const platformLink = client.platformUrl
      ? `<a href="${client.platformUrl}" target="_blank" style="color: #0284c7; text-decoration: underline;">${client.platformUrl} ↗</a>`
      : 'N/A';

    // Build Recent Transactions Mini Table
    let txTableHtml = '';
    if (recentTx.length > 0) {
      txTableHtml = `
        <div style="margin-top: 1.25rem;">
          <h4 style="font-size: 0.95rem; color: #1e293b; margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between;">
            <span>📜 Recent Payment Requests (${recentTx.length})</span>
            <span style="font-size: 0.75rem; color: #64748b; font-weight: normal;">Latest transactions</span>
          </h4>
          <div style="overflow-x: auto; max-height: 200px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <table class="custom-table" style="font-size: 0.8rem; margin: 0;">
              <thead>
                <tr style="background: #f8fafc;">
                  <th style="padding: 6px 10px;">Tx ID</th>
                  <th style="padding: 6px 10px;">Amount</th>
                  <th style="padding: 6px 10px;">Method</th>
                  <th style="padding: 6px 10px;">Status</th>
                  <th style="padding: 6px 10px;">UTR / Reference</th>
                  <th style="padding: 6px 10px;">Date</th>
                </tr>
              </thead>
              <tbody>
                ${recentTx.map(t => {
                  let badge = 'badge-info';
                  if (t.status === 'APPROVED' || t.status === 'COMPLETED') badge = 'badge-success';
                  else if (t.status === 'REJECTED') badge = 'badge-danger';
                  else if (t.status === 'AWAITING_VENDOR_VERIFICATION') badge = 'badge-warning';

                  const amt = (t.approvedAmount || t.amount || 0).toLocaleString('en-IN');
                  const dt = t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-IN') : '--';
                  const utr = t.externalTransactionId || '<span style="color:#94a3b8;">--</span>';

                  return `
                    <tr>
                      <td style="padding: 6px 10px; font-family: monospace; font-weight: 700;">${t.transactionId}</td>
                      <td style="padding: 6px 10px; font-weight: 800; color: #059669;">₹${amt}</td>
                      <td style="padding: 6px 10px;"><span class="badge ${t.paymentMethod === 'bank' ? 'badge-primary' : 'badge-info'}" style="font-size: 0.7rem; padding: 2px 5px;">${(t.paymentMethod || 'wallet').toUpperCase()}</span></td>
                      <td style="padding: 6px 10px;"><span class="badge ${badge}" style="font-size: 0.7rem; padding: 2px 5px;">${t.status}</span></td>
                      <td style="padding: 6px 10px; font-family: monospace; font-size: 0.75rem;">${utr}</td>
                      <td style="padding: 6px 10px; color: #64748b;">${dt}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else {
      txTableHtml = `
        <div style="margin-top: 1rem; padding: 0.75rem; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; text-align: center; font-size: 0.85rem; color: #64748b;">
          No payment requests submitted yet.
        </div>
      `;
    }

    content.innerHTML = `
      <!-- 1. LIVE FINANCIAL OVERVIEW PANEL -->
      <div style="margin-bottom: 1.25rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
          <h4 style="font-size: 0.95rem; color: #1e293b; margin: 0; display: flex; align-items: center; gap: 6px;">
            <span>💰 Financial Overview & Balances</span>
          </h4>
          <span class="badge badge-approved" style="font-size: 0.75rem;">Authoritative Live Ledger</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.65rem;">
          
          <!-- Current Wallet Balance -->
          <div style="background: linear-gradient(135deg, #ecfdf5, #d1fae5); border: 1px solid #a7f3d0; border-radius: 8px; padding: 10px 12px;">
            <div style="font-size: 0.75rem; color: #047857; font-weight: 700; text-transform: uppercase;">Available Balance</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: #065f46; margin: 2px 0;">₹${fin.currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            <div style="font-size: 0.7rem; color: #059669;">In Client Possession</div>
          </div>

          <!-- Withdrawable Balance -->
          <div style="background: linear-gradient(135deg, #eff6ff, #dbeafe); border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 12px;">
            <div style="font-size: 0.75rem; color: #1d4ed8; font-weight: 700; text-transform: uppercase;">Withdrawable</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: #1e40af; margin: 2px 0;">₹${fin.withdrawableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            <div style="font-size: 0.7rem; color: #2563eb;">Ready for Payout</div>
          </div>

          <!-- Total Approved -->
          <div style="background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 12px;">
            <div style="font-size: 0.75rem; color: #15803d; font-weight: 700; text-transform: uppercase;">Total Approved</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #166534; margin: 2px 0;">₹${fin.totalApprovedAmount.toLocaleString('en-IN')}</div>
            <div style="font-size: 0.7rem; color: #16a34a;">✅ ${fin.totalApprovedCount} successful</div>
          </div>

          <!-- Total Pending -->
          <div style="background: linear-gradient(135deg, #fffbeb, #fef3c7); border: 1px solid #fde68a; border-radius: 8px; padding: 10px 12px;">
            <div style="font-size: 0.75rem; color: #b45309; font-weight: 700; text-transform: uppercase;">Pending Approval</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #92400e; margin: 2px 0;">₹${fin.totalPendingAmount.toLocaleString('en-IN')}</div>
            <div style="font-size: 0.7rem; color: #d97706;">⏳ ${fin.totalPendingCount} in verification</div>
          </div>

          <!-- Total Rejected -->
          <div style="background: linear-gradient(135deg, #fef2f2, #fee2e2); border: 1px solid #fecaca; border-radius: 8px; padding: 10px 12px;">
            <div style="font-size: 0.75rem; color: #b91c1c; font-weight: 700; text-transform: uppercase;">Rejected / Failed</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #991b1b; margin: 2px 0;">₹${fin.totalRejectedAmount.toLocaleString('en-IN')}</div>
            <div style="font-size: 0.7rem; color: #dc2626;">❌ ${fin.totalRejectedCount} rejected</div>
          </div>

        </div>
      </div>

      <!-- 2. CLIENT PERSONAL & BUSINESS PROFILE -->
      <div>
        <h4 style="font-size: 0.95rem; color: #1e293b; margin-bottom: 0.5rem;">👤 Personal & Business Information</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; font-size: 0.85rem;">
          <div class="info-card">
            <span class="label">Full Name</span>
            <span class="value">${client.firstName} ${client.lastName}</span>
          </div>
          <div class="info-card">
            <span class="label">User Role</span>
            <span class="value"><span class="badge badge-info">${client.role || 'client'}</span></span>
          </div>
          <div class="info-card">
            <span class="label">Email Address</span>
            <span class="value">${client.email}</span>
          </div>
          <div class="info-card">
            <span class="label">Primary Phone</span>
            <span class="value">${client.mobile || '--'}</span>
          </div>
          <div class="info-card">
            <span class="label">WhatsApp Number</span>
            <span class="value">${client.whatsappNumber || '--'}</span>
          </div>
          <div class="info-card">
            <span class="label">Alternative Phone</span>
            <span class="value">${client.alternativeMobileNumber || '--'}</span>
          </div>
          <div class="info-card" style="grid-column: span 2;">
            <span class="label">Platform URL / Website</span>
            <span class="value">${platformLink}</span>
          </div>
          <div class="info-card" style="grid-column: span 2;">
            <span class="label">Business / Service Type</span>
            <span class="value">${client.businessType || 'N/A'}</span>
          </div>
          <div class="info-card" style="grid-column: span 2;">
            <span class="label">Telegram IDs</span>
            <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.35rem;">
              ${telegramList}
            </div>
          </div>
          <div class="info-card">
            <span class="label">Account Status</span>
            <div style="margin-top: 0.25rem;"><span class="status-pill ${client.status}">${(client.status || 'active').toUpperCase()}</span></div>
          </div>
          <div class="info-card">
            <span class="label">KYC Verification</span>
            <div style="margin-top: 0.25rem;"><span class="badge badge-${client.isVerified ? 'success' : 'warning'}">${client.isVerified ? 'Verified' : 'Unverified'}</span></div>
          </div>
          <div class="info-card">
            <span class="label">Registered At</span>
            <span class="value" style="font-size: 0.8rem;">${new Date(client.createdAt).toLocaleString('en-IN')}</span>
          </div>
          <div class="info-card">
            <span class="label">Last Login</span>
            <span class="value" style="font-size: 0.8rem;">${client.lastLoginAt ? new Date(client.lastLoginAt).toLocaleString('en-IN') : 'Never'}</span>
          </div>
          <div class="info-card" style="grid-column: span 2;">
            <span class="label">MongoDB Client ID</span>
            <code style="font-size: 0.8rem;">${client._id || client.id}</code>
          </div>
        </div>
      </div>

      <!-- 3. RECENT TRANSACTIONS TABLE -->
      ${txTableHtml}
    `;

  } catch (err) {
    console.error('openClientDetailModal error:', err);
    content.innerHTML = `<p class="empty-state" style="color: #dc2626;">Network error loading client profile details.</p>`;
  }
}

function closeClientDetailModal() {
  document.getElementById('clientDetailModal').classList.add('hidden');
}

/**
 * =============================================================================
 * 7. VENDOR COMMISSION WITHDRAWALS MANAGEMENT
 * =============================================================================
 */

let adminWithdrawalSearchTimeout = null;

async function fetchAdminWithdrawals(page = 1) {
  if (!adminToken) return;

  withdrawalCurrentPage = page;
  const search = document.getElementById('adminWithdrawalSearchInput')?.value.trim() || '';
  const statusParam = currentWithdrawalFilter !== 'all' ? `&status=${currentWithdrawalFilter}` : '';
  const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';

  try {
    const res = await fetch(`${API_BASE}/admin/withdrawals?page=${withdrawalCurrentPage}&limit=20${statusParam}${searchParam}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const data = await res.json();
    if (data.success && data.data) {
      adminWithdrawalsCache = data.data.withdrawals || [];
      const pagination = data.data.pagination || { page: 1, pages: 1, total: 0 };
      const stats = data.data.stats || {};

      withdrawalTotalPages = pagination.pages || 1;
      updateAdminWithdrawalStats(stats, pagination.total);
      updateAdminWithdrawalPagination(pagination);
      renderAdminWithdrawalsTable();
    } else {
      showToast(data.message || 'Failed to fetch withdrawals', 'error');
    }
  } catch (err) {
    console.error('fetchAdminWithdrawals error:', err);
    showToast('Failed to load withdrawal requests', 'error');
  }
}

function updateAdminWithdrawalStats(stats, totalCount) {
  document.getElementById('statTotalWithdrawalsCount').textContent = totalCount || 0;
  
  const settledVolume = stats.approvedVolume || 0;
  document.getElementById('statSettledWithdrawalsVolume').textContent = `₹${settledVolume.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  
  document.getElementById('statPendingAdminPaymentCount').textContent = stats.pendingAdminPaymentCount || 0;
  document.getElementById('statPaymentSentCount').textContent = stats.paymentSentCount || 0;
  document.getElementById('statApprovedWithdrawalsCount').textContent = stats.approvedCount || 0;
}

function updateAdminWithdrawalPagination(pagination) {
  const page = pagination.page || 1;
  const pages = pagination.pages || 1;
  const total = pagination.total || 0;

  const infoEl = document.getElementById('withdrawalPaginationInfo');
  const indicatorEl = document.getElementById('withdrawalPageIndicator');
  const btnPrev = document.getElementById('btnWithdrawalPrevPage');
  const btnNext = document.getElementById('btnWithdrawalNextPage');

  if (infoEl) infoEl.textContent = `Showing page ${page} of ${pages} (${total} total requests)`;
  if (indicatorEl) indicatorEl.textContent = `Page ${page} of ${pages}`;
  if (btnPrev) btnPrev.disabled = page <= 1;
  if (btnNext) btnNext.disabled = page >= pages;
}

function changeWithdrawalPage(delta) {
  const targetPage = withdrawalCurrentPage + delta;
  if (targetPage >= 1 && targetPage <= withdrawalTotalPages) {
    fetchAdminWithdrawals(targetPage);
  }
}

function setAdminWithdrawalFilter(filter, event) {
  currentWithdrawalFilter = filter;
  document.querySelectorAll('#withdrawalsManagementTab .tabs .tab-btn').forEach(b => b.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  fetchAdminWithdrawals(1);
}

function handleAdminWithdrawalSearch() {
  clearTimeout(adminWithdrawalSearchTimeout);
  adminWithdrawalSearchTimeout = setTimeout(() => {
    fetchAdminWithdrawals(1);
  }, 350);
}

function renderAdminWithdrawalsTable() {
  const tbody = document.getElementById('adminWithdrawalsTbody');
  if (!tbody) return;

  if (adminWithdrawalsCache.length > 0) {
    tbody.innerHTML = adminWithdrawalsCache.map(w => {
      const vendorName = w.vendorId ? `${w.vendorId.firstName} ${w.vendorId.lastName}` : 'Unknown Vendor';
      const vendorEmail = w.vendorId?.email || '';
      const vendorMobile = w.vendorId?.mobileNumber || '';
      const amountStr = `₹${(w.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      const dateStr = new Date(w.createdAt).toLocaleString('en-IN');

      // Payout Destination Formatting
      let destHtml = '';
      const isBank = w.destinationType === 'bank';
      const destTypeBadge = isBank
        ? '<span class="badge badge-primary" style="font-size: 0.7rem; padding: 2px 5px;">🏦 BANK</span>'
        : '<span class="badge badge-info" style="font-size: 0.7rem; padding: 2px 5px;">👛 WALLET / UPI</span>';

      const originTag = w.isManualDestination
        ? '<span class="badge badge-warning" style="font-size: 0.65rem; margin-left: 4px;">Manual New</span>'
        : '<span class="badge badge-default" style="font-size: 0.65rem; margin-left: 4px;">Linked Profile</span>';

      if (isBank) {
        destHtml = `
          <div>
            ${destTypeBadge} ${originTag}<br>
            <strong>${w.destinationDetails?.bankName || 'Bank'}</strong><br>
            <small class="text-muted">A/C: <code>${w.destinationDetails?.accountNumber || '--'}</code></small><br>
            <small class="text-muted">IFSC: <code>${w.destinationDetails?.ifscCode || '--'}</code> | Holder: ${w.destinationDetails?.accountHolderName || '--'}</small>
          </div>
        `;
      } else {
        destHtml = `
          <div>
            ${destTypeBadge} ${originTag}<br>
            <strong>${w.destinationDetails?.walletName || 'Wallet / UPI'}</strong><br>
            <small class="text-muted">UPI ID / VPA: <code>${w.destinationDetails?.walletId || '--'}</code></small>
          </div>
        `;
      }

      // Status Badge Formatting
      let statusBadge = '';
      if (w.status === 'PENDING_ADMIN_PAYMENT') {
        statusBadge = '<span class="badge badge-warning" style="padding: 4px 8px; font-weight: 700;">⏳ Awaiting Payment</span>';
      } else if (w.status === 'PAYMENT_SENT_BY_ADMIN') {
        statusBadge = '<span class="badge badge-info" style="padding: 4px 8px; font-weight: 700;">💳 Sent (Awaiting Vendor)</span>';
      } else if (w.status === 'APPROVED') {
        statusBadge = '<span class="badge badge-success" style="padding: 4px 8px; font-weight: 700;">✅ Approved & Settled</span>';
      } else if (w.status === 'REJECTED') {
        statusBadge = '<span class="badge badge-danger" style="padding: 4px 8px; font-weight: 700;">❌ Rejected by Vendor</span>';
      } else {
        statusBadge = `<span class="badge badge-default">${w.status}</span>`;
      }

      // Admin Payment Proof Details
      let paymentInfoHtml = '<span class="text-muted" style="font-size: 0.8rem;">--</span>';
      if (w.adminPaymentDetails?.transactionId) {
        const proofLink = w.adminPaymentDetails.paymentProof
          ? `<a href="${w.adminPaymentDetails.paymentProof}" target="_blank" style="color: var(--primary); text-decoration: underline; font-size: 0.75rem;">🖼️ View Proof</a>`
          : '';
        const payDate = w.adminPaymentDetails.paidAt ? new Date(w.adminPaymentDetails.paidAt).toLocaleDateString('en-IN') : '';

        paymentInfoHtml = `
          <div style="font-size: 0.8rem;">
            <code>${w.adminPaymentDetails.transactionId}</code><br>
            ${proofLink} ${payDate ? `<small class="text-muted">(${payDate})</small>` : ''}
          </div>
        `;
      }

      // Actions Column
      let actionButtons = `
        <button class="btn btn-sm btn-secondary" onclick="openAdminWithdrawalDetailModal('${w._id}')" title="View Full Lifecycle Details">🔍 Details</button>
      `;

      if (w.status === 'PENDING_ADMIN_PAYMENT') {
        actionButtons = `
          <button class="btn btn-sm btn-primary" onclick="openAdminPayWithdrawalModal('${w._id}')" style="font-weight: 700;">💳 Pay & Send Proof</button>
          <button class="btn btn-sm btn-secondary" onclick="openAdminWithdrawalDetailModal('${w._id}')">🔍</button>
        `;
      }

      return `
        <tr>
          <td><code style="font-weight: 700; color: #4338ca;">${w.withdrawalId || w._id.slice(-8)}</code></td>
          <td>
            <strong>${vendorName}</strong><br>
            <small class="text-muted">${vendorEmail}</small><br>
            <small class="text-muted">📱 ${vendorMobile}</small>
          </td>
          <td style="font-weight: 800; font-size: 1.05rem; color: #059669;">${amountStr}</td>
          <td>${destHtml}</td>
          <td>${statusBadge}</td>
          <td>${paymentInfoHtml}</td>
          <td><small class="text-muted">${dateStr}</small></td>
          <td>
            <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
              ${actionButtons}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } else {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No vendor withdrawal requests match the selected filter.</td></tr>';
  }
}

/**
 * Open Admin Send Payment & Proof Modal
 */
async function openAdminPayWithdrawalModal(withdrawalId) {
  let w = adminWithdrawalsCache.find(x => x._id === withdrawalId || x.withdrawalId === withdrawalId);
  
  if (!w) {
    try {
      const res = await fetch(`${API_BASE}/admin/withdrawals/${withdrawalId}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.success && data.data?.withdrawal) {
        w = data.data.withdrawal;
      }
    } catch (e) {
      console.error('Failed to fetch withdrawal for payout modal:', e);
    }
  }

  if (!w) {
    showToast('Withdrawal details not found', 'error');
    return;
  }

  document.getElementById('adminPayWithdrawalId').value = w._id;
  document.getElementById('adminPayTxnId').value = '';
  document.getElementById('adminPayProofFile').value = '';
  document.getElementById('adminPayNotes').value = '';

  const vendorName = w.vendorId ? `${w.vendorId.firstName || ''} ${w.vendorId.lastName || ''} (${w.vendorId.email || ''})`.trim() : 'Vendor';
  const isBank = w.destinationType === 'bank';
  
  let destSummary = '';
  if (isBank) {
    destSummary = `
      <strong>Bank Name:</strong> ${w.destinationDetails?.bankName || 'N/A'}<br>
      <strong>Account Number:</strong> <code style="font-size: 1rem; font-weight: 700;">${w.destinationDetails?.accountNumber || 'N/A'}</code><br>
      <strong>IFSC Code:</strong> <code>${w.destinationDetails?.ifscCode || 'N/A'}</code><br>
      <strong>Account Holder:</strong> ${w.destinationDetails?.accountHolderName || 'N/A'}
      ${w.destinationDetails?.branchName ? `<br><strong>Branch:</strong> ${w.destinationDetails.branchName}` : ''}
    `;
  } else {
    destSummary = `
      <strong>Wallet / App:</strong> ${w.destinationDetails?.walletName || 'UPI'}<br>
      <strong>UPI ID / VPA:</strong> <code style="font-size: 1.05rem; font-weight: 700; color: #4338ca;">${w.destinationDetails?.walletId || 'N/A'}</code>
    `;
  }

  document.getElementById('adminPayWithdrawalInfo').innerHTML = `
    <div style="margin-bottom: 0.5rem;">
      <strong>Vendor:</strong> ${vendorName}<br>
      <strong>Withdrawal ID:</strong> <code>${w.withdrawalId || w._id}</code><br>
      <strong>Payout Amount:</strong> <span style="font-size: 1.25rem; font-weight: 800; color: #059669;">₹${(w.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
    </div>
    <div style="background: #ffffff; border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem; margin-top: 0.5rem; font-size: 0.85rem;">
      <div style="font-weight: 700; color: #1e293b; margin-bottom: 0.35rem;">🏦 Transfer Funds To:</div>
      ${destSummary}
    </div>
    ${w.notes ? `<div style="margin-top: 0.5rem; font-size: 0.85rem; color: #64748b;"><strong>Vendor Note:</strong> <em>${w.notes}</em></div>` : ''}
  `;

  document.getElementById('adminPayWithdrawalModal').classList.remove('hidden');
}

function closeAdminPayWithdrawalModal() {
  document.getElementById('adminPayWithdrawalModal').classList.add('hidden');
}

/**
 * Handle Admin Submit Withdrawal Payment Proof
 */
async function handleAdminSubmitWithdrawalPayment(event) {
  event.preventDefault();

  const withdrawalId = document.getElementById('adminPayWithdrawalId').value;
  const transactionId = document.getElementById('adminPayTxnId').value.trim();
  const fileInput = document.getElementById('adminPayProofFile');
  const adminNotes = document.getElementById('adminPayNotes').value.trim();
  const submitBtn = document.getElementById('btnAdminSubmitWithdrawalPay');

  if (!transactionId) {
    showToast('Please enter the Bank UTR / Transaction ID', 'error');
    return;
  }

  if (!fileInput.files || fileInput.files.length === 0) {
    showToast('Please select a payment screenshot proof image', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('transactionId', transactionId);
  formData.append('paymentProof', fileInput.files[0]);
  if (adminNotes) {
    formData.append('adminNotes', adminNotes);
  }

  submitBtn.disabled = true;
  submitBtn.textContent = '⏳ Uploading Proof to Cloudinary...';

  try {
    const res = await fetch(`${API_BASE}/admin/withdrawals/${withdrawalId}/send-payment`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      },
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      showToast('Payment proof sent to vendor! Vendor can now confirm and settle payout.', 'success');
      closeAdminPayWithdrawalModal();
      fetchAdminWithdrawals(withdrawalCurrentPage);
    } else {
      showToast(data.message || 'Failed to submit withdrawal payment', 'error');
    }
  } catch (err) {
    console.error('handleAdminSubmitWithdrawalPayment error:', err);
    showToast('Failed to connect to server', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '🚀 Submit Payment & Notify Vendor';
  }
}

/**
 * Open Admin Withdrawal Full Details Modal
 */
async function openAdminWithdrawalDetailModal(withdrawalId) {
  const content = document.getElementById('modalAdminWithdrawalDetailContent');
  if (!content) return;

  content.innerHTML = `
    <div style="text-align: center; padding: 2rem;">
      <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">⏳</div>
      <p class="text-muted">Loading full payout lifecycle & audit trail...</p>
    </div>
  `;
  document.getElementById('adminWithdrawalDetailModal').classList.remove('hidden');

  try {
    const res = await fetch(`${API_BASE}/admin/withdrawals/${withdrawalId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const data = await res.json();
    if (!data.success || !data.data?.withdrawal) {
      content.innerHTML = `<p class="empty-state" style="color: #dc2626;">Failed to load details: ${data.message || 'Unknown error'}</p>`;
      return;
    }

    const w = data.data.withdrawal;
    const vendorName = w.vendorId ? `${w.vendorId.firstName} ${w.vendorId.lastName} (${w.vendorId.email})` : 'Vendor';
    const isBank = w.destinationType === 'bank';

    // Status Timeline Steps
    const step1Done = true;
    const step2Done = w.status === 'PAYMENT_SENT_BY_ADMIN' || w.status === 'APPROVED' || w.status === 'REJECTED';
    const step3Approved = w.status === 'APPROVED';
    const step3Rejected = w.status === 'REJECTED';

    let timelineHtml = `
      <div style="display: flex; gap: 0.5rem; margin-bottom: 1.25rem; font-size: 0.8rem; background: #f8fafc; padding: 0.75rem; border-radius: 8px; border: 1px solid var(--border);">
        <div style="flex: 1; text-align: center; padding: 0.5rem; border-radius: 6px; background: ${step1Done ? '#ecfdf5' : '#f1f5f9'}; border: 1px solid ${step1Done ? '#10b981' : '#cbd5e1'};">
          <strong>1. Request Submitted</strong><br>
          <small class="text-muted">${new Date(w.createdAt).toLocaleDateString('en-IN')}</small>
        </div>
        <div style="align-self: center; font-weight: 700; color: #94a3b8;">➔</div>
        <div style="flex: 1; text-align: center; padding: 0.5rem; border-radius: 6px; background: ${step2Done ? '#eff6ff' : '#f1f5f9'}; border: 1px solid ${step2Done ? '#3b82f6' : '#cbd5e1'};">
          <strong>2. Admin Paid & Proof</strong><br>
          <small class="text-muted">${w.adminPaymentDetails?.paidAt ? new Date(w.adminPaymentDetails.paidAt).toLocaleDateString('en-IN') : 'Pending'}</small>
        </div>
        <div style="align-self: center; font-weight: 700; color: #94a3b8;">➔</div>
        <div style="flex: 1; text-align: center; padding: 0.5rem; border-radius: 6px; background: ${step3Approved ? '#f0fdf4' : (step3Rejected ? '#fef2f2' : '#f1f5f9')}; border: 1px solid ${step3Approved ? '#22c55e' : (step3Rejected ? '#ef4444' : '#cbd5e1')};">
          <strong>3. Vendor Confirmation</strong><br>
          <small class="text-muted">${step3Approved ? '✅ Verified & Settled' : (step3Rejected ? '❌ Rejected' : 'Awaiting Vendor')}</small>
        </div>
      </div>
    `;

    // Destination Box
    let destBox = '';
    if (isBank) {
      destBox = `
        <div class="info-box mb-3">
          <div style="font-weight: 700; color: #1e293b; margin-bottom: 0.25rem;">🏦 Bank Account Details:</div>
          <strong>Bank:</strong> ${w.destinationDetails?.bankName || '--'}<br>
          <strong>Account Number:</strong> <code>${w.destinationDetails?.accountNumber || '--'}</code><br>
          <strong>IFSC:</strong> <code>${w.destinationDetails?.ifscCode || '--'}</code><br>
          <strong>Account Holder:</strong> ${w.destinationDetails?.accountHolderName || '--'}<br>
          <strong>Branch:</strong> ${w.destinationDetails?.branchName || 'N/A'}<br>
          <span class="badge ${w.isManualDestination ? 'badge-warning' : 'badge-default'}" style="margin-top: 0.35rem;">${w.isManualDestination ? 'Manual Destination' : 'Saved Profile Account'}</span>
        </div>
      `;
    } else {
      destBox = `
        <div class="info-box mb-3">
          <div style="font-weight: 700; color: #1e293b; margin-bottom: 0.25rem;">👛 UPI / Wallet Details:</div>
          <strong>Wallet / App Name:</strong> ${w.destinationDetails?.walletName || '--'}<br>
          <strong>UPI ID / VPA:</strong> <code style="font-size: 1rem; font-weight: 700;">${w.destinationDetails?.walletId || '--'}</code><br>
          <span class="badge ${w.isManualDestination ? 'badge-warning' : 'badge-default'}" style="margin-top: 0.35rem;">${w.isManualDestination ? 'Manual Destination' : 'Saved Profile Wallet'}</span>
        </div>
      `;
    }

    // Admin Payment Box
    let adminPayBox = '';
    if (w.adminPaymentDetails?.transactionId) {
      adminPayBox = `
        <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 0.85rem; margin-bottom: 1rem;">
          <h4 style="font-size: 0.95rem; color: #166534; margin: 0 0 0.5rem 0;">💳 Admin Payment Details & Proof</h4>
          <strong>Bank UTR / Reference:</strong> <code>${w.adminPaymentDetails.transactionId}</code><br>
          <strong>Payment Processed At:</strong> ${new Date(w.adminPaymentDetails.paidAt).toLocaleString('en-IN')}<br>
          ${w.adminPaymentDetails.adminNotes ? `<strong>Admin Notes:</strong> <em>${w.adminPaymentDetails.adminNotes}</em><br>` : ''}
          ${w.adminPaymentDetails.paymentProof ? `
            <div style="margin-top: 0.75rem;">
              <label style="font-size: 0.8rem; font-weight: 700; color: #166534;">Payment Proof Screenshot (Cloudinary):</label><br>
              <a href="${w.adminPaymentDetails.paymentProof}" target="_blank">
                <img src="${w.adminPaymentDetails.paymentProof}" alt="Payment Proof" style="max-width: 100%; max-height: 220px; object-fit: contain; border: 1px solid #bbf7d0; border-radius: 6px; padding: 4px; background: #fff;">
              </a>
            </div>
          ` : ''}
        </div>
      `;
    }

    // Vendor Confirmation Box
    let vendorConfBox = '';
    if (w.vendorConfirmation?.confirmedAt) {
      const isApproved = w.vendorConfirmation.isApproved;
      vendorConfBox = `
        <div style="background: ${isApproved ? '#f0fdf4' : '#fef2f2'}; border: 1px solid ${isApproved ? '#86efac' : '#fecaca'}; border-radius: 8px; padding: 0.85rem; margin-bottom: 1rem;">
          <h4 style="font-size: 0.95rem; color: ${isApproved ? '#166534' : '#991b1b'}; margin: 0 0 0.5rem 0;">
            ${isApproved ? '✅ Vendor Received & Approved Payout' : '❌ Vendor Reported Payout Not Received'}
          </h4>
          <strong>Decision:</strong> ${isApproved ? 'FUNDS RECEIVED' : 'REJECTED'}<br>
          <strong>Confirmed Date:</strong> ${new Date(w.vendorConfirmation.confirmedAt).toLocaleString('en-IN')}<br>
          ${w.vendorConfirmation.vendorNotes ? `<strong>Vendor Notes:</strong> <em>${w.vendorConfirmation.vendorNotes}</em><br>` : ''}
          ${w.vendorConfirmation.rejectionReason ? `<strong>Rejection Reason:</strong> <span style="color: #dc2626;">${w.vendorConfirmation.rejectionReason}</span><br>` : ''}
        </div>
      `;
    }

    // Financial Settlement Box
    let settlementBox = '';
    if (w.financialSettlement?.isSettled) {
      settlementBox = `
        <div style="background: linear-gradient(135deg, #eff6ff, #dbeafe); border: 1px solid #93c5fd; border-radius: 8px; padding: 0.85rem;">
          <h4 style="font-size: 0.95rem; color: #1e40af; margin: 0 0 0.5rem 0;">💰 Authoritative Financial Ledger Settlement</h4>
          <strong>Deducted from Commission Wallet:</strong> <span style="color: #1e40af; font-weight: 700;">₹${(w.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span><br>
          <strong>Settled Timestamp:</strong> ${new Date(w.financialSettlement.settledAt).toLocaleString('en-IN')}<br>
          ${w.financialSettlement.walletTransactionId ? `<strong>Wallet Transaction ID:</strong> <code>${w.financialSettlement.walletTransactionId}</code>` : ''}
        </div>
      `;
    }

    content.innerHTML = `
      ${timelineHtml}

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem; font-size: 0.85rem;">
        <div class="info-card">
          <span class="label">Withdrawal ID</span>
          <code style="font-weight: 700; color: #4338ca;">${w.withdrawalId}</code>
        </div>
        <div class="info-card">
          <span class="label">Requested Amount</span>
          <span class="value" style="font-size: 1.15rem; font-weight: 800; color: #059669;">₹${(w.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
        <div class="info-card">
          <span class="label">Vendor Name</span>
          <span class="value">${vendorName}</span>
        </div>
        <div class="info-card">
          <span class="label">Current Status</span>
          <div><span class="badge badge-${w.status}">${w.status.replace(/_/g, ' ')}</span></div>
        </div>
      </div>

      ${destBox}
      ${adminPayBox}
      ${vendorConfBox}
      ${settlementBox}
    `;

  } catch (err) {
    console.error('openAdminWithdrawalDetailModal error:', err);
    content.innerHTML = `<p class="empty-state" style="color: #dc2626;">Network error loading withdrawal details.</p>`;
  }
}

function closeAdminWithdrawalDetailModal() {
  document.getElementById('adminWithdrawalDetailModal').classList.add('hidden');
}



