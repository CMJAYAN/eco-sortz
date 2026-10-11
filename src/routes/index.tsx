import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Eco Sort — AI Waste Classifier" },
      { name: "description", content: "Snap a photo of waste and Eco Sort's AI tells you the right bin, with recycling tips." },
      { property: "og:title", content: "Eco Sort — AI Waste Classifier" },
      { property: "og:description", content: "Snap a photo of waste and get the right disposal category instantly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Result = { item: string; category: string; confidence: number; instruction: string; tips: string[] };
type Log = { category: string; confidence: number; at: number };

const META: Record<string, { emoji: string; cls: string }> = {
  Plastic: { emoji: "🧴", cls: "cat-plastic" },
  Paper: { emoji: "📦", cls: "cat-paper" },
  Glass: { emoji: "🍾", cls: "cat-glass" },
  Metal: { emoji: "🥫", cls: "cat-metal" },
  Organic: { emoji: "🍌", cls: "cat-organic" },
  "E-waste": { emoji: "🔋", cls: "cat-ewaste" },
  Hazardous: { emoji: "☣️", cls: "cat-hazard" },
  General: { emoji: "🗑️", cls: "cat-general" },
};

const GENERAL_TIPS = [
  "Carry a reusable bottle and shopping bag.",
  "Rinse containers before recycling — dirty items contaminate batches.",
  "Compost food scraps to cut landfill waste.",
  "Repair or donate before you throw away.",
];

function resize(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = img.width * s;
      c.height = img.height * s;
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function Index() {
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { setLogs(JSON.parse(localStorage.getItem("ecosort-logs") || "[]")); } catch {}
  }, []);

  async function handle(file?: File) {
    if (!file) return;
    setError(null); setResult(null); setLoading(true);
    try {
      const data = await resize(file);
      setPreview(data);
      const r = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: data }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Something went wrong");
      setResult(j);
      const next = [...logs, { category: j.category, confidence: j.confidence, at: Date.now() }];
      setLogs(next);
      localStorage.setItem("ecosort-logs", JSON.stringify(next));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const counts = Object.keys(META).map((k) => ({ k, n: logs.filter((l) => l.category === k).length }));
  const max = Math.max(1, ...counts.map((c) => c.n));
  const m = result ? META[result.category] ?? META["General"]! : null;

  return (
    <main className="min-h-screen eco-bg">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <header className="text-center mb-10">
          <div className="text-5xl mb-2">♻️</div>
          <h1 className="font-display text-5xl md:text-6xl font-bold eco-gradient-text">Eco Sort</h1>
          <p className="mt-3 text-lg text-muted-foreground">Snap a photo of any waste item — AI tells you which bin it belongs in.</p>
        </header>

        <section className="grid md:grid-cols-2 gap-6">
          <div className="eco-card p-6">
            <div className="aspect-square rounded-2xl border-2 border-dashed border-primary/40 bg-muted/50 flex items-center justify-center overflow-hidden">
              {preview ? <img src={preview} alt="Uploaded waste item" className="h-full w-full object-cover" />
                : <p className="text-muted-foreground text-center px-6">📸 Upload or capture a photo of a waste item</p>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button className="eco-btn eco-btn-primary" disabled={loading} onClick={() => uploadRef.current?.click()}>⬆️ Upload</button>
              <button className="eco-btn eco-btn-accent" disabled={loading} onClick={() => cameraRef.current?.click()}>📷 Camera</button>
            </div>
            <input ref={uploadRef} type="file" accept="image/*" hidden onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ""; }} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ""; }} />
          </div>

          <div className="eco-card p-6 flex flex-col">
            <h2 className="font-display text-2xl font-bold mb-4">Result</h2>
            {loading && <div className="flex-1 flex flex-col items-center justify-center gap-3"><div className="eco-spinner" /><p className="text-muted-foreground">Analysing…</p></div>}
            {error && <p className="rounded-xl bg-destructive/10 text-destructive p-4">{error}</p>}
            {!loading && !error && !result && <p className="text-muted-foreground">Your prediction will appear here.</p>}
            {result && m && !loading && (
              <div className="space-y-4">
                <div className={`rounded-2xl p-5 ${m.cls}`}>
                  <p className="text-sm opacity-80">Detected: {result.item}</p>
                  <p className="font-display text-3xl font-bold">{m.emoji} {result.category}</p>
                  <div className="mt-3">
                    <div className="flex justify-between text-sm"><span>Confidence</span><span className="font-bold">{result.confidence}%</span></div>
                    <div className="mt-1 h-3 rounded-full bg-background/40 overflow-hidden">
                      <div className="h-full bg-current rounded-full transition-all" style={{ width: `${result.confidence}%` }} />
                    </div>
                  </div>
                </div>
                <div className="rounded-xl bg-secondary p-4">
                  <p className="font-semibold text-secondary-foreground">🗂️ Recommendation</p>
                  <p className="text-secondary-foreground">{result.instruction}</p>
                </div>
                <div>
                  <p className="font-semibold mb-2">💡 Reduce & reuse tips</p>
                  <ul className="space-y-1 list-disc pl-5 text-muted-foreground">{result.tips.map((t) => <li key={t}>{t}</li>)}</ul>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="grid md:grid-cols-2 gap-6 mt-6">
          <div className="eco-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-2xl font-bold">📊 Awareness dashboard</h2>
              {logs.length > 0 && <button className="text-sm text-muted-foreground underline" onClick={() => { setLogs([]); localStorage.removeItem("ecosort-logs"); }}>Reset</button>}
            </div>
            <p className="text-muted-foreground mb-4">{logs.length} items sorted · avg confidence {logs.length ? Math.round(logs.reduce((a, l) => a + l.confidence, 0) / logs.length) : 0}%</p>
            <div className="space-y-2">
              {counts.map(({ k, n }) => (
                <div key={k} className="flex items-center gap-3 text-sm">
                  <span className="w-24">{META[k]!.emoji} {k}</span>
                  <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${META[k]!.cls}`} style={{ width: `${(n / max) * 100}%` }} /></div>
                  <span className="w-6 text-right font-semibold">{n}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Results are stored anonymously in your browser only.</p>
          </div>
          <div className="eco-card p-6">
            <h2 className="font-display text-2xl font-bold mb-4">🌱 Everyday tips</h2>
            <ul className="space-y-3">{GENERAL_TIPS.map((t) => <li key={t} className="rounded-xl bg-muted p-3">{t}</li>)}</ul>
          </div>
        </section>
        <footer className="text-center text-sm text-muted-foreground mt-10">Eco Sort · Sort smarter, waste less 🌍</footer>
      </div>
    </main>
  );
}
