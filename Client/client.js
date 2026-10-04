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

  // Load payment requests, accounts & initialize UI
  updateMethodUI();
  fetchClientBalance();
  fetchClientPaymentRequests();
  fetchClientBankAccounts();
  fetchClientWallets();
}

// =============================================================================
// CLIENT TAB SWITCHING
// =============================================================================
function switchClientTab(tabId, event) {
  document.querySelectorAll('.client-tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tabs .tab-btn').forEach(el => el.classList.remove('active'));

  const targetEl = document.getElementById(tabId);
  if (targetEl) targetEl.classList.remove('hidden');
  if (event && event.target) event.target.classList.add('active');

  if (tabId === 'paymentTab') {
    fetchClientBalance();
  } else if (tabId === 'accountsTab') {
    fetchClientBankAccounts();
    fetchClientWallets();
  } else if (tabId === 'historyTab') {
    fetchClientPaymentRequests();
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

  // Commission Details Card right below Wallet / Bank Info
  const commRate = data.commissionPercentage !== undefined && data.commissionPercentage !== null ? data.commissionPercentage : (details?.commissionPercentage || 0);
  const tierName = data.tierAtTransaction || details?.tierAtTransaction || '';
  const commAmount = data.commissionAmount !== undefined && data.commissionAmount !== null
    ? data.commissionAmount
    : Number(((amount * commRate) / 100).toFixed(2));

  const commissionHtml = `
    <div style="margin-top: 14px; padding: 12px 16px; background: linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%); border: 1.5px solid #d8b4fe; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 1.5rem;">🏷️</span>
        <div>
          <div style="font-size: 0.75rem; font-weight: 700; color: #7e22ce; text-transform: uppercase; letter-spacing: 0.05em;">Vendor Commission Rate</div>
          <div style="font-size: 1.15rem; font-weight: 800; color: #6b21a8;">
            ${commRate}% <span class="badge" style="font-size: 0.75rem; margin-left: 4px; background: #9333ea; color: #fff;">${tierName || 'Standard Tier'}</span>
          </div>
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 0.75rem; color: #9333ea; font-weight: 600;">Commission Amount</div>
        <div style="font-size: 1.15rem; font-weight: 800; color: #7e22ce;">₹${commAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
      </div>
    </div>
  `;

  if (!details) {
    container.innerHTML = `<p class="text-muted">No specific account details attached.</p>${commissionHtml}`;
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
      ${commissionHtml}
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
        ${commissionHtml}
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

          let commText = '';
          if (tx.commissionPercentage !== undefined && tx.commissionPercentage !== null) {
            commText = `<div style="font-size: 0.75rem; color: #7e22ce; font-weight: 700; margin-top: 3px;">🏷️ Comm: ${tx.commissionPercentage}% ${tx.tierAtTransaction ? `(${tx.tierAtTransaction})` : ''}</div>`;
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
              <td style="font-size: 0.85rem; color: #334155; max-width: 250px;">
                ${detailsText}
                ${commText}
              </td>
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

// =============================================================================
// 7. CLIENT BANK ACCOUNTS MANAGEMENT
// =============================================================================
let cachedClientBankAccounts = [];

async function fetchClientBankAccounts() {
  const container = document.getElementById('clientBankAccountsList');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/client/bank-accounts`, {
      headers: getAuthHeaders()
    });
    const data = await res.json();

    if (data.success && data.data) {
      cachedClientBankAccounts = data.data.bankAccounts || [];
      renderClientBankAccounts();
      updateAccountsSummaryBadge();
    } else {
      container.innerHTML = `<p class="empty-state" style="color: #dc2626;">${data.message || 'Failed to load bank accounts'}</p>`;
    }
  } catch (err) {
    console.error('fetchClientBankAccounts error:', err);
    if (container) container.innerHTML = '<p class="empty-state" style="color: #dc2626;">Network error loading bank accounts</p>';
  }
}

function renderClientBankAccounts() {
  const container = document.getElementById('clientBankAccountsList');
  if (!container) return;

  if (cachedClientBankAccounts.length > 0) {
    container.innerHTML = cachedClientBankAccounts.map(b => {
      const defaultBadge = b.isDefault 
        ? '<span class="badge badge-success" style="font-size: 0.72rem; padding: 2px 6px;">⭐ Primary / Default</span>' 
        : '';
      const activeBadge = b.isActive 
        ? '<span class="badge badge-approved" style="font-size: 0.72rem;">Active</span>' 
        : '<span class="badge badge-rejected" style="font-size: 0.72rem;">Inactive</span>';

      return `
        <div class="item-card" style="display: flex; flex-direction: column; gap: 8px; border-left: 4px solid ${b.isDefault ? '#10b981' : '#6366f1'}; padding: 14px; background: #ffffff; border-radius: 8px; border: 1px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <div>
              <div style="font-size: 1.05rem; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 6px;">
                <span>🏦 ${b.bankName}</span>
                ${defaultBadge}
                ${activeBadge}
              </div>
              <div style="font-size: 0.88rem; color: #475569; margin-top: 4px;">
                <strong>A/C No:</strong> <code style="font-size: 0.95rem; font-weight: 700; color: #4338ca;">${b.accountNumber}</code>
              </div>
            </div>
            <div style="display: flex; gap: 4px;">
              ${!b.isDefault ? `<button class="btn btn-sm btn-secondary" onclick="setDefaultClientBankAccount('${b._id}')" title="Set as Primary Default">⭐</button>` : ''}
              <button class="btn btn-sm btn-secondary" onclick="openEditClientBankModal('${b._id}')" title="Edit Bank Details">✏️</button>
              <button class="btn btn-sm btn-danger" onclick="deleteClientBankAccount('${b._id}')" title="Delete Bank Account">🗑️</button>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.82rem; color: #64748b; background: #f8fafc; padding: 8px 10px; border-radius: 6px;">
            <div><strong>IFSC Code:</strong> <code>${b.ifscCode}</code></div>
            <div><strong>Account Holder:</strong> ${b.accountHolderName}</div>
            ${b.branchName ? `<div style="grid-column: span 2;"><strong>Branch:</strong> ${b.branchName}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } else {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px;">
        <p class="text-muted" style="margin-bottom: 10px;">No bank accounts added yet.</p>
        <button class="btn btn-sm btn-primary" onclick="openAddClientBankModal()">➕ Add Your First Bank Account</button>
      </div>
    `;
  }
}

function openAddClientBankModal() {
  document.getElementById('bankModalId').value = '';
  document.getElementById('clientBankModalTitle').textContent = '🏦 Add New Bank Account';
  document.getElementById('bankFormBankName').value = '';
  document.getElementById('bankFormAccountNumber').value = '';
  document.getElementById('bankFormIfscCode').value = '';
  document.getElementById('bankFormHolderName').value = '';
  document.getElementById('bankFormBranchName').value = '';
  document.getElementById('bankFormIsDefault').checked = cachedClientBankAccounts.length === 0;

  document.getElementById('clientBankModal').classList.remove('hidden');
}

function openEditClientBankModal(id) {
  const b = cachedClientBankAccounts.find(x => x._id === id);
  if (!b) return;

  document.getElementById('bankModalId').value = b._id;
  document.getElementById('clientBankModalTitle').textContent = `✏️ Edit Bank Account: ${b.bankName}`;
  document.getElementById('bankFormBankName').value = b.bankName || '';
  document.getElementById('bankFormAccountNumber').value = b.accountNumber || '';
  document.getElementById('bankFormIfscCode').value = b.ifscCode || '';
  document.getElementById('bankFormHolderName').value = b.accountHolderName || '';
  document.getElementById('bankFormBranchName').value = b.branchName || '';
  document.getElementById('bankFormIsDefault').checked = Boolean(b.isDefault);

  document.getElementById('clientBankModal').classList.remove('hidden');
}

function closeClientBankModal() {
  document.getElementById('clientBankModal').classList.add('hidden');
}

async function handleSaveClientBankAccount(event) {
  event.preventDefault();

  const id = document.getElementById('bankModalId').value;
  const bankName = document.getElementById('bankFormBankName').value.trim();
  const accountNumber = document.getElementById('bankFormAccountNumber').value.trim();
  const ifscCode = document.getElementById('bankFormIfscCode').value.trim().toUpperCase();
  const accountHolderName = document.getElementById('bankFormHolderName').value.trim();
  const branchName = document.getElementById('bankFormBranchName').value.trim();
  const isDefault = document.getElementById('bankFormIsDefault').checked;
  const saveBtn = document.getElementById('btnSaveClientBank');

  if (!bankName || !accountNumber || !ifscCode || !accountHolderName) {
    showToast('Please fill all required bank account fields', 'error');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = '⏳ Saving...';

  try {
    const url = id ? `${API_BASE}/client/bank-accounts/${id}` : `${API_BASE}/client/bank-accounts`;
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify({
        bankName,
        accountNumber,
        ifscCode,
        accountHolderName,
        branchName,
        isDefault
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Bank account ${id ? 'updated' : 'added'} successfully!`, 'success');
      closeClientBankModal();
      fetchClientBankAccounts();
    } else {
      showToast(data.message || 'Failed to save bank account', 'error');
    }
  } catch (err) {
    console.error('handleSaveClientBankAccount error:', err);
    showToast('Network error saving bank account', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Save Bank Account';
  }
}

async function setDefaultClientBankAccount(id) {
  try {
    const res = await fetch(`${API_BASE}/client/bank-accounts/${id}/default`, {
      method: 'PATCH',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      showToast('Default bank account updated!', 'success');
      fetchClientBankAccounts();
    } else {
      showToast(data.message || 'Failed to set default', 'error');
    }
  } catch (err) {
    showToast('Network error updating default bank account', 'error');
  }
}

async function deleteClientBankAccount(id) {
  if (!confirm('Are you sure you want to delete this bank account?')) return;

  try {
    const res = await fetch(`${API_BASE}/client/bank-accounts/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      showToast('Bank account deleted successfully', 'success');
      fetchClientBankAccounts();
    } else {
      showToast(data.message || 'Failed to delete bank account', 'error');
    }
  } catch (err) {
    showToast('Network error deleting bank account', 'error');
  }
}

// =============================================================================
// 8. CLIENT WALLETS & QR CODE MANAGEMENT
// =============================================================================
let cachedClientWallets = [];

async function fetchClientWallets() {
  const container = document.getElementById('clientWalletsList');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/client/wallets`, {
      headers: getAuthHeaders()
    });
    const data = await res.json();

    if (data.success && data.data) {
      cachedClientWallets = data.data.wallets || [];
      renderClientWallets();
      updateAccountsSummaryBadge();
    } else {
      container.innerHTML = `<p class="empty-state" style="color: #dc2626;">${data.message || 'Failed to load wallets'}</p>`;
    }
  } catch (err) {
    console.error('fetchClientWallets error:', err);
    if (container) container.innerHTML = '<p class="empty-state" style="color: #dc2626;">Network error loading wallets</p>';
  }
}

function renderClientWallets() {
  const container = document.getElementById('clientWalletsList');
  if (!container) return;

  if (cachedClientWallets.length > 0) {
    container.innerHTML = cachedClientWallets.map(w => {
      const defaultBadge = w.isDefault 
        ? '<span class="badge badge-success" style="font-size: 0.72rem; padding: 2px 6px;">⭐ Primary / Default</span>' 
        : '';
      const activeBadge = w.isActive 
        ? '<span class="badge badge-approved" style="font-size: 0.72rem;">Active</span>' 
        : '<span class="badge badge-rejected" style="font-size: 0.72rem;">Inactive</span>';

      const qrThumbnail = w.qrCode
        ? `
          <div style="cursor: pointer; position: relative;" onclick="openClientQrViewerModal('${w.qrCode}', '${w.walletName}', '${w.walletId}')" title="Click to enlarge QR">
            <img src="${w.qrCode}" alt="QR" style="width: 58px; height: 58px; object-fit: contain; border: 1px solid #cbd5e1; border-radius: 6px; padding: 2px; background: #fff;" />
            <span style="position: absolute; bottom: 2px; right: 2px; background: rgba(0,0,0,0.6); color: white; font-size: 0.6rem; padding: 1px 3px; border-radius: 3px;">🔍</span>
          </div>
        `
        : `
          <div style="width: 58px; height: 58px; display: flex; align-items: center; justify-content: center; background: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 6px; font-size: 0.65rem; color: #94a3b8; text-align: center; line-height: 1.1;">
            No QR
          </div>
        `;

      return `
        <div class="item-card" style="display: flex; gap: 12px; align-items: center; border-left: 4px solid ${w.isDefault ? '#10b981' : '#0284c7'}; padding: 14px; background: #ffffff; border-radius: 8px; border: 1px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          ${qrThumbnail}

          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
              <div>
                <div style="font-size: 1.05rem; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span>💳 ${w.walletName}</span>
                  ${defaultBadge}
                  ${activeBadge}
                </div>
                <div style="font-size: 0.9rem; color: #475569; margin-top: 4px; word-break: break-all;">
                  <strong>UPI ID:</strong> <code style="font-size: 0.95rem; font-weight: 700; color: #4338ca;">${w.walletId}</code>
                </div>
              </div>

              <div style="display: flex; gap: 4px;">
                ${!w.isDefault ? `<button class="btn btn-sm btn-secondary" onclick="setDefaultClientWallet('${w._id}')" title="Set as Primary Default">⭐</button>` : ''}
                <button class="btn btn-sm btn-secondary" onclick="openEditClientWalletModal('${w._id}')" title="Edit Wallet & QR">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="deleteClientWallet('${w._id}')" title="Delete Wallet">🗑️</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } else {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px;">
        <p class="text-muted" style="margin-bottom: 10px;">No wallets or QR codes added yet.</p>
        <button class="btn btn-sm btn-primary" onclick="openAddClientWalletModal()">➕ Add Your First Wallet & QR</button>
      </div>
    `;
  }
}

function updateAccountsSummaryBadge() {
  const elem = document.getElementById('clientTotalAccountsCount');
  if (elem) {
    const bankCount = cachedClientBankAccounts.length;
    const walletCount = cachedClientWallets.length;
    elem.textContent = `${bankCount} Banks / ${walletCount} Wallets`;
  }
}

function previewWalletQrImage(event) {
  const file = event.target.files && event.target.files[0];
  const box = document.getElementById('walletQrPreviewBox');
  const img = document.getElementById('walletQrPreviewImg');
  const label = document.getElementById('walletQrCurrentLabel');

  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      img.src = e.target.result;
      box.style.display = 'block';
      label.textContent = `Selected: ${file.name} (${Math.round(file.size / 1024)} KB)`;
    };
    reader.readAsDataURL(file);
  }
}

function openAddClientWalletModal() {
  document.getElementById('walletModalId').value = '';
  document.getElementById('clientWalletModalTitle').textContent = '👛 Add New Wallet & QR Code';
  document.getElementById('walletFormName').value = '';
  document.getElementById('walletFormId').value = '';
  document.getElementById('walletFormQrFile').value = '';
  document.getElementById('walletFormIsDefault').checked = cachedClientWallets.length === 0;

  document.getElementById('walletQrPreviewBox').style.display = 'none';
  document.getElementById('walletQrPreviewImg').src = '';
  document.getElementById('walletQrCurrentLabel').textContent = '';

  document.getElementById('clientWalletModal').classList.remove('hidden');
}

function openEditClientWalletModal(id) {
  const w = cachedClientWallets.find(x => x._id === id);
  if (!w) return;

  document.getElementById('walletModalId').value = w._id;
  document.getElementById('clientWalletModalTitle').textContent = `✏️ Edit Wallet: ${w.walletName}`;
  document.getElementById('walletFormName').value = w.walletName || '';
  document.getElementById('walletFormId').value = w.walletId || '';
  document.getElementById('walletFormQrFile').value = '';
  document.getElementById('walletFormIsDefault').checked = Boolean(w.isDefault);

  const box = document.getElementById('walletQrPreviewBox');
  const img = document.getElementById('walletQrPreviewImg');
  const label = document.getElementById('walletQrCurrentLabel');

  if (w.qrCode) {
    img.src = w.qrCode;
    box.style.display = 'block';
    label.innerHTML = `Current QR on file. <a href="${w.qrCode}" target="_blank" style="color: var(--primary); text-decoration: underline;">View Current</a> (Upload new image to replace)`;
  } else {
    box.style.display = 'none';
    img.src = '';
    label.textContent = '';
  }

  document.getElementById('clientWalletModal').classList.remove('hidden');
}

function closeClientWalletModal() {
  document.getElementById('clientWalletModal').classList.add('hidden');
}

async function handleSaveClientWallet(event) {
  event.preventDefault();

  const id = document.getElementById('walletModalId').value;
  const walletName = document.getElementById('walletFormName').value.trim();
  const walletId = document.getElementById('walletFormId').value.trim();
  const isDefault = document.getElementById('walletFormIsDefault').checked;
  const qrFileInput = document.getElementById('walletFormQrFile');
  const saveBtn = document.getElementById('btnSaveClientWallet');

  if (!walletName || !walletId) {
    showToast('Please provide wallet name and UPI / Wallet ID', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('walletName', walletName);
  formData.append('walletId', walletId);
  formData.append('isDefault', isDefault);

  if (qrFileInput.files && qrFileInput.files[0]) {
    formData.append('qrCode', qrFileInput.files[0]);
  }

  saveBtn.disabled = true;
  saveBtn.textContent = '⏳ Uploading & Saving...';

  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const url = id ? `${API_BASE}/client/wallets/${id}` : `${API_BASE}/client/wallets`;
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Wallet ${id ? 'updated' : 'added'} successfully!`, 'success');
      closeClientWalletModal();
      fetchClientWallets();
    } else {
      showToast(data.message || 'Failed to save wallet', 'error');
    }
  } catch (err) {
    console.error('handleSaveClientWallet error:', err);
    showToast('Network error saving wallet', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Save Wallet & QR';
  }
}

async function setDefaultClientWallet(id) {
  try {
    const res = await fetch(`${API_BASE}/client/wallets/${id}/default`, {
      method: 'PATCH',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      showToast('Default wallet updated!', 'success');
      fetchClientWallets();
    } else {
      showToast(data.message || 'Failed to set default wallet', 'error');
    }
  } catch (err) {
    showToast('Network error setting default wallet', 'error');
  }
}

async function deleteClientWallet(id) {
  if (!confirm('Are you sure you want to delete this wallet?')) return;

  try {
    const res = await fetch(`${API_BASE}/client/wallets/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      showToast('Wallet deleted successfully', 'success');
      fetchClientWallets();
    } else {
      showToast(data.message || 'Failed to delete wallet', 'error');
    }
  } catch (err) {
    showToast('Network error deleting wallet', 'error');
  }
}

// QR Viewer Modal
function openClientQrViewerModal(qrUrl, walletName, walletId) {
  document.getElementById('qrViewerImage').src = qrUrl;
  document.getElementById('qrViewerSubtitle').textContent = `${walletName || 'UPI Wallet'} - ${walletId || ''}`;
  document.getElementById('qrViewerDownloadLink').href = qrUrl;
  document.getElementById('clientQrViewerModal').classList.remove('hidden');
}

function closeClientQrViewerModal() {
  document.getElementById('clientQrViewerModal').classList.add('hidden');
}



