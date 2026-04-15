require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const rateLimit = require('express-rate-limit');

const evolutionRoutes = require('./routes/evolution');
const whatsappRoutes = require('./routes/whatsapp');
const webhookRoutes = require('./routes/webhooks');
const schedulerRoutes = require('./routes/scheduler');
const { runJobForAllUsers } = require('./services/schedulerService');

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
// Cron scheduler — runs every day at 09:00
// ─────────────────────────────────────────────────────────────
function initScheduler() {
  // "0 9 * * *" = every day at 09:00 server time
  cron.schedule('0 9 * * *', async () => {
    console.log('[cron] Daily reminder job started at', new Date().toISOString());
    try {
      const results = await runJobForAllUsers();
      console.log('[cron] Job completed. Results:', JSON.stringify(results, null, 2));
    } catch (err) {
      console.error('[cron] Job failed:', err.message);
    }
  });

  console.log('[scheduler] Cron job registered — runs daily at 09:00');
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
