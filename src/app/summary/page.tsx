"use client";

import {
  calculateFixedBreakdowns,
  formatQty,
  formatRupiah,
} from "@/lib/rpb-calculator";
import { RpbPageFrame } from "@/components/layout/rpb-page-frame";
import { useRpbMasterData } from "@/hooks/use-rpb-master-data";
import { buildAhuSummaries } from "@/lib/rpb-line-items";
import { saveSummaryHistory, updateSummaryHistory } from "@/lib/rpb-db";
import {
  getActiveDraftId,
  setActiveDraftId,
} from "@/lib/rpb-latest-draft";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRpbStore } from "@/store/rpb-store";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Minus,
  Plus,
  RotateCcw,
  Save,
} from "lucide-react";
import type { RowInput } from "jspdf-autotable";
import Link from "next/link";
import type { FocusEvent, FormEvent } from "react";
import { useMemo, useState } from "react";

const normalizeNumericInput = (value: string): string => {
  const normalizedDot = value.replace(",", ".");

  if (normalizedDot === "" || normalizedDot === "." || normalizedDot === "-") {
    return normalizedDot;
  }

  if (normalizedDot.startsWith("0.") || normalizedDot.startsWith("-0.")) {
    return normalizedDot;
  }

  return normalizedDot.replace(/^(-?)0+(?=\d)/, "$1");
};

const parsePercentInput = (value: string): number => {
  const parsed = Number.parseFloat(normalizeNumericInput(value));
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return parsed;
};

const selectInputOnFocus = (event: FocusEvent<HTMLInputElement>) => {
  event.currentTarget.select();
};

const buildDefaultHistoryTitle = (projectName: string): string =>
  `${projectName || "RPB"} - ${new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date())}`;

interface CalculationRow {
  key: string;
  label: string;
  value: number;
  highlight?: boolean;
}

const toTitleCase = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

const buildDetailLabel = (itemType: string): string => `Detail ${toTitleCase(itemType)}`;

export default function SummaryPage() {
  const { data: masterData, loading: masterLoading, error: masterError } = useRpbMasterData();
  const customerName = useRpbStore((state) => state.customerName);
  const projectName = useRpbStore((state) => state.projectName);
  const customerAddress = useRpbStore((state) => state.customerAddress);
  const ahus = useRpbStore((state) => state.ahus);
  const adjustments = useRpbStore((state) => state.adjustments);
  const setAhuOtherQty = useRpbStore((state) => state.setAhuOtherQty);
  const setAhuCustomOtherItemQty = useRpbStore((state) => state.setAhuCustomOtherItemQty);
  const setAdjustment = useRpbStore((state) => state.setAdjustment);
  const getSnapshot = useRpbStore((state) => state.getSnapshot);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveTitleInput, setSaveTitleInput] = useState("");
  const [openAhuIds, setOpenAhuIds] = useState<string[]>(() => ahus.map((ahu) => ahu.id));

  const { ahuSummaries, totals } = useMemo(
    () =>
      buildAhuSummaries({
        ahus,
        adjustments,
        profileItems: masterData?.profileItems ?? [],
        konstruksiItems: masterData?.konstruksiItems ?? [],
        otherItems: masterData?.otherItems ?? [],
      }),
    [adjustments, ahus, masterData?.konstruksiItems, masterData?.otherItems, masterData?.profileItems],
  );

  const calculationRows: CalculationRow[] = [
    { key: "subtotal", label: "Subtotal", value: totals.subtotalIdr },
    { key: "stock", label: `Stock Return (${adjustments.stockReturn}%)`, value: totals.stockReturnIdr },
    {
      key: "marketing",
      label: `Marketing Cost (${adjustments.marketingCost}%)`,
      value: totals.marketingCostIdr,
    },
    { key: "services", label: `Services (${adjustments.services}%)`, value: totals.servicesIdr },
    { key: "profit", label: `Profit (${adjustments.profit}%)`, value: totals.profitIdr },
    { key: "grand", label: "GRAND TOTAL", value: totals.grandTotalIdr, highlight: true },
  ];

  const updateQty = (ahuId: string, itemId: string, qty: number) => {
    if (itemId.startsWith("stock-")) {
      const stockId = itemId.replace("stock-", "");
      setAhuOtherQty(ahuId, stockId, Math.max(0, qty));
      return;
    }

    if (itemId.startsWith("custom-")) {
      const customId = itemId.replace("custom-", "");
      setAhuCustomOtherItemQty(ahuId, customId, Math.max(0, qty));
    }
  };

  const getFixedDetailRows = (ahuIndex: number, itemId: string) => {
    const ahu = ahus[ahuIndex];
    if (!ahu) {
      return [];
    }

    const { profileRows, konstruksiRows } = calculateFixedBreakdowns(
      ahu.dimensions,
      ahu.panelThickness,
      masterData?.profileItems ?? [],
      masterData?.konstruksiItems ?? [],
    );

    if (itemId === "profile") {
      return profileRows;
    }
    if (itemId === "konstruksi") {
      return konstruksiRows;
    }
    return [];
  };

  const submitSaveState = async (rawTitle: string) => {
    setSaveBusy(true);
    setSaveMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const title = rawTitle.trim() || projectName || "RPB Summary";
      const snapshot = getSnapshot();
      const activeId = getActiveDraftId();

      if (activeId) {
        const updated = await updateSummaryHistory(supabase, activeId, {
          title,
          customerName,
          projectName,
          snapshot,
        });

        if (!updated) {
          const created = await saveSummaryHistory(supabase, {
            title,
            customerName,
            projectName,
            snapshot,
          });
          setActiveDraftId(created.id);
          setSaveMessage("Draft sebelumnya tidak ditemukan, tersimpan sebagai entry baru.");
        } else {
          setSaveMessage("Quotation berhasil di-update di database.");
        }
      } else {
        const created = await saveSummaryHistory(supabase, {
          title,
          customerName,
          projectName,
          snapshot,
        });
        setActiveDraftId(created.id);
        setSaveMessage("Quotation berhasil disimpan ke database.");
      }
      setSaveModalOpen(false);
    } catch (error) {
      setSaveMessage(
        error instanceof Error ? `Gagal menyimpan history: ${error.message}` : "Gagal menyimpan.",
      );
    } finally {
      setSaveBusy(false);
    }
  };

  const openSaveModal = () => {
    setSaveMessage(null);
    setSaveTitleInput(buildDefaultHistoryTitle(projectName));
    setSaveModalOpen(true);
  };

  const closeSaveModal = () => {
    if (saveBusy) {
      return;
    }
    setSaveModalOpen(false);
  };

  const handleSaveModalSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitSaveState(saveTitleInput);
  };

  const toggleAhuOpen = (ahuId: string) => {
    setOpenAhuIds((current) =>
      current.includes(ahuId) ? current.filter((item) => item !== ahuId) : [...current, ahuId],
    );
  };

  const downloadPdf = async () => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const dateText = new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date());

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("RPB Summary", 14, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Customer Name : ${customerName || "-"}`, 14, 26);
    doc.text(`Project Name    : ${projectName || "-"}`, 14, 32);
    doc.text(`Customer Address : ${customerAddress || "-"}`, 14, 38);
    doc.text(`Date                 : ${dateText}`, 14, 44);

    const tableHead = [["No", "Jenis", "Keterangan", "Satuan", "Jenis Spec", "Qty", "Harga", "Total"]];
    const tableBody: RowInput[] = [];
    const pdfBodyRowKinds: Array<"ahu" | "main-even" | "main-odd" | "detail"> = [];
    let globalIndex = 1;

    ahuSummaries.forEach((summary, ahuIndex) => {
      tableBody.push([
        {
          content: `${summary.ahu.name} - Subtotal ${formatRupiah(summary.subtotalIdr)}`,
          colSpan: 8,
          styles: {
            fillColor: [230, 238, 255],
            textColor: [31, 35, 64],
            fontStyle: "bold",
          },
        },
      ]);
      pdfBodyRowKinds.push("ahu");

      summary.lineItems.forEach((item, index) => {
        tableBody.push([
          String(globalIndex),
          item.jenis,
          item.keterangan,
          item.satuan,
          item.jenisSpec,
          formatQty(item.qty),
          formatRupiah(item.hargaIdr),
          formatRupiah(item.hargaIdr * item.qty),
        ]);
        pdfBodyRowKinds.push(index % 2 === 0 ? "main-even" : "main-odd");
        globalIndex += 1;

        const fixedRows = getFixedDetailRows(ahuIndex, item.id);
        fixedRows.forEach((row, detailIndex) => {
          tableBody.push([
            "",
            detailIndex === 0 ? buildDetailLabel(item.jenis) : "",
            `${detailIndex + 1}. ${row.name}`,
            row.unit,
            "",
            formatQty(row.qty),
            formatRupiah(row.unitPriceIdr),
            formatRupiah(row.totalIdr),
          ]);
          pdfBodyRowKinds.push("detail");
        });
      });
    });

    const tableFoot: RowInput[] = calculationRows.map((row) => [
      {
        content: "",
        colSpan: 6,
        styles: {
          fillColor: row.highlight ? [46, 49, 146] : [245, 251, 255],
          lineColor: [217, 219, 239],
          lineWidth: 0.15,
        },
      },
      {
        content: row.label,
        styles: {
          fillColor: row.highlight ? [46, 49, 146] : [245, 251, 255],
          textColor: row.highlight ? [255, 255, 255] : [75, 82, 122],
          halign: "right",
          fontStyle: row.highlight ? "bold" : "normal",
          lineColor: [217, 219, 239],
          lineWidth: 0.15,
        },
      },
      {
        content: formatRupiah(row.value),
        styles: {
          fillColor: row.highlight ? [46, 49, 146] : [245, 251, 255],
          textColor: row.highlight ? [255, 255, 255] : [31, 35, 64],
          halign: "right",
          fontStyle: "bold",
          lineColor: [217, 219, 239],
          lineWidth: 0.15,
        },
      },
    ] as RowInput);

    autoTable(doc, {
      startY: 51,
      head: tableHead,
      body: tableBody,
      foot: tableFoot,
      showFoot: "lastPage",
      theme: "plain",
      styles: {
        fontSize: 8.3,
        cellPadding: { top: 1.8, right: 1.6, bottom: 1.8, left: 1.6 },
        textColor: [31, 35, 64],
        lineColor: [223, 227, 243],
        lineWidth: { bottom: 0.15 },
      },
      headStyles: {
        fillColor: [46, 49, 146],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
        lineWidth: 0,
      },
      columnStyles: {
        0: { cellWidth: 8, halign: "center", valign: "top" },
        1: { cellWidth: 18, halign: "left" },
        2: { cellWidth: 52, halign: "left" },
        3: { cellWidth: 14, halign: "left" },
        4: { cellWidth: 18, halign: "left" },
        5: { cellWidth: 12, halign: "center" },
        6: { cellWidth: 28, halign: "right" },
        7: { cellWidth: 30, halign: "right" },
      },
      didParseCell: (data) => {
        if (data.section === "head") {
          data.cell.styles.halign = "center";
          return;
        }

        if (data.section === "body") {
          const kind = pdfBodyRowKinds[data.row.index];
          if (kind === "ahu") {
            data.cell.styles.fontStyle = "bold";
          }
          if (kind === "main-even") {
            data.cell.styles.fillColor = [255, 255, 255];
          }
          if (kind === "main-odd") {
            data.cell.styles.fillColor = [252, 253, 255];
          }
          if (kind === "detail") {
            data.cell.styles.fillColor = [244, 247, 251];
            data.cell.styles.fontSize = 7.8;
            data.cell.styles.textColor = [75, 82, 122];
          }
        }
      },
    });

    const safeProjectName = (projectName || "summary")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "");
    const now = new Date();
    const uniqueStamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      "-",
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
      "-",
      String(now.getMilliseconds()).padStart(3, "0"),
    ].join("");
    doc.save(`RPB-${safeProjectName || "summary"}-${uniqueStamp}.pdf`);
  };

  return (
    <RpbPageFrame shellClassName="rpb-compact">
      <div className="space-y-4 py-5 md:space-y-3 md:py-6">
        <nav className="flex items-center gap-1.5 text-xs text-rpb-ink-soft">
          <Link href="/" className="hover:text-rpb-primary transition-colors">Beranda</Link>
          <span>/</span>
          <span className="font-semibold text-foreground">Ringkasan</span>
        </nav>
        {masterLoading ? (
          <div className="rpb-section p-4">
            <div className="space-y-3">
              <div className="rpb-skeleton rpb-skeleton-line" />
              <div className="rpb-skeleton rpb-skeleton-line" />
              <div className="rpb-skeleton rpb-skeleton-line" />
            </div>
          </div>
        ) : null}
        {masterError ? (
          <div className="rpb-alert rpb-alert-error flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{masterError}</span>
            <button
              type="button"
              className="rpb-btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
              onClick={() => window.location.reload()}
            >
              <RotateCcw size={12} />
              Coba Lagi
            </button>
          </div>
        ) : null}
        {saveMessage ? <div className="rpb-alert rpb-alert-info">{saveMessage}</div> : null}

        <section className="rpb-section p-4 md:p-4">
          <div className="grid gap-2 md:grid-cols-4">
            <label className="flex flex-col gap-2 text-sm font-semibold text-rpb-ink-soft">
              Stock Return (%)
              <input
                className="rpb-input"
                type="number"
                min={0}
                max={100}
                step="any"
                value={adjustments.stockReturn}
                onFocus={selectInputOnFocus}
                onChange={(event) =>
                  setAdjustment("stockReturn", parsePercentInput(event.target.value))
                }
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-rpb-ink-soft">
              Marketing Cost (%)
              <input
                className="rpb-input"
                type="number"
                min={0}
                max={100}
                step="any"
                value={adjustments.marketingCost}
                onFocus={selectInputOnFocus}
                onChange={(event) =>
                  setAdjustment("marketingCost", parsePercentInput(event.target.value))
                }
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-rpb-ink-soft">
              Services (%)
              <input
                className="rpb-input"
                type="number"
                min={0}
                max={100}
                step="any"
                value={adjustments.services}
                onFocus={selectInputOnFocus}
                onChange={(event) =>
                  setAdjustment("services", parsePercentInput(event.target.value))
                }
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-rpb-ink-soft">
              Profit (%)
              <input
                className="rpb-input"
                type="number"
                min={0}
                max={100}
                step="any"
                value={adjustments.profit}
                onFocus={selectInputOnFocus}
                onChange={(event) => setAdjustment("profit", parsePercentInput(event.target.value))}
              />
            </label>
          </div>
        </section>

        <section className="space-y-3">
          {ahuSummaries.map((summary, ahuIndex) => {
            const isOpen = openAhuIds.includes(summary.ahu.id);

            return (
              <article key={summary.ahu.id} className="rpb-section p-3 md:p-4">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 text-left"
                  onClick={() => toggleAhuOpen(summary.ahu.id)}
                >
                  <div>
                    <h3 className="rpb-h-title text-base font-semibold">{summary.ahu.name}</h3>
                    <p className="text-xs text-rpb-ink-soft">
                      Subtotal AHU: {formatRupiah(summary.subtotalIdr)}
                    </p>
                  </div>
                  {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {isOpen ? (
                  <div className="mt-3">
                    <div className="hidden lg:block">
                      <table className="rpb-table w-full text-sm" style={{ tableLayout: "fixed" }}>
                        <thead>
                          <tr>
                            <th style={{ width: "5%", textAlign: "center" }}>No</th>
                            <th style={{ width: "13%", textAlign: "center" }}>Jenis</th>
                            <th style={{ width: "22%", textAlign: "center" }}>Keterangan</th>
                            <th style={{ width: "7%", textAlign: "center" }}>Satuan</th>
                            <th style={{ width: "13%", textAlign: "center" }}>Jenis Spec</th>
                            <th style={{ width: "11%", textAlign: "center" }}>Qty</th>
                            <th style={{ width: "14.5%", textAlign: "center" }}>Harga</th>
                            <th style={{ width: "14.5%", textAlign: "center" }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.lineItems.map((item, index) => {
                            const isEditable = item.id.startsWith("stock-") || item.id.startsWith("custom-");
                            const hasFixedDetail = item.id === "profile" || item.id === "konstruksi";
                            const fixedDetailRows = hasFixedDetail ? getFixedDetailRows(ahuIndex, item.id) : [];
                            const lineTotalIdr = item.qty * item.hargaIdr;

                            return [
                              <tr key={item.id} className={index % 2 === 0 ? "bg-white" : "bg-[#fcfdff]"}>
                                <td className="text-center align-top">{index + 1}</td>
                                <td className="align-top font-semibold leading-tight">{item.jenis}</td>
                                <td className="align-top leading-tight">{item.keterangan}</td>
                                <td className="align-top leading-tight">{item.satuan}</td>
                                <td className="align-top leading-tight">{item.jenisSpec || "-"}</td>
                                <td className="align-middle text-center whitespace-nowrap">
                                  {isEditable ? (
                                    <div className="inline-flex items-center gap-1 whitespace-nowrap">
                                      <button
                                        type="button"
                                        className="rpb-btn-ghost inline-flex h-11 w-11 items-center justify-center"
                                        onClick={() => updateQty(summary.ahu.id, item.id, item.qty - 1)}
                                      >
                                        <Minus size={14} />
                                      </button>
                                      <span className="min-w-4 text-center text-xs font-semibold">
                                        {formatQty(item.qty)}
                                      </span>
                                      <button
                                        type="button"
                                        className="rpb-btn-primary inline-flex h-11 w-11 items-center justify-center"
                                        onClick={() => updateQty(summary.ahu.id, item.id, item.qty + 1)}
                                      >
                                        <Plus size={14} />
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-xs font-semibold">{formatQty(item.qty)}</span>
                                  )}
                                </td>
                                <td className="align-top text-right whitespace-nowrap">{formatRupiah(item.hargaIdr)}</td>
                                <td className="align-top text-right font-semibold whitespace-nowrap">
                                  {formatRupiah(lineTotalIdr)}
                                </td>
                              </tr>,
                              hasFixedDetail
                                ? fixedDetailRows.map((row, rowIndex) => (
                                    <tr key={`${item.id}-detail-${row.id}`} className="bg-[#f4f7fb]">
                                      <td className="text-center align-top text-[10px] text-rpb-ink-soft">
                                        {rowIndex === 0 ? "•" : ""}
                                      </td>
                                      <td className="align-top text-[10px] font-semibold leading-tight text-rpb-ink-soft">
                                        {rowIndex === 0 ? buildDetailLabel(item.jenis) : ""}
                                      </td>
                                      <td className="align-top text-[10px] leading-tight">
                                        {rowIndex + 1}. {row.name}
                                      </td>
                                      <td className="align-top text-[10px] leading-tight">{row.unit}</td>
                                      <td className="align-top text-[10px] leading-tight">-</td>
                                      <td className="align-top text-center text-[10px] leading-tight">
                                        {formatQty(row.qty)}
                                      </td>
                                      <td className="align-top text-right text-[10px] leading-tight whitespace-nowrap">
                                        {formatRupiah(row.unitPriceIdr)}
                                      </td>
                                      <td className="align-top text-right text-[10px] font-semibold leading-tight whitespace-nowrap">
                                        {formatRupiah(row.totalIdr)}
                                      </td>
                                    </tr>
                                  ))
                                : null,
                            ];
                          })}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={6} className="bg-[#eceef8]" />
                            <td className="bg-[#eceef8] text-right text-rpb-ink-soft">Subtotal AHU</td>
                            <td className="bg-[#eceef8] text-right font-semibold">
                              {formatRupiah(summary.subtotalIdr)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <div className="space-y-2 lg:hidden">
                      {summary.lineItems.map((item, index) => {
                        const isEditable = item.id.startsWith("stock-") || item.id.startsWith("custom-");
                        const lineTotalIdr = item.qty * item.hargaIdr;

                        return (
                          <article key={item.id} className="rounded-xl border border-rpb-border bg-white px-3 py-2">
                            <div className="mb-1 flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[11px] font-semibold leading-tight">
                                  {index + 1}. {item.jenis}
                                </p>
                                <p className="text-[10px] leading-tight text-rpb-ink-soft">{item.keterangan}</p>
                              </div>
                              <div className="shrink-0">
                                {isEditable ? (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      className="rpb-btn-ghost inline-flex h-11 w-11 items-center justify-center"
                                      onClick={() => updateQty(summary.ahu.id, item.id, item.qty - 1)}
                                    >
                                      <Minus size={14} />
                                    </button>
                                    <span className="min-w-4 text-center text-[11px] font-semibold">
                                      {formatQty(item.qty)}
                                    </span>
                                    <button
                                      type="button"
                                      className="rpb-btn-primary inline-flex h-11 w-11 items-center justify-center"
                                      onClick={() => updateQty(summary.ahu.id, item.id, item.qty + 1)}
                                    >
                                      <Plus size={14} />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[11px] font-semibold">Qty {formatQty(item.qty)}</span>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 border-t border-rpb-border pt-1.5 text-[10px]">
                              <div className="text-right">
                                <p className="text-rpb-ink-soft">Harga</p>
                                <p className="font-semibold leading-tight whitespace-nowrap">
                                  {formatRupiah(item.hargaIdr)}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-rpb-ink-soft">Total</p>
                                <p className="font-semibold leading-tight whitespace-nowrap">
                                  {formatRupiah(lineTotalIdr)}
                                </p>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>

        <section className="rpb-section p-3 md:p-4">
          <h3 className="rpb-h-title mb-2 text-base font-semibold">Ringkasan Global</h3>
          <div className="overflow-hidden rounded-md border border-rpb-border bg-white">
            <div className="divide-y divide-rpb-border">
              {calculationRows.map((row) => (
                <div
                  key={row.key}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2 ${
                    row.highlight ? "bg-[#373d77]" : "bg-[#eceef8]"
                  }`}
                >
                  <p className={row.highlight ? "font-bold text-white" : "text-rpb-ink-soft"}>{row.label}</p>
                  <p className={row.highlight ? "font-bold text-white" : "font-semibold text-foreground"}>
                    {formatRupiah(row.value)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="no-print rpb-section p-3 md:p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Link
              href="/"
              className="rpb-btn-ghost inline-flex h-11 items-center justify-center gap-2 px-4 py-2 text-sm font-semibold md:justify-start"
            >
              <ArrowLeft size={16} />
              Kembali
            </Link>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:flex md:flex-wrap md:justify-end">
              <button
                type="button"
                className="rpb-btn-ghost inline-flex h-11 items-center justify-center gap-2 px-4 py-2 text-sm font-semibold"
                onClick={openSaveModal}
                disabled={saveBusy}
                title="Simpan / update quotation aktif ke database"
              >
                <Save size={15} />
                {saveBusy ? "Menyimpan..." : "Simpan"}
              </button>
              <Link
                href="/quotation"
                className="rpb-btn-primary inline-flex h-11 items-center justify-center gap-2 px-4 py-2 text-sm font-semibold"
              >
                <FileText size={15} />
                Buat Penawaran
              </Link>
              <button
                type="button"
                className="rpb-btn-ghost inline-flex h-11 items-center justify-center gap-2 px-4 py-2 text-sm font-semibold"
                onClick={() => void downloadPdf()}
              >
                <Download size={15} />
                Unduh PDF
              </button>
            </div>
          </div>
        </section>
      </div>

      {saveModalOpen ? (
        <div className="rpb-modal-backdrop fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-[#15172b]/45 p-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] backdrop-blur-[2px] md:items-center md:pb-6">
          <div className="rpb-modal-panel flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-rpb-border bg-white shadow-xl">
            <div className="rpb-topbar px-5 py-4 text-white">
              <h3 className="rpb-h-title text-lg font-semibold">Simpan Quotation</h3>
            </div>
            <form className="space-y-4 overflow-y-auto p-5" onSubmit={handleSaveModalSubmit}>
              <p className="text-xs text-rpb-ink-soft">Update quotation aktif. Jika belum ada, akan dibuat entry baru.</p>
              <label className="flex flex-col gap-2 text-sm font-semibold text-rpb-ink-soft">
                Nama history (opsional)
                <input
                  className="rpb-input"
                  value={saveTitleInput}
                  onChange={(event) => setSaveTitleInput(event.target.value)}
                  onFocus={selectInputOnFocus}
                  autoFocus
                />
              </label>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rpb-btn-ghost px-4 py-2 text-sm font-semibold"
                  onClick={closeSaveModal}
                  disabled={saveBusy}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rpb-btn-primary px-4 py-2 text-sm font-semibold"
                  disabled={saveBusy}
                >
                  {saveBusy ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </RpbPageFrame>
  );
}
