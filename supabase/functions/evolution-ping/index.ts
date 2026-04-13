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

    const body = await req.json();
    const { evolutionUrl, evolutionApiKey } = body;

    if (!evolutionUrl || !evolutionApiKey) {
      return json({ error: "URL e API Key são obrigatórios." }, 400);
    }

    // Validate URL format
    try {
      new URL(evolutionUrl);
    } catch {
      return json({ error: "URL inválida. Use o formato https://evolution.seudominio.com" }, 400);
    }

    const baseUrl = evolutionUrl.replace(/\/+$/, "");

    // Try to reach Evolution API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(`${baseUrl}/instance/fetchInstances`, {
        headers: { apikey: evolutionApiKey },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 401 || res.status === 403) {
        return json({ success: false, error: "API Key inválida ou sem permissão." });
      }

      if (!res.ok) {
        const text = await res.text();
        return json({ success: false, error: `Evolution API retornou erro ${res.status}: ${text.substring(0, 100)}` });
      }

      await res.json(); // consume body
      return json({ success: true, message: "Evolution API acessível!" });
    } catch (fetchErr) {
      clearTimeout(timeout);
      const msg = fetchErr instanceof Error && fetchErr.name === "AbortError"
        ? "Timeout: Evolution API não respondeu em 10 segundos."
        : "Não foi possível conectar à Evolution API. Verifique a URL.";
      return json({ success: false, error: msg });
    }
  } catch (error) {
    console.error("evolution-ping error:", error);
    return json({ error: "Erro interno.", fallback: true });
  }
});