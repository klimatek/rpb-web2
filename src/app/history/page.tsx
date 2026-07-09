"use client";

import { Download, FileUp, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { RpbPageFrame } from "@/components/layout/rpb-page-frame";
import {
  buildTemplateFileName,
  buildTemplatePayloadFromHistory,
  MAX_TEMPLATE_FILE_BYTES,
  parseTemplateText,
  stringifyTemplate,
} from "@/lib/rpb-template";
import {
  deleteSummaryHistory,
  fetchSummaryHistory,
  saveSummaryHistory,
} from "@/lib/rpb-db";
import { setActiveDraftId } from "@/lib/rpb-latest-draft";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRpbStore } from "@/store/rpb-store";
import type { SavedSummaryRecord } from "@/types/rpb";

const formatDateTime = (value: string) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const HISTORY_FETCH_LIMIT = 100;

interface DeleteDialogState {
  id: string;
  title: string;
  customerName: string;
  projectName: string;
}

export default function HistoryPage() {
  const router = useRouter();
  const loadSnapshot = useRpbStore((state) => state.loadSnapshot);
  const templateInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<SavedSummaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const rows = await fetchSummaryHistory(supabase, { limit: HISTORY_FETCH_LIMIT });
      setItems(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat riwayat.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleUse = (record: SavedSummaryRecord) => {
    loadSnapshot(record.snapshot);
    setActiveDraftId(record.id);
    router.push("/summary");
  };

  const handleExportTemplate = (record: SavedSummaryRecord) => {
    setError(null);
    setInfoMessage(null);

    try {
      const template = buildTemplatePayloadFromHistory(record);
      const blob = new Blob([stringifyTemplate(template)], {
        type: "application/json;charset=utf-8",
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = buildTemplateFileName(template.name);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setInfoMessage(`Template "${template.name}" berhasil diexport.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal export template.");
    }
  };

  const handleUploadTemplate = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (file.size > MAX_TEMPLATE_FILE_BYTES) {
      setError(
        `Ukuran file terlalu besar. Maksimal ${Math.round(MAX_TEMPLATE_FILE_BYTES / 1024)} KB.`,
      );
      return;
    }

    setImportBusy(true);
    setError(null);
    setInfoMessage(null);

    try {
      const rawText = await file.text();
      const template = parseTemplateText(rawText);
      const supabase = getSupabaseBrowserClient();
      const title = template.name || template.snapshot.projectName || "Imported Template";

      await saveSummaryHistory(supabase, {
        title,
        customerName: template.snapshot.customerName,
        projectName: template.snapshot.projectName,
        snapshot: template.snapshot,
      });
      await refresh();
      setInfoMessage(`Template "${title}" berhasil diimport ke riwayat kamu.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal import template.");
    } finally {
      setImportBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) {
      return;
    }

    setBusyId(deleteDialog.id);
    setError(null);
    setInfoMessage(null);
    try {
      const supabase = getSupabaseBrowserClient();
      await deleteSummaryHistory(supabase, deleteDialog.id);
      await refresh();
      setInfoMessage(`History "${deleteDialog.title}" disembunyikan dari daftar.`);
      setDeleteDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus history.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <RpbPageFrame shellClassName="rpb-compact">
      <div className="space-y-4 py-5 md:py-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href="/summary"
              className="rpb-btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
            >
              Kembali ke Summary
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={templateInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleUploadTemplate}
              />
              <button
                type="button"
                className="rpb-btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
                onClick={() => templateInputRef.current?.click()}
                disabled={importBusy}
              >
                <FileUp size={14} />
                {importBusy ? "Import..." : "Upload Template"}
              </button>
              <button
                type="button"
                className="rpb-btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
                onClick={() => void refresh()}
                disabled={loading}
              >
                {loading ? "Memuat..." : "Refresh"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rpb-alert rpb-alert-error">
              {error}
            </div>
          ) : null}
          {infoMessage ? (
            <div className="rpb-alert rpb-alert-success">
              {infoMessage}
            </div>
          ) : null}
          <section className="rpb-section p-4">
            <p className="mb-2 text-xs text-rpb-ink-soft">
              Menampilkan maksimal {HISTORY_FETCH_LIMIT} riwayat terbaru.
            </p>
            {loading ? (
              <p className="rpb-delayed-loader text-sm text-rpb-ink-soft">Memuat riwayat...</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-rpb-ink-soft">Belum ada riwayat tersimpan.</p>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className="flex flex-col gap-3 rounded-2xl border border-rpb-border bg-white p-4 md:flex-row md:items-start md:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{item.title}</p>
                      <p className="text-sm text-rpb-ink-soft">
                        Customer: {item.customerName || "-"} | Project: {item.projectName || "-"}
                      </p>
                      <p className="text-sm text-rpb-ink-soft">
                        Address: {item.snapshot.customerAddress || "-"}
                      </p>
                      <p className="text-xs text-rpb-ink-soft">
                        Jumlah AHU: {Array.isArray(item.snapshot.ahus) ? item.snapshot.ahus.length : 1}
                      </p>
                      <p className="text-xs text-rpb-ink-soft">
                        Dibuat oleh: {item.createdByEmail || "-"}
                      </p>
                      <p className="text-xs text-rpb-ink-soft">
                        Update: {formatDateTime(item.updatedAt)}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:w-auto md:shrink-0">
                      <button
                        type="button"
                        className="rpb-btn-ghost inline-flex min-w-[140px] items-center justify-center gap-2 px-3 py-2 text-sm font-semibold"
                        onClick={() => handleUse(item)}
                      >
                        <Upload size={14} />
                        Gunakan
                      </button>
                      <button
                        type="button"
                        className="rpb-btn-ghost inline-flex min-w-[140px] items-center justify-center gap-2 px-3 py-2 text-sm font-semibold"
                        onClick={() => handleExportTemplate(item)}
                      >
                        <Download size={14} />
                        Export
                      </button>
                      <button
                        type="button"
                        className="rpb-btn-ghost inline-flex min-w-[140px] items-center justify-center border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                        onClick={() =>
                          setDeleteDialog({
                            id: item.id,
                            title: item.title,
                            customerName: item.customerName,
                            projectName: item.projectName,
                          })
                        }
                        disabled={busyId === item.id}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Trash2 size={14} />
                          {busyId === item.id ? "Menghapus..." : "Hapus"}
                        </span>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          {deleteDialog ? (
            <div
              className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] backdrop-blur-[2px] md:items-center md:py-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="history-delete-title"
            >
              <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-rpb-border bg-white shadow-2xl">
                <div className="border-b border-rpb-border px-5 py-4">
                  <p id="history-delete-title" className="text-lg font-semibold text-foreground">
                    Hapus history?
                  </p>
                  <p className="mt-1 max-w-[32ch] text-sm leading-relaxed text-rpb-ink-soft">
                    Aksi ini tidak bisa dibatalkan.
                  </p>
                </div>
                <div className="space-y-4 px-5 py-4">
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm">
                    <p className="font-semibold text-red-800">{deleteDialog.title}</p>
                    <p className="mt-1 leading-relaxed text-red-700">
                      Customer: {deleteDialog.customerName || "-"} | Project: {deleteDialog.projectName || "-"}
                    </p>
                  </div>
                  <p className="text-sm leading-relaxed text-rpb-ink-soft">
                    Pastikan data yang dipilih sudah benar.
                  </p>
                </div>
                <div className="flex flex-col-reverse gap-2 border-t border-rpb-border px-5 py-4 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      className="rpb-btn-ghost px-4 py-2 text-sm font-semibold"
                      onClick={() => setDeleteDialog(null)}
                      disabled={busyId === deleteDialog.id}
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      className="rpb-btn-primary inline-flex items-center justify-center px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed"
                      onClick={() => void handleDelete()}
                      disabled={busyId === deleteDialog.id}
                    >
                      {busyId === deleteDialog.id ? "Menghapus..." : "Ya, hapus"}
                    </button>
                  </div>
              </div>
            </div>
          ) : null}
      </div>
    </RpbPageFrame>
  );
}
