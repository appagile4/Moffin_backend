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

  const targetEl = document.getElementById(tabId);
  if (targetEl) targetEl.classList.remove('hidden');
  if (event && event.target) event.target.classList.add('active');

  if (tabId === 'walletTab') fetchVendorWalletAndLedger();
  if (tabId === 'topupsTab') fetchVendorTopUps();
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
 * 7. Wallet & Immutable Ledger
 */
async function fetchVendorWalletAndLedger() {
  if (!currentToken) return;

  try {
    // 1. Fetch Wallet Info & Tier
    const resWallet = await fetch(`${API_BASE}/vendors/wallet`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const walletData = await resWallet.json();

    if (walletData.success && walletData.data) {
      const { wallet, tier, queueStatus } = walletData.data;
      if (wallet) {
        document.getElementById('walletAvailableBalance').textContent = `₹${(wallet.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        document.getElementById('walletLockedBalance').textContent = `₹${(wallet.lockedBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      }
      if (tier) {
        document.getElementById('vendorTierName').textContent = tier.tierName || 'Bronze';
        document.getElementById('vendorTierRate').textContent = `Fee: ${tier.commissionPercentage ?? 2}%`;
      }
      if (queueStatus) {
        document.getElementById('vendorQueuePosition').textContent = queueStatus.priority ? `#${queueStatus.priority}` : 'Active';
        document.getElementById('vendorQueueSkips').textContent = `Skips: ${queueStatus.consecutiveSkips ?? 0}`;
      }
    }

    // 2. Fetch Ledger Transactions
    const resLedger = await fetch(`${API_BASE}/vendors/wallet/ledger?limit=50`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const ledgerData = await resLedger.json();

    const tbody = document.getElementById('walletLedgerTbody');
    if (ledgerData.success && ledgerData.data?.transactions?.length > 0) {
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
    } else {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No transactions in ledger yet. Top up your wallet to begin.</td></tr>';
    }
  } catch (err) {
    console.error('fetchVendorWalletAndLedger error:', err);
  }
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
        const amountStr = `₹${(t.requestedAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        const assignedDests = t.adminResponse?.selectedDestinations || (t.paymentDestination ? [t.paymentDestination] : []);

        let destInfoHtml = '';
        let actionBtnHtml = '';

        if (t.status === 'PENDING_ADMIN_RESPONSE') {
          destInfoHtml = `<p style="color: #92400e;">⏳ Waiting for SuperAdmin to review and assign company payment destinations...</p>`;
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
              <div class="info-box mt-2" style="background: #f0fdf4; border-color: #bbf7d0; color: #166534;">
                <strong>💳 Company Payment Destination(s) Assigned (${assignedDests.length}):</strong><br>
                ${destCards}
                ${t.adminResponse?.adminMessage ? `<p style="margin-top: 0.35rem;"><strong>Admin Note:</strong> <em>${t.adminResponse.adminMessage}</em></p>` : ''}
              </div>
            `;
          }
          actionBtnHtml = `<button class="btn btn-sm btn-success" onclick="openPaymentProofModal('${t._id}')">💳 Pay & Submit Proof</button>`;
        } else if (t.status === 'PAYMENT_SUBMITTED') {
          destInfoHtml = `<p style="color: #854d0e;">⏳ Payment proof submitted. Verification in progress by SuperAdmin.</p>`;
        } else if (t.status === 'APPROVED' || t.status === 'COMPLETED') {
          destInfoHtml = `<p style="color: #059669;">✅ Approved & Credited to your wallet balance.</p>`;
        } else if (t.status === 'REJECTED') {
          destInfoHtml = `<p style="color: #dc2626;">❌ Rejected ${t.rejectionReason ? `(Reason: ${t.rejectionReason})` : ''}</p>`;
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
                <h4>Top-Up ${t.topUpId || t._id.slice(-8)} — ${amountStr}</h4>
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

function openPaymentProofModal(topUpId) {
  const topUp = cachedTopUps.find(t => t._id === topUpId);
  if (!topUp) return;

  document.getElementById('proofTopUpId').value = topUp._id;
  document.getElementById('proofAmountPaid').value = topUp.adminResponse?.approvedAmount || topUp.requestedAmount;
  document.getElementById('proofTransactionId').value = '';
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

  const destSummary = assignedDests.length > 0
    ? `<strong>Available Assigned Destinations:</strong> ${assignedDests.length} option(s)<br><strong>Approved Amount:</strong> ₹${(topUp.adminResponse?.approvedAmount || topUp.requestedAmount).toLocaleString('en-IN')}`
    : `<strong>Amount to Transfer:</strong> ₹${topUp.requestedAmount.toLocaleString('en-IN')}`;

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
 * 11. Logout
 */
function logout() {
  currentToken = null;
  currentVendor = null;
  localStorage.removeItem('moffin_token');
  showAuthSection();
  showToast('Logged out', 'success');
}
