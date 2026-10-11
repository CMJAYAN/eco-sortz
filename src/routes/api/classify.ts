import { createFileRoute } from "@tanstack/react-router";

const CATEGORIES = ["Plastic", "Paper", "Glass", "Metal", "Organic", "E-waste", "Hazardous", "General"];

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["item", "category", "confidence", "instruction", "tips"],
  properties: {
    item: { type: "string" },
    category: { type: "string", enum: CATEGORIES },
    confidence: { type: "number" },
    instruction: { type: "string" },
    tips: { type: "array", items: { type: "string" } },
  },
};

export const Route = createFileRoute("/api/classify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { image } = (await request.json()) as { image?: string };
        if (!image || !image.startsWith("data:image/") || image.length > 8_000_000) {
          return Response.json({ error: "Please upload a valid image (under ~6MB)." }, { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return Response.json({ error: "AI is not configured." }, { status: 500 });

        const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": key,
            "X-Lovable-AIG-SDK": "fetch",
          },
          body: JSON.stringify({
            model: "openai/gpt-6-astra",
            stream: true,
            store: false,
            reasoning: { effort: "low" },
            text: { format: { type: "json_schema", name: "waste", strict: true, schema } },
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: `You are a waste sorting classifier. Identify the main waste item in the photo and classify it into one of: ${CATEGORIES.join(", ")}. confidence is 0-100 (your honest certainty). instruction: one short sentence telling where/how to dispose it (e.g. "Rinse and place in the recyclable plastic bin."). tips: 3 short tips to reduce or reuse this kind of waste. If no waste item is visible, use category General with low confidence.`,
                  },
                  { type: "input_image", image_url: image },
                ],
              },
            ],
          }),
        });

        if (!res.ok || !res.body) {
          const msg =
            res.status === 429 ? "Too many requests, please wait a moment." :
            res.status === 402 ? "AI credits exhausted for this workspace." :
            "The AI could not analyse this image.";
          return Response.json({ error: msg }, { status: res.status || 500 });
        }

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let text = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const ev = JSON.parse(data);
              if (ev.type === "response.output_text.delta") text += ev.delta;
              if (ev.type === "error" || ev.type === "response.failed")
                return Response.json({ error: "The AI could not analyse this image." }, { status: 502 });
            } catch {}
          }
        }
        try {
          const out = JSON.parse(text);
          out.confidence = Math.max(0, Math.min(100, Math.round(out.confidence)));
          out.tips = (out.tips ?? []).slice(0, 4);
          return Response.json(out);
        } catch {
          return Response.json({ error: "Unexpected AI response, please try again." }, { status: 502 });
        }
      },
    },
  },
});
