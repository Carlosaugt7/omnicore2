const { supabase } = require('../lib/supabase');
const { logger } = require('../lib/logger');

/**
 * Middleware que restringe acesso apenas aos admins master.
 * Emails autorizados: carlosaugt7@gmail.com e andressanramos@hotmail.com
 */
const MASTER_EMAILS = ['carlosaugt7@gmail.com', 'andressanramos@hotmail.com'];

async function requireMaster(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido.' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }

    if (!MASTER_EMAILS.includes(user.email)) {
      logger.warn({ email: user.email }, 'master middleware: acesso negado');
      return res.status(403).json({ error: 'Acesso restrito ao painel master.' });
    }

    req.masterUser = user;
    next();
  } catch (err) {
    logger.error({ err }, 'master middleware: erro');
    return res.status(500).json({ error: 'Erro interno de autenticação.' });
  }
}

module.exports = { requireMaster };
