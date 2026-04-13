import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    // Get user settings
    const { data: settings, error: settingsError } = await supabase
      .from("settings")
      .select("evolution_api_url, evolution_api_key, evolution_instance")
      .eq("user_id", userId)
      .maybeSingle();

    if (settingsError || !settings) {
      return json({ error: "Configurações não encontradas. Salve suas credenciais primeiro." }, 400);
    }

    const { evolution_api_url, evolution_api_key } = settings;
    if (!evolution_api_url || !evolution_api_key) {
      return json({ error: "Preencha URL e API Key nas configurações." }, 400);
    }

    // Auto-generate instance name based on user ID
    const instanceName = settings.evolution_instance || `omnicore_${userId.replace(/-/g, "").substring(0, 16)}`;
    const baseUrl = evolution_api_url.replace(/\/+$/, "");

    // Step 1: Try to create instance
    const createRes = await fetch(`${baseUrl}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evolution_api_key },
      body: JSON.stringify({
        instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
      }),
    });
    const createData = await createRes.json();

    let qrcode: string | null = null;
    let pairingCode: string | null = null;
    let status = "created";

    if (!createRes.ok) {
      // Instance already exists — fetch QR code
      if (
        createRes.status === 403 ||
        createRes.status === 409 ||
        (createData?.message && (createData.message.includes("already") || createData.message.includes("exists")))
      ) {
        status = "existing";
        const qrRes = await fetch(`${baseUrl}/instance/connect/${instanceName}`, {
          headers: { apikey: evolution_api_key },
        });
        const qrData = await qrRes.json();
        qrcode = qrData?.base64 || qrData?.qrcode?.base64 || null;
        pairingCode = qrData?.pairingCode || null;
      } else {
        return json({ error: `Erro na Evolution API: ${createData?.message || createRes.status}` });
      }
    } else {
      qrcode = createData?.qrcode?.base64 || createData?.base64 || null;
      pairingCode = createData?.pairingCode || null;
    }

    // Step 2: Save instance name back to settings if it was auto-generated
    if (!settings.evolution_instance || settings.evolution_instance !== instanceName) {
      await supabase
        .from("settings")
        .update({ evolution_instance: instanceName })
        .eq("user_id", userId);
    }

    // Step 3: Configure webhook automatically
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
    try {
      await fetch(`${baseUrl}/webhook/set/${instanceName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evolution_api_key },
        body: JSON.stringify({
          url: webhookUrl,
          webhook_by_events: false,
          webhook_base64: false,
          events: [
            "CONNECTION_UPDATE",
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE",
            "QRCODE_UPDATED",
          ],
        }),
      });
      console.log(`Webhook configured for ${instanceName} -> ${webhookUrl}`);
    } catch (webhookErr) {
      console.error("Failed to set webhook:", webhookErr);
    }

    return json({
      status,
      instanceName,
      qrcode,
      pairingCode,
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