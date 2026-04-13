import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.49.4/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    // Get user settings
    const { data: settings, error: settingsError } = await supabase
      .from("settings")
      .select("evolution_api_url, evolution_api_key, evolution_instance")
      .eq("user_id", userId)
      .maybeSingle();

    if (settingsError || !settings) {
      return new Response(
        JSON.stringify({ error: "Configurações não encontradas. Salve suas credenciais primeiro." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { evolution_api_url, evolution_api_key, evolution_instance } = settings;
    if (!evolution_api_url || !evolution_api_key || !evolution_instance) {
      return new Response(
        JSON.stringify({ error: "Preencha URL, API Key e Nome da Instância nas configurações." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create instance on Evolution API
    const baseUrl = evolution_api_url.replace(/\/+$/, "");
    const createRes = await fetch(`${baseUrl}/instance/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evolution_api_key,
      },
      body: JSON.stringify({
        instanceName: evolution_instance,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
      }),
    });

    const createData = await createRes.json();

    if (!createRes.ok) {
      // If instance already exists, try to get QR code instead
      if (createRes.status === 403 || createRes.status === 409 || 
          (createData?.message && createData.message.includes("already"))) {
        // Instance exists, fetch QR code
        const qrRes = await fetch(`${baseUrl}/instance/connect/${evolution_instance}`, {
          method: "GET",
          headers: { apikey: evolution_api_key },
        });
        const qrData = await qrRes.json();

        return new Response(
          JSON.stringify({
            status: "existing",
            qrcode: qrData?.base64 || qrData?.qrcode?.base64 || null,
            pairingCode: qrData?.pairingCode || null,
            message: "Instância já existe. Escaneie o QR Code.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Erro na Evolution API: ${createData?.message || createRes.status}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        status: "created",
        qrcode: createData?.qrcode?.base64 || createData?.base64 || null,
        pairingCode: createData?.pairingCode || null,
        instance: createData?.instance || null,
        message: "Instância criada! Escaneie o QR Code.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("evolution-create-instance error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno ao criar instância.", fallback: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});