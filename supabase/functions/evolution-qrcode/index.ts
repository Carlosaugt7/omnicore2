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

    const { data: settings } = await supabase
      .from("settings")
      .select("evolution_api_url, evolution_api_key, evolution_instance")
      .eq("user_id", userId)
      .maybeSingle();

    if (!settings?.evolution_api_url || !settings?.evolution_api_key || !settings?.evolution_instance) {
      return new Response(
        JSON.stringify({ error: "Credenciais não configuradas." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = settings.evolution_api_url.replace(/\/+$/, "");
    const res = await fetch(
      `${baseUrl}/instance/connect/${settings.evolution_instance}`,
      { headers: { apikey: settings.evolution_api_key } }
    );

    const data = await res.json();

    return new Response(
      JSON.stringify({
        qrcode: data?.base64 || data?.qrcode?.base64 || null,
        pairingCode: data?.pairingCode || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("evolution-qrcode error:", error);
    return new Response(
      JSON.stringify({ error: "Erro ao obter QR Code.", fallback: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});