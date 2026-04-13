import { supabase } from '@/integrations/supabase/client';

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const SUPABASE_URL = `https://${PROJECT_ID}.supabase.co`;

export const api = {
  async invokeFunction(functionName: string, body?: unknown) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Não autenticado');

    const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok && res.status === 401) throw new Error('Sessão expirada. Faça login novamente.');
    return res.json();
  },
};
