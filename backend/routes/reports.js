const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { sendWeeklyReportForUser } = require('../services/reportService');
const { logger } = require('../lib/logger');

// ─────────────────────────────────────────────────────────────
// POST /api/reports/send-now
// Dispara manualmente o relatório semanal configurado para o usuário
// Body: { userId }
// ─────────────────────────────────────────────────────────────
router.post('/send-now', requireAuth, async (req, res) => {
  const userId = req.userId;

  logger.info({ userId }, 'reports/send-now: disparo manual solicitado');

  try {
    const result = await sendWeeklyReportForUser(userId, { manual: true });
    return res.json(result);
  } catch (err) {
    logger.error({ userId, err: err.message }, 'reports/send-now: erro');
    return res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
