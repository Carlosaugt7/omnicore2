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

    const { data: settings } = await supabase
      .from("settings")
      .select("evolution_api_url, evolution_api_key, evolution_instance")
      .eq("user_id", userId)
      .maybeSingle();

    if (
      !settings?.evolution_api_url ||
      !settings?.evolution_api_key ||
      !settings?.evolution_instance
    ) {
      return json({
        connected: false,
        state: "not_configured",
        error: "Credenciais não configuradas.",
      });
    }

    const baseUrl = settings.evolution_api_url.replace(/\/+$/, "");
    const instanceName = settings.evolution_instance;

    // Fetch connection state
    const res = await fetch(
      `${baseUrl}/instance/connectionState/${instanceName}`,
      { headers: { apikey: settings.evolution_api_key } }
    );
    const data = await res.json();

    const state =
      data?.instance?.state || data?.state || "unknown";
    const connected = state === "open";

    // Try to get phone / profile name
    let phone = "";
    if (connected) {
      // First try profileName from connectionState response
      phone =
        data?.instance?.profileName ||
        data?.instance?.owner ||
        data?.profileName ||
        "";

      // If empty, fetch from instances list
      if (!phone) {
        try {
          const infoRes = await fetch(
            `${baseUrl}/instance/fetchInstances?instanceName=${instanceName}`,
            { headers: { apikey: settings.evolution_api_key } }
          );
          const infoData = await infoRes.json();
          const inst = Array.isArray(infoData) ? infoData[0] : infoData;
          phone =
            inst?.instance?.owner ||
            inst?.instance?.profileName ||
            inst?.owner ||
            "";
        } catch {
          /* ignore */
        }
      }

      // Save phone and status to settings
      await supabase
        .from("settings")
        .update({
          evolution_phone: phone || null,
          evolution_status: "open",
        })
        .eq("user_id", userId);
    } else {
      // Update disconnected status
      await supabase
        .from("settings")
        .update({ evolution_status: state })
        .eq("user_id", userId);
    }

    return json({ connected, state, phone });
  } catch (error) {
    console.error("evolution-status error:", error);
    return json({
      connected: false,
      state: "error",
      error: "Erro ao verificar conexão.",
      fallback: true,
    });
  }
});