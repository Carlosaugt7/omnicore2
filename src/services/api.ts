import { supabase } from '@/integrations/supabase/client';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

/**
 * Makes an authenticated request to the Node.js backend.
 * Attaches the Supabase JWT so the backend can identify the user.
 */
async function backendFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Não autenticado');

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) throw new Error('Sessão expirada. Faça login novamente.');
  return res;
}

export const api = {
  // ── Evolution API ──────────────────────────────────────────

  async evolutionPing(evolutionUrl: string, evolutionApiKey: string) {
    const params = new URLSearchParams({ evolutionUrl, evolutionApiKey });
    const res = await backendFetch(`/api/evolution/ping?${params}`);
    return res.json();
  },

  async evolutionSetup(payload: {
    userId: string;
    evolutionUrl: string;
    evolutionApiKey: string;
    n8nWebhookUrl?: string;
  }) {
    const res = await backendFetch('/api/evolution/setup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  async evolutionConnectQr(userId: string) {
    const res = await backendFetch(`/api/evolution/connect-qr?userId=${userId}`);
    return res.json();
  },

  async evolutionStatus(userId: string) {
    const res = await backendFetch(`/api/evolution/status?userId=${userId}`);
    return res.json();
  },

  async evolutionDisconnect(userId: string) {
    const res = await backendFetch('/api/evolution/disconnect', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    return res.json();
  },

  // ── WhatsApp ───────────────────────────────────────────────

  async whatsappSendSingle(payload: {
    userId: string;
    clientId: string;
    phone: string;
    templateType: string;
  }) {
    const res = await backendFetch('/api/whatsapp/send-single', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  async whatsappSendBroadcast(payload: {
    clientId: string;
    phone: string;
    messageText: string;
    imageUrl?: string;
  }) {
    const res = await backendFetch('/api/whatsapp/send-broadcast', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  // ── Scheduler ─────────────────────────────────────────────

  async schedulerRunNow(userId: string) {
    const res = await backendFetch('/api/scheduler/run-now', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    return res.json();
  },
};
