require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cron = require('node-cron');
const rateLimit = require('express-rate-limit');
const { logger } = require('./lib/logger');

const evolutionRoutes = require('./routes/evolution');
const whatsappRoutes = require('./routes/whatsapp');
const webhookRoutes = require('./routes/webhooks');
const schedulerRoutes = require('./routes/scheduler');

// ─────────────────────────────────────────────────────────────
// Validate required environment variables
// ─────────────────────────────────────────────────────────────
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'FRONTEND_URL'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    logger.fatal(`[startup] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL;

// Origens permitidas — produção + dev local
const ALLOWED_ORIGINS = [
  FRONTEND_URL,
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://10.10.1.28:8080',
  ...(process.env.EXTRA_CORS_ORIGINS ? process.env.EXTRA_CORS_ORIGINS.split(',') : []),
].filter(Boolean);

// ─────────────────────────────────────────────────────────────
// Express app setup
// ─────────────────────────────────────────────────────────────
const app = express();

// ── Security headers (Helmet) ─────────────────────────────────
app.use(helmet());

// CSP — Content Security Policy
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", ...ALLOWED_ORIGINS],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  })
);

// CORS — permite apenas origens autorizadas
app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ─────────────────────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────────────────────

// General API: 100 requests per minute per IP
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// WhatsApp send: 20 sends per minute per IP (prevent abuse)
const whatsappLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'WhatsApp rate limit exceeded. Please wait before sending more messages.' },
});

app.use('/api/', generalLimiter);
app.use('/api/whatsapp/', whatsappLimiter);

// ─────────────────────────────────────────────────────────────
// Request logger (dev-friendly)
// ─────────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.info({ method: req.method, path: req.path }, 'request');
  next();
});

// ─────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'OmniCore Backend',
  });
});

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────
app.use('/api/evolution', evolutionRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/scheduler', schedulerRoutes);

// ─────────────────────────────────────────────────────────────
// 404 handler
// ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─────────────────────────────────────────────────────────────
// Global error handler
// ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error({ err }, 'unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

// ─────────────────────────────────────────────────────────────
// Cron scheduler — runs every minute, checks each user's
// reminder_time against their saved reminder_timezone
// ─────────────────────────────────────────────────────────────
const { supabase } = require('./lib/supabase');
const { runJobForUser } = require('./services/schedulerService');

/**
 * Returns the current HH:MM in a given IANA timezone.
 * @param {string} tz - e.g. 'America/Manaus'
 */
/**
 * Returns the current HH:MM in a given IANA timezone.
 * @param {string} tz - e.g. 'America/Manaus'
 */
function currentTimeInTZ(tz) {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    // This returns "HH:MM"
    return formatter.format(new Date());
  } catch (err) {
    // Fallback if TZ is invalid
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return formatter.format(new Date());
  }
}

function initScheduler() {
  // Runs every minute — each user has their own timezone + reminder_time
  cron.schedule('* * * * *', async () => {

    // Fetch all connected users with their timezone setting
    const { data: usersToCheck, error } = await supabase
      .from('settings')
      .select('user_id, reminder_time, reminder_timezone')
      .eq('evolution_status', 'open')
      .not('reminder_time', 'is', null);

    if (error) {
      logger.error({ error }, 'cron: error fetching users');
      return;
    }

    if (!usersToCheck || usersToCheck.length === 0) return;

    // For each user, check if their local time matches their reminder_time
    const toRun = usersToCheck.filter(row => {
      const tz = row.reminder_timezone || 'America/Sao_Paulo';
      const nowHHMM = currentTimeInTZ(tz);
      return nowHHMM === row.reminder_time;
    });

    if (toRun.length === 0) return;

    logger.info({ count: toRun.length }, 'cron: triggering users');

    for (const row of toRun) {
      try {
        const summary = await runJobForUser(row.user_id);
        logger.info({ userId: row.user_id, timezone: row.reminder_timezone, time: row.reminder_time, summary }, 'cron: job completed');
      } catch (err) {
        logger.error({ userId: row.user_id, err }, 'cron: user job failed');
      }
    }
  });

  logger.info('scheduler: cron registered (checks every minute per user timezone)');
}

// ─────────────────────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info({ port: PORT, frontendUrl: FRONTEND_URL }, 'OmniCore Backend started');
  initScheduler();
});

module.exports = app;
