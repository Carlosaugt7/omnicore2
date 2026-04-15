const express = require('express');
const router = express.Router();
const { runJobForUser } = require('../services/schedulerService');

// ─────────────────────────────────────────────────────────────
// POST /api/scheduler/run-now
// Manually triggers the reminder job for a specific user
// Body: { userId }
// ─────────────────────────────────────────────────────────────
router.post('/run-now', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, error: 'userId is required' });
  }

  console.log(`[scheduler/run-now] Manual trigger for user: ${userId}`);

  try {
    const summary = await runJobForUser(userId);
    return res.json({ success: true, summary });
  } catch (err) {
    console.error('[scheduler/run-now] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
