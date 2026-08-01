// daily-trinks-automation — APOSENTADA em 2026-08-01 (stub 410).
// A ingestão de trinks_services é feita pelos workflows n8n desde 2026-07-29
// (trinks_services_daily 03:40 + trinks_services_hourly 09:30–21:30, seg–sáb).
// NÃO reative a versão antiga: ela lia e reescrevia a tabela inteira e
// conflitaria com a reconciliação incremental do n8n (risco de perda de dados).
// Histórico da versão antiga: git deste repo (antes deste commit).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      error: "Função aposentada (410). A ingestão de trinks_services é feita pelos workflows n8n desde 2026-07-29.",
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
