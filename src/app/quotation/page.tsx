"use client";

import { RpbPageFrame } from "@/components/layout/rpb-page-frame";
import { useAuthSession } from "@/hooks/use-auth-session";
import { DEFAULT_ADDITIONAL_INFORMATION } from "@/lib/quotation-content";
import { useRpbMasterData } from "@/hooks/use-rpb-master-data";
import { buildAhuSummaries } from "@/lib/rpb-line-items";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRpbStore } from "@/store/rpb-store";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type QuotationForm = {
  attn: string;
  discount: string;
  additionalInformation: string;
};

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
  const customerAddress = useRpbStore((state) => state.customerAddress);
  const ahus = useRpbStore((state) => state.ahus);
  const adjustments = useRpbStore((state) => state.adjustments);
  const setAhuQuotationDescription = useRpbStore((state) => state.setAhuQuotationDescription);
  const setAhuQuotationQty = useRpbStore((state) => state.setAhuQuotationQty);

  const [accountName, setAccountName] = useState("");
  const [accountPhone, setAccountPhone] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const attnInputRef = useRef<HTMLInputElement>(null);
  const additionalInfoRef = useRef<HTMLTextAreaElement>(null);
  const descriptionRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const [form, setForm] = useState<QuotationForm>({
    attn: "",
    discount: "25%",
    additionalInformation: DEFAULT_ADDITIONAL_INFORMATION,
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const a4ShellRef = useRef<HTMLDivElement>(null);
  const [a4Scale, setA4Scale] = useState(1);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    const onlyStars = (value: string): boolean => /^\s*\*+\s*$/.test(value);
    setForm((prev) => ({
      ...prev,
      attn: onlyStars(prev.attn) ? "" : prev.attn,
      additionalInformation: onlyStars(prev.additionalInformation) ? "" : prev.additionalInformation,
    }));
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

  const { ahuSummaries } = useMemo(
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
    const items = ahuSummaries.map((summary) => {
      const quantity = Math.max(1, summary.ahu.quotationQty);
      const price = summary.grandTotalIdr;
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
    const discountRate = toDiscount(form.discount);
    const discountAmount = subtotal * discountRate;
    const ppn = (subtotal - discountAmount) * ppnRate;
    const grandTotal = subtotal - discountAmount + ppn;

    return {
      items,
      discountRate,
      subtotal,
      discountAmount,
      ppn,
      grandTotal,
      contactPerson: [accountName, accountPhone].filter(Boolean).join(" / "),
    };
  }, [accountName, accountPhone, ahuSummaries, form.discount, ppnRate]);

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
    const date = new Date();
    return `Q-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const setField = (key: keyof QuotationForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

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
          preparedFor: customerName,
          customerAddress,
          attn: form.attn,
          salesName: accountName,
          salesEmail: accountEmail,
          salesPhone: accountPhone,
          items: preview.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            price: item.price,
          })),
          discount: form.discount,
          additionalInformation: form.additionalInformation,
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
      anchor.download = `quotation-${Date.now()}.xlsx`;
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
              <div className="auto-box">
                <div className="auto-row">
                  <span>Prepared For (Customer Name)</span>
                  <strong>{customerName || "-"}</strong>
                </div>
                <div className="auto-row">
                  <span>Customer Address</span>
                  <strong>{customerAddress || "-"}</strong>
                </div>
                <div className="auto-row">
                  <span>Contact Person</span>
                  <strong>{accountName || "-"}</strong>
                </div>
                <div className="auto-row">
                  <span>Phone Number</span>
                  <strong>{accountPhone || "-"}</strong>
                </div>
              </div>

              <label>
                Attn
                <div className="field-toolbar">
                  <button
                    type="button"
                    className="rpb-btn-ghost text-style-btn"
                    onClick={() =>
                      applyBoldToControl(
                        attnInputRef.current,
                        () => form.attn,
                        (value) => setField("attn", value),
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
                  value={form.attn}
                  onChange={(event) => setField("attn", event.target.value)}
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
                          () => form.additionalInformation,
                          (value) => setField("additionalInformation", value),
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
                    value={form.additionalInformation}
                    onChange={(event) => setField("additionalInformation", event.target.value)}
                  />
                </label>
              </fieldset>

              <label>
                Discount (%)
                <input
                  className="rpb-input"
                  value={form.discount}
                  onChange={(event) => setField("discount", event.target.value)}
                />
                <span className="text-xs text-rpb-ink-soft">Contoh: 25% atau 0.25. Jangan tulis 25 tanpa %.</span>
              </label>

              {error ? <div className="error-box">{error}</div> : null}

              <div className="actions">
                <button
                  type="button"
                  className="rpb-btn-primary action-btn"
                  onClick={() => void downloadExcel()}
                  disabled={busy}
                >
                  {busy ? "Generating..." : "Download Excel"}
                </button>
              </div>
            </div>
          </section>

          <section className="quotation-panel preview">
            <h2>Preview</h2>

            <div className="a4-stage">
              <div className="a4-page-shell" ref={a4ShellRef} style={{ height: `${A4_HEIGHT_PX * a4Scale}px` }}>
                <article className="a4-page" style={{ transform: `scale(${a4Scale})` }}>
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
                      <div className="info-value strong">{customerName || "-"}</div>
                    </div>
                    <div className="info-line info-line-address">
                      <div className="info-label" />
                      <div className="info-sep" />
                      <div className="info-value">
                        <div>{customerAddress || "-"}</div>
                      </div>
                    </div>
                    <div className="info-line info-line-attn">
                      <div className="info-label">Attn</div>
                      <div className="info-sep">:</div>
                      <div className="info-value strong">
                        {form.attn ? renderRichMultilineText(form.attn) : "-"}
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
                        <td className="summary-empty" colSpan={2} rowSpan={4} />
                        <td className="summary-label" colSpan={2}>Subtotal</td>
                        <td className="summary-value">{currencyFormatter.format(preview.subtotal)}</td>
                      </tr>
                      <tr className="summary-row">
                        <td className="summary-label" colSpan={2}>
                          Discount ({(preview.discountRate * 100).toFixed(2)}%)
                        </td>
                        <td className="summary-value">{currencyFormatter.format(preview.discountAmount)}</td>
                      </tr>
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
                      {form.additionalInformation.trim().length > 0
                        ? renderRichMultilineText(form.additionalInformation)
                        : "-"}
                    </div>
                  </section>

                  <footer className="sign-block">
                    <div>Best Regards</div>
                    <div className="sign-name">{accountName || "-"}</div>
                    <div className="sign-company">PT Klimatek</div>
                    <div className="sign-email">Email : {accountEmail || "-"}</div>
                  </footer>
                </article>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-3 flex justify-end gap-2 no-print">
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
        .auto-box { border: 1px solid var(--rpb-border); border-radius: 10px; background: #f8fafc; padding: 10px 12px; display: grid; gap: 8px; }
        .auto-row { display: grid; gap: 2px; }
        .auto-row span { color: var(--rpb-ink-soft); font-size: 12px; }
        .auto-row strong { font-size: 14px; white-space: pre-line; word-break: break-word; }
        label { display: grid; gap: 6px; font-size: 14px; }
        .field-toolbar { display: flex; justify-content: flex-end; margin-top: -2px; margin-bottom: 2px; }
        .text-style-btn { width: 30px; height: 28px; font-weight: 800; font-size: 14px; line-height: 1; cursor: pointer; }
        textarea { resize: vertical; min-height: 90px; }
        .item-box { border: 1px solid var(--rpb-border); border-radius: 10px; padding: 12px; margin: 0; display: grid; gap: 8px; }
        legend { padding: 0 8px; color: var(--rpb-ink-soft); font-weight: 600; font-size: 13px; }
        .actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
        .action-btn { padding: 10px 14px; font-weight: 700; cursor: pointer; }
        .error-box { border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; border-radius: 10px; padding: 10px 12px; font-size: 13px; white-space: pre-wrap; }
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
          .a4-stage { padding: 8px; }
        }
      `}</style>
    </RpbPageFrame>
  );
}
