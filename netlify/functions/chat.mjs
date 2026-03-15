// Proxy HuggingFace — token seguro no servidor
// Aceita qualquer modelo (HF cuida do rate limit)
const HF_TOKEN = process.env.HF_TOKEN;

export default async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });

  if (req.method !== "POST")
    return Response.json({ error: "POST only" }, { status: 405 });

  if (!HF_TOKEN)
    return Response.json(
      { error: "HF_TOKEN não configurado. Peça pro admin." },
      { status: 500 }
    );

  try {
    const body = await req.json();
    const model = body.model;
    const messages = (body.messages || []).slice(-30);

    if (!model)
      return Response.json({ error: "model é obrigatório" }, { status: 400 });

    const url =
      `https://router.huggingface.co/hf-inference/models/${model}/v1/chat/completions`;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${HF_TOKEN}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: Math.min(body.max_tokens || 4096, 16384),
        temperature: body.temperature ?? 0.6,
        top_p: 0.95,
        stream: true,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      const msgs = {
        401: "Token HF inválido. Avise o admin.",
        403: "Sem acesso. Aceite os termos do modelo no HuggingFace.",
        404: "Modelo não encontrado na API. Verifique o ID.",
        429: "Rate limit. Espere ~1 min.",
        503: "Modelo carregando no servidor (~30-60s). Tente de novo.",
      };
      return Response.json(
        { error: msgs[resp.status] || `Erro ${resp.status}: ${txt.slice(0, 200)}` },
        { status: resp.status }
      );
    }

    return new Response(resp.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/chat" };