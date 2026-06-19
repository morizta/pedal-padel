/**
 * Dialog konfirmasi/info ber-style (pengganti window.alert / window.confirm).
 *
 * Pakai dari mana saja (termasuk di luar komponen):
 *   if (await confirmDialog("Hapus?", { tone: "danger" })) { ... }
 *   await alertDialog("Tersimpan.");
 *
 * <DialogHost /> dipasang sekali di root app.
 */
import { useEffect, useState } from "react";

type Req = {
  id: number;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string | null; // null → mode alert (cuma tombol OK)
  tone: "default" | "danger";
  resolve: (ok: boolean) => void;
};

let emit: ((r: Req | null) => void) | null = null;
let counter = 0;

function show(
  message: string,
  o: {
    title?: string;
    confirmText?: string;
    cancelText?: string;
    tone?: "default" | "danger";
    isAlert?: boolean;
  }
): Promise<boolean> {
  return new Promise((resolve) => {
    const req: Req = {
      id: ++counter,
      title: o.title ?? (o.isAlert ? "Info" : "Confirm"),
      message,
      confirmText: o.confirmText ?? (o.isAlert ? "OK" : "Yes"),
      cancelText: o.isAlert ? null : (o.cancelText ?? "Cancel"),
      tone: o.tone ?? "default",
      resolve,
    };
    if (!emit) {
      // Host belum ter-mount → fallback ke native browser.
      resolve(o.isAlert ? true : window.confirm(message));
      return;
    }
    emit(req);
  });
}

export function confirmDialog(
  message: string,
  opts: {
    title?: string;
    confirmText?: string;
    cancelText?: string;
    tone?: "default" | "danger";
  } = {}
): Promise<boolean> {
  return show(message, opts);
}

export function alertDialog(
  message: string,
  opts: { title?: string; confirmText?: string; tone?: "default" | "danger" } = {}
): Promise<void> {
  return show(message, { ...opts, isAlert: true }).then(() => {});
}

export function DialogHost() {
  const [req, setReq] = useState<Req | null>(null);
  useEffect(() => {
    emit = setReq;
    return () => {
      emit = null;
    };
  }, []);

  if (!req) return null;
  const isAlert = req.cancelText === null;
  const close = (ok: boolean) => {
    req.resolve(ok);
    setReq(null);
  };

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={() => close(isAlert)}
    >
      <div
        className="w-full max-w-xs overflow-hidden rounded-3xl bg-surface-container-lowest text-on-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pb-2 pt-5">
          <div className="mb-2 flex items-center gap-2.5">
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                req.tone === "danger"
                  ? "bg-error-container text-error"
                  : "bg-primary-container text-on-primary-container"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {req.tone === "danger" ? "warning" : isAlert ? "info" : "help"}
              </span>
            </span>
            <h3 className="font-display text-base font-bold">{req.title}</h3>
          </div>
          <p className="whitespace-pre-line text-sm text-on-surface-variant">
            {req.message}
          </p>
        </div>
        <div className="flex gap-2 p-4">
          {!isAlert && (
            <button
              onClick={() => close(false)}
              className="flex-1 rounded-xl border border-outline-variant px-4 py-2.5 text-sm font-semibold hover:bg-surface-container-low"
            >
              {req.cancelText}
            </button>
          )}
          <button
            onClick={() => close(true)}
            autoFocus
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold ${
              req.tone === "danger"
                ? "bg-error text-white hover:opacity-90"
                : "bg-primary-fixed text-on-primary-fixed hover:bg-primary-fixed-dim"
            }`}
          >
            {req.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
