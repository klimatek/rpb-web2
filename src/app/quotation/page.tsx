"use client";

import { RpbPageFrame } from "@/components/layout/rpb-page-frame";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useRpbMasterData } from "@/hooks/use-rpb-master-data";
import { buildAhuSummaries } from "@/lib/rpb-line-items";
import { saveSummaryHistory, updateSummaryHistory } from "@/lib/rpb-db";
import {
  getActiveDraftId,
  setActiveDraftId,
} from "@/lib/rpb-latest-draft";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRpbStore } from "@/store/rpb-store";
import { Download, FileSpreadsheet, Save } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { RowInput } from "jspdf-autotable";
import { useEffect, useMemo, useRef, useState } from "react";

const numberFormatter = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

function toNumber(value: string): number {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDiscount(value: string): number {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.replace("%", "");
  let n = toNumber(normalized);
  if (n > 1) n /= 100;
  if (n < 0) n = 0;
  if (n > 1) n = 1;
  return n;
}

function toQuotationMarkupFactor(discountRate: number): number {
  const safeDiscountRate = Number.isFinite(discountRate) ? discountRate : 0;
  const denominator = 1 - safeDiscountRate;
  if (denominator <= 0) return 1;
  return 1 / denominator;
}

function sanitizeFilePart(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function buildQuotationFileName(quotationNo: string, preparedFor: string, extension: "pdf" | "xlsx"): string {
  const safeQuotationNo = sanitizeFilePart(quotationNo) || "quotation";
  const safePreparedFor = sanitizeFilePart(preparedFor) || "customer";
  return `${safeQuotationNo}-${safePreparedFor}.${extension}`;
}

function cleanPdfText(value: string): string {
  return String(value ?? "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\u00A0/g, " ")
    .trim();
}

function formatPdfCurrency(value: number): string {
  return currencyFormatter.format(value).replace(/\u00A0/g, " ");
}

function loadImageAsDataUrl(src: string): Promise<string> {
  return fetch(src)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Gagal memuat logo quotation.");
      }
      return response.blob();
    })
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Gagal membaca logo quotation."));
          reader.readAsDataURL(blob);
        }),
    );
}

function renderBoldInline(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g).filter((part) => part.length > 0);
  return parts.map((part, index) => {
    const boldMatch = /^\*\*(.*)\*\*$/.exec(part);
    if (boldMatch) {
      return <strong key={`b-${index}`}>{boldMatch[1]}</strong>;
    }
    return <span key={`n-${index}`}>{part}</span>;
  });
}

function renderRichMultilineText(value: string) {
  const normalized = String(value ?? "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length === 0) {
    return "-";
  }
  return lines.map((line, index) => (
    <span key={`line-${index}`}>
      {line.length > 0 ? renderBoldInline(line) : "\u00A0"}
      {index < lines.length - 1 ? <br /> : null}
    </span>
  ));
}

export default function QuotationPage() {
  const { user } = useAuthSession();
  const { data: masterData } = useRpbMasterData();

  const customerName = useRpbStore((state) => state.customerName);
  const projectName = useRpbStore((state) => state.projectName);
  const customerAddress = useRpbStore((state) => state.customerAddress);
  const ahus = useRpbStore((state) => state.ahus);
  const setAhuQuotationDescription = useRpbStore((state) => state.setAhuQuotationDescription);
  const setAhuQuotationQty = useRpbStore((state) => state.setAhuQuotationQty);
  const quotationContent = useRpbStore((state) => state.quotationContent);
  const setQuotationContentField = useRpbStore((state) => state.setQuotationContentField);
  const getSnapshot = useRpbStore((state) => state.getSnapshot);

  const [accountName, setAccountName] = useState("");
  const [accountPhone, setAccountPhone] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const attnInputRef = useRef<HTMLInputElement>(null);
  const additionalInfoRef = useRef<HTMLTextAreaElement>(null);
  const descriptionRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const a4ShellRef = useRef<HTMLDivElement>(null);
  const a4PageRef = useRef<HTMLElement>(null);
  const [a4Scale, setA4Scale] = useState(1);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    const onlyStars = (value: string): boolean => /^\s*\*+\s*$/.test(value);
    if (onlyStars(quotationContent.attn)) {
      setQuotationContentField("attn", "");
    }
    if (onlyStars(quotationContent.additionalInformation)) {
      setQuotationContentField("additionalInformation", "");
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const shell = a4ShellRef.current;
    if (!shell || typeof window === "undefined") {
      return;
    }

    let frameId: number | null = null;
    const updateScale = (width: number) => {
      const nextScale = Math.max(0.2, Math.min(1, width / A4_WIDTH_PX));
      setA4Scale((prev) => (Math.abs(prev - nextScale) < 0.001 ? prev : nextScale));
    };

    const measureNow = () => updateScale(shell.clientWidth);
    measureNow();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measureNow);
      return () => window.removeEventListener("resize", measureNow);
    }

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? shell.clientWidth;
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => updateScale(width));
    });
    observer.observe(shell);

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setAccountName("");
      setAccountPhone("");
      setAccountEmail("");
      return;
    }

    const loadProfile = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase
          .from("user_profiles")
          .select("full_name, phone_number, email")
          .eq("id", user.id)
          .maybeSingle();

        const fallbackName =
          String(user.user_metadata?.full_name ?? "").trim() ||
          String(user.user_metadata?.name ?? "").trim() ||
          String(user.email ?? "").trim();

        setAccountName(String(data?.full_name ?? fallbackName).trim());
        setAccountPhone(String(data?.phone_number ?? "").trim());
        setAccountEmail(String(data?.email ?? user.email ?? "").trim());
      } catch {
        const fallbackName =
          String(user.user_metadata?.full_name ?? "").trim() ||
          String(user.user_metadata?.name ?? "").trim() ||
          String(user.email ?? "").trim();
        setAccountName(fallbackName);
        setAccountPhone("");
        setAccountEmail(String(user.email ?? "").trim());
      }
    };

    void loadProfile();
  }, [user]);

  const effectivePreparedFor = useMemo(
    () => quotationContent.preparedForOverride.trim() || customerName,
    [customerName, quotationContent.preparedForOverride],
  );
  const effectiveCustomerAddress = useMemo(
    () => quotationContent.customerAddressOverride.trim() || customerAddress,
    [customerAddress, quotationContent.customerAddressOverride],
  );
  const effectiveContactPerson = useMemo(
    () => quotationContent.contactPersonOverride.trim() || accountName,
    [accountName, quotationContent.contactPersonOverride],
  );
  const effectivePhoneNumber = useMemo(
    () => quotationContent.phoneNumberOverride.trim() || accountPhone,
    [accountPhone, quotationContent.phoneNumberOverride],
  );
  const effectiveSalesName = useMemo(
    () => quotationContent.salesNameOverride.trim() || accountName,
    [accountName, quotationContent.salesNameOverride],
  );
  const effectiveSalesEmail = useMemo(
    () => quotationContent.salesEmailOverride.trim() || accountEmail,
    [accountEmail, quotationContent.salesEmailOverride],
  );

  const { ahuSummaries } = useMemo(
    () =>
      buildAhuSummaries({
        ahus,
        profileItems: masterData?.profileItems ?? [],
        konstruksiItems: masterData?.konstruksiItems ?? [],
        otherItems: masterData?.otherItems ?? [],
      }),
    [ahus, masterData?.konstruksiItems, masterData?.otherItems, masterData?.profileItems],
  );

  const ppnRate = useMemo(() => {
    const variables = masterData?.formulaVariables ?? [];
    const ppnVar = variables.find((v) => v.key === "ppn_rate");
    if (ppnVar && Number.isFinite(ppnVar.defaultValue) && ppnVar.defaultValue > 0) {
      return ppnVar.defaultValue / 100;
    }
    return 0.11;
  }, [masterData?.formulaVariables]);

  const ppnPercent = useMemo(() => Math.round(ppnRate * 100), [ppnRate]);

  const preview = useMemo(() => {
    const discountRate = toDiscount(quotationContent.discount);
    const hasAdditionalDiscount = quotationContent.additionalDiscount.trim().length > 0;
    const additionalDiscountRate = toDiscount(quotationContent.additionalDiscount);
    const quotationMarkupFactor = toQuotationMarkupFactor(discountRate);

    const items = ahuSummaries.map((summary) => {
      const quantity = Math.max(1, summary.ahu.quotationQty);
      const price = summary.grandTotalIdr * quotationMarkupFactor;
      const total = quantity * price;

      return {
        id: summary.ahu.id,
        name: summary.ahu.name,
        description: summary.ahu.quotationDescription,
        quantity,
        price,
        total,
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const discountAmount = subtotal * discountRate;
    const subtotalAfterDiscount = subtotal - discountAmount;
    const additionalDiscountAmount = hasAdditionalDiscount
      ? subtotalAfterDiscount * additionalDiscountRate
      : 0;
    const taxableSubtotal = subtotalAfterDiscount - additionalDiscountAmount;
    const ppn = taxableSubtotal * ppnRate;
    const grandTotal = taxableSubtotal + ppn;

    return {
      items,
      hasAdditionalDiscount,
      discountRate,
      additionalDiscountRate,
      subtotal,
      discountAmount,
      additionalDiscountAmount,
      ppn,
      grandTotal,
      contactPerson: [effectiveContactPerson, effectivePhoneNumber].filter(Boolean).join(" / "),
    };
  }, [
    ahuSummaries,
    effectiveContactPerson,
    effectivePhoneNumber,
    quotationContent.additionalDiscount,
    quotationContent.discount,
    ppnRate,
  ]);

  const quotationDate = useMemo(
    () =>
      new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date()),
    [],
  );

  const quotationNo = useMemo(() => {
    const customQuotationNo = quotationContent.quotationNo.trim();
    if (customQuotationNo) {
      return customQuotationNo;
    }

    const date = new Date();
    return `Q-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  }, [quotationContent.quotationNo]);

  const applyBoldToControl = (
    control: HTMLInputElement | HTMLTextAreaElement | null,
    getValue: () => string,
    setValue: (value: string) => void,
  ) => {
    if (!control) return;

    const start = control.selectionStart ?? 0;
    const end = control.selectionEnd ?? 0;
    const currentValue = getValue();
    const selected = currentValue.slice(start, end);

    if (!selected) {
      control.focus();
      return;
    }

    const wrapped = `**${selected}**`;
    const nextValue = `${currentValue.slice(0, start)}${wrapped}${currentValue.slice(end)}`;
    setValue(nextValue);
    requestAnimationFrame(() => {
      control.focus();
      control.setSelectionRange(start + 2, end + 2);
    });
  };

  const persist = async () => {
    setSaveMessage(null);
    setError(null);
    setSaveBusy(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const snapshot = getSnapshot();
      const titleBase = projectName || customerName || "Quotation";
      const title = `${titleBase} - ${new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date())}`;

      const activeId = getActiveDraftId();

      if (activeId) {
        const updated = await updateSummaryHistory(supabase, activeId, {
          title,
          customerName,
          projectName,
          snapshot,
        });

        if (!updated) {
          // row was deleted/inaccessible -> fall back to insert
          const created = await saveSummaryHistory(supabase, {
            title,
            customerName,
            projectName,
            snapshot,
          });
          setActiveDraftId(created.id);
          setSaveMessage("Draft sebelumnya tidak ditemukan, tersimpan sebagai entry baru.");
          return;
        }

        setSaveMessage("Quotation berhasil di-update di database.");
        return;
      }

      const created = await saveSummaryHistory(supabase, {
        title,
        customerName,
        projectName,
        snapshot,
      });
      setActiveDraftId(created.id);
      setSaveMessage("Quotation berhasil disimpan ke database.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan ke database.");
    } finally {
      setSaveBusy(false);
    }
  };

  const downloadExcel = async () => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/quotation/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotationDate,
          quotationNo,
          preparedFor: effectivePreparedFor,
          customerAddress: effectiveCustomerAddress,
          attn: quotationContent.attn,
          salesName: effectiveSalesName,
          salesEmail: effectiveSalesEmail,
          salesPhone: effectivePhoneNumber,
          items: preview.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            price: item.price,
          })),
          discount: quotationContent.discount,
          additionalDiscount: quotationContent.additionalDiscount,
          additionalInformation: quotationContent.additionalInformation,
          ppnRate,
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Gagal generate file Excel");
      }

      const blob = await response.blob();
      const fileUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = fileUrl;
      anchor.download = buildQuotationFileName(quotationNo, effectivePreparedFor, "xlsx");
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(fileUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal generate file Excel");
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    setError(null);

    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);

      const doc = new jsPDF({ format: "a4", orientation: "portrait", unit: "mm" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 14;
      const bottomMargin = 14;
      const usableWidth = pageWidth - marginX * 2;

      doc.setTextColor(20, 20, 20);
      doc.setDrawColor(17, 17, 17);

      try {
        const logoDataUrl = await loadImageAsDataUrl("/assets/template-logo.png");
        doc.addImage(logoDataUrl, "PNG", marginX, 17, 46, 15);
      } catch {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("PT. Klimatek", marginX, 25);
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(14);
      doc.text("QUOTATION", pageWidth - marginX, 23, { align: "right" });

      doc.setFontSize(8.5);
      const metaX = pageWidth - 53;
      doc.text("Date", metaX, 32);
      doc.text(":", metaX + 22, 32);
      doc.text(quotationDate, metaX + 28, 32);
      doc.text("Quotation No", metaX, 38);
      doc.text(":", metaX + 22, 38);
      doc.text(quotationNo, metaX + 28, 38);

      doc.setLineWidth(0.2);
      doc.line(marginX, 44, pageWidth - marginX, 44);

      doc.setFontSize(9);
      doc.text(["PT. Klimatek", "Jl. Tengsaw Kp. Babakan, Desa Tarikolot,", "RT. 003 RW. 005 Citeureup - Kab. Bogor", "Jawa Barat - Indonesia"], marginX, 52, {
        lineHeightFactor: 1.45,
      });

      const drawInfoLine = (
        label: string,
        value: string,
        y: number,
        options?: { bold?: boolean; labelBlank?: boolean },
      ): number => {
        const labelWidth = 38;
        const separatorWidth = 5;
        const valueX = marginX + labelWidth + separatorWidth;
        const maxValueWidth = usableWidth - labelWidth - separatorWidth;
        const lines = doc.splitTextToSize(cleanPdfText(value) || "-", maxValueWidth) as string[];

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        if (!options?.labelBlank) {
          doc.text(label, marginX, y);
          doc.text(":", marginX + labelWidth, y);
        }
        doc.setFont("helvetica", options?.bold ? "bold" : "normal");
        doc.text(lines, valueX, y, { lineHeightFactor: 1.35 });
        return y + Math.max(lines.length, 1) * 4.3;
      };

      let cursorY = 80;
      cursorY = drawInfoLine("Contact Person", preview.contactPerson || "-", cursorY);
      cursorY = drawInfoLine("Prepared For", effectivePreparedFor || "-", cursorY + 1, { bold: true });
      cursorY = drawInfoLine("", effectiveCustomerAddress || "-", cursorY, { labelBlank: true });
      cursorY = drawInfoLine("Attn", quotationContent.attn || "-", cursorY + 3, { bold: true });

      const tableBody: RowInput[] = preview.items.map((item, index) => [
        String(index + 1),
        cleanPdfText(item.description) || "-",
        numberFormatter.format(item.quantity),
        formatPdfCurrency(item.price),
        formatPdfCurrency(item.total),
      ]);

      tableBody.push([
        { content: "", colSpan: 2, styles: { lineWidth: 0 } },
        { content: "Subtotal", colSpan: 2, styles: { fontStyle: "bold", halign: "right" } },
        { content: formatPdfCurrency(preview.subtotal), styles: { halign: "right" } },
      ]);
      tableBody.push([
        { content: "", colSpan: 2, styles: { lineWidth: 0 } },
        {
          content: `Discount (${(preview.discountRate * 100).toFixed(2)}%)`,
          colSpan: 2,
          styles: { fontStyle: "bold", halign: "right" },
        },
        { content: formatPdfCurrency(preview.discountAmount), styles: { halign: "right" } },
      ]);
      if (preview.hasAdditionalDiscount) {
        tableBody.push([
          { content: "", colSpan: 2, styles: { lineWidth: 0 } },
          {
            content: `Additional Discount (${(preview.additionalDiscountRate * 100).toFixed(2)}%)`,
            colSpan: 2,
            styles: { fontStyle: "bold", halign: "right" },
          },
          { content: formatPdfCurrency(preview.additionalDiscountAmount), styles: { halign: "right" } },
        ]);
      }
      tableBody.push([
        { content: "", colSpan: 2, styles: { lineWidth: 0 } },
        { content: `PPN ${ppnPercent}%`, colSpan: 2, styles: { fontStyle: "bold", halign: "right" } },
        { content: formatPdfCurrency(preview.ppn), styles: { halign: "right" } },
      ]);
      tableBody.push([
        { content: "", colSpan: 2, styles: { lineWidth: 0 } },
        { content: "Grand Total", colSpan: 2, styles: { fontStyle: "bold", halign: "right" } },
        { content: formatPdfCurrency(preview.grandTotal), styles: { fontStyle: "bold", halign: "right" } },
      ]);

      autoTable(doc, {
        startY: Math.max(103, cursorY + 6),
        head: [["No", "Description", "QTY", "Price", "Total Price"]],
        body: tableBody,
        theme: "grid",
        margin: { left: marginX, right: marginX, bottom: bottomMargin },
        styles: {
          cellPadding: { top: 1.5, right: 1.4, bottom: 1.5, left: 1.4 },
          font: "helvetica",
          fontSize: 8.3,
          lineColor: [17, 17, 17],
          lineWidth: 0.18,
          minCellHeight: 7,
          overflow: "linebreak",
          textColor: [20, 20, 20],
          valign: "top",
        },
        headStyles: {
          fillColor: [255, 255, 255],
          fontStyle: "bold",
          halign: "center",
          textColor: [20, 20, 20],
        },
        columnStyles: {
          0: { cellWidth: 11, halign: "center" },
          1: { cellWidth: 92, halign: "left" },
          2: { cellWidth: 19, halign: "right" },
          3: { cellWidth: 30, halign: "right" },
          4: { cellWidth: 30, halign: "right" },
        },
      });

      const lastTableY =
        (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? Math.max(103, cursorY + 6);
      cursorY = lastTableY + 8;

      const ensureSpace = (space: number) => {
        if (cursorY + space <= pageHeight - bottomMargin) return;
        doc.addPage();
        cursorY = 18;
      };

      doc.setFontSize(8.6);
      const additionalLines = String(quotationContent.additionalInformation || "-")
        .replace(/\r\n/g, "\n")
        .split("\n");

      additionalLines.forEach((rawLine) => {
        const isBold = /^\s*\*\*.*\*\*\s*$/.test(rawLine);
        const line = cleanPdfText(rawLine);
        if (!line) {
          cursorY += 3.5;
          return;
        }

        doc.setFont("helvetica", isBold ? "bold" : "normal");
        const lines = doc.splitTextToSize(line, usableWidth) as string[];
        ensureSpace(lines.length * 4.1);
        doc.text(lines, marginX, cursorY, { lineHeightFactor: 1.35 });
        cursorY += lines.length * 4.1;
      });

      ensureSpace(26);
      cursorY += 8;
      doc.setFont("helvetica", "normal");
      doc.text("Best Regards", marginX, cursorY);
      cursorY += 13;
      doc.setFont("helvetica", "bold");
      doc.text(effectiveSalesName || "-", marginX, cursorY);
      cursorY += 5;
      doc.text("PT Klimatek", marginX, cursorY);
      cursorY += 5;
      doc.text(`Email : ${effectiveSalesEmail || "-"}`, marginX, cursorY);

      doc.save(buildQuotationFileName(quotationNo, effectivePreparedFor, "pdf"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal generate file PDF");
    } finally {
      setPdfBusy(false);
    }
  };

  const resetOverrideToDefault = (key:
    | "preparedForOverride"
    | "customerAddressOverride"
    | "contactPersonOverride"
    | "phoneNumberOverride") => {
    setQuotationContentField(key, "");
  };

  if (!isHydrated) {
    return (
      <RpbPageFrame noContentPadding>
        <div className="quotation-page py-4 md:py-5">
          <div className="quotation-grid">
            <section className="quotation-panel">
              <h1>Quotation</h1>
              <p className="muted">Menyiapkan data quotation...</p>
            </section>
          </div>
        </div>
      </RpbPageFrame>
    );
  }

  return (
    <RpbPageFrame noContentPadding>
      <div className="quotation-page py-4 md:py-5">
        <div className="quotation-grid">
          <section className="quotation-panel">
            <h1>Quotation</h1>
            <p className="muted">
              Tiap AHU menjadi satu baris item quotation dengan qty dan price masing-masing.
            </p>

            <div className="form-grid">
              <fieldset className="item-box">
                <legend>Detail Pelanggan & Sales</legend>
                <p className="muted" style={{ marginBottom: 4 }}>
                  Default diambil dari database. Bisa diubah; kosongkan untuk pakai default.
                </p>

                <label>
                  <span>Quotation No</span>
                  <input
                    className="rpb-input"
                    value={quotationContent.quotationNo}
                    placeholder={quotationNo}
                    onChange={(event) => setQuotationContentField("quotationNo", event.target.value)}
                  />
                  <span className="text-xs text-rpb-ink-soft">
                    Kosongkan untuk pakai format otomatis `Q-YYYYMM`.
                  </span>
                </label>

                <label>
                  <div className="field-label-row">
                    <span>Prepared For (Customer Name)</span>
                    {quotationContent.preparedForOverride ? (
                      <button
                        type="button"
                        className="rpb-btn-ghost reset-default-btn"
                        onClick={() => resetOverrideToDefault("preparedForOverride")}
                        title="Pakai default dari database"
                      >
                        Reset
                      </button>
                    ) : null}
                  </div>
                  <input
                    className="rpb-input"
                    value={quotationContent.preparedForOverride || customerName}
                    placeholder={customerName || "-"}
                    onChange={(event) =>
                      setQuotationContentField("preparedForOverride", event.target.value)
                    }
                  />
                </label>

                <label>
                  <div className="field-label-row">
                    <span>Customer Address</span>
                    {quotationContent.customerAddressOverride ? (
                      <button
                        type="button"
                        className="rpb-btn-ghost reset-default-btn"
                        onClick={() => resetOverrideToDefault("customerAddressOverride")}
                        title="Pakai default dari database"
                      >
                        Reset
                      </button>
                    ) : null}
                  </div>
                  <textarea
                    className="rpb-input"
                    rows={2}
                    value={quotationContent.customerAddressOverride || customerAddress}
                    placeholder={customerAddress || "-"}
                    onChange={(event) =>
                      setQuotationContentField("customerAddressOverride", event.target.value)
                    }
                  />
                </label>

                <label>
                  <div className="field-label-row">
                    <span>Contact Person</span>
                    {quotationContent.contactPersonOverride ? (
                      <button
                        type="button"
                        className="rpb-btn-ghost reset-default-btn"
                        onClick={() => resetOverrideToDefault("contactPersonOverride")}
                        title="Pakai default dari database"
                      >
                        Reset
                      </button>
                    ) : null}
                  </div>
                  <input
                    className="rpb-input"
                    value={quotationContent.contactPersonOverride || accountName}
                    placeholder={accountName || "-"}
                    onChange={(event) =>
                      setQuotationContentField("contactPersonOverride", event.target.value)
                    }
                  />
                </label>

                <label>
                  <div className="field-label-row">
                    <span>Phone Number</span>
                    {quotationContent.phoneNumberOverride ? (
                      <button
                        type="button"
                        className="rpb-btn-ghost reset-default-btn"
                        onClick={() => resetOverrideToDefault("phoneNumberOverride")}
                        title="Pakai default dari database"
                      >
                        Reset
                      </button>
                    ) : null}
                  </div>
                  <input
                    className="rpb-input"
                    value={quotationContent.phoneNumberOverride || accountPhone}
                    placeholder={accountPhone || "-"}
                    onChange={(event) =>
                      setQuotationContentField("phoneNumberOverride", event.target.value)
                    }
                  />
                </label>
              </fieldset>

              <label>
                Attn
                <div className="field-toolbar">
                  <button
                    type="button"
                    className="rpb-btn-ghost text-style-btn"
                    onClick={() =>
                      applyBoldToControl(
                        attnInputRef.current,
                        () => quotationContent.attn,
                        (value) => setQuotationContentField("attn", value),
                      )
                    }
                    title="Bold teks terpilih"
                  >
                    B
                  </button>
                </div>
                <input
                  ref={attnInputRef}
                  className="rpb-input"
                  value={quotationContent.attn}
                  onChange={(event) => setQuotationContentField("attn", event.target.value)}
                />
              </label>

              <fieldset className="item-box">
                <legend>Item per AHU</legend>
                <div className="space-y-3">
                  {preview.items.map((item, index) => (
                    <article key={item.id} className="rounded-xl border border-rpb-border bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{item.name}</p>
                          <p className="text-xs text-rpb-ink-soft">Baris quotation {index + 1}</p>
                        </div>
                        <button
                          type="button"
                          className="rpb-btn-ghost text-style-btn"
                          onClick={() =>
                            applyBoldToControl(
                              descriptionRefs.current[item.id] ?? null,
                              () => ahus.find((ahu) => ahu.id === item.id)?.quotationDescription ?? "",
                              (value) => setAhuQuotationDescription(item.id, value),
                            )
                          }
                          title="Bold teks terpilih"
                        >
                          B
                        </button>
                      </div>
                      <label>
                        Description
                        <textarea
                          ref={(element) => {
                            descriptionRefs.current[item.id] = element;
                          }}
                          className="rpb-input"
                          rows={3}
                          value={ahus.find((ahu) => ahu.id === item.id)?.quotationDescription ?? ""}
                          onChange={(event) => setAhuQuotationDescription(item.id, event.target.value)}
                        />
                      </label>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <label>
                          Quantity
                          <input
                            className="rpb-input"
                            value={ahus.find((ahu) => ahu.id === item.id)?.quotationQty ?? 1}
                            onChange={(event) =>
                              setAhuQuotationQty(item.id, Math.max(1, toNumber(event.target.value)))
                            }
                          />
                        </label>
                        <label>
                          Price (Auto)
                          <input className="rpb-input" value={currencyFormatter.format(item.price)} readOnly />
                        </label>
                      </div>
                    </article>
                  ))}
                </div>
              </fieldset>

              <fieldset className="item-box">
                <legend>Additional Information</legend>
                <label>
                  <div className="field-toolbar">
                    <button
                      type="button"
                      className="rpb-btn-ghost text-style-btn"
                      onClick={() =>
                        applyBoldToControl(
                          additionalInfoRef.current,
                          () => quotationContent.additionalInformation,
                          (value) => setQuotationContentField("additionalInformation", value),
                        )
                      }
                      title="Bold teks terpilih"
                    >
                      B
                    </button>
                  </div>
                  <textarea
                    ref={additionalInfoRef}
                    className="rpb-input"
                    rows={12}
                    value={quotationContent.additionalInformation}
                    onChange={(event) =>
                      setQuotationContentField("additionalInformation", event.target.value)
                    }
                  />
                </label>
              </fieldset>

              <label>
                Discount (%)
                <input
                  className="rpb-input"
                  value={quotationContent.discount}
                  onChange={(event) => setQuotationContentField("discount", event.target.value)}
                />
                <span className="text-xs text-rpb-ink-soft">Contoh: 25% atau 0.25. Jangan tulis 25 tanpa %.</span>
              </label>
              <label>
                Additional Discount (%)
                <input
                  className="rpb-input"
                  value={quotationContent.additionalDiscount}
                  onChange={(event) => setQuotationContentField("additionalDiscount", event.target.value)}
                />
                <span className="text-xs text-rpb-ink-soft">Diskon tambahan dihitung setelah discount utama.</span>
              </label>

              {error ? <div className="error-box">{error}</div> : null}
              {saveMessage ? <div className="info-box">{saveMessage}</div> : null}

              <div className="actions">
                <button
                  type="button"
                  className="rpb-btn-primary action-btn"
                  onClick={() => void persist()}
                  disabled={saveBusy}
                  title="Simpan / update quotation aktif ke database"
                >
                  <Save size={15} aria-hidden="true" />
                  {saveBusy ? "Menyimpan..." : "Simpan"}
                </button>
                <button
                  type="button"
                  className="rpb-btn-ghost action-btn"
                  onClick={() => void downloadPdf()}
                  disabled={pdfBusy}
                  title="Download preview quotation sebagai PDF"
                >
                  <Download size={15} aria-hidden="true" />
                  {pdfBusy ? "Generating..." : "Download PDF"}
                </button>
                <button
                  type="button"
                  className="rpb-btn-ghost action-btn"
                  onClick={() => void downloadExcel()}
                  disabled={busy}
                >
                  <FileSpreadsheet size={15} aria-hidden="true" />
                  {busy ? "Generating..." : "Download Excel"}
                </button>
              </div>
            </div>
          </section>

          <section className="quotation-panel preview">
            <h2>Preview</h2>

            <div className="a4-stage">
              <div className="a4-page-shell" ref={a4ShellRef} style={{ height: `${A4_HEIGHT_PX * a4Scale}px` }}>
                <article
                  ref={a4PageRef}
                  className="a4-page"
                  data-quotation-pdf-page
                  style={{ transform: `scale(${a4Scale})` }}
                >
                  <header className="sheet-head">
                    <Image
                      src="/assets/template-logo.png"
                      alt="Company Logo"
                      className="sheet-logo"
                      width={175}
                      height={58}
                      priority
                    />
                    <div className="sheet-head-right">
                      <h3 className="sheet-title">QUOTATION</h3>
                      <table className="meta-table">
                        <tbody>
                          <tr>
                            <td>Date</td>
                            <td>:</td>
                            <td>{quotationDate}</td>
                          </tr>
                          <tr>
                            <td>Quotation No</td>
                            <td>:</td>
                            <td>{quotationNo}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </header>
                  <div className="sheet-divider" />
                  <section className="company-block">
                    <div>PT. Klimatek</div>
                    <div>Jl. Tengsaw Kp. Babakan, Desa Tarikolot,</div>
                    <div>RT. 003 RW. 005 Citeureup - Kab. Bogor</div>
                    <div>Jawa Barat - Indonesia</div>
                  </section>

                  <section className="info-lines">
                    <div className="info-line">
                      <div className="info-label">Contact Person</div>
                      <div className="info-sep">:</div>
                      <div className="info-value">{preview.contactPerson || "-"}</div>
                    </div>
                    <div className="info-line">
                      <div className="info-label">Prepared For</div>
                      <div className="info-sep">:</div>
                      <div className="info-value strong">{effectivePreparedFor || "-"}</div>
                    </div>
                    <div className="info-line info-line-address">
                      <div className="info-label" />
                      <div className="info-sep" />
                      <div className="info-value">
                        <div>{effectiveCustomerAddress || "-"}</div>
                      </div>
                    </div>
                    <div className="info-line info-line-attn">
                      <div className="info-label">Attn</div>
                      <div className="info-sep">:</div>
                      <div className="info-value strong">
                        {quotationContent.attn ? renderRichMultilineText(quotationContent.attn) : "-"}
                      </div>
                    </div>
                  </section>

                  <table className="item-grid">
                    <thead>
                      <tr>
                        <th className="w-no">No</th>
                        <th className="w-desc">Description</th>
                        <th className="w-qty">QTY</th>
                        <th className="w-price">Price</th>
                        <th className="w-total">Total Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.items.map((item, index) => (
                        <tr className="item-row" key={item.id}>
                          <td>{index + 1}</td>
                          <td>{item.description ? renderRichMultilineText(item.description) : "-"}</td>
                          <td>{numberFormatter.format(item.quantity)}</td>
                          <td>{currencyFormatter.format(item.price)}</td>
                          <td>{currencyFormatter.format(item.total)}</td>
                        </tr>
                      ))}
                      <tr className="summary-row summary-start">
                        <td className="summary-empty" colSpan={2} rowSpan={preview.hasAdditionalDiscount ? 5 : 4} />
                        <td className="summary-label" colSpan={2}>Subtotal</td>
                        <td className="summary-value">{currencyFormatter.format(preview.subtotal)}</td>
                      </tr>
                      <tr className="summary-row">
                        <td className="summary-label" colSpan={2}>
                          Discount ({(preview.discountRate * 100).toFixed(2)}%)
                        </td>
                        <td className="summary-value">{currencyFormatter.format(preview.discountAmount)}</td>
                      </tr>
                      {preview.hasAdditionalDiscount ? (
                        <tr className="summary-row">
                          <td className="summary-label" colSpan={2}>
                            Additional Discount ({(preview.additionalDiscountRate * 100).toFixed(2)}%)
                          </td>
                          <td className="summary-value">
                            {currencyFormatter.format(preview.additionalDiscountAmount)}
                          </td>
                        </tr>
                      ) : null}
                      <tr className="summary-row">
                        <td className="summary-label" colSpan={2}>PPN {ppnPercent}%</td>
                        <td className="summary-value">{currencyFormatter.format(preview.ppn)}</td>
                      </tr>
                      <tr className="summary-row strong">
                        <td className="summary-label" colSpan={2}>Grand Total</td>
                        <td className="summary-value">{currencyFormatter.format(preview.grandTotal)}</td>
                      </tr>
                    </tbody>
                  </table>

                  <section className="terms">
                    <div className="terms-list plain-text">
                      {quotationContent.additionalInformation.trim().length > 0
                        ? renderRichMultilineText(quotationContent.additionalInformation)
                        : "-"}
                    </div>
                  </section>

                  <footer className="sign-block">
                    <div>Best Regards</div>
                    <div className="sign-name">{effectiveSalesName || "-"}</div>
                    <div className="sign-company">PT Klimatek</div>
                    <div className="sign-email">Email : {effectiveSalesEmail || "-"}</div>
                  </footer>
                </article>
              </div>
            </div>
          </section>
        </div>

        <div className="footer-actions mt-3 no-print">
          <Link
            href="/"
            className="rpb-btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
          >
            Kembali ke Beranda
          </Link>
          <Link
            href="/summary"
            className="rpb-btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
          >
            Back to Summary
          </Link>
        </div>
      </div>

      <style>{`
        .quotation-grid { display: grid; width: 100%; grid-template-columns: 1fr; gap: 16px; align-items: start; }
        .quotation-grid > * { min-width: 0; }
        .quotation-page { width: 100%; padding-left: 20px; padding-right: 20px; overflow-x: hidden; }
        @media (min-width: 1024px) { .quotation-page { padding-left: 28px; padding-right: 28px; } }
        .quotation-panel { border: 1px solid var(--rpb-border); border-radius: 14px; background: #fff; padding: 20px; box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08); min-width: 0; }
        .quotation-panel h1, .quotation-panel h2, .quotation-panel h3 { margin: 0 0 12px; }
        .muted { color: var(--rpb-ink-soft); margin: 0 0 16px; font-size: 13px; }
        .form-grid { display: grid; gap: 12px; }
        label { display: grid; gap: 6px; font-size: 14px; }
        .field-label-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .field-label-row span { color: var(--rpb-ink-soft); font-size: 12px; font-weight: 600; }
        .reset-default-btn { font-size: 11px; padding: 2px 8px; height: auto; line-height: 1.2; cursor: pointer; }
        .field-toolbar { display: flex; justify-content: flex-end; margin-top: -2px; margin-bottom: 2px; }
        .text-style-btn { width: 30px; height: 28px; font-weight: 800; font-size: 14px; line-height: 1; cursor: pointer; }
        textarea { resize: vertical; min-height: 90px; }
        .item-box { border: 1px solid var(--rpb-border); border-radius: 10px; padding: 12px; margin: 0; display: grid; gap: 8px; }
        legend { padding: 0 8px; color: var(--rpb-ink-soft); font-weight: 600; font-size: 13px; }
        .actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
        .action-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 14px; font-weight: 700; cursor: pointer; }
        .footer-actions { margin-top: 12px; display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
        .error-box { border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; border-radius: 10px; padding: 10px 12px; font-size: 13px; white-space: pre-wrap; }
        .info-box { border: 1px solid #bbf7d0; background: #f0fdf4; color: #166534; border-radius: 10px; padding: 10px 12px; font-size: 13px; white-space: pre-wrap; }
        .a4-stage { margin-top: 12px; padding: 14px; border: 1px solid var(--rpb-border); border-radius: 10px; background: #eef2f7; overflow: hidden; display: flex; justify-content: center; }
        .a4-page-shell { width: 100%; min-width: 0; display: flex; justify-content: center; align-items: flex-start; }
        .a4-page { width: ${A4_WIDTH_PX}px; min-height: ${A4_HEIGHT_PX}px; box-sizing: border-box; background: #fff; color: #111; font-family: Calibri, Arial, sans-serif; font-size: 11px; line-height: 1.2; padding: 10mm; box-shadow: 0 14px 24px rgba(15, 23, 42, 0.14); transform-origin: top center; }
        .sheet-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; }
        .sheet-logo { width: 175px; max-width: 48%; max-height: 58px; object-fit: contain; }
        .sheet-head-right { min-width: 0; max-width: 52%; }
        .sheet-title { font-size: 16px; font-weight: 400; margin: 0 0 2px; text-align: right; }
        .meta-table { width: auto; margin-left: auto; border-collapse: collapse; }
        .meta-table td { border: none; padding: 0 4px; font-size: 10px; }
        .sheet-divider { margin-top: 2px; border-top: 1px solid #111; }
        .company-block { margin-top: 4px; margin-bottom: 10px; }
        .company-block div { margin: 2px 0; }
        .info-lines { margin: 10px 0 12px; }
        .info-line { display: grid; grid-template-columns: 120px 10px 1fr; align-items: start; column-gap: 3px; margin: 2px 0; }
        .info-value { white-space: pre-line; }
        .info-value.strong { font-weight: 700; }
        .info-line-attn { margin-top: 8px; }
        .item-grid { width: 100%; border-collapse: collapse; margin-bottom: 8px; table-layout: fixed; }
        .item-grid th, .item-grid td { border: 1px solid #111; padding: 2px 4px; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
        .item-grid th { font-weight: 700; text-align: center; }
        .item-grid .w-no { width: 36px; }
        .item-grid .w-desc { width: 52%; }
        .item-grid .w-qty { width: 11%; }
        .item-grid .w-price { width: 18%; }
        .item-grid .w-total { width: 18%; }
        .item-grid .item-row td:nth-child(1) { text-align: center; }
        .item-grid .item-row td:nth-child(2) { white-space: pre-wrap; min-height: 60px; }
        .item-grid .item-row td:nth-child(3), .item-grid .item-row td:nth-child(4), .item-grid .item-row td:nth-child(5), .summary-label, .summary-value { text-align: right; }
        .summary-label { font-weight: 700; }
        .summary-empty { border: none !important; padding: 0; }
        .summary-row.strong .summary-label, .summary-row.strong .summary-value { font-weight: 700; }
        .terms { margin-top: 6px; font-size: 10px; }
        .terms-list.plain-text { white-space: pre-line; line-height: 1.35; }
        .sign-block { margin-top: 18px; font-size: 10px; white-space: pre-line; }
        .sign-block div { margin: 2px 0; }
        .sign-name, .sign-company, .sign-email { font-weight: 700; }
        .sign-name { margin-top: 20px !important; }
        @media (min-width: 981px) { .quotation-grid { grid-template-columns: minmax(360px, 1fr) minmax(420px, 1.4fr); } }
        @media (max-width: 640px) {
          .quotation-page { padding-left: 12px; padding-right: 12px; }
          .quotation-panel { border-radius: 12px; padding: 14px; }
          .actions { justify-content: stretch; }
          .action-btn { width: 100%; }
          .footer-actions { justify-content: stretch; }
          .footer-actions > * { width: 100%; justify-content: center; }
          .a4-stage { padding: 8px; }
        }
      `}</style>
    </RpbPageFrame>
  );
}
