const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { renewClientInPanel } = require('../services/panelService');
const { encryptSecret } = require('../lib/crypto');
const { logger } = require('../lib/logger');

// ─────────────────────────────────────────────────────────────
// POST /api/panels/encrypt-password
// Criptografa a senha do painel com AES-256-GCM antes de salvar no banco
// Body: { password }
// ─────────────────────────────────────────────────────────────
router.post('/encrypt-password', requireAuth, (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    return res.json({ success: true, encrypted: null });
  }
  try {
    const encrypted = encryptSecret(password);
    return res.json({ success: true, encrypted });
  } catch (err) {
    logger.error({ err: err.message }, 'panels/encrypt-password: erro');
    return res.status(500).json({ success: false, error: 'Erro ao criptografar senha.' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/panels/renew
// Efetua renovação automatizada no painel do servidor
// Body: { userId, clientId, serverName }
// ─────────────────────────────────────────────────────────────
router.post('/renew', requireAuth, async (req, res) => {
  const userId = req.userId;
  const { clientId, serverName } = req.body;

  if (!clientId) {
    return res.status(400).json({ success: false, error: 'clientId é obrigatório.' });
  }

  logger.info({ userId, clientId, serverName }, 'panels route: acionando renovação');

  try {
    const result = await renewClientInPanel({ userId, clientId, serverName });
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err) {
    logger.error({ err: err.message }, 'panels route: erro inesperado');
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
