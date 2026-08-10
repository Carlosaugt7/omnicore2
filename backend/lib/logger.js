const pino = require('pino');

/**
 * Logger estruturado com Pino.
 * Em produção, emite JSON para agregação (CloudWatch, Datadog, etc.).
 * Em desenvolvimento, usa pino-pretty para saída legível.
 */
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
  // Campos padrão em todos os logs
  base: {
    service: 'omnicore-backend',
  },
  redact: {
    paths: ['password', 'api_key', 'evolution_api_key', 'token', 'secret'],
    censor: '[REDACTED]',
  },
});

module.exports = { logger };
