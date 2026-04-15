# OmniCore Backend

Node.js/Express backend for WhatsApp automation via Evolution API.

## Setup

```bash
cd backend
npm install
cp .env.example .env   # fill in your values
npm start              # or: npm run dev (with nodemon)
```

## Environment Variables

| Variable              | Description                                      |
|-----------------------|--------------------------------------------------|
| `PORT`                | Server port (default: 3001)                      |
| `SUPABASE_URL`        | Your Supabase project URL                        |
| `SUPABASE_SERVICE_KEY`| Supabase service role key (full access)          |
| `FRONTEND_URL`        | Frontend URL for CORS and webhook callbacks      |

## Endpoints

### Group 1 — Instance Setup & QR Code

| Method | Path                          | Description                              |
|--------|-------------------------------|------------------------------------------|
| GET    | `/api/evolution/ping`         | Test Evolution API connectivity          |
| POST   | `/api/evolution/setup`        | Create/configure instance, get QR code   |
| GET    | `/api/evolution/connect-qr`   | Get a fresh QR code                      |
| GET    | `/api/evolution/status`       | Check connection state                   |
| POST   | `/api/evolution/disconnect`   | Logout WhatsApp instance                 |

### Group 2 — Message Sending

| Method | Path                          | Description                              |
|--------|-------------------------------|------------------------------------------|
| POST   | `/api/whatsapp/send-single`   | Send a templated message to one client   |

### Group 3 — Webhooks

| Method | Path                              | Description                          |
|--------|-----------------------------------|--------------------------------------|
| POST   | `/api/webhooks/evolution`         | Receive events from Evolution API    |
| POST   | `/api/webhooks/payment-detected`  | Receive payment events from N8N      |

### Group 4 — Scheduler

| Method | Path                          | Description                              |
|--------|-------------------------------|------------------------------------------|
| POST   | `/api/scheduler/run-now`      | Manually run reminders for a user        |

The cron job runs automatically every day at **09:00** server time.

## File Structure

```
backend/
├── server.js                    # Entry point, Express app, cron init
├── routes/
│   ├── evolution.js             # /api/evolution/*
│   ├── whatsapp.js              # /api/whatsapp/*
│   ├── webhooks.js              # /api/webhooks/*
│   └── scheduler.js             # /api/scheduler/*
├── services/
│   ├── evolutionService.js      # Shared: settings, message building, logging
│   └── schedulerService.js      # Cron job logic
├── lib/
│   ├── supabase.js              # Supabase client (service role)
│   └── evolutionApi.js          # Axios factory + phone/QR helpers
└── .env.example
```
