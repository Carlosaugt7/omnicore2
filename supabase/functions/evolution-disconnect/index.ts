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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);
    const userId = user.id;

    const { data: settings } = await supabase
      .from("settings")
      .select("evolution_api_url, evolution_api_key, evolution_instance")
      .eq("user_id", userId)
      .maybeSingle();

    if (!settings?.evolution_api_url || !settings?.evolution_api_key || !settings?.evolution_instance) {
      return json({ error: "Credenciais não configuradas." }, 400);
    }

    const baseUrl = settings.evolution_api_url.replace(/\/+$/, "");

    // Logout the instance
    const logoutRes = await fetch(`${baseUrl}/instance/logout/${settings.evolution_instance}`, {
      method: "DELETE",
      headers: { apikey: settings.evolution_api_key },
    });

    if (!logoutRes.ok) {
      const text = await logoutRes.text();
      console.error("Logout failed:", text);
    }

    return json({ success: true, message: "WhatsApp desconectado." });
  } catch (error) {
    console.error("evolution-disconnect error:", error);
    return json({ error: "Erro ao desconectar.", fallback: true });
  }
});