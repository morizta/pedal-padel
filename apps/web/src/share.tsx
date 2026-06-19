/**
 * Bagikan klasemen ke media sosial.
 *
 * Render template (DOM) → PNG via html-to-image, lalu Share (Web Share API)
 * atau Download. Semua di sisi client; tak ada server. Dipakai untuk hasil
 * event yang selesai maupun klasemen liga akumulatif.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { alertDialog } from "./dialog";

/* ---------- Data ---------- */

export interface ShareRow {
  rank: number;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  diff: number;
  plusM: number;
  points: number;
}

/** Standing dari engine → baris share (urutan = peringkat). */
export function buildShareRows(
  standings: readonly {
    playerId: string;
    wins: number;
    losses: number;
    ties: number;
    gamesDiff: number;
    compensation: number;
    adjustedPoints: number;
  }[]
): ShareRow[] {
  return standings.map((s, i) => ({
    rank: i + 1,
    name: s.playerId,
    wins: s.wins,
    losses: s.losses,
    ties: s.ties,
    diff: s.gamesDiff,
    plusM: s.compensation,
    points: s.adjustedPoints,
  }));
}

/* ---------- Util ---------- */

const W = 1080; // lebar kanvas template (px)
const H = 1920; // tinggi (rasio 9:16, pas untuk story/feed)
const NAVY = "#131b2e";
const LIME = "#c3f400";
const INK = "#161e00";

const MEDAL = ["🥇", "🥈", "🥉"];

function initials(name: string): string {
  // "Audi & Zen" → "AZ"; "Arbi" → "AR".
  const parts = name.replace(/&/g, " ").split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return (letters.join("") || name.slice(0, 2)).toUpperCase();
}

function wlt(r: ShareRow): string {
  return `${r.wins}-${r.losses}-${r.ties}`;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** Logo SICOPA (raket + wordmark) untuk pojok template. */
function Brand({ light = false }: { light?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: LIME,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg viewBox="0 0 64 64" width="40" height="40">
          <path
            fill={INK}
            d="M32 9c-10.2 0-18.5 8.7-18.5 19.4 0 9.1 6 16.8 14.1 18.8v2.3h-4.2a3 3 0 0 0 0 6h13.2a3 3 0 0 0 0-6h-4.2v-2.3c8.1-2 14.1-9.7 14.1-18.8C50.5 17.7 42.2 9 32 9z"
          />
          {[
            [32, 20],
            [24.5, 25],
            [39.5, 25],
            [32, 29],
            [24.5, 33.5],
            [39.5, 33.5],
            [32, 38],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={2.3} fill={LIME} />
          ))}
        </svg>
      </div>
      <span
        style={{
          fontFamily: "'Hanken Grotesk', sans-serif",
          fontWeight: 800,
          fontSize: 40,
          letterSpacing: "-0.02em",
          color: light ? "#fff" : LIME,
        }}
      >
        SICOPA
      </span>
    </div>
  );
}

/* ---------- Template ---------- */

export interface TemplateProps {
  title: string;
  rows: ShareRow[];
  bg?: string | null;
  /** Posisi konten secara vertikal. */
  align?: "top" | "center" | "bottom";
  /** Kegelapan scrim di atas foto (0 = foto penuh, 1 = gelap). */
  overlay?: number;
}

/** Posisi vertikal → justify-content. */
function justifyOf(a: TemplateProps["align"]): string {
  return a === "top" ? "flex-start" : a === "bottom" ? "flex-end" : "center";
}
/** Posisi vertikal → margin kartu (di dalam frame flex-column). */
function marginOf(a: TemplateProps["align"]): string {
  return a === "top" ? "0 auto auto" : a === "bottom" ? "auto auto 0" : "auto";
}

interface Template {
  key: string;
  label: string;
  /** Background PNG: true = transparan (checkerboard di preview). */
  transparent: boolean;
  render: (p: TemplateProps) => JSX.Element;
}

const titleStyle: React.CSSProperties = {
  fontFamily: "'Hanken Grotesk', sans-serif",
  fontWeight: 800,
  fontSize: 64,
  lineHeight: 1.1,
  textAlign: "center",
  margin: 0,
};

const mono: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontVariantNumeric: "tabular-nums",
};

/** Tabel klasemen (dipakai beberapa template). */
function StandingsTable({
  rows,
  dark,
}: {
  rows: ShareRow[];
  dark: boolean;
}) {
  const head = dark ? "rgba(255,255,255,.55)" : "rgba(0,0,0,.5)";
  const rowBg = dark ? "rgba(255,255,255,.06)" : "#fff";
  const rowText = dark ? "#fff" : "#1a1a1a";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "70px 1fr 150px 110px 90px 110px",
          padding: "0 24px",
          fontFamily: "'Inter', sans-serif",
          fontSize: 26,
          color: head,
          fontWeight: 600,
        }}
      >
        <span>#</span>
        <span>Player</span>
        <span style={{ textAlign: "center" }}>W-L-T</span>
        <span style={{ textAlign: "center" }}>Diff</span>
        <span style={{ textAlign: "center" }}>+M</span>
        <span style={{ textAlign: "right" }}>P</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.rank}
          style={{
            display: "grid",
            gridTemplateColumns: "70px 1fr 150px 110px 90px 110px",
            alignItems: "center",
            background: rowBg,
            borderRadius: 18,
            padding: "22px 24px",
            color: rowText,
          }}
        >
          <span style={{ fontSize: 30 }}>
            {r.rank <= 3 ? MEDAL[r.rank - 1] : r.rank}
          </span>
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 700,
              fontSize: 34,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {r.name}
          </span>
          <span style={{ ...mono, fontSize: 28, textAlign: "center" }}>
            {wlt(r)}
          </span>
          <span style={{ ...mono, fontSize: 28, textAlign: "center" }}>
            {signed(r.diff)}
          </span>
          <span
            style={{
              ...mono,
              fontSize: 28,
              textAlign: "center",
              color: r.plusM > 0 ? "#5fb800" : head,
            }}
          >
            {r.plusM > 0 ? `+${r.plusM}` : "–"}
          </span>
          <span
            style={{
              ...mono,
              fontSize: 38,
              fontWeight: 800,
              textAlign: "right",
              color: dark ? LIME : "#2563eb",
            }}
          >
            {r.points}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Podium top-3 (1 di tengah & tertinggi). */
function Podium({ rows, dark }: { rows: ShareRow[]; dark: boolean }) {
  const top = rows.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean) as ShareRow[];
  const sizes = [200, 240, 200];
  const lift = [60, 0, 90];
  const ring = ["#9ca3af", LIME, "#cd7f32"];
  const text = dark ? "#fff" : "#1a1a1a";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-end",
        gap: 36,
      }}
    >
      {order.map((r) => {
        const i = r.rank - 1;
        const size = sizes[Math.min(order.indexOf(r), 2)] ?? 200;
        return (
          <div
            key={r.rank}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginBottom: lift[order.indexOf(r)],
              width: size + 40,
            }}
          >
            <div style={{ fontSize: 56, marginBottom: -10 }}>{MEDAL[i]}</div>
            <div
              style={{
                width: size,
                height: size,
                borderRadius: "50%",
                background: dark ? "rgba(255,255,255,.08)" : "#eafff0",
                border: `8px solid ${ring[i]}`,
                boxShadow: `0 0 40px ${ring[i]}66`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "'Hanken Grotesk', sans-serif",
                fontWeight: 800,
                fontSize: size * 0.3,
                color: i === 0 ? "#7c3aed" : "#0f766e",
              }}
            >
              {initials(r.name)}
            </div>
            <div
              style={{
                marginTop: 18,
                fontFamily: "'Inter', sans-serif",
                fontWeight: 700,
                fontSize: 32,
                color: text,
                textAlign: "center",
                maxWidth: size + 30,
              }}
            >
              {r.name}
            </div>
            <div
              style={{ ...mono, fontSize: 26, color: text, opacity: 0.7 }}
            >
              {wlt(r)}
            </div>
            <div
              style={{
                fontFamily: "'Hanken Grotesk', sans-serif",
                fontWeight: 800,
                fontSize: 44,
                color: dark ? LIME : "#2563eb",
              }}
            >
              {r.points}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function frame(bg: string | null | undefined, base: string): React.CSSProperties {
  return {
    width: W,
    height: H,
    position: "relative",
    overflow: "hidden",
    background: bg ? undefined : base,
    display: "flex",
    flexDirection: "column",
  };
}

function BgImage({
  bg,
  overlay = 0.55,
}: {
  bg?: string | null;
  overlay?: number;
}) {
  if (!bg) return null;
  return (
    <>
      {/* bg = data URL lokal → JANGAN set crossOrigin (merusak load di mobile). */}
      <img
        src={bg}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      {/* Scrim: kegelapan bisa diatur. Gradien tipis utama dari opacity. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(180deg, rgba(8,12,24,${overlay * 0.7}) 0%, rgba(8,12,24,${overlay}) 100%)`,
        }}
      />
    </>
  );
}

const TEMPLATES: Template[] = [
  {
    key: "list-dark",
    label: "Dark List",
    transparent: false,
    render: ({ title, rows, bg, align, overlay }) => (
      <div style={frame(bg, `linear-gradient(180deg, ${NAVY} 0%, #0b1120 100%)`)}>
        <BgImage bg={bg} overlay={overlay} />
        <div
          style={{
            position: "relative",
            padding: 64,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: justifyOf(align ?? "top"),
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Brand light />
          </div>
          <h1 style={{ ...titleStyle, color: "#fff", margin: "30px 0 50px" }}>
            {title}
          </h1>
          <StandingsTable rows={rows} dark />
        </div>
      </div>
    ),
  },
  {
    key: "list-card",
    label: "Card List",
    transparent: true,
    render: ({ title, rows, bg, align, overlay }) => (
      <div style={frame(bg, "transparent")}>
        <BgImage bg={bg} overlay={overlay} />
        <div
          style={{
            position: "relative",
            margin: marginOf(align),
            width: W - 80,
            background: "rgba(20,20,20,.55)",
            borderRadius: 32,
            padding: 56,
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Brand light />
          </div>
          <h1 style={{ ...titleStyle, color: "#fff", margin: "26px 0 44px" }}>
            {title}
          </h1>
          <StandingsTable rows={rows} dark={false} />
        </div>
      </div>
    ),
  },
  {
    key: "podium",
    label: "Podium",
    transparent: true,
    render: ({ title, rows, bg, align, overlay }) => (
      <div style={frame(bg, `linear-gradient(180deg, #0b1120 0%, ${NAVY} 100%)`)}>
        <BgImage bg={bg} overlay={overlay} />
        <div
          style={{
            position: "relative",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: justifyOf(align ?? "bottom"),
            padding: 64,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 64,
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Brand light />
          </div>
          <h1 style={{ ...titleStyle, color: "#fff", marginBottom: 70 }}>
            {title}
          </h1>
          <Podium rows={rows} dark />
          <div style={{ height: 40 }} />
        </div>
      </div>
    ),
  },
  {
    key: "podium-light",
    label: "Light Podium",
    transparent: false,
    render: ({ title, rows, bg, align, overlay }) => (
      <div style={frame(bg, "linear-gradient(180deg,#f8fafc 0%,#e2e8f0 100%)")}>
        <BgImage bg={bg} overlay={overlay} />
        <div
          style={{
            position: "relative",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: justifyOf(align),
            padding: 64,
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 40 }}>
            <Brand />
          </div>
          <h1 style={{ ...titleStyle, color: NAVY, marginBottom: 90 }}>
            {title}
          </h1>
          <Podium rows={rows} dark={false} />
        </div>
      </div>
    ),
  },
  {
    key: "compact",
    label: "Compact Top-3",
    transparent: true,
    render: ({ title, rows, bg, align, overlay }) => (
      <div style={frame(bg, "transparent")}>
        <BgImage bg={bg} overlay={overlay} />
        <div
          style={{
            position: "relative",
            margin: marginOf(align),
            width: W - 100,
            background: `linear-gradient(180deg, ${NAVY} 0%, #0b1120 100%)`,
            borderRadius: 36,
            padding: 56,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h1 style={{ ...titleStyle, color: "#fff", fontSize: 48, textAlign: "left" }}>
              {title}
            </h1>
            <Brand light />
          </div>
          <div style={{ height: 40 }} />
          <StandingsTable rows={rows.slice(0, 3)} dark />
        </div>
      </div>
    ),
  },
];

/* ---------- Modal ---------- */

export function ShareModal({
  title,
  rows,
  onClose,
}: {
  title: string;
  rows: ShareRow[];
  onClose: () => void;
}) {
  const [tpl, setTpl] = useState(0);
  const [start, setStart] = useState(1);
  const [count, setCount] = useState(Math.min(rows.length, 10));
  const [bg, setBg] = useState<string | null>(null);
  const [align, setAlign] = useState<"top" | "center" | "bottom">("center");
  const [overlay, setOverlay] = useState(0.55);
  const [busy, setBusy] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  const template = TEMPLATES[tpl] ?? TEMPLATES[0]!;
  const visibleRows = useMemo(
    () => rows.slice(start - 1, start - 1 + count),
    [rows, start, count]
  );

  // Skala preview: muat di lebar modal DAN dibatasi tinggi viewport supaya
  // kontrol (template/slider/aksi) tetap terlihat — penting di desktop yang
  // tinggi, juga aman di mobile.
  const [scale, setScale] = useState(0.3);
  const frameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const fit = () => {
      const maxH = window.innerHeight * 0.48;
      setScale(Math.min(el.clientWidth / W, maxH / H));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  async function capture(): Promise<{ url: string; file: File } | null> {
    const node = captureRef.current;
    if (!node) return null;
    // Tunggu font siap supaya teks tidak fallback saat di-capture.
    if (document.fonts?.ready) await document.fonts.ready;
    // Tunggu SEMUA gambar (mis. foto background data-URL) selesai decode dulu —
    // tanpa ini foto bisa kosong di hasil. cacheBust DIHILANGKAN karena merusak
    // data URL (menambah ?query) → foto tak muncul saat download/share.
    await waitForImages(node);
    const url = await toPng(node, {
      width: W,
      height: H,
      pixelRatio: 1,
    });
    const blob = await (await fetch(url)).blob();
    const safe = title.replace(/[^\w-]+/g, "_").slice(0, 40) || "standings";
    const file = new File([blob], `${safe}.png`, { type: "image/png" });
    return { url, file };
  }

  async function onShare() {
    setBusy(true);
    try {
      const out = await capture();
      if (!out) return;
      const navAny = navigator as Navigator & {
        canShare?: (d: ShareData) => boolean;
      };
      if (navAny.canShare?.({ files: [out.file] })) {
        await navigator.share({
          files: [out.file],
          title,
          text: `${title} Standings — via SICOPA`,
        });
      } else {
        download(out.url, out.file.name);
        void alertDialog("Your browser doesn't support sharing files — the image was downloaded.", {
          title: "Downloaded",
        });
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        void alertDialog("Failed to create image: " + (e as Error).message, {
          title: "Failed",
          tone: "danger",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function onDownload() {
    setBusy(true);
    try {
      const out = await capture();
      if (out) download(out.url, out.file.name);
    } catch (e) {
      void alertDialog("Failed to create image: " + (e as Error).message, {
        title: "Failed",
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  }

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setBg(reader.result as string);
    reader.readAsDataURL(f);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-surface sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4">
          <div>
            <h3 className="font-display text-lg font-bold">Share Standings</h3>
            <p className="text-xs text-on-surface-variant">
              Pick a template, then Share / Download
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-container"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Preview (frameRef = ukur lebar; box dalam = kanvas terskala) */}
          <div ref={frameRef} className="w-full">
            <div
              className="mx-auto overflow-hidden rounded-2xl border border-outline-variant/30 bg-[conic-gradient(#0000_90deg,#e5e7eb_0_180deg,#0000_0_270deg,#e5e7eb_0)] bg-[length:24px_24px]"
              style={{ width: W * scale, height: H * scale }}
            >
              <div
                style={{
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                  width: W,
                  height: H,
                }}
              >
                <div ref={captureRef}>
                  {template.render({ title, rows: visibleRows, bg, align, overlay })}
                </div>
              </div>
            </div>
          </div>

          {/* Template picker */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {TEMPLATES.map((t, i) => (
              <button
                key={t.key}
                onClick={() => setTpl(i)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  i === tpl
                    ? "border-primary-fixed bg-primary-fixed/15 text-on-surface"
                    : "border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Slider start / count */}
          {rows.length > 1 && (
            <div className="mt-4 space-y-3">
              <label className="block">
                <div className="flex justify-between text-xs font-semibold text-on-surface-variant">
                  <span>Start from rank</span>
                  <span>{start}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={rows.length}
                  value={start}
                  onChange={(e) => {
                    const v = +e.target.value;
                    setStart(v);
                    setCount((c) => Math.min(c, rows.length - v + 1));
                  }}
                  className="w-full accent-primary-fixed-dim"
                />
              </label>
              <label className="block">
                <div className="flex justify-between text-xs font-semibold text-on-surface-variant">
                  <span>Players shown</span>
                  <span>{count}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={rows.length - start + 1}
                  value={count}
                  onChange={(e) => setCount(+e.target.value)}
                  className="w-full accent-primary-fixed-dim"
                />
              </label>
            </div>
          )}

          {/* Insert photo — label membungkus input agar tap di mobile andal */}
          <div className="mt-4 flex gap-2">
            <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-surface-container px-4 py-3 text-sm font-semibold hover:bg-surface-container-high">
              <span className="material-symbols-outlined text-[20px]">image</span>
              {bg ? "Change photo" : "Insert photo"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={onPickPhoto}
              />
            </label>
            {bg && (
              <button
                onClick={() => setBg(null)}
                className="rounded-xl border border-outline-variant px-4 py-3 text-sm font-semibold hover:bg-surface-container-low"
              >
                Remove
              </button>
            )}
          </div>

          {/* Position konten */}
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-semibold text-on-surface-variant">
              Position
            </div>
            <div className="flex w-full overflow-hidden rounded-xl border border-outline-variant text-sm font-semibold">
              {(["top", "center", "bottom"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setAlign(a)}
                  className={`flex-1 px-3 py-2 capitalize transition ${
                    align === a
                      ? "bg-primary-fixed text-on-primary-fixed"
                      : "text-on-surface-variant hover:bg-surface-container-low"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Opacity scrim — hanya relevan saat ada foto */}
          {bg && (
            <label className="mt-4 block">
              <div className="flex justify-between text-xs font-semibold text-on-surface-variant">
                <span>Photo darkness</span>
                <span>{Math.round(overlay * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.9}
                step={0.05}
                value={overlay}
                onChange={(e) => setOverlay(+e.target.value)}
                className="w-full accent-primary-fixed-dim"
              />
            </label>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-outline-variant/30 p-4">
          <button
            disabled={busy}
            onClick={onShare}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary-fixed px-4 py-3 font-semibold text-on-primary-fixed transition hover:bg-primary-fixed-dim active:scale-95 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[20px]">ios_share</span>
            {busy ? "Processing…" : "Share"}
          </button>
          <button
            disabled={busy}
            onClick={onDownload}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-outline-variant px-4 py-3 font-semibold transition hover:bg-surface-container-low disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[20px]">download</span>
            Download
          </button>
        </div>
      </div>
    </div>
  );
}

/** Pastikan semua <img> di node sudah ter-load/decode sebelum di-capture. */
async function waitForImages(node: HTMLElement): Promise<void> {
  const imgs = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? img.decode().catch(() => undefined)
        : new Promise<void>((res) => {
            img.onload = () => res();
            img.onerror = () => res();
          })
    )
  );
}

function download(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

/* ---------- Tombol pemicu ---------- */

export function ShareButton({
  title,
  rows,
  className,
  label = "Share",
}: {
  title: string;
  rows: ShareRow[];
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          className ??
          "flex items-center gap-1.5 rounded-xl bg-primary-fixed px-4 py-2.5 text-sm font-semibold text-on-primary-fixed transition hover:bg-primary-fixed-dim active:scale-95"
        }
      >
        <span className="material-symbols-outlined text-[18px]">ios_share</span>
        {label}
      </button>
      {open && (
        <ShareModal title={title} rows={rows} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
