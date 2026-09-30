const express = require('express');
const router = express.Router();
const { allocateTransaction } = require('../controllers/fcfsController');

// POST /api/client/transactions/allocate - FCFS transaction allocation engine
router.post('/transactions/allocate', allocateTransaction);

module.exports = router;
