const HF_TOKEN = process.env.HF_TOKEN;

export default async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // Health check — pra testar se a function tá viva
  if (req.method === "GET") {
    return Response.json({
      ok: true,
      hasToken: !!HF_TOKEN,
      tokenPrefix: HF_TOKEN ? HF_TOKEN.slice(0, 6) + "..." : "MISSING",
    });
  }

  if (req.method !== "POST") {
    return Response.json({ error: "POST only" }, { status: 405 });
  }

  if (!HF_TOKEN) {
    return Response.json(
      { error: "HF_TOKEN não configurado. Vá em Site settings → Environment variables no Netlify." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const model = body.model;
    const messages = (body.messages || []).slice(-30);

    if (!model) {
      return Response.json({ error: "model é obrigatório" }, { status: 400 });
    }

    if (!messages.length) {
      return Response.json({ error: "messages[] vazio" }, { status: 400 });
    }

    // HuggingFace Inference API (OpenAI-compatible)
    const url = `https://router.huggingface.co/hf-inference/models/${model}/v1/chat/completions`;

    console.log(`[chat] model=${model} messages=${messages.length}`);

    const hfResp = await fetch(url, {
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

    if (!hfResp.ok) {
      const errTxt = await hfResp.text().catch(() => "");
      console.error(`[chat] HF error ${hfResp.status}:`, errTxt.slice(0, 300));

      const msgs = {
        401: "Token HF inválido. Reconfigure em Site settings → Env vars.",
        403: "Modelo precisa de autorização. Aceite os termos na página do modelo no HuggingFace.",
        404: `Modelo "${model}" não disponível na Inference API gratuita. Tente um modelo oficial.`,
        429: "Rate limit atingido. Aguarde ~1 minuto.",
        500: "Erro interno do HuggingFace. Tente novamente.",
        503: "Modelo está carregando no servidor. Tente de novo em ~30-60 segundos.",
      };

      return new Response(
        JSON.stringify({
          error: msgs[hfResp.status] || `HuggingFace retornou erro ${hfResp.status}`,
          detail: errTxt.slice(0, 200),
          model,
        }),
        {
          status: hfResp.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Stream passthrough
    return new Response(hfResp.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
        "X-Model": model,
      },
    });
  } catch (err) {
    console.error("[chat] Error:", err);
    return Response.json(
      { error: "Erro na function: " + err.message },
      {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }
};

export const config = {
  path: "/api/chat",
  method: ["GET", "POST", "OPTIONS"],
};
