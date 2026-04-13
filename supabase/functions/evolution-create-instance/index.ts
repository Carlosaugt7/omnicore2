import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── Helper: configure N8N native integration on Evolution API ───
async function setupN8NIntegration(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  n8nWebhookUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Enable native N8N integration (Evolution API v2.2+)
    const n8nRes = await fetch(`${baseUrl}/n8n/set/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({
        enabled: true,
        url: n8nWebhookUrl,
        rejectCall: false,
        msgCall: "",
        groupsIgnore: false,
        alwaysOnline: false,
        readMessages: false,
        readStatus: false,
        syncFullHistory: false,
      }),
    });
    if (!n8nRes.ok) {
      const txt = await n8nRes.text();
      console.warn(`N8N native set failed (${n8nRes.status}): ${txt}`);
      // non-fatal – fall through to webhook
    } else {
      await n8nRes.text(); // consume
      console.log(`N8N native integration enabled for ${instanceName}`);
    }

    // 2. Configure webhook as fallback / additional events
    const whRes = await fetch(`${baseUrl}/webhook/set/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({
        url: n8nWebhookUrl,
        byEvents: false,
        base64: false,
        headers: {},
        events: [
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE",
          "CONNECTION_UPDATE",
          "SEND_MESSAGE",
        ],
      }),
    });
    if (!whRes.ok) {
      const txt = await whRes.text();
      console.warn(`Webhook set for N8N failed (${whRes.status}): ${txt}`);
    } else {
      await whRes.text();
      console.log(`Webhook → N8N configured for ${instanceName}`);
    }

    return { success: true };
  } catch (err) {
    console.error("setupN8NIntegration error:", err);
    return { success: false, error: String(err) };
  }
}

// ── Main handler ────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer "))
      return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user)
      return json({ error: "Unauthorized" }, 401);
    const userId = user.id;

    // ── Read settings ───────────────────────────────────────────
    const { data: settings, error: settingsError } = await supabase
      .from("settings")
      .select(
        "evolution_api_url, evolution_api_key, evolution_instance, n8n_webhook_url"
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (settingsError || !settings)
      return json(
        { error: "Configurações não encontradas. Salve suas credenciais." },
        400
      );

    const { evolution_api_url, evolution_api_key } = settings;
    if (!evolution_api_url || !evolution_api_key)
      return json({ error: "Preencha URL e API Key nas configurações." }, 400);

    const instanceName =
      settings.evolution_instance ||
      `omnicore_${userId.replace(/-/g, "").substring(0, 8)}`;
    const baseUrl = evolution_api_url.replace(/\/+$/, "");

    // ── Step 1: Create instance ─────────────────────────────────
    const createRes = await fetch(`${baseUrl}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evolution_api_key },
      body: JSON.stringify({
        instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
        rejectCall: true,
        msgCall: "Não atendemos chamadas. Envie uma mensagem.",
        groupsIgnore: false,
      }),
    });
    const createData = await createRes.json();

    let qrcode: string | null = null;
    let pairingCode: string | null = null;
    let status = "created";
    let alreadyExists = false;

    if (!createRes.ok) {
      const msg = createData?.message || "";
      if (
        createRes.status === 403 ||
        createRes.status === 409 ||
        msg.includes("already") ||
        msg.includes("exists")
      ) {
        status = "existing";
        alreadyExists = true;
      } else {
        return json({
          error: `Erro na Evolution API: ${msg || createRes.status}`,
        });
      }
    }

    // ── Step 2: Fetch QR Code ───────────────────────────────────
    if (status === "created") {
      qrcode = createData?.qrcode?.base64 || createData?.base64 || null;
      pairingCode = createData?.pairingCode || null;
    }
    if (!qrcode) {
      const qrRes = await fetch(
        `${baseUrl}/instance/connect/${instanceName}`,
        { headers: { apikey: evolution_api_key } }
      );
      const qrData = await qrRes.json();
      qrcode = qrData?.base64 || qrData?.qrcode?.base64 || null;
      pairingCode = qrData?.pairingCode || pairingCode || null;
    }

    // ── Step 3: Configure N8N if provided ───────────────────────
    const n8nWebhookUrl = (settings as Record<string, unknown>)
      .n8n_webhook_url as string | null;
    let n8nConfigured = false;
    if (n8nWebhookUrl) {
      const n8nResult = await setupN8NIntegration(
        baseUrl,
        evolution_api_key,
        instanceName,
        n8nWebhookUrl
      );
      n8nConfigured = n8nResult.success;
    }

    // ── Step 4: Also set OmniCore webhook (our own edge function) ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const ownWebhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
    // Only set if N8N webhook is different or not set
    if (!n8nWebhookUrl || n8nWebhookUrl !== ownWebhookUrl) {
      try {
        // If N8N is already using the webhook endpoint, we add ours via
        // the Evolution API's additional webhook feature or just log.
        // For simplicity, if N8N is set, we skip our own webhook to avoid
        // overwriting. N8N will handle forwarding.
        if (!n8nWebhookUrl) {
          await fetch(`${baseUrl}/webhook/set/${instanceName}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: evolution_api_key,
            },
            body: JSON.stringify({
              url: ownWebhookUrl,
              byEvents: false,
              base64: false,
              events: [
                "CONNECTION_UPDATE",
                "MESSAGES_UPSERT",
                "MESSAGES_UPDATE",
                "QRCODE_UPDATED",
              ],
            }),
          });
          console.log(
            `OmniCore webhook configured for ${instanceName} -> ${ownWebhookUrl}`
          );
        }
      } catch (webhookErr) {
        console.error("Failed to set OmniCore webhook:", webhookErr);
      }
    }

    // ── Step 5: Save to settings ────────────────────────────────
    await supabase
      .from("settings")
      .update({
        evolution_instance: instanceName,
        n8n_configured: n8nConfigured,
      })
      .eq("user_id", userId);

    return json({
      status,
      instanceName,
      qrcode,
      pairingCode,
      alreadyExists,
      n8nConfigured,
      webhookConfigured: true,
      message:
        status === "created"
          ? "Instância criada! Escaneie o QR Code."
          : "Instância encontrada. Escaneie o QR Code.",
    });
  } catch (error) {
    console.error("evolution-create-instance error:", error);
    return json({ error: "Erro interno ao criar instância.", fallback: true });
  }
});