const express = require('express');
const router = express.Router();

const {
  registerClient,
  loginClient
} = require('../controllers/clientAuthController');

// =============================================================================
// CLIENT AUTHENTICATION ROUTES
// =============================================================================
// POST /api/auth/client/register
router.post('/client/register', registerClient);

// POST /api/auth/client/login
router.post('/client/login', loginClient);

module.exports = router;
