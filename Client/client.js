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

  // Load payment requests & initialize UI
  updateMethodUI();
  fetchClientBalance();
  fetchClientPaymentRequests();
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
// CLIENT PAYMENT REQUEST & FCFS VENDOR ALLOCATION
// =============================================================================
function updateMethodUI() {
  const method = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'wallet';
  const walletLabel = document.getElementById('methodWalletLabel');
  const bankLabel = document.getElementById('methodBankLabel');

  if (walletLabel && bankLabel) {
    if (method === 'wallet') {
      walletLabel.style.borderColor = '#6366f1';
      walletLabel.style.backgroundColor = 'rgba(99, 102, 241, 0.05)';
      bankLabel.style.borderColor = 'var(--border)';
      bankLabel.style.backgroundColor = 'transparent';
    } else {
      bankLabel.style.borderColor = '#6366f1';
      bankLabel.style.backgroundColor = 'rgba(99, 102, 241, 0.05)';
      walletLabel.style.borderColor = 'var(--border)';
      walletLabel.style.backgroundColor = 'transparent';
    }
  }
}

function setQuickAmount(amount) {
  const amountInput = document.getElementById('paymentRequestAmount');
  if (amountInput) {
    amountInput.value = amount;
    amountInput.focus();
  }
}

function copyToClipboard(text) {
  if (!text || text === '--') return;
  navigator.clipboard.writeText(text).then(
    () => showToast('Copied to clipboard: ' + text, 'success'),
    () => showToast('Failed to copy', 'error')
  );
}

async function handleCreatePaymentRequest(e) {
  e.preventDefault();

  const method = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'wallet';
  const amountInput = document.getElementById('paymentRequestAmount');
  const referenceInput = document.getElementById('paymentRequestReference');
  const submitBtn = document.getElementById('btnSubmitPaymentRequest');

  const amount = Number(amountInput.value);
  const clientReference = referenceInput.value.trim();

  if (!amount || isNaN(amount) || amount <= 0) {
    showToast('Please enter a valid amount greater than 0', 'error');
    return;
  }

  // Generate unique idempotency key for this request attempt
  const idempotencyKey = 'REQ-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);

  submitBtn.disabled = true;
  submitBtn.innerHTML = '⏳ Matching FCFS Vendor...';

  try {
    const res = await fetch(`${API_BASE}/client/payment-request`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        paymentMethod: method,
        amount,
        clientReference,
        idempotencyKey
      })
    });

    const data = await res.json();

    if (data.success && data.data) {
      showToast('Payment request allocated successfully!', 'success');
      renderAssignedDestination(data.data);
      amountInput.value = '';
      referenceInput.value = '';
      fetchClientPaymentRequests();
    } else {
      showToast(data.message || 'No eligible vendor currently available for this request', 'warning');
      const card = document.getElementById('assignedDestinationCard');
      if (card) card.classList.add('hidden');
    }
  } catch (err) {
    console.error('Payment Request Error:', err);
    showToast('Network or server error submitting payment request', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '🚀 Submit Payment Request & Allocate Vendor';
  }
}

function renderAssignedDestination(data) {
  const card = document.getElementById('assignedDestinationCard');
  if (!card) return;

  const txId = data.transactionId || data._id || '--';
  const amount = Number(data.amount || data.allocatedAmount || data.requestedAmount || 0);
  const method = (data.paymentMethod || 'wallet').toLowerCase();

  document.getElementById('assignedTxId').textContent = txId;
  document.getElementById('assignedAmount').textContent = `₹${amount.toLocaleString('en-IN')}`;
  document.getElementById('assignedMethod').textContent = method.toUpperCase();
  document.getElementById('assignedStatusBadge').textContent = data.status || 'ASSIGNED';

  // Populate Step 2 hidden inputs
  const submitReqIdInput = document.getElementById('submitPaymentRequestId');
  const submitAmountInput = document.getElementById('submitPaymentAmount');
  const submitMethodInput = document.getElementById('submitAssignedMethod');
  const submitWalletIdInput = document.getElementById('submitAssignedWalletId');
  const submitBankIdInput = document.getElementById('submitAssignedBankId');
  const submitSummaryBox = document.getElementById('submitDetailsSummaryBox');

  if (submitReqIdInput) submitReqIdInput.value = txId;
  if (submitAmountInput) submitAmountInput.value = amount;
  if (submitMethodInput) submitMethodInput.value = method;

  const container = document.getElementById('assignedDetailsContainer');
  const details = data.paymentDetails;

  if (!details) {
    container.innerHTML = '<p class="text-muted">No specific account details attached.</p>';
    if (submitSummaryBox) submitSummaryBox.innerHTML = '';
  } else if (details.type === 'wallet') {
    if (submitWalletIdInput) submitWalletIdInput.value = details.walletId || '';
    if (submitBankIdInput) submitBankIdInput.value = '';
    if (submitSummaryBox) {
      submitSummaryBox.innerHTML = `<strong>Paying to Wallet:</strong> <code>${details.walletId || ''}</code> (${details.walletName || 'UPI'})`;
    }

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
        <div style="flex: 1; min-width: 200px;">
          <div style="font-size: 0.85rem; color: #64748b; font-weight: 600; text-transform: uppercase;">Assigned Wallet / UPI</div>
          <div style="font-size: 1.15rem; font-weight: 800; color: #1e293b; margin: 4px 0;">💳 ${details.walletName || 'UPI'}</div>
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
            <span style="font-size: 1.05rem; font-family: monospace; font-weight: 700; color: #4f46e5; background: #eef2ff; padding: 4px 8px; border-radius: 6px;">
              ${details.walletId}
            </span>
            <button type="button" class="btn btn-sm btn-secondary" onclick="copyToClipboard('${details.walletId}')">📋 Copy UPI</button>
          </div>
        </div>
        ${
          details.qrCode
            ? `
          <div style="text-align: center;">
            <img src="${details.qrCode}" alt="Vendor QR" style="width: 130px; height: 130px; object-fit: contain; border-radius: 8px; border: 1px solid #cbd5e1; box-shadow: 0 2px 6px rgba(0,0,0,0.06);" />
            <div style="font-size: 0.75rem; color: #64748b; margin-top: 4px;">Scan to Pay</div>
          </div>
        `
            : ''
        }
      </div>
    `;
  } else if (details.type === 'bank') {
    if (submitWalletIdInput) submitWalletIdInput.value = '';
    if (submitBankIdInput) submitBankIdInput.value = details.accountNumber || details.bankId || '';
    if (submitSummaryBox) {
      submitSummaryBox.innerHTML = `<strong>Paying to Bank Account:</strong> <code>${details.accountNumber || ''}</code> (${details.bankName || 'Bank'})`;
    }

    container.innerHTML = `
      <div>
        <div style="font-size: 0.85rem; color: #64748b; font-weight: 600; text-transform: uppercase; margin-bottom: 8px;">Assigned Bank Account Details</div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
          <div style="padding: 8px 12px; background: #f8fafc; border-radius: 6px; border-left: 3px solid #6366f1;">
            <div style="font-size: 0.75rem; color: #64748b;">Bank Name</div>
            <div style="font-weight: 700; color: #1e293b;">🏦 ${details.bankName || 'Bank'}</div>
          </div>

          <div style="padding: 8px 12px; background: #f8fafc; border-radius: 6px; border-left: 3px solid #6366f1;">
            <div style="font-size: 0.75rem; color: #64748b;">Account Holder Name</div>
            <div style="font-weight: 700; color: #1e293b;">👤 ${details.accountHolderName || '--'}</div>
          </div>

          <div style="padding: 8px 12px; background: #f8fafc; border-radius: 6px; border-left: 3px solid #10b981;">
            <div style="font-size: 0.75rem; color: #64748b;">Account Number</div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-weight: 800; font-family: monospace; color: #047857;">${details.accountNumber || '--'}</span>
              <button type="button" class="btn btn-sm btn-secondary" style="padding: 1px 5px; font-size: 0.7rem;" onclick="copyToClipboard('${details.accountNumber}')">📋</button>
            </div>
          </div>

          <div style="padding: 8px 12px; background: #f8fafc; border-radius: 6px; border-left: 3px solid #10b981;">
            <div style="font-size: 0.75rem; color: #64748b;">IFSC Code</div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-weight: 800; font-family: monospace; color: #047857;">${details.ifscCode || '--'}</span>
              <button type="button" class="btn btn-sm btn-secondary" style="padding: 1px 5px; font-size: 0.7rem;" onclick="copyToClipboard('${details.ifscCode}')">📋</button>
            </div>
          </div>
        </div>
        ${details.branchName ? `<div style="font-size: 0.8rem; color: #64748b; margin-top: 8px;">Branch: <strong>${details.branchName}</strong></div>` : ''}
      </div>
    `;
  }

  card.classList.remove('hidden');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// =============================================================================
// STEP 2: CLIENT PAYMENT SUBMISSION (UTR / EXTERNAL TX ID)
// =============================================================================
async function handleClientPaymentSubmission(e) {
  e.preventDefault();

  const paymentRequestId = document.getElementById('submitPaymentRequestId')?.value;
  const amount = Number(document.getElementById('submitPaymentAmount')?.value);
  const paymentMethod = document.getElementById('submitAssignedMethod')?.value;
  const transactionId = document.getElementById('submitExternalTxId')?.value.trim();
  const walletId = document.getElementById('submitAssignedWalletId')?.value;
  const bankId = document.getElementById('submitAssignedBankId')?.value;
  const submitBtn = document.getElementById('btnSubmitPaymentProof');

  if (!paymentRequestId) {
    showToast('Missing payment request reference', 'error');
    return;
  }

  if (!transactionId) {
    showToast('Please enter the external UTR / Transaction ID', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '⏳ Submitting payment details...';

  try {
    const res = await fetch(`${API_BASE}/client/payment/submit`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        paymentRequestId,
        amount,
        paymentMethod,
        transactionId,
        walletId: paymentMethod === 'wallet' ? walletId : null,
        bankId: paymentMethod === 'bank' ? bankId : null
      })
    });

    const data = await res.json();

    if (data.success) {
      showToast('Payment details submitted successfully! Awaiting vendor approval.', 'success');
      document.getElementById('assignedStatusBadge').textContent = 'AWAITING_VERIFICATION';
      document.getElementById('assignedStatusBadge').style.background = '#eab308';
      document.getElementById('submitExternalTxId').value = '';
      fetchClientPaymentRequests();
      fetchClientBalance();
    } else {
      showToast(data.message || 'Payment submission failed', 'error');
    }
  } catch (err) {
    console.error('Payment Submission Error:', err);
    showToast('Server or network error submitting payment details', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '✅ Submit Payment for Vendor Verification';
  }
}

// =============================================================================
// CLIENT BALANCE & TRANSACTIONS
// =============================================================================
async function fetchClientBalance() {
  try {
    const res = await fetch(`${API_BASE}/client/balance`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (data.success && data.data) {
      const balanceElem = document.getElementById('clientPlatformBalance');
      const countElem = document.getElementById('clientTotalTxCount');

      if (balanceElem) {
        balanceElem.textContent = `₹ ${(data.data.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      }

      if (countElem && data.data.ledger?.pagination) {
        countElem.textContent = `${data.data.ledger.pagination.total || 0} Records`;
      }
    }
  } catch (err) {
    console.error('Fetch Balance Error:', err);
  }
}

async function fetchClientPaymentRequests() {
  const tbody = document.getElementById('clientRequestsTbody');
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/client/payment-requests`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (data.success && data.data && data.data.transactions?.length > 0) {
      tbody.innerHTML = data.data.transactions
        .map((tx) => {
          const method = (tx.paymentMethod || 'wallet').toUpperCase();
          const amount = (tx.requestedAmount || tx.allocatedAmount || 0).toLocaleString('en-IN');
          const dt = tx.createdAt ? new Date(tx.createdAt).toLocaleString() : '--';
          let detailsText = '--';

          if (tx.paymentDetails?.type === 'wallet') {
            detailsText = `💳 ${tx.paymentDetails.walletName || 'UPI'}: ${tx.paymentDetails.walletId || ''}`;
          } else if (tx.paymentDetails?.type === 'bank') {
            detailsText = `🏦 ${tx.paymentDetails.bankName || 'Bank'}: A/C ${tx.paymentDetails.accountNumber || ''} (${tx.paymentDetails.ifscCode || ''})`;
          }

          let badgeClass = 'badge-info';
          if (tx.status === 'APPROVED' || tx.status === 'COMPLETED') badgeClass = 'badge-success';
          else if (tx.status === 'REJECTED') badgeClass = 'badge-danger';
          else if (tx.status === 'AWAITING_VENDOR_VERIFICATION') badgeClass = 'badge-warning';

          return `
            <tr>
              <td><strong style="font-family: monospace; font-size: 0.85rem;">${tx.transactionId}</strong></td>
              <td style="font-weight: 800; color: #059669;">₹${amount}</td>
              <td><span class="badge ${tx.paymentMethod === 'bank' ? 'badge-primary' : 'badge-info'}">${method}</span></td>
              <td style="font-size: 0.85rem; color: #334155; max-width: 250px;">${detailsText}</td>
              <td><span class="badge ${badgeClass}">${tx.status || 'ASSIGNED'}</span></td>
              <td style="font-size: 0.8rem; color: #64748b;">${dt}</td>
            </tr>
          `;
        })
        .join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No payment requests created yet.</td></tr>';
    }
  } catch (err) {
    console.error('Fetch Requests Error:', err);
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


