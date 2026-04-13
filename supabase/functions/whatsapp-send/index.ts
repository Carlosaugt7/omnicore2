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

    const body = await req.json();
    const { phone, message, clientId, clientName, templateType } = body;

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ error: "phone e message são obrigatórios." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitize phone: digits only, ensure country code
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return new Response(
        JSON.stringify({ error: "Número de telefone inválido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: settings } = await supabase
      .from("settings")
      .select("evolution_api_url, evolution_api_key, evolution_instance")
      .eq("user_id", userId)
      .maybeSingle();

    if (!settings?.evolution_api_url || !settings?.evolution_api_key || !settings?.evolution_instance) {
      return new Response(
        JSON.stringify({ error: "Credenciais Evolution API não configuradas." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = settings.evolution_api_url.replace(/\/+$/, "");
    const sendRes = await fetch(
      `${baseUrl}/message/sendText/${settings.evolution_instance}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: settings.evolution_api_key,
        },
        body: JSON.stringify({
          number: cleanPhone,
          text: message,
        }),
      }
    );

    const sendData = await sendRes.json();
    const success = sendRes.ok;

    // Log the result
    await supabase.from("reminder_logs").insert({
      user_id: userId,
      client_id: clientId || null,
      client_name: clientName || null,
      phone: cleanPhone,
      template_type: templateType || "manual",
      status: success ? "success" : "failed",
      error_message: success ? null : JSON.stringify(sendData),
      message_id: sendData?.key?.id || null,
      sent_at: new Date().toISOString(),
    });

    if (!success) {
      return new Response(
        JSON.stringify({ error: `Falha ao enviar: ${sendData?.message || sendRes.status}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, messageId: sendData?.key?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("whatsapp-send error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno ao enviar mensagem.", fallback: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});