require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const rateLimit = require('express-rate-limit');

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
    console.error(`[startup] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL;

// ─────────────────────────────────────────────────────────────
// Express app setup
// ─────────────────────────────────────────────────────────────
const app = express();

// CORS — only allow requests from the frontend
app.use(
  cors({
    origin: FRONTEND_URL,
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
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
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
  console.error('[error]', err.message);
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
      console.error('[cron] Error fetching users:', error.message);
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

    console.log(`[cron] Triggering ${toRun.length} user(s)`);

    for (const row of toRun) {
      try {
        const summary = await runJobForUser(row.user_id);
        console.log(`[cron] User ${row.user_id} (${row.reminder_timezone || 'America/Sao_Paulo'} ${row.reminder_time}):`, summary);
      } catch (err) {
        console.error(`[cron] User ${row.user_id} failed:`, err.message);
      }
    }
  });

  console.log('[scheduler] Cron registered — checks every minute per user timezone');
}

// ─────────────────────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 OmniCore Backend running on port ${PORT}`);
  console.log(`   Frontend URL (CORS): ${FRONTEND_URL}`);
  console.log(`   Health check: http://localhost:${PORT}/health\n`);

  initScheduler();
});

module.exports = app;
