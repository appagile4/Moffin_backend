// Moffin 2 Vendor Client JavaScript
const API_BASE = window.location.origin && window.location.origin.startsWith('http')
  ? `${window.location.origin}/api`
  : 'http://localhost:5000/api';

// State Management
let currentToken = localStorage.getItem('moffin_token') || null;
let currentVendor = null;
let cachedBankAccounts = [];
let cachedWallets = [];
let cachedTopUps = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  checkServerHealth();
  initTransactionIdChecker();
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

function switchTab(tabId, btnEl = null) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

  const targetEl = document.getElementById(tabId);
  if (targetEl) targetEl.classList.remove('hidden');
  
  if (btnEl) {
    btnEl.classList.add('active');
  } else if (typeof event !== 'undefined' && event && event.target && event.target.classList.contains('tab-btn')) {
    event.target.classList.add('active');
  } else {
    const defaultBtn = document.querySelector(`.tab-btn[onclick*="${tabId}"]`);
    if (defaultBtn) defaultBtn.classList.add('active');
  }

  if (tabId === 'walletTab') {
    fetchVendorWalletAndLedger();
    fetchVendorTierProgress();
  }
  if (tabId === 'withdrawalsTab') {
    fetchVendorWithdrawals();
    populateWithdrawDestinationOptions();
  }
  if (tabId === 'tiersTab') {
    fetchVendorTierProgress().then(() => {
      fetchVendorTiersList();
    });
    fetchVendorTierMovements();
    fetchVendorTierHistory();
  }
  if (tabId === 'topupsTab') {
    fetchVendorTopUps();
    fetchVendorTierProgress();
  }
  if (tabId === 'banksTab') fetchBankAccounts();
  if (tabId === 'walletsTab') fetchWallets();
  if (tabId === 'incomingPaymentsTab') fetchVendorPaymentRequests();
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
      body: formData
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
      fetchVendorWalletAndLedger();
      fetchVendorTierProgress();
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
 * 4. Render Dashboard Overview & Profile Data
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

  // Overview Tier & Commission Badges
  const tierDisplayName = currentVendor.currentTierDisplayName || currentVendor.currentTierName || currentVendor.currentTier || 'Bronze V';
  const effectiveRate = currentVendor.effectiveCommissionRate !== undefined ? currentVendor.effectiveCommissionRate : 1.0;
  const isManual = currentVendor.commissionMode === 'MANUAL';

  const dashTierBadge = document.getElementById('dashTierBadge');
  if (dashTierBadge) {
    dashTierBadge.textContent = tierDisplayName;
    dashTierBadge.className = `badge ${getTierBadgeClass('', tierDisplayName)}`;
  }

  const dashCommissionBadge = document.getElementById('dashCommissionBadge');
  if (dashCommissionBadge) {
    const modeSuffix = isManual ? ' (MANUAL)' : '';
    dashCommissionBadge.textContent = `${effectiveRate}%${modeSuffix}`;
    dashCommissionBadge.className = `badge ${isManual ? 'badge-mode-manual' : 'badge-info'}`;
  }

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
 * 5. Update Profile
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
      headers: { 'Authorization': `Bearer ${currentToken}` },
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      showToast('Profile and photo updated on Cloudinary & MongoDB!', 'success');
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

/**
 * 7. Wallet & Immutable Ledger & Live Overview Stats (Image 2 Redesign)
 */
async function fetchVendorOverviewStats(timeframe = 'month') {
  if (!currentToken) return;

  try {
    const res = await fetch(`${API_BASE}/vendors/wallet/overview-stats?timeframe=${timeframe}`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();

    if (data.success && data.data?.stats) {
      const s = data.data.stats;
      const topUpEl = document.getElementById('overviewTotalTopUp');
      const depositEl = document.getElementById('overviewTotalDeposit');
      const withdrawEl = document.getElementById('overviewTotalWithdraw');
      const commEl = document.getElementById('overviewTotalCommission');

      if (topUpEl) topUpEl.textContent = `₹ ${(s.totalTopUp || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      if (depositEl) depositEl.textContent = `₹ ${(s.totalDeposit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      if (withdrawEl) withdrawEl.textContent = `₹ ${(s.totalWithdraw || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      if (commEl) commEl.textContent = `₹ ${(s.totalCommission || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

      // Update Header Badges
      const commBadge = document.getElementById('dashCommissionBalanceBadge');
      if (commBadge) {
        commBadge.textContent = `₹ ${(s.commissionBalance !== undefined ? s.commissionBalance : (s.totalCommissionEarned || s.totalCommission || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      }

      const walletBadge = document.getElementById('dashWalletBalanceBadge');
      if (walletBadge) {
        walletBadge.textContent = `₹ ${(s.availableBalance !== undefined ? s.availableBalance : (s.walletBalance || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      }
    }
  } catch (err) {
    console.error('fetchVendorOverviewStats error:', err);
  }
}

async function fetchVendorWalletAndLedger() {
  if (!currentToken) return;

  try {
    // 1. Fetch Live Overview Statistics
    const selectedTimeframe = document.getElementById('overviewTimeframeSelect')?.value || 'month';
    fetchVendorOverviewStats(selectedTimeframe);

    // 2. Fetch Ledger Transactions
    const resLedger = await fetch(`${API_BASE}/vendors/wallet/ledger?limit=50`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const ledgerData = await resLedger.json();

    const tbody = document.getElementById('walletLedgerTbody');
    if (tbody && ledgerData.success && ledgerData.data?.transactions?.length > 0) {
      tbody.innerHTML = ledgerData.data.transactions.map(t => {
        const isCredit = t.transactionType.startsWith('CREDIT');
        const amountDisplay = `${isCredit ? '+' : '-'}₹${(t.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        const amountColor = isCredit ? '#059669' : '#dc2626';
        const dateStr = new Date(t.createdAt).toLocaleString('en-IN');

        return `
          <tr>
            <td><code>${t.transactionId || t._id.slice(-8)}</code></td>
            <td><span class="badge badge-${t.transactionType}">${t.transactionType}</span></td>
            <td style="font-weight: 700; color: ${amountColor};">${amountDisplay}</td>
            <td>₹${(t.balanceBefore || 0).toLocaleString('en-IN')} ➔ <strong>₹${(t.balanceAfter || 0).toLocaleString('en-IN')}</strong></td>
            <td><small class="text-muted">${t.referenceId || t.description || 'N/A'}</small></td>
            <td>${dateStr}</td>
            <td><span class="badge badge-${t.status}">${t.status}</span></td>
          </tr>
        `;
      }).join('');
    } else if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No transactions in ledger yet. Top up your wallet to begin.</td></tr>';
    }
  } catch (err) {
    console.error('fetchVendorWalletAndLedger error:', err);
  }
}

function openWithdrawModal() {
  showToast('Withdrawals / Payouts module is active. To withdraw, contact your account manager.', 'info');
}

function openTransferModal() {
  showToast('Inter-wallet transfers are available through company payment destinations.', 'info');
}

/**
 * 8. Top-Up Requests & Payment Confirmations
 */
function handleTopupMethodChange() {
  const method = document.getElementById('topupMethod').value;
  const bankGroup = document.getElementById('topupBankSelectGroup');
  const walletGroup = document.getElementById('topupWalletSelectGroup');

  if (method === 'bank') {
    bankGroup.classList.remove('hidden');
    walletGroup.classList.add('hidden');
  } else if (method === 'wallet') {
    bankGroup.classList.add('hidden');
    walletGroup.classList.remove('hidden');
  } else if (method === 'both') {
    bankGroup.classList.remove('hidden');
    walletGroup.classList.remove('hidden');
  }
}

function populateTopupBankAndWalletOptions() {
  const bankContainer = document.getElementById('topupBankCheckboxes');
  const walletContainer = document.getElementById('topupWalletCheckboxes');

  if (bankContainer) {
    if (cachedBankAccounts.length > 0) {
      bankContainer.innerHTML = cachedBankAccounts.map(b => `
        <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: normal; cursor: pointer; margin-bottom: 0.35rem;">
          <input type="checkbox" name="topupBankCheckbox" value="${b._id}" ${b.isDefault ? 'checked' : ''}>
          <span><strong>${b.bankName}</strong> - ${b.accountNumber} (${b.accountHolderName}) ${b.isDefault ? '<span class="badge badge-default">Default</span>' : ''}</span>
        </label>
      `).join('');
    } else {
      bankContainer.innerHTML = '<p class="text-muted" style="font-size: 0.85rem;">(No bank accounts linked yet)</p>';
    }
  }

  if (walletContainer) {
    if (cachedWallets.length > 0) {
      walletContainer.innerHTML = cachedWallets.map(w => `
        <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: normal; cursor: pointer; margin-bottom: 0.35rem;">
          <input type="checkbox" name="topupWalletCheckbox" value="${w._id}" ${w.isDefault ? 'checked' : ''}>
          <span><strong>${w.walletName}</strong> - ${w.walletId} ${w.isDefault ? '<span class="badge badge-default">Default</span>' : ''}</span>
        </label>
      `).join('');
    } else {
      walletContainer.innerHTML = '<p class="text-muted" style="font-size: 0.85rem;">(No wallets linked yet)</p>';
    }
  }
}

async function handleCreateTopUp(event) {
  event.preventDefault();

  const method = document.getElementById('topupMethod').value;
  const selectedBankAccountIds = Array.from(document.querySelectorAll('input[name="topupBankCheckbox"]:checked')).map(cb => cb.value);
  const selectedWalletIds = Array.from(document.querySelectorAll('input[name="topupWalletCheckbox"]:checked')).map(cb => cb.value);

  const payload = {
    requestedAmount: Number(document.getElementById('topupAmount').value),
    preferredPaymentMethod: method,
    selectedBankAccountIds: ['bank', 'both'].includes(method) ? selectedBankAccountIds : undefined,
    selectedWalletIds: ['wallet', 'both'].includes(method) ? selectedWalletIds : undefined,
    notes: document.getElementById('topupNote').value.trim() || undefined
  };

  try {
    const res = await fetch(`${API_BASE}/vendors/topups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      showToast('Top-Up request submitted! SuperAdmin will assign payment destinations.', 'success');
      document.getElementById('createTopUpForm').reset();
      handleTopupMethodChange();
      populateTopupBankAndWalletOptions();
      fetchVendorTopUps();
    } else {
      showToast(data.message || 'Failed to create top-up request', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to server', 'error');
  }
}

async function fetchVendorTopUps() {
  if (!currentToken) return;

  try {
    const res = await fetch(`${API_BASE}/vendors/topups`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    const listEl = document.getElementById('vendorTopUpsList');

    if (data.success && data.data?.topUps?.length > 0) {
      cachedTopUps = data.data.topUps;
      listEl.innerHTML = data.data.topUps.map(t => {
        const dateStr = new Date(t.createdAt).toLocaleString('en-IN');
        const reqAmount = Number(t.requestedAmount || 0);
        const hasApprovedAmount = t.adminResponse?.approvedAmount !== undefined && t.adminResponse?.approvedAmount !== null;
        const approvedAmount = hasApprovedAmount ? Number(t.adminResponse.approvedAmount) : null;
        const effectiveAmount = approvedAmount !== null ? approvedAmount : reqAmount;
        const assignedDests = t.adminResponse?.selectedDestinations || (t.paymentDestination ? [t.paymentDestination] : []);

        let headerAmountHtml = '';
        if (hasApprovedAmount && approvedAmount !== reqAmount) {
          headerAmountHtml = `
            <h4>Top-Up ${t.topUpId || t._id.slice(-8)} — <span style="color: #15803d; font-weight: 700;">₹${approvedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span> <span class="badge badge-success" style="font-size: 0.72rem; vertical-align: middle;">Approved Amount</span></h4>
            <p class="text-muted" style="margin-top: -2px; margin-bottom: 6px;"><small>Requested Amount: <strong>₹${reqAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></small></p>
          `;
        } else {
          headerAmountHtml = `<h4>Top-Up ${t.topUpId || t._id.slice(-8)} — ₹${effectiveAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h4>`;
        }

        let destInfoHtml = '';
        let actionBtnHtml = '';

        if (t.status === 'PENDING_ADMIN_RESPONSE') {
          destInfoHtml = `<p style="color: #92400e; margin-top: 0.35rem;">⏳ Waiting for SuperAdmin to review and assign company payment destinations...</p>`;
        } else if (t.status === 'AWAITING_PAYMENT') {
          if (assignedDests.length > 0) {
            const destCards = assignedDests.map(dest => {
              if (!dest) return '';
              const isBank = dest.type === 'bank' || dest.destinationType === 'bank';
              return `
                <div style="background: #ffffff; border: 1px solid #bbf7d0; border-radius: 8px; padding: 0.65rem; margin-top: 0.35rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                  <div>
                    <strong>${isBank ? '🏦 Bank Account' : '👛 UPI / Wallet'}:</strong> ${dest.name || (isBank ? dest.bankName : dest.walletName)}<br>
                    ${isBank 
                      ? `Bank: <strong>${dest.bankName}</strong> | A/C: <strong>${dest.accountNumber}</strong> | IFSC: <strong>${dest.ifscCode}</strong> | Holder: ${dest.accountHolderName}`
                      : `UPI ID: <strong>${dest.walletId}</strong>`
                    }
                    ${dest.instructions ? `<br><small class="text-muted">Instructions: ${dest.instructions}</small>` : ''}
                  </div>
                  ${dest.qrCode ? `
                    <div style="text-align: center;">
                      <a href="${dest.qrCode}" target="_blank" title="Click to view full QR">
                        <img src="${dest.qrCode}" alt="Destination QR" style="width: 65px; height: 65px; object-fit: contain; border: 1px solid #d1d5db; border-radius: 6px; padding: 2px; background: #fff;">
                      </a>
                      <br><small style="font-size: 0.7rem; color: #4b5563;">Scan QR</small>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('');

            destInfoHtml = `
              <div class="info-box mt-2" style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; color: #166534; padding: 0.85rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem; padding-bottom: 0.4rem; border-bottom: 1px dashed #bbf7d0;">
                  <div>
                    <span style="font-size: 0.9rem; font-weight: 600;">💰 Approved Amount to Transfer:</span>
                    <span style="font-size: 1.2rem; font-weight: 800; color: #15803d; margin-left: 4px;">₹${effectiveAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    ${hasApprovedAmount && approvedAmount !== reqAmount ? `<span style="font-size: 0.8rem; color: #4b5563; margin-left: 6px;">(Requested: ₹${reqAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })})</span>` : ''}
                  </div>
                  <span class="badge badge-success">SuperAdmin Assigned</span>
                </div>
                <strong>💳 Transfer to Any of the Following Company Destination(s) (${assignedDests.length}):</strong><br>
                ${destCards}
                ${t.adminResponse?.adminMessage ? `<p style="margin-top: 0.4rem; background: #fff; padding: 0.4rem 0.6rem; border-radius: 6px; border: 1px solid #dcfce7;"><strong>Admin Note:</strong> <em>${t.adminResponse.adminMessage}</em></p>` : ''}
              </div>
            `;
          }
          actionBtnHtml = `<button class="btn btn-sm btn-success" onclick="openPaymentProofModal('${t._id}')">💳 Pay & Submit Proof</button>`;
        } else if (t.status === 'PAYMENT_SUBMITTED') {
          destInfoHtml = `
            <p style="color: #854d0e; margin-top: 0.35rem;">⏳ Payment proof submitted. Verification in progress by SuperAdmin.</p>
            ${hasApprovedAmount && approvedAmount !== reqAmount ? `<p style="font-size: 0.85rem; color: #15803d;"><strong>Approved Amount:</strong> ₹${approvedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} <span class="text-muted">(Requested: ₹${reqAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })})</span></p>` : ''}
          `;
        } else if (t.status === 'APPROVED' || t.status === 'COMPLETED') {
          destInfoHtml = `
            <p style="color: #059669; margin-top: 0.35rem;">✅ Approved & Credited to your wallet balance.</p>
            ${hasApprovedAmount && approvedAmount !== reqAmount ? `<p style="font-size: 0.85rem; color: #15803d;"><strong>Approved Credited Amount:</strong> ₹${approvedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} <span class="text-muted">(Requested: ₹${reqAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })})</span></p>` : ''}
          `;
        } else if (t.status === 'REJECTED') {
          destInfoHtml = `<p style="color: #dc2626; margin-top: 0.35rem;">❌ Rejected ${t.rejectionReason ? `(Reason: ${t.rejectionReason})` : ''}</p>`;
        }

        // Display vendor's selected banks/wallets
        let vendorAccountsHtml = '';
        if (Array.isArray(t.vendorBankDetails) && t.vendorBankDetails.length > 0) {
          vendorAccountsHtml += `<small class="text-muted">🏦 Your Linked Banks: ` + t.vendorBankDetails.map(b => `<strong>${b.bankName}</strong> (${b.accountNumber})`).join(', ') + `</small><br>`;
        } else if (t.vendorBankDetails?.bankName) {
          vendorAccountsHtml += `<small class="text-muted">🏦 Your Bank: <strong>${t.vendorBankDetails.bankName}</strong> (${t.vendorBankDetails.accountNumber})</small><br>`;
        }

        if (Array.isArray(t.vendorWalletDetails) && t.vendorWalletDetails.length > 0) {
          vendorAccountsHtml += `<small class="text-muted">👛 Your Linked Wallets: ` + t.vendorWalletDetails.map(w => `<strong>${w.walletName}</strong> (${w.walletId})`).join(', ') + `</small><br>`;
        } else if (t.vendorWalletDetails?.walletName) {
          vendorAccountsHtml += `<small class="text-muted">👛 Your Wallet: <strong>${t.vendorWalletDetails.walletName}</strong> (${t.vendorWalletDetails.walletId})</small><br>`;
        }

        return `
          <div class="item-card">
            <div class="item-info">
              <div class="flex-between">
                <div>${headerAmountHtml}</div>
                <span class="badge badge-${t.status}">${t.status.replace(/_/g, ' ')}</span>
              </div>
              <p>Preferred Method: <strong class="badge badge-info">${t.preferredPaymentMethod.toUpperCase()}</strong> | Requested: ${dateStr}</p>
              ${vendorAccountsHtml ? `<div style="margin: 0.25rem 0;">${vendorAccountsHtml}</div>` : ''}
              ${t.notes ? `<p><em>Note: ${t.notes}</em></p>` : ''}
              ${destInfoHtml}
            </div>
            ${actionBtnHtml ? `<div class="item-actions">${actionBtnHtml}</div>` : ''}
          </div>
        `;
      }).join('');
    } else {
      cachedTopUps = [];
      listEl.innerHTML = '<p class="empty-state">No top-up requests found. Create a new request above.</p>';
    }
  } catch (err) {
    console.error('fetchVendorTopUps error:', err);
  }
}

let txCheckTimeout = null;
let isCurrentTxIdValid = false;

function initTransactionIdChecker() {
  const txInput = document.getElementById('proofTransactionId');
  const feedbackEl = document.getElementById('proofTxIdFeedback');
  const submitBtn = document.getElementById('btnSubmitProof');
  if (!txInput || !feedbackEl) return;

  txInput.addEventListener('input', () => {
    const val = txInput.value.trim();
    clearTimeout(txCheckTimeout);

    if (!val) {
      feedbackEl.style.display = 'none';
      feedbackEl.textContent = '';
      txInput.style.borderColor = '';
      if (submitBtn) submitBtn.disabled = true;
      isCurrentTxIdValid = false;
      return;
    }

    if (val.length < 3) {
      feedbackEl.style.display = 'block';
      feedbackEl.style.color = '#d97706';
      feedbackEl.innerHTML = '⚠️ Transaction ID / UTR must be at least 3 characters.';
      txInput.style.borderColor = '#f59e0b';
      if (submitBtn) submitBtn.disabled = true;
      isCurrentTxIdValid = false;
      return;
    }

    feedbackEl.style.display = 'block';
    feedbackEl.style.color = '#6b7280';
    feedbackEl.innerHTML = '🔄 Verifying Transaction ID in database...';
    if (submitBtn) submitBtn.disabled = true;

    txCheckTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/vendors/topups/check-transaction-id?transactionId=${encodeURIComponent(val)}`, {
          headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await res.json();

        if (data.success && data.data?.isUnique) {
          feedbackEl.style.display = 'block';
          feedbackEl.style.color = '#15803d';
          feedbackEl.innerHTML = `✅ <strong>Valid:</strong> Transaction ID is unique & available for submission.`;
          txInput.style.borderColor = '#16a34a';
          if (submitBtn) submitBtn.disabled = false;
          isCurrentTxIdValid = true;
        } else {
          feedbackEl.style.display = 'block';
          feedbackEl.style.color = '#dc2626';
          feedbackEl.innerHTML = `❌ <strong>Invalid ID:</strong> ${data.data?.message || 'This Transaction ID has already been used in the database. Please enter a unique ID.'}`;
          txInput.style.borderColor = '#dc2626';
          if (submitBtn) submitBtn.disabled = true;
          isCurrentTxIdValid = false;
        }
      } catch (err) {
        console.error('Error checking transaction id:', err);
        feedbackEl.style.display = 'block';
        feedbackEl.style.color = '#dc2626';
        feedbackEl.innerHTML = '❌ Error verifying Transaction ID with server.';
        if (submitBtn) submitBtn.disabled = true;
        isCurrentTxIdValid = false;
      }
    }, 300);
  });
}

function openPaymentProofModal(topUpId) {
  const topUp = cachedTopUps.find(t => t._id === topUpId);
  if (!topUp) return;

  const reqAmount = Number(topUp.requestedAmount || 0);
  const hasApprovedAmount = topUp.adminResponse?.approvedAmount !== undefined && topUp.adminResponse?.approvedAmount !== null;
  const approvedAmount = hasApprovedAmount ? Number(topUp.adminResponse.approvedAmount) : null;
  const effectiveAmount = approvedAmount !== null ? approvedAmount : reqAmount;

  document.getElementById('proofTopUpId').value = topUp._id;
  document.getElementById('proofAmountPaid').value = effectiveAmount;
  
  const txInput = document.getElementById('proofTransactionId');
  txInput.value = '';
  txInput.style.borderColor = '';

  const feedbackEl = document.getElementById('proofTxIdFeedback');
  if (feedbackEl) {
    feedbackEl.style.display = 'none';
    feedbackEl.textContent = '';
  }

  const submitBtn = document.getElementById('btnSubmitProof');
  if (submitBtn) {
    submitBtn.disabled = true; // Required unique transaction ID validation before enabling
  }
  isCurrentTxIdValid = false;

  document.getElementById('proofFile').value = '';
  document.getElementById('proofNote').value = '';

  const assignedDests = topUp.adminResponse?.selectedDestinations || (topUp.paymentDestination ? [topUp.paymentDestination] : []);
  const destSelect = document.getElementById('proofSelectedDestId');

  if (assignedDests.length > 0) {
    destSelect.innerHTML = assignedDests.map((dest, idx) => {
      const isBank = dest.type === 'bank' || dest.destinationType === 'bank';
      const label = isBank
        ? `[BANK] ${dest.name || dest.bankName} - A/C: ${dest.accountNumber} (${dest.ifscCode})`
        : `[UPI/WALLET] ${dest.name || dest.walletName} - ${dest.walletId}`;
      return `<option value="${dest._id}" ${idx === 0 ? 'selected' : ''}>${label}</option>`;
    }).join('');
  } else {
    destSelect.innerHTML = '<option value="">(No destination found)</option>';
  }

  const destSummary = `
    <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 0.65rem 0.85rem; margin-bottom: 0.75rem;">
      <div style="font-size: 0.95rem; font-weight: 700; color: #166534;">
        💰 Approved Amount to Transfer: <span style="font-size: 1.2rem; color: #15803d; font-weight: 800;">₹${effectiveAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        ${hasApprovedAmount && approvedAmount !== reqAmount ? `<span style="font-size: 0.8rem; font-weight: normal; color: #4b5563; margin-left: 6px;">(Requested: ₹${reqAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })})</span>` : ''}
      </div>
      <div style="font-size: 0.85rem; color: #374151; margin-top: 0.35rem;">
        Available Company Destinations: <strong>${assignedDests.length} option(s)</strong>
      </div>
    </div>
  `;

  document.getElementById('modalTopUpDetails').innerHTML = destSummary;
  document.getElementById('paymentProofModal').classList.remove('hidden');
}

function closePaymentProofModal() {
  document.getElementById('paymentProofModal').classList.add('hidden');
}

async function handleSubmitPaymentProof(event) {
  event.preventDefault();

  const topUpId = document.getElementById('proofTopUpId').value;
  const paymentDestinationId = document.getElementById('proofSelectedDestId').value;
  const amountPaid = document.getElementById('proofAmountPaid').value;
  const transactionId = document.getElementById('proofTransactionId').value.trim();
  const proofFile = document.getElementById('proofFile').files[0];
  const note = document.getElementById('proofNote').value.trim();

  if (!paymentDestinationId) {
    showToast('Please select the destination you transferred to', 'error');
    return;
  }

  if (!transactionId) {
    showToast('Please enter transaction ID / UTR reference', 'error');
    return;
  }

  if (isCurrentTxIdValid === false) {
    showToast('Please enter a valid unique Transaction ID before submitting', 'error');
    return;
  }

  if (!proofFile) {
    showToast('Please upload payment screenshot / proof', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('amountPaid', amountPaid);
  formData.append('paymentDestinationId', paymentDestinationId);
  formData.append('transactionId', transactionId);
  formData.append('paymentProof', proofFile);
  if (note) formData.append('note', note);

  const submitBtn = document.getElementById('btnSubmitProof');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading to Cloudinary...';

  try {
    const res = await fetch(`${API_BASE}/vendors/topups/${topUpId}/confirm-payment`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${currentToken}` },
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      showToast('Payment proof submitted successfully! SuperAdmin will verify.', 'success');
      closePaymentProofModal();
      fetchVendorTopUps();
    } else {
      showToast(data.message || 'Failed to submit payment confirmation', 'error');
    }
  } catch (err) {
    showToast('Error uploading payment confirmation', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Payment Proof';
  }
}

/**
 * 9. Bank Accounts CRUD
 */
async function fetchBankAccounts() {
  if (!currentToken) return;

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
    populateTopupBankAndWalletOptions();
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
 * 10. Wallets CRUD
 */
async function fetchWallets() {
  if (!currentToken) return;

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
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;">
              <div>
                <h4>${w.walletName}</h4>
                <p>ID / VPA: <strong>${w.walletId}</strong></p>
                <div style="margin-top: 0.35rem;">
                  ${w.isDefault ? '<span class="badge badge-default">Default</span>' : ''}
                </div>
              </div>
              ${w.qrCode ? `
                <div style="text-align: center;">
                  <a href="${w.qrCode}" target="_blank" title="Click to view QR code">
                    <img src="${w.qrCode}" alt="Wallet QR" style="width: 50px; height: 50px; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 6px; padding: 2px; background: #fff;">
                  </a>
                  <br><small style="font-size: 0.7rem; color: #6b7280;">QR Code</small>
                </div>
              ` : ''}
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
    populateTopupBankAndWalletOptions();
  } catch (err) {
    console.error('fetchWallets error:', err);
  }
}

async function handleAddWallet(event) {
  event.preventDefault();

  const walletName = document.getElementById('walletName').value.trim();
  const walletId = document.getElementById('walletId').value.trim();
  const qrFile = document.getElementById('walletQrFile')?.files[0];
  const isDefault = document.getElementById('walletIsDefault').checked;

  const formData = new FormData();
  formData.append('walletName', walletName);
  formData.append('walletId', walletId);
  formData.append('isDefault', isDefault);
  if (qrFile) {
    formData.append('qrCode', qrFile);
  }

  try {
    const res = await fetch(`${API_BASE}/vendors/wallets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentToken}`
      },
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      showToast('Wallet added with QR code!', 'success');
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
  const qrFileInput = document.getElementById('editWalletQrFile');
  if (qrFileInput) qrFileInput.value = '';

  const qrCurrentEl = document.getElementById('editWalletQrCurrent');
  if (qrCurrentEl) {
    qrCurrentEl.innerHTML = wallet.qrCode 
      ? `Current QR: <a href="${wallet.qrCode}" target="_blank" style="color: var(--primary); text-decoration: underline;">View Current Image</a> (Upload new image to replace)`
      : `No QR code currently uploaded.`;
  }

  document.getElementById('editWalletIsDefault').checked = Boolean(wallet.isDefault);
  document.getElementById('editWalletModal').classList.remove('hidden');
}

function closeEditWalletModal() {
  document.getElementById('editWalletModal').classList.add('hidden');
}

async function handleUpdateWallet(event) {
  event.preventDefault();

  const walletSubId = document.getElementById('editWalletSubId').value;
  const walletName = document.getElementById('editWalletName').value.trim();
  const walletId = document.getElementById('editWalletId').value.trim();
  const qrFile = document.getElementById('editWalletQrFile')?.files[0];
  const isDefault = document.getElementById('editWalletIsDefault').checked;

  const formData = new FormData();
  formData.append('walletName', walletName);
  formData.append('walletId', walletId);
  formData.append('isDefault', isDefault);
  if (qrFile) {
    formData.append('qrCode', qrFile);
  }

  try {
    const res = await fetch(`${API_BASE}/vendors/wallets/${walletSubId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${currentToken}`
      },
      body: formData
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
 * 11. Tier & Ranking System
 */
let cachedCurrentTierId = null;
let cachedCurrentTierName = '';
let cachedVendorMonthlyTopUp = 0;

function getTierBadgeClass(divisionGroup = '', tierName = '') {
  const text = (divisionGroup || tierName || '').toUpperCase();
  if (text.includes('ACE')) return 'badge-tier-ace';
  if (text.includes('CROWN')) return 'badge-tier-crown';
  if (text.includes('DIAMOND')) return 'badge-tier-diamond';
  if (text.includes('PLATINUM')) return 'badge-tier-platinum';
  if (text.includes('GOLD')) return 'badge-tier-gold';
  if (text.includes('SILVER')) return 'badge-tier-silver';
  return 'badge-tier-bronze';
}

function getTierEmblem(divisionGroup = '', tierName = '') {
  const text = (divisionGroup || tierName || '').toUpperCase();
  if (text.includes('ACE')) return '🔥';
  if (text.includes('CROWN')) return '👑';
  if (text.includes('DIAMOND')) return '💎';
  if (text.includes('PLATINUM')) return '🛡️';
  if (text.includes('GOLD')) return '🥇';
  if (text.includes('SILVER')) return '🥈';
  return '🥉';
}

async function fetchVendorTierProgress() {
  if (!currentToken) return;

  try {
    const res = await fetch(`${API_BASE}/vendors/tier-progress`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (!data.success || !data.data) return;

    const p = data.data.progress || data.data;
    const currentTier = p.currentTier || {};
    const nextTier = p.nextTier;
    
    cachedCurrentTierId = currentTier.id || currentTier._id;
    cachedCurrentTierName = currentTier.displayName || currentTier.name || p.currentTierName || 'Bronze V';
    cachedVendorMonthlyTopUp = Number(p.totalMonthlyTopUp) || 0;

    const tierDisplayName = cachedCurrentTierName;
    const effectiveRate = p.effectiveCommissionRate !== undefined 
      ? p.effectiveCommissionRate 
      : (p.commission?.effectiveRate !== undefined ? p.commission.effectiveRate : 1.0);
    const commMode = p.commissionMode || p.commission?.mode || 'AUTO';
    const isManual = commMode === 'MANUAL';
    const isMaxTier = p.isMaxTier || !nextTier || tierDisplayName === 'Ace';

    // 1. Top Navbar / Header overview badges
    const dashTierBadge = document.getElementById('dashTierBadge');
    if (dashTierBadge) {
      dashTierBadge.textContent = tierDisplayName;
      dashTierBadge.className = `badge ${getTierBadgeClass(currentTier.divisionGroup, tierDisplayName)}`;
    }

    const dashCommissionBadge = document.getElementById('dashCommissionBadge');
    if (dashCommissionBadge) {
      const modeSuffix = isManual ? ' (MANUAL)' : '';
      dashCommissionBadge.textContent = `${effectiveRate}%${modeSuffix}`;
      dashCommissionBadge.className = `badge ${isManual ? 'badge-mode-manual' : 'badge-info'}`;
    }

    // 2. Wallet KPI tier card if exists
    const vendorTierNameEl = document.getElementById('vendorTierName');
    if (vendorTierNameEl) {
      vendorTierNameEl.textContent = `${tierDisplayName} (${effectiveRate}%)`;
    }

    // 3. Hero Rank Card
    const emblemEl = document.getElementById('tierEmblem');
    if (emblemEl) emblemEl.textContent = getTierEmblem(currentTier.divisionGroup, tierDisplayName);

    const heroDisplayName = document.getElementById('tierHeroDisplayName');
    if (heroDisplayName) heroDisplayName.textContent = tierDisplayName;

    const heroDivisionBadge = document.getElementById('tierHeroDivisionBadge');
    if (heroDivisionBadge) {
      heroDivisionBadge.textContent = (currentTier.divisionGroup || tierDisplayName.split(' ')[0] || 'BRONZE').toUpperCase();
      heroDivisionBadge.className = `badge ${getTierBadgeClass(currentTier.divisionGroup, tierDisplayName)}`;
    }

    const monthBadge = document.getElementById('tierMonthBadge');
    if (monthBadge) monthBadge.textContent = p.monthLabel || 'Current Month';

    const heroMonthlyTopUp = document.getElementById('tierHeroMonthlyTopUp');
    if (heroMonthlyTopUp) heroMonthlyTopUp.textContent = `₹${cachedVendorMonthlyTopUp.toLocaleString('en-IN')}`;

    const heroNextTier = document.getElementById('tierHeroNextTier');
    if (heroNextTier) {
      heroNextTier.textContent = isMaxTier ? '🏆 Max Rank Achieved' : (nextTier?.displayName || nextTier?.name || 'Next Tier');
    }

    const heroAmountNeeded = document.getElementById('tierHeroAmountNeeded');
    if (heroAmountNeeded) {
      heroAmountNeeded.textContent = isMaxTier 
        ? 'Top Rank (Ace)' 
        : `₹${(p.amountToNextTier || 0).toLocaleString('en-IN')}`;
    }

    const heroCommission = document.getElementById('tierHeroCommission');
    if (heroCommission) heroCommission.textContent = `${effectiveRate}%`;

    const heroCommissionMode = document.getElementById('tierHeroCommissionMode');
    if (heroCommissionMode) {
      heroCommissionMode.textContent = isManual ? 'MANUAL OVERRIDE' : 'AUTO TIER RATE';
      heroCommissionMode.className = `badge ${isManual ? 'badge-mode-manual' : 'badge-mode-auto'}`;
      const reason = p.manualCommissionReason || p.commission?.manualReason;
      if (reason) {
        heroCommissionMode.title = `Override Reason: ${reason}`;
      }
    }

    // 4. Progress bar
    const progressBar = document.getElementById('tierProgressBar');
    const progressText = document.getElementById('tierProgressPercentageText');
    const startLabel = document.getElementById('tierProgressStartLabel');
    const endLabel = document.getElementById('tierProgressEndLabel');

    if (progressBar) progressBar.style.width = `${p.progressPercentage || 0}%`;
    if (progressText) progressText.textContent = `${p.progressPercentage || 0}%`;
    if (startLabel) startLabel.textContent = `Min: ₹${(currentTier.minTopUp || 0).toLocaleString('en-IN')}`;
    if (endLabel) {
      endLabel.textContent = isMaxTier 
        ? 'Ace Level Max' 
        : `Target: ₹${(nextTier?.minTopUp || currentTier.maxTopUp || 0).toLocaleString('en-IN')}`;
    }

  } catch (err) {
    console.error('fetchVendorTierProgress error:', err);
  }
}

async function fetchVendorTierMovements() {
  if (!currentToken) return;

  try {
    const res = await fetch(`${API_BASE}/vendors/tier-movements`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    const container = document.getElementById('tierMovementsList');
    if (!container) return;

    if (data.success && data.data?.movements?.length > 0) {
      container.classList.remove('is-empty');
      container.classList.add('has-items');
      container.innerHTML = data.data.movements.map(m => {
        const dateStr = new Date(m.changedAt).toLocaleString('en-IN');
        const commRate = m.newCommission !== undefined ? m.newCommission : (m.newCommissionRate || 0);
        const prevComm = m.previousCommission !== undefined ? m.previousCommission : null;
        const commChangeText = prevComm !== null && prevComm !== commRate 
          ? `${prevComm}% ➔ ${commRate}%` 
          : `${commRate}%`;

        return `
          <div class="timeline-item">
            <div class="timeline-content">
              <div class="timeline-header">
                <strong style="color: var(--primary); font-weight: 700;">${m.previousTierName} ➔ ${m.newTierName}</strong>
                <small class="text-muted">${dateStr}</small>
              </div>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0;">
                Volume reached: <strong>₹${(m.totalMonthlyTopUp || 0).toLocaleString('en-IN')}</strong> (+₹${(m.topUpAmountAtChange || 0).toLocaleString('en-IN')}) | Commission: <strong>${commChangeText}</strong>
              </p>
            </div>
          </div>
        `;
      }).join('');
    } else {
      container.classList.remove('has-items');
      container.classList.add('is-empty');
      container.innerHTML = `
        <div class="empty-state" style="padding: 1.5rem 0; text-align: center; color: var(--text-muted); margin: 0;">
          <p style="margin: 0; font-size: 0.9rem;">No rank movements recorded this month yet.</p>
        </div>
      `;
    }
  } catch (err) {
    console.error('fetchVendorTierMovements error:', err);
  }
}

async function fetchVendorTierHistory() {
  if (!currentToken) return;

  try {
    const res = await fetch(`${API_BASE}/vendors/monthly-history`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    const tbody = document.getElementById('tierHistoryTbody');
    if (!tbody) return;

    if (data.success && data.data?.history?.length > 0) {
      tbody.innerHTML = data.data.history.map(h => {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthLabel = `${monthNames[h.month - 1] || h.month} ${h.year}`;
        const badgeClass = getTierBadgeClass('', h.currentTierName);

        return `
          <tr>
            <td><strong>${monthLabel}</strong></td>
            <td>₹${(h.totalMonthlyTopUp || 0).toLocaleString('en-IN')}</td>
            <td><span class="badge ${badgeClass}">${h.currentTierName}</span></td>
            <td><strong>${h.currentCommissionRate}%</strong> <small class="text-muted">(${h.commissionMode})</small></td>
            <td><span class="badge ${h.isClosed ? 'badge-approved' : 'badge-pending'}">${h.isClosed ? 'Finalized' : 'In Progress'}</span></td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No past monthly records found.</td></tr>';
    }
  } catch (err) {
    console.error('fetchVendorTierHistory error:', err);
  }
}

async function fetchVendorTiersList() {
  if (!currentToken) return;

  try {
    const res = await fetch(`${API_BASE}/vendors/tiers`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    const tbody = document.getElementById('tierMatrixTbody');
    if (!tbody) return;

    if (data.success && data.data?.tiers?.length > 0) {
      const volume = cachedVendorMonthlyTopUp || 0;
      const sortedTiers = [...data.data.tiers].sort((a, b) => (a.orderPriority || 0) - (b.orderPriority || 0) || (a.minTopUp || 0) - (b.minTopUp || 0));

      tbody.innerHTML = sortedTiers.map(t => {
        const isCurrentActive = cachedCurrentTierId 
          ? (t._id === cachedCurrentTierId || t.name === cachedCurrentTierName || t.displayName === cachedCurrentTierName)
          : (volume >= t.minTopUp && (!t.maxTopUp || volume <= t.maxTopUp));

        const badgeClass = getTierBadgeClass(t.divisionGroup, t.name);
        const rangeDisplay = t.maxTopUp 
          ? `₹${(t.minTopUp || 0).toLocaleString('en-IN')} – ₹${t.maxTopUp.toLocaleString('en-IN')}` 
          : `₹${(t.minTopUp || 0).toLocaleString('en-IN')}+ (Unlimited)`;

        let neededHtml = '';
        let statusHtml = '';

        if (isCurrentActive) {
          neededHtml = `<span style="font-weight: 700; color: #059669;">⭐ Current Active Rank</span>`;
          statusHtml = `<span class="badge badge-approved" style="font-weight: 700; padding: 0.35rem 0.65rem;">📍 YOU ARE HERE</span>`;
        } else if (volume >= (t.maxTopUp || t.minTopUp)) {
          neededHtml = `<span style="color: #059669; font-weight: 600;">✅ Achieved</span>`;
          statusHtml = `<span class="badge badge-approved">Unlocked</span>`;
        } else {
          const diff = Math.max(0, t.minTopUp - volume);
          neededHtml = `<span style="font-weight: 700; color: #0284c7;">+₹${diff.toLocaleString('en-IN')} more</span>`;
          statusHtml = `<span class="badge badge-pending">🔒 Needs ₹${diff.toLocaleString('en-IN')}</span>`;
        }

        return `
          <tr class="${isCurrentActive ? 'row-active-tier' : ''}">
            <td>
              <span class="badge ${badgeClass}">${t.divisionGroup || 'Tier'} ${t.level || ''}</span>
            </td>
            <td>
              <strong>${t.displayName || t.name}</strong>
            </td>
            <td>${rangeDisplay}</td>
            <td style="font-weight: 700; color: #059669;">${t.commissionRate}%</td>
            <td>${neededHtml}</td>
            <td>${statusHtml}</td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No tiers configured.</td></tr>';
    }
  } catch (err) {
    console.error('fetchVendorTiersList error:', err);
  }
}

/**
 * 12. Logout
 */
function logout() {
  currentToken = null;
  currentVendor = null;
  localStorage.removeItem('moffin_token');
  showAuthSection();
  showToast('Logged out', 'success');
}

/**
 * 13. Vendor Incoming Payment Requests (Stage 2 Verification & Approval)
 */
async function fetchVendorPaymentRequests(statusOverride = null) {
  const tbody = document.getElementById('vendorIncomingPaymentsTbody');
  if (!tbody) return;

  const filterSelect = document.getElementById('incomingPaymentFilter');
  const status = statusOverride || (filterSelect ? filterSelect.value : 'all');

  try {
    let url = `${API_BASE}/vendors/payment-requests`;
    if (status && status !== 'all') {
      url += `?status=${encodeURIComponent(status)}`;
    }

    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentToken}`
      }
    });

    const data = await res.json();

    if (data.success && data.data && data.data.transactions?.length > 0) {
      tbody.innerHTML = data.data.transactions
        .map((tx) => {
          const clientName = tx.clientId ? `${tx.clientId.firstName || ''} ${tx.clientId.lastName || ''}`.trim() : 'Client';
          const clientContact = tx.clientId?.mobile || tx.clientId?.email || '';
          const method = (tx.paymentMethod || 'wallet').toUpperCase();
          const amount = Number(tx.submittedAmount || tx.allocatedAmount || tx.requestedAmount || 0);
          const utr = tx.externalTransactionId || '<span style="color:#94a3b8;">Pending Client Proof</span>';
          const dt = tx.submittedAt ? new Date(tx.submittedAt).toLocaleString('en-IN') : (tx.createdAt ? new Date(tx.createdAt).toLocaleString('en-IN') : '--');

          let accountDesc = '--';
          if (tx.paymentDetails?.type === 'wallet') {
            accountDesc = `👛 ${tx.paymentDetails.walletName || 'UPI'}: <code>${tx.paymentDetails.walletId || ''}</code>`;
          } else if (tx.paymentDetails?.type === 'bank') {
            accountDesc = `🏦 ${tx.paymentDetails.bankName || 'Bank'}: A/C <code>${tx.paymentDetails.accountNumber || ''}</code>`;
          }

          let badgeClass = 'badge-info';
          if (tx.status === 'APPROVED' || tx.status === 'COMPLETED') badgeClass = 'badge-approved';
          else if (tx.status === 'REJECTED') badgeClass = 'badge-rejected';
          else if (tx.status === 'AWAITING_VENDOR_VERIFICATION') badgeClass = 'badge-pending';

          let actionsHtml = '';
          if (['AWAITING_VENDOR_VERIFICATION', 'ASSIGNED', 'PAYMENT_SUBMITTED', 'ALLOCATED'].includes(tx.status)) {
            actionsHtml = `
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <button type="button" class="btn btn-sm btn-success" style="padding: 3px 8px; font-size: 0.8rem; font-weight: 700;" onclick="handleVendorApprovePayment('${tx.transactionId}')">
                  ✓ Approve
                </button>
                <button type="button" class="btn btn-sm btn-danger" style="padding: 3px 8px; font-size: 0.8rem;" onclick="openVendorRejectModal('${tx.transactionId}')">
                  ✕ Reject
                </button>
              </div>
            `;
          } else if (tx.status === 'APPROVED' || tx.status === 'COMPLETED') {
            actionsHtml = `<span style="color: #059669; font-weight: 700; font-size: 0.85rem;">✅ Settled (+₹${tx.commissionAmount || 0} comm)</span>`;
          } else if (tx.status === 'REJECTED') {
            actionsHtml = `<span style="color: #dc2626; font-size: 0.8rem;">❌ Rejected: ${tx.rejectionReason || 'Declined'}</span>`;
          }

          return `
            <tr>
              <td><strong style="font-family: monospace; font-size: 0.85rem;">${tx.transactionId}</strong></td>
              <td>
                <div style="font-weight: 600; color: #1e293b;">${clientName}</div>
                <div style="font-size: 0.75rem; color: #64748b;">${clientContact}</div>
              </td>
              <td style="font-size: 0.85rem;">${accountDesc}</td>
              <td style="font-weight: 800; color: #059669; font-size: 1rem;">₹${amount.toLocaleString('en-IN')}</td>
              <td><span style="font-family: monospace; font-weight: 700; color: #4f46e5; background: #eef2ff; padding: 2px 6px; border-radius: 4px;">${utr}</span></td>
              <td><span class="badge ${badgeClass}">${tx.status}</span></td>
              <td style="font-size: 0.8rem; color: #64748b;">${dt}</td>
              <td>${actionsHtml}</td>
            </tr>
          `;
        })
        .join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No payment requests matching current filter.</td></tr>';
    }
  } catch (err) {
    console.error('fetchVendorPaymentRequests error:', err);
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Failed to load payment requests.</td></tr>';
  }
}

/**
 * Approve Incoming Client Payment
 */
async function handleVendorApprovePayment(paymentId) {
  if (!confirm(`Are you sure you have verified receiving this payment and want to APPROVE Transaction ${paymentId}?`)) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/vendors/payment/${paymentId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentToken}`
      }
    });

    const data = await res.json();

    if (data.success) {
      showToast(`Payment ${paymentId} approved successfully! Commission credited: ₹${data.data?.commissionAmount || 0}`, 'success');
      fetchVendorPaymentRequests();
      fetchVendorWalletAndLedger();
      if (typeof fetchVendorOverviewStats === 'function') fetchVendorOverviewStats();
    } else {
      showToast(data.message || 'Failed to approve payment', 'error');
    }
  } catch (err) {
    console.error('handleVendorApprovePayment error:', err);
    showToast('Network error while approving payment', 'error');
  }
}

/**
 * Reject Incoming Client Payment Modal & Handlers
 */
function openVendorRejectModal(paymentId) {
  const modal = document.getElementById('rejectPaymentModal');
  const idInput = document.getElementById('rejectPaymentId');
  const reasonInput = document.getElementById('vendorRejectReason');

  if (idInput) idInput.value = paymentId;
  if (reasonInput) reasonInput.value = '';
  if (modal) modal.classList.remove('hidden');
}

function closeVendorRejectModal() {
  const modal = document.getElementById('rejectPaymentModal');
  if (modal) modal.classList.add('hidden');
}

async function handleConfirmVendorReject(event) {
  event.preventDefault();

  const paymentId = document.getElementById('rejectPaymentId')?.value;
  const reason = document.getElementById('vendorRejectReason')?.value.trim();
  const btn = document.getElementById('btnConfirmReject');

  if (!paymentId) return;

  btn.disabled = true;
  btn.textContent = 'Rejecting...';

  try {
    const res = await fetch(`${API_BASE}/vendors/payment/${paymentId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentToken}`
      },
      body: JSON.stringify({ rejectionReason: reason })
    });

    const data = await res.json();

    if (data.success) {
      showToast(`Payment ${paymentId} rejected. Reserved funds restored to your wallet.`, 'success');
      closeVendorRejectModal();
      fetchVendorPaymentRequests();
      fetchVendorWalletAndLedger();
    } else {
      showToast(data.message || 'Failed to reject payment', 'error');
    }
  } catch (err) {
    console.error('handleConfirmVendorReject error:', err);
    showToast('Network error while rejecting payment', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirm Rejection';
  }
}

/**
 * 14. Commission Withdrawal Management
 */
let cachedWithdrawals = [];

function handleWithdrawDestTypeChange() {
  const type = document.getElementById('withdrawDestType')?.value || 'bank';
  const source = document.querySelector('input[name="withdrawDestSource"]:checked')?.value || 'linked';

  const linkedBankGroup = document.getElementById('withdrawLinkedBankGroup');
  const linkedWalletGroup = document.getElementById('withdrawLinkedWalletGroup');
  const manualBankGroup = document.getElementById('withdrawManualBankGroup');
  const manualWalletGroup = document.getElementById('withdrawManualWalletGroup');

  if (source === 'linked') {
    if (type === 'bank') {
      if (linkedBankGroup) linkedBankGroup.classList.remove('hidden');
      if (linkedWalletGroup) linkedWalletGroup.classList.add('hidden');
    } else {
      if (linkedBankGroup) linkedBankGroup.classList.add('hidden');
      if (linkedWalletGroup) linkedWalletGroup.classList.remove('hidden');
    }
    if (manualBankGroup) manualBankGroup.classList.add('hidden');
    if (manualWalletGroup) manualWalletGroup.classList.add('hidden');
  } else {
    if (linkedBankGroup) linkedBankGroup.classList.add('hidden');
    if (linkedWalletGroup) linkedWalletGroup.classList.add('hidden');
    if (type === 'bank') {
      if (manualBankGroup) manualBankGroup.classList.remove('hidden');
      if (manualWalletGroup) manualWalletGroup.classList.add('hidden');
    } else {
      if (manualBankGroup) manualBankGroup.classList.add('hidden');
      if (manualWalletGroup) manualWalletGroup.classList.remove('hidden');
    }
  }
}

function handleWithdrawSourceChange() {
  handleWithdrawDestTypeChange();
}

function populateWithdrawDestinationOptions() {
  const bankSelect = document.getElementById('withdrawLinkedBankSelect');
  const walletSelect = document.getElementById('withdrawLinkedWalletSelect');

  if (bankSelect) {
    if (cachedBankAccounts.length > 0) {
      bankSelect.innerHTML = cachedBankAccounts.map(b => `
        <option value="${b._id}" ${b.isDefault ? 'selected' : ''}>
          🏦 ${b.bankName} - A/C: ${b.accountNumber} (${b.accountHolderName}) ${b.isDefault ? '★ Default' : ''}
        </option>
      `).join('');
    } else {
      bankSelect.innerHTML = '<option value="">(No bank accounts linked - please add one or select Manual)</option>';
    }
  }

  if (walletSelect) {
    if (cachedWallets.length > 0) {
      walletSelect.innerHTML = cachedWallets.map(w => `
        <option value="${w._id}" ${w.isDefault ? 'selected' : ''}>
          👛 ${w.walletName} - ${w.walletId} ${w.isDefault ? '★ Default' : ''}
        </option>
      `).join('');
    } else {
      walletSelect.innerHTML = '<option value="">(No wallets linked - please add one or select Manual)</option>';
    }
  }

  handleWithdrawDestTypeChange();
}

async function handleCreateWithdrawal(event) {
  event.preventDefault();

  const amount = Number(document.getElementById('withdrawAmount').value);
  if (!amount || isNaN(amount) || amount < 25000) {
    showToast('Minimum withdrawal amount is ₹25,000', 'error');
    return;
  }

  const destinationType = document.getElementById('withdrawDestType').value;
  const source = document.querySelector('input[name="withdrawDestSource"]:checked')?.value || 'linked';
  const isManualDestination = source === 'manual';
  const notes = document.getElementById('withdrawNotes').value.trim();

  let payload = {
    amount,
    destinationType,
    isManualDestination,
    notes
  };

  if (!isManualDestination) {
    const selectedAccountId = destinationType === 'bank'
      ? document.getElementById('withdrawLinkedBankSelect').value
      : document.getElementById('withdrawLinkedWalletSelect').value;

    if (!selectedAccountId) {
      showToast(`Please select a valid linked ${destinationType} account or switch to manual input`, 'error');
      return;
    }
    payload.selectedAccountId = selectedAccountId;
  } else {
    if (destinationType === 'bank') {
      const bankName = document.getElementById('withdrawManualBankName').value.trim();
      const accountNumber = document.getElementById('withdrawManualAccountNo').value.trim();
      const ifscCode = document.getElementById('withdrawManualIfsc').value.trim();
      const branchName = document.getElementById('withdrawManualBranch').value.trim();
      const accountHolderName = document.getElementById('withdrawManualHolderName').value.trim();

      if (!bankName || !accountNumber || !ifscCode || !accountHolderName) {
        showToast('Please fill all required manual bank details', 'error');
        return;
      }

      payload.destinationDetails = {
        bankName,
        accountNumber,
        ifscCode,
        branchName,
        accountHolderName
      };
    } else {
      const walletName = document.getElementById('withdrawManualWalletName').value.trim();
      const walletId = document.getElementById('withdrawManualWalletId').value.trim();

      if (!walletName || !walletId) {
        showToast('Please enter wallet name and UPI/Wallet ID', 'error');
        return;
      }

      payload.destinationDetails = {
        walletName,
        walletId
      };
    }
  }

  const btn = document.getElementById('btnSubmitWithdrawal');
  btn.disabled = true;
  btn.textContent = 'Submitting Request...';

  try {
    const res = await fetch(`${API_BASE}/vendors/withdrawals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentToken}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      showToast('Withdrawal request submitted! SuperAdmin will transfer funds.', 'success');
      document.getElementById('createWithdrawalForm').reset();
      handleWithdrawDestTypeChange();
      fetchVendorWithdrawals();
      fetchVendorOverviewStats();
    } else {
      showToast(data.message || 'Failed to create withdrawal request', 'error');
    }
  } catch (err) {
    console.error('handleCreateWithdrawal error:', err);
    showToast('Failed to connect to server', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Withdrawal Request';
  }
}

async function fetchVendorWithdrawals(statusOverride = null) {
  if (!currentToken) return;

  const tbody = document.getElementById('vendorWithdrawalsTbody');
  if (!tbody) return;

  const filterSelect = document.getElementById('vendorWithdrawalFilter');
  const status = statusOverride || (filterSelect ? filterSelect.value : 'all');

  try {
    let url = `${API_BASE}/vendors/withdrawals?limit=50`;
    if (status && status !== 'all') {
      url += `&status=${encodeURIComponent(status)}`;
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${currentToken}` }
    });
    const data = await res.json();

    if (data.success && data.data) {
      const summary = data.data.summary || {};
      const availCommEl = document.getElementById('withdrawAvailCommission');
      const totalWithdrawnEl = document.getElementById('withdrawTotalWithdrawn');

      if (availCommEl) availCommEl.textContent = `₹ ${(summary.commissionBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      if (totalWithdrawnEl) totalWithdrawnEl.textContent = `₹ ${(summary.totalWithdrawn || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

      cachedWithdrawals = data.data.withdrawals || [];

      if (cachedWithdrawals.length > 0) {
        tbody.innerHTML = cachedWithdrawals.map(w => {
          const dateStr = new Date(w.createdAt).toLocaleString('en-IN');
          const dest = w.destinationDetails || {};
          let destHtml = '';

          if (w.destinationType === 'bank') {
            destHtml = `<strong>🏦 ${dest.bankName || 'Bank'}</strong><br><small>A/C: <code>${dest.accountNumber || 'N/A'}</code> | IFSC: <code>${dest.ifscCode || 'N/A'}</code><br>Holder: ${dest.accountHolderName || 'N/A'}</small>`;
          } else {
            destHtml = `<strong>👛 ${dest.walletName || 'UPI'}</strong><br><small>VPA: <code>${dest.walletId || 'N/A'}</code></small>`;
          }

          let badgeClass = 'badge-pending';
          let statusLabel = w.status;
          if (w.status === 'PENDING_ADMIN_PAYMENT') {
            badgeClass = 'badge-pending';
            statusLabel = '⏳ Pending Admin Payment';
          } else if (w.status === 'PAYMENT_SENT_BY_ADMIN') {
            badgeClass = 'badge-info';
            statusLabel = '💳 Payment Sent (Verify Now)';
          } else if (w.status === 'APPROVED') {
            badgeClass = 'badge-approved';
            statusLabel = '✅ Completed & Settled';
          } else if (w.status === 'REJECTED') {
            badgeClass = 'badge-rejected';
            statusLabel = '❌ Rejected';
          }

          let proofHtml = '<span class="text-muted">--</span>';
          if (w.adminPaymentDetails?.transactionId) {
            proofHtml = `
              <div>
                <span style="font-family: monospace; font-weight: 700; color: #4338ca; background: #e0e7ff; padding: 2px 6px; border-radius: 4px;">
                  ${w.adminPaymentDetails.transactionId}
                </span>
                ${w.adminPaymentDetails.paymentProof ? `
                  <div style="margin-top: 4px;">
                    <a href="${w.adminPaymentDetails.paymentProof}" target="_blank" style="font-size: 0.8rem; color: #0284c7; text-decoration: underline; font-weight: 600;">
                      🖼️ View Proof Screenshot
                    </a>
                  </div>
                ` : ''}
              </div>
            `;
          }

          let actionsHtml = '<span class="text-muted">--</span>';
          if (w.status === 'PAYMENT_SENT_BY_ADMIN') {
            actionsHtml = `
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <button type="button" class="btn btn-sm btn-success" style="padding: 4px 10px; font-weight: 700;" onclick="handleVendorApproveWithdrawal('${w.withdrawalId}')">
                  ✓ Confirm & Approve
                </button>
                <button type="button" class="btn btn-sm btn-danger" style="padding: 4px 8px;" onclick="openVendorRejectWithdrawalModal('${w.withdrawalId}')">
                  ✕ Reject
                </button>
              </div>
            `;
          } else if (w.status === 'APPROVED') {
            actionsHtml = `<span style="color: #059669; font-weight: 700; font-size: 0.85rem;">✅ Settled</span>`;
          } else if (w.status === 'REJECTED') {
            actionsHtml = `<span style="color: #dc2626; font-size: 0.8rem;">❌ ${w.vendorConfirmation?.rejectionReason || 'Declined'}</span>`;
          }

          return `
            <tr>
              <td><strong style="font-family: monospace;">${w.withdrawalId}</strong></td>
              <td style="font-weight: 800; font-size: 1.05rem; color: #7c3aed;">₹ ${(w.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              <td style="font-size: 0.85rem;">${destHtml}</td>
              <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
              <td>${proofHtml}</td>
              <td style="font-size: 0.8rem; color: #64748b;">${dateStr}</td>
              <td>${actionsHtml}</td>
            </tr>
          `;
        }).join('');
      } else {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No withdrawal requests found.</td></tr>';
      }
    }
  } catch (err) {
    console.error('fetchVendorWithdrawals error:', err);
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Failed to load withdrawal requests.</td></tr>';
  }
}

async function handleVendorApproveWithdrawal(withdrawalId) {
  if (!confirm(`Are you sure you have verified receiving this payout in your bank/wallet account and want to APPROVE withdrawal ${withdrawalId}?`)) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/vendors/withdrawals/${withdrawalId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentToken}`
      }
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Withdrawal ${withdrawalId} confirmed and settled successfully! Commission balance updated.`, 'success');
      fetchVendorWithdrawals();
      fetchVendorWalletAndLedger();
      fetchVendorOverviewStats();
    } else {
      showToast(data.message || 'Failed to approve withdrawal', 'error');
    }
  } catch (err) {
    console.error('handleVendorApproveWithdrawal error:', err);
    showToast('Network error while approving withdrawal', 'error');
  }
}

function openVendorRejectWithdrawalModal(withdrawalId) {
  const modal = document.getElementById('rejectWithdrawalModal');
  const idInput = document.getElementById('rejectWithdrawalId');
  const reasonInput = document.getElementById('vendorRejectWithdrawalReason');

  if (idInput) idInput.value = withdrawalId;
  if (reasonInput) reasonInput.value = '';
  if (modal) modal.classList.remove('hidden');
}

function closeVendorRejectWithdrawalModal() {
  const modal = document.getElementById('rejectWithdrawalModal');
  if (modal) modal.classList.add('hidden');
}

async function handleConfirmVendorRejectWithdrawal(event) {
  event.preventDefault();

  const withdrawalId = document.getElementById('rejectWithdrawalId')?.value;
  const reason = document.getElementById('vendorRejectWithdrawalReason')?.value.trim();
  const btn = document.getElementById('btnConfirmRejectWithdrawal');

  if (!withdrawalId) return;

  btn.disabled = true;
  btn.textContent = 'Rejecting...';

  try {
    const res = await fetch(`${API_BASE}/vendors/withdrawals/${withdrawalId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentToken}`
      },
      body: JSON.stringify({ rejectionReason: reason })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Withdrawal ${withdrawalId} rejected. No commission was deducted.`, 'success');
      closeVendorRejectWithdrawalModal();
      fetchVendorWithdrawals();
    } else {
      showToast(data.message || 'Failed to reject withdrawal', 'error');
    }
  } catch (err) {
    console.error('handleConfirmVendorRejectWithdrawal error:', err);
    showToast('Network error while rejecting withdrawal', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirm Rejection';
  }
}



