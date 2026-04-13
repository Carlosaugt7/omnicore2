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

// This is a PUBLIC webhook endpoint — no JWT required
// Evolution API sends events here automatically
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const event = body?.event;
    const instance = body?.instance;
    const data = body?.data;

    console.log(`[evolution-webhook] event=${event} instance=${instance}`);

    // Use service role to write data since this is a webhook (no user auth)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (event === "CONNECTION_UPDATE") {
      const state = data?.state || data?.status;
      console.log(`[evolution-webhook] Connection state: ${state} for instance: ${instance}`);

      // If connected, try to save the phone number
      if (state === "open" && data?.number) {
        // Find user by instance name
        const { data: settings } = await supabase
          .from("settings")
          .select("user_id")
          .eq("evolution_instance", instance)
          .maybeSingle();

        if (settings?.user_id) {
          console.log(`[evolution-webhook] Instance ${instance} connected, user: ${settings.user_id}`);
        }
      }
    }

    if (event === "MESSAGES_UPSERT") {
      const message = data?.message;
      const key = data?.key;
      console.log(`[evolution-webhook] Message from ${key?.remoteJid}: ${message?.conversation?.substring(0, 50)}`);
    }

    if (event === "QRCODE_UPDATED") {
      console.log(`[evolution-webhook] QR Code updated for instance: ${instance}`);
    }

    return json({ received: true });
  } catch (error) {
    console.error("[evolution-webhook] Error:", error);
    return json({ received: false, error: "Processing failed" });
  }
});