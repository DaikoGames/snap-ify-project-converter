import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import {
  convertCatrobatXml,
  readCatrobatFile,
  type ConversionResult,
} from "@/lib/catrobat-to-snap";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Catrobat to Snap! Converter — Pocket Code project translator" },
      {
        name: "description",
        content:
          "Convert Pocket Code / Catrobat project files (.catrobat) into Snap! BYOB XML in your browser. Touch events become mouse clicks. No upload, fully offline.",
      },
      { property: "og:title", content: "Catrobat to Snap! BYOB Converter" },
      {
        property: "og:description",
        content:
          "Drop a .catrobat file and get a Snap! BYOB project XML. Bricks, formulas and touch-to-click mapping included.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const MAPPING = [
  ["When screen is tapped", "when I am clicked"],
  ["When program starts", "when green flag clicked"],
  ["When I receive «msg»", "when I receive «msg»"],
  ["Place at / Set X / Set Y", "go to x: y: / set x / set y"],
  ["Move N steps, Turn left/right", "move / turn ↺ ↻"],
  ["Glide to", "glide secs to x: y:"],
  ["Say / Think bubble", "say / think (for secs)"],
  ["Set look, Next look", "switch to costume, next costume"],
  ["Set size / transparency", "set size, set ghost effect"],
  ["Forever, Repeat, Repeat until", "forever, repeat, repeat until"],
  ["If … then … else", "if / if else"],
  ["Set / change variable", "set / change variable"],
  ["Play sound, Stop all sounds", "play sound, stop all sounds"],
  ["Finger X / Finger Y / touched", "mouse x / mouse y / mouse down?"],
  ["X / Y inclination (tilt)", "mouse x / mouse y scaled to ±90°"],
  ["X / Y acceleration", "mouse x / mouse y scaled to ±10 m/s²"],
  ["Compass direction", "atan2 (mouse x, mouse y)"],
];

function Index() {
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pasted, setPasted] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const xml = await readCatrobatFile(file);
      const converted = convertCatrobatXml(xml);
      setFileName(file.name);
      setResult(converted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not convert that file.");
    } finally {
      setBusy(false);
    }
  }, []);

  const handlePaste = useCallback(() => {
    if (!pasted.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const converted = convertCatrobatXml(pasted);
      setFileName("pasted code.xml");
      setResult(converted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not convert that XML.");
    } finally {
      setBusy(false);
    }
  }, [pasted]);

  const download = () => {
    if (!result) return;
    const blob = new Blob([result.xml], { type: "text/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.projectName.replace(/[^\w -]/g, "") || "project"}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-14">
      <header className="mb-12">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <span className="size-2 rounded-full bg-[var(--catrobat)]" />
          Catrobat
          <span className="text-muted-foreground/60">→</span>
          <span className="size-2 rounded-full bg-[var(--snap)]" />
          Snap! BYOB
        </div>
        <h1 className="text-4xl leading-tight font-bold sm:text-5xl">
          Turn your Pocket Code project into a Snap! project
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground">
          Drop a <code className="font-mono text-accent">.catrobat</code> file (or a raw{" "}
          <code className="font-mono text-accent">code.xml</code>) and get back Snap! BYOB
          XML you can import straight into snap.berkeley.edu. Everything runs in your
          browser — nothing is uploaded.
        </p>
      </header>

      <section
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`panel flex cursor-pointer flex-col items-center justify-center gap-3 px-6 py-16 text-center transition-colors ${
          dragging ? "border-primary bg-primary/5" : "hover:border-primary/60"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".catrobat,.zip,.xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <div className="text-lg font-semibold">
          {busy ? "Converting…" : "Drop your .catrobat file here"}
        </div>
        <p className="text-sm text-muted-foreground">
          or click to browse · .catrobat, .zip or code.xml
        </p>
        {fileName && !busy && (
          <p className="mt-1 font-mono text-xs text-accent">{fileName}</p>
        )}
      </section>

      <section className="panel mt-4 px-5 py-4">
        <label htmlFor="xml-input" className="text-sm font-semibold">
          …or paste your Catrobat <code className="font-mono text-accent">code.xml</code>
        </label>
        <textarea
          id="xml-input"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="<program>…</program>"
          rows={5}
          className="mt-3 w-full resize-y rounded-xl border border-border bg-background px-4 py-3 font-mono text-xs outline-none focus:border-primary"
        />
        <div className="mt-3 flex gap-3">
          <button
            onClick={handlePaste}
            disabled={!pasted.trim() || busy}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Convert pasted XML
          </button>
          <button
            onClick={() => setPasted("")}
            className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
          >
            Clear
          </button>
        </div>
      </section>



      {error && (
        <div className="panel mt-6 border-destructive/60 px-5 py-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && (
        <section className="mt-8 space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Project", result.projectName],
              ["Sprites", String(result.log.sprites)],
              ["Scripts", String(result.log.scripts)],
              ["Bricks", String(result.log.bricks)],
            ].map(([label, value]) => (
              <div key={label} className="panel px-4 py-3">
                <div className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  {label}
                </div>
                <div className="mt-1 truncate text-lg font-semibold">{value}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={download}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Download Snap! XML
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(result.xml)}
              className="rounded-xl border border-border bg-secondary px-5 py-2.5 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-muted"
            >
              Copy XML
            </button>
            <a
              href="https://snap.berkeley.edu/snap/snap.html"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
            >
              Open Snap! →
            </a>
          </div>

          {(result.log.warnings.length > 0 ||
            Object.keys(result.log.unsupported).length > 0) && (
            <div className="panel px-5 py-4">
              <h2 className="text-sm font-semibold">Conversion notes</h2>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {Object.entries(result.log.unsupported).map(([k, n]) => (
                  <li key={k}>
                    <span className="text-[var(--catrobat)]">●</span> {k} × {n} — left as a
                    comment block in Snap!
                  </li>
                ))}
                {result.log.warnings.map((w) => (
                  <li key={w}>
                    <span className="text-primary">●</span> {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="panel overflow-hidden">
            <div className="border-b border-border px-5 py-3 text-sm font-semibold">
              Generated Snap! XML
            </div>
            <pre className="max-h-96 overflow-auto px-5 py-4 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
              {result.xml}
            </pre>
          </div>
        </section>
      )}

      <section className="mt-14">
        <h2 className="text-xl font-bold">How bricks are translated</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Pocket Code is touch-first, Snap! is mouse-first — so{" "}
          <strong className="text-foreground">tapping the screen becomes clicking</strong>:
          a “When tapped” script turns into “when I am clicked”, and the finger sensors
          become mouse sensors.
        </p>
        <div className="panel mt-5 divide-y divide-border">
          {MAPPING.map(([from, to]) => (
            <div
              key={from}
              className="grid grid-cols-1 gap-1 px-5 py-3 text-sm sm:grid-cols-2 sm:gap-4"
            >
              <span className="text-[var(--catrobat)]">{from}</span>
              <span className="text-[var(--snap)]">{to}</span>
            </div>
          ))}
        </div>
        <p className="mt-5 text-xs text-muted-foreground">
          Costumes and sounds are referenced by name only — media files aren’t embedded, so
          add them in Snap! after importing. Import via Snap!’s file menu → Import… and
          pick the downloaded XML.
        </p>
      </section>
    </main>
  );
}
