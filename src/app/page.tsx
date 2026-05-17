"use client";

import {
  calculateFixedBreakdowns,
  type CalculatedFixedItem,
  formatQty,
  formatRupiah,
} from "@/lib/rpb-calculator";
import {
  clearLatestDraft,
  loadLatestDraft,
  saveLatestDraft,
  type LatestDraftPayload,
} from "@/lib/rpb-latest-draft";
import { RpbPageFrame } from "@/components/layout/rpb-page-frame";
import { useRpbMasterData } from "@/hooks/use-rpb-master-data";
import { useRpbStore } from "@/store/rpb-store";
import { MAX_AHU_PER_QUOTATION, type DimensionKey, type OtherItem, type StockCategory } from "@/types/rpb";
import { ArrowRight, ChevronDown, ChevronUp, Pencil, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import type { FocusEvent } from "react";
import { useEffect, useMemo, useState } from "react";

type OtherFilter = "Semua" | StockCategory | string;

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

const parseNumberInput = (value: string): number => {
  const parsed = Number.parseFloat(normalizeNumericInput(value));
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return parsed;
};

const selectInputOnFocus = (event: FocusEvent<HTMLInputElement>) => {
  event.currentTarget.select();
};

const FixedBreakdownPanel = ({
  items,
  emptyText,
  totalLabel,
  totalValue,
}: {
  items: CalculatedFixedItem[];
  emptyText: string;
  totalLabel: string;
  totalValue: number;
}) => (
  <div className="mt-3 overflow-hidden rounded-xl border border-rpb-border bg-white">
    {items.length === 0 ? (
      <p className="px-4 py-3 text-xs text-rpb-ink-soft">{emptyText}</p>
    ) : (
      <div className="divide-y divide-rpb-border">
        {items.map((item) => (
          <div
            key={item.id}
            className="grid gap-1 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{item.name}</p>
              <p className="text-xs text-rpb-ink-soft">
                {formatQty(item.qty)} {item.unit} x {formatRupiah(item.unitPriceIdr)}
              </p>
            </div>
            <p className="text-sm font-semibold text-foreground md:text-right">
              {formatRupiah(item.totalIdr)}
            </p>
          </div>
        ))}
      </div>
    )}

    <div className="flex items-center justify-between border-t border-rpb-border bg-[#eceef8] px-4 py-2 text-sm font-semibold">
      <span>{totalLabel}</span>
      <span>{formatRupiah(totalValue)}</span>
    </div>
  </div>
);

const DimensionInput = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (nextValue: number) => void;
}) => (
  <label className="flex w-full flex-col gap-2 text-sm font-semibold text-rpb-ink-soft">
    {label}
    <input
      className="rpb-input"
      type="number"
      min={0}
      step="any"
      value={value}
      onFocus={selectInputOnFocus}
      onChange={(event) => onChange(parseNumberInput(event.target.value))}
    />
  </label>
);

export default function HomePage() {
  const { data: masterData, loading: masterLoading, error: masterError } = useRpbMasterData();
  const customerName = useRpbStore((state) => state.customerName);
  const projectName = useRpbStore((state) => state.projectName);
  const customerAddress = useRpbStore((state) => state.customerAddress);
  const ahus = useRpbStore((state) => state.ahus);
  const activeAhuId = useRpbStore((state) => state.activeAhuId);
  const activeAhu = useRpbStore((state) => state.getActiveAhu());
  const setCustomerName = useRpbStore((state) => state.setCustomerName);
  const setProjectName = useRpbStore((state) => state.setProjectName);
  const setCustomerAddress = useRpbStore((state) => state.setCustomerAddress);
  const setPanelThickness = useRpbStore((state) => state.setPanelThickness);
  const setDimension = useRpbStore((state) => state.setDimension);
  const addOtherQty = useRpbStore((state) => state.addOtherQty);
  const addCustomOtherItem = useRpbStore((state) => state.addCustomOtherItem);
  const addAhu = useRpbStore((state) => state.addAhu);
  const removeAhu = useRpbStore((state) => state.removeAhu);
  const setActiveAhu = useRpbStore((state) => state.setActiveAhu);
  const renameAhu = useRpbStore((state) => state.renameAhu);
  const getSnapshot = useRpbStore((state) => state.getSnapshot);
  const loadSnapshot = useRpbStore((state) => state.loadSnapshot);

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<OtherFilter>("Semua");
  const [modalItem, setModalItem] = useState<OtherItem | null>(null);
  const [modalQty, setModalQty] = useState(1);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customJenis, setCustomJenis] = useState("");
  const [customKeterangan, setCustomKeterangan] = useState("");
  const [customSatuan, setCustomSatuan] = useState("");
  const [customJenisSpec, setCustomJenisSpec] = useState("");
  const [customHargaIdr, setCustomHargaIdr] = useState(0);
  const [customQty, setCustomQty] = useState(1);
  const [profileBreakdownOpen, setProfileBreakdownOpen] = useState(false);
  const [konstruksiBreakdownOpen, setKonstruksiBreakdownOpen] = useState(false);
  const [latestDraft, setLatestDraft] = useState<LatestDraftPayload | null>(() =>
    loadLatestDraft(),
  );
  const [draftBannerDismissed, setDraftBannerDismissed] = useState(false);
  const [customErrors, setCustomErrors] = useState<{ jenis?: string; keterangan?: string; satuan?: string; jenisSpec?: string; harga?: string; qty?: string }>({});
  const [onboardVisible, setOnboardVisible] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return localStorage.getItem("rpb-onboard-done") !== "1";
  });
  const [renamingAhuId, setRenamingAhuId] = useState<string | null>(null);
  const [renamingAhuValue, setRenamingAhuValue] = useState("");

  const dimensions = activeAhu.dimensions;
  const panelThickness = activeAhu.panelThickness;
  const selectedOther = activeAhu.selectedOther;
  const customOtherItems = activeAhu.customOtherItems;

  const hideOnboard = () => {
    localStorage.setItem("rpb-onboard-done", "1");
    setOnboardVisible(false);
  };

  const otherItems = useMemo(() => masterData?.otherItems ?? [], [masterData?.otherItems]);
  const filterOptions = useMemo<OtherFilter[]>(() => {
    const categories = Array.from(new Set(otherItems.map((item) => item.category)));
    return ["Semua", ...categories];
  }, [otherItems]);

  const { profileRows, konstruksiRows, profileTotalIdr, konstruksiTotalIdr } = useMemo(
    () =>
      calculateFixedBreakdowns(
        dimensions,
        panelThickness,
        masterData?.profileItems ?? [],
        masterData?.konstruksiItems ?? [],
      ),
    [dimensions, masterData?.konstruksiItems, masterData?.profileItems, panelThickness],
  );

  const profileIdr = profileTotalIdr;
  const profileBreakdown = useMemo(
    () => profileRows.filter((item) => item.qty > 0),
    [profileRows],
  );

  const konstruksiIdr = konstruksiTotalIdr;
  const konstruksiBreakdown = useMemo(
    () => konstruksiRows.filter((item) => item.qty > 0),
    [konstruksiRows],
  );

  const filteredOtherItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return otherItems.filter((item) => {
      const sameCategory =
        activeFilter === "Semua" ? true : item.category === activeFilter;

      const text = `${item.name} ${item.model}`.toLowerCase();
      const sameKeyword = keyword.length === 0 ? true : text.includes(keyword);

      return sameCategory && sameKeyword;
    });
  }, [activeFilter, otherItems, search]);

  const selectedOtherCount = useMemo(
    () => {
      const stockQty = Object.values(selectedOther).reduce(
        (sum, qty) => sum + (Number.isFinite(qty) ? qty : 0),
        0,
      );
      const customQtyTotal = customOtherItems.reduce((sum, item) => sum + item.qty, 0);

      return stockQty + customQtyTotal;
    },
    [customOtherItems, selectedOther],
  );

  useEffect(() => {
    const snapshot = getSnapshot();
    saveLatestDraft(snapshot);
  }, [ahus, customerAddress, customerName, getSnapshot, projectName]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      const defaultAhu = ahus[0];
      const empty =
        !customerName.trim() &&
        !projectName.trim() &&
        !customerAddress.trim() &&
        ahus.length === 1 &&
        defaultAhu?.dimensions.length === 3550 &&
        defaultAhu?.dimensions.width === 1100 &&
        defaultAhu?.dimensions.height === 950 &&
        defaultAhu?.panelThickness === 30 &&
        Object.keys(defaultAhu?.selectedOther ?? {}).length === 0 &&
        (defaultAhu?.customOtherItems.length ?? 0) === 0;
      if (empty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [ahus, customerAddress, customerName, projectName]);

  const latestDraftLabel = useMemo(() => {
    if (!latestDraft) {
      return "-";
    }

    const date = new Date(latestDraft.updatedAt);
    if (Number.isNaN(date.getTime())) {
      return "Waktu tidak tersedia";
    }

    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }, [latestDraft]);

  const handleContinueLatestDraft = () => {
    if (!latestDraft) {
      return;
    }

    loadSnapshot(latestDraft.snapshot);
    setDraftBannerDismissed(true);
  };

  const handleDiscardLatestDraft = () => {
    clearLatestDraft();
    setLatestDraft(null);
    setDraftBannerDismissed(true);
  };

  const beginRenameAhu = (ahuId: string, name: string) => {
    setRenamingAhuId(ahuId);
    setRenamingAhuValue(name);
  };

  const commitRenameAhu = () => {
    if (!renamingAhuId) {
      return;
    }

    renameAhu(renamingAhuId, renamingAhuValue);
    setRenamingAhuId(null);
    setRenamingAhuValue("");
  };

  const handleRemoveAhu = (ahuId: string) => {
    if (ahus.length <= 1) {
      return;
    }

    const targetAhu = ahus.find((ahu) => ahu.id === ahuId);
    const hasMeaningfulData = Boolean(
      targetAhu &&
        (targetAhu.dimensions.length !== 3550 ||
          targetAhu.dimensions.width !== 1100 ||
          targetAhu.dimensions.height !== 950 ||
          targetAhu.panelThickness !== 30 ||
          Object.keys(targetAhu.selectedOther).length > 0 ||
          targetAhu.customOtherItems.length > 0),
    );

    if (hasMeaningfulData && !window.confirm(`Hapus ${targetAhu?.name ?? "AHU"}?`)) {
      return;
    }

    removeAhu(ahuId);
  };

  const openAddModal = (item: OtherItem) => {
    setModalItem(item);
    setModalQty(1);
  };

  const closeAddModal = () => {
    setModalItem(null);
    setModalQty(1);
  };

  const handleAddOther = () => {
    if (!modalItem) {
      return;
    }

    addOtherQty(modalItem.id, modalQty);
    closeAddModal();
  };

  const openCustomModal = () => {
    setCustomModalOpen(true);
    setCustomJenis("");
    setCustomKeterangan("");
    setCustomSatuan("");
    setCustomJenisSpec("");
    setCustomHargaIdr(0);
    setCustomQty(1);
    setCustomErrors({});
  };

  const closeCustomModal = () => {
    setCustomModalOpen(false);
  };

  const handleAddCustomOther = () => {
    const jenis = customJenis.trim();
    const keterangan = customKeterangan.trim();
    const satuan = customSatuan.trim();
    const jenisSpec = customJenisSpec.trim();
    const errors: typeof customErrors = {};

    if (!jenis) errors.jenis = "Jenis wajib diisi.";
    if (!keterangan) errors.keterangan = "Keterangan wajib diisi.";
    if (!satuan) errors.satuan = "Satuan wajib diisi.";
    if (!jenisSpec) errors.jenisSpec = "Jenis Spec wajib diisi.";
    if (customHargaIdr <= 0) errors.harga = "Harga minimal Rp 1.";
    if (customQty <= 0) errors.qty = "Jumlah minimal 1.";

    if (Object.keys(errors).length > 0) {
      setCustomErrors(errors);
      return;
    }

    addCustomOtherItem({
      jenis,
      keterangan,
      satuan,
      jenisSpec,
      hargaIdr: customHargaIdr,
      qty: customQty,
    });
    closeCustomModal();
  };

  const updateDimension = (key: DimensionKey, value: number) => {
    setDimension(key, value);
  };

  return (
    <RpbPageFrame shellClassName="rpb-compact">
      <div className="space-y-4 py-4 md:space-y-3 md:py-5">
          {masterLoading ? (
            <div className="rpb-section p-4">
              <div className="space-y-3">
                <div className="rpb-skeleton rpb-skeleton-line" />
                <div className="rpb-skeleton rpb-skeleton-line" />
                <div className="rpb-skeleton rpb-skeleton-line" />
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
          {onboardVisible ? (
            <div className="rpb-onboarding-banner rounded-xl border border-rpb-border bg-white px-4 py-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rpb-primary text-sm text-white font-bold">?</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Selamat datang di RPB Kalkulator!</p>
                    <p className="mt-1 text-xs text-rpb-ink-soft">
                      Cukup <strong>3 langkah</strong>:
                      (1) Isi data customer (boleh dikosongkan),
                      (2) Masukkan ukuran ruangan,
                      (3) Klik tombol <strong>&quot;Lanjut&quot;</strong> di bawah.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-rpb-ink-soft hover:text-foreground"
                  onClick={hideOnboard}
                  aria-label="Tutup panduan"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          ) : null}
          {latestDraft && !draftBannerDismissed ? (
            <section className="rpb-section border border-dashed border-rpb-border p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Draft terbaru tersedia</p>
                  <p className="text-xs text-rpb-ink-soft">
                    Terakhir disimpan: {latestDraftLabel}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rpb-btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
                    onClick={handleContinueLatestDraft}
                  >
                    <RotateCcw size={14} />
                    Lanjutkan draft
                  </button>
                  <button
                    type="button"
                    className="rpb-btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
                    onClick={handleDiscardLatestDraft}
                  >
                    <Trash2 size={14} />
                    Hapus draft
                  </button>
                </div>
              </div>
            </section>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
             <label className="flex flex-col gap-2 text-sm font-semibold text-rpb-ink-soft">
              Nama Customer <span className="font-normal text-xs">(opsional)</span>
              <input
                className="rpb-input"
                placeholder="Masukkan nama customer"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-rpb-ink-soft">
              Nama Proyek <span className="font-normal text-xs">(opsional)</span>
              <input
                className="rpb-input"
                placeholder="Masukkan nama proyek"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-rpb-ink-soft md:col-span-2">
              Alamat Customer <span className="font-normal text-xs">(opsional)</span>
              <input
                className="rpb-input"
                placeholder="Masukkan alamat customer"
                value={customerAddress}
                onChange={(event) => setCustomerAddress(event.target.value)}
              />
            </label>
          </div>

          <section className="rpb-section p-4 md:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="rpb-h-title text-base font-semibold md:text-lg">Daftar AHU</h2>
                <p className="text-xs text-rpb-ink-soft">
                  Tambah AHU baru akan menyalin data teknis dari AHU aktif.
                </p>
              </div>
              <button
                type="button"
                className="rpb-btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
                onClick={addAhu}
                disabled={ahus.length >= MAX_AHU_PER_QUOTATION}
              >
                <Plus size={15} />
                Tambah AHU
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {ahus.map((ahu, index) => {
                const isActive = ahu.id === activeAhuId;

                return (
                  <div
                    key={ahu.id}
                    className={`min-w-[180px] rounded-xl border px-3 py-2 ${
                      isActive ? "border-rpb-primary bg-[#eef2ff]" : "border-rpb-border bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setActiveAhu(ahu.id)}
                    >
                      <p className="text-xs text-rpb-ink-soft">AHU {index + 1}</p>
                      {renamingAhuId === ahu.id ? (
                        <input
                          className="rpb-input mt-1 h-9"
                          value={renamingAhuValue}
                          onChange={(event) => setRenamingAhuValue(event.target.value)}
                          onBlur={commitRenameAhu}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              commitRenameAhu();
                            }
                            if (event.key === "Escape") {
                              setRenamingAhuId(null);
                              setRenamingAhuValue("");
                            }
                          }}
                          autoFocus
                        />
                      ) : (
                        <p className="mt-0.5 font-semibold text-foreground">{ahu.name}</p>
                      )}
                    </button>

                    <div className="mt-2 flex items-center justify-end gap-1">
                      <button
                        type="button"
                        className="rpb-btn-ghost inline-flex h-9 w-9 items-center justify-center"
                        onClick={() => beginRenameAhu(ahu.id, ahu.name)}
                        aria-label={`Rename ${ahu.name}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="rpb-btn-ghost inline-flex h-9 w-9 items-center justify-center text-red-700"
                        onClick={() => handleRemoveAhu(ahu.id)}
                        disabled={ahus.length === 1}
                        aria-label={`Hapus ${ahu.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div>
            <h2 className="rpb-h-title mb-2 text-base font-semibold md:text-lg">
              Ukuran Ruangan {activeAhu.name}
            </h2>
            <div className="grid gap-3 md:grid-cols-3">
              <DimensionInput
                label="Panjang (mm)"
                value={dimensions.length}
                onChange={(value) => updateDimension("length", value)}
              />
              <DimensionInput
                label="Lebar (mm)"
                value={dimensions.width}
                onChange={(value) => updateDimension("width", value)}
              />
              <DimensionInput
                label="Tinggi (mm)"
                value={dimensions.height}
                onChange={(value) => updateDimension("height", value)}
              />
            </div>
          </div>

          <section className="rpb-key-card p-4 md:p-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="rpb-h-title text-base font-semibold md:text-lg">Profile</h2>
              <button
                type="button"
                className="rpb-btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold"
                onClick={() => setProfileBreakdownOpen((current) => !current)}
                aria-expanded={profileBreakdownOpen}
                aria-controls="profile-breakdown"
              >
                <span>Lihat Rincian</span>
                {profileBreakdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <label className="flex flex-col gap-2 text-sm font-semibold text-rpb-ink-soft md:w-64">
                Tebal Panel
                <select
                  className="rpb-input"
                  value={panelThickness}
                  onChange={(event) =>
                    setPanelThickness(Number(event.target.value) as 30 | 45)
                  }
                >
                  <option value={30}>30</option>
                  <option value={45}>45</option>
                </select>
              </label>
              <div className="rpb-price-pill inline-flex w-full items-center justify-between gap-4 px-5 py-3 text-sm font-semibold md:w-auto md:min-w-72">
                <span>Harga Profile</span>
                <span className="text-base">{formatRupiah(profileIdr)}</span>
              </div>
            </div>
            {profileBreakdownOpen ? (
              <div id="profile-breakdown">
                <FixedBreakdownPanel
                  items={profileBreakdown}
                  emptyText="Belum ada item Profile yang terhitung. Isi dimensi (Panjang/Lebar/Tinggi) di atas, maka rincian otomatis muncul."
                  totalLabel="Total Profile"
                  totalValue={profileIdr}
                />
              </div>
            ) : null}
          </section>

          <section className="rpb-key-card p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="rpb-h-title text-base font-semibold md:text-lg">Konstruksi</h2>
              <button
                type="button"
                className="rpb-btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold"
                onClick={() => setKonstruksiBreakdownOpen((current) => !current)}
                aria-expanded={konstruksiBreakdownOpen}
                aria-controls="konstruksi-breakdown"
              >
                <span>Lihat Rincian</span>
                {konstruksiBreakdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
            <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="rpb-price-pill inline-flex w-full items-center justify-between gap-4 px-5 py-3 text-sm font-semibold md:ml-auto md:w-auto md:min-w-72">
                <span>Total Konstruksi</span>
                <span className="text-base">{formatRupiah(konstruksiIdr)}</span>
              </div>
            </div>
            {konstruksiBreakdownOpen ? (
              <div id="konstruksi-breakdown">
                <FixedBreakdownPanel
                  items={konstruksiBreakdown}
                  emptyText="Belum ada item Konstruksi yang terhitung. Isi dimensi dan pilih Tebal Panel untuk melihat rincian."
                  totalLabel="Total Konstruksi"
                  totalValue={konstruksiIdr}
                />
              </div>
            ) : null}
          </section>

          <section className="rpb-section p-4 md:p-4">
            <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <h2 className="rpb-h-title text-base font-semibold md:text-lg">Lainnya</h2>
              <div className="rpb-price-pill inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold">
                <span>Terpilih</span>
                <span>{selectedOtherCount} unit</span>
              </div>
            </div>
            <div className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
              <label className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-rpb-ink-soft"
                />
                <input
                  className="rpb-input rpb-input-with-icon"
                  placeholder="Cari item atau model"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <label>
                <select
                  className="rpb-input pl-3"
                  value={activeFilter}
                  onChange={(event) => setActiveFilter(event.target.value as OtherFilter)}
                >
                  {filterOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="max-h-[300px] overflow-y-auto pr-1 md:max-h-[360px]">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <button
                  type="button"
                  className="rpb-grid-card rpb-custom-card flex min-h-[130px] flex-col items-center justify-center gap-2 p-3"
                  onClick={openCustomModal}
                  aria-label="Tambah custom item"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-current text-2xl leading-none">
                    +
                  </span>
                  <div className="text-center">
                    <p className="text-sm font-semibold">Tambah Custom Item</p>
                    <p className="text-xs font-medium opacity-80">Klik untuk tambah</p>
                  </div>
                </button>
                {filteredOtherItems.map((item) => {
                  const currentQty = selectedOther[item.id] ?? 0;

                  return (
                    <article key={item.id} className="rpb-grid-card p-2.5">
                      <div className="mb-1.5 flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{item.name}</p>
                          <p className="text-xs text-rpb-ink-soft">{item.category}</p>
                        </div>
                        <button
                          type="button"
                          className="rpb-btn-primary inline-flex h-8 w-8 items-center justify-center"
                          onClick={() => openAddModal(item)}
                          aria-label={`Tambah ${item.name}`}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <p className="line-clamp-1 text-xs text-rpb-ink-soft">
                        Model: {item.model}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-sm">
                          <span className="font-semibold">
                          {formatRupiah(item.priceIdr)}
                        </span>
                        {currentQty > 0 ? (
                          <span className="rpb-chip px-2 py-0.5 text-xs font-semibold text-rpb-primary">
                            Qty {currentQty}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>

          <div className="rpb-sticky-bottom flex justify-end">
            <Link
              href="/summary"
              className="rpb-btn-primary inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold shadow-lg"
            >
              Lanjut
              <ArrowRight size={16} />
            </Link>
          </div>
      </div>

      {modalItem ? (
        <div className="rpb-modal-backdrop fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-[#15172b]/45 p-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] backdrop-blur-[2px] md:items-center md:pb-6">
          <div className="rpb-modal-panel flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-rpb-border bg-white shadow-xl">
            <div className="rpb-topbar px-5 py-4 text-white">
              <h3 className="rpb-h-title text-lg font-semibold">{modalItem.name}</h3>
            </div>
            <div className="space-y-5 overflow-y-auto p-5">
              <div className="rpb-section p-4">
                <p className="mb-1 text-sm text-rpb-ink-soft">Harga</p>
                <p className="text-2xl font-semibold">
                  {formatRupiah(modalItem.priceIdr)}
                </p>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-rpb-ink-soft">
                  Jumlah (unit)
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="rpb-btn-ghost h-11 w-11 text-xl"
                    onClick={() => setModalQty((qty) => Math.max(1, qty - 1))}
                  >
                    -
                  </button>
                  <input
                    className="rpb-input text-center"
                    type="number"
                    min={1}
                    step={1}
                    value={modalQty}
                    onFocus={selectInputOnFocus}
                    onChange={(event) =>
                      setModalQty(Math.max(1, Math.floor(parseNumberInput(event.target.value))))
                    }
                  />
                  <button
                    type="button"
                    className="rpb-btn-primary h-11 w-11 text-xl font-semibold"
                    onClick={() => setModalQty((qty) => qty + 1)}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="rpb-section p-4">
                <p className="text-sm text-rpb-ink-soft">Total Harga</p>
                <p className="text-xl font-semibold">
                  {formatRupiah(modalQty * modalItem.priceIdr)}
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rpb-btn-ghost px-4 py-2 text-sm font-semibold"
                  onClick={closeAddModal}
                >
                  Batal
                </button>
                <button
                  type="button"
                  className="rpb-btn-primary px-4 py-2 text-sm font-semibold"
                  onClick={handleAddOther}
                >
                  Tambah
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {customModalOpen ? (
        <div className="rpb-modal-backdrop fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-[#15172b]/45 p-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] backdrop-blur-[2px] md:items-center md:pb-6">
          <div className="rpb-modal-panel flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-rpb-border bg-[#eceef8] shadow-xl">
            <div className="rpb-topbar px-6 py-4 text-white">
              <h3 className="rpb-h-title text-lg font-semibold">Custom Item</h3>
            </div>
            <div className="space-y-5 overflow-y-auto p-5 md:p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold text-rpb-ink-soft">
                  Jenis
                  <input
                    className={`rpb-input ${customErrors.jenis ? "border-red-400" : ""}`}
                    value={customJenis}
                    onChange={(event) => { setCustomJenis(event.target.value); setCustomErrors((e) => ({ ...e, jenis: undefined })); }}
                  />
                  {customErrors.jenis ? <p className="text-xs text-red-600">{customErrors.jenis}</p> : null}
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold text-rpb-ink-soft">
                  Keterangan
                  <input
                    className={`rpb-input ${customErrors.keterangan ? "border-red-400" : ""}`}
                    value={customKeterangan}
                    onChange={(event) => { setCustomKeterangan(event.target.value); setCustomErrors((e) => ({ ...e, keterangan: undefined })); }}
                  />
                  {customErrors.keterangan ? <p className="text-xs text-red-600">{customErrors.keterangan}</p> : null}
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <label className="flex flex-col gap-2 text-sm font-semibold text-rpb-ink-soft">
                  Satuan
                  <input
                    className={`rpb-input ${customErrors.satuan ? "border-red-400" : ""}`}
                    value={customSatuan}
                    onChange={(event) => { setCustomSatuan(event.target.value); setCustomErrors((e) => ({ ...e, satuan: undefined })); }}
                  />
                  {customErrors.satuan ? <p className="text-xs text-red-600">{customErrors.satuan}</p> : null}
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold text-rpb-ink-soft">
                  Jenis Spec
                  <input
                    className={`rpb-input ${customErrors.jenisSpec ? "border-red-400" : ""}`}
                    value={customJenisSpec}
                    onChange={(event) => { setCustomJenisSpec(event.target.value); setCustomErrors((e) => ({ ...e, jenisSpec: undefined })); }}
                  />
                  {customErrors.jenisSpec ? <p className="text-xs text-red-600">{customErrors.jenisSpec}</p> : null}
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold text-rpb-ink-soft">
                  Harga (Rupiah)
                  <input
                    className={`rpb-input ${customErrors.harga ? "border-red-400" : ""}`}
                    type="number"
                    min={0}
                    step="any"
                    value={customHargaIdr}
                    onFocus={selectInputOnFocus}
                    onChange={(event) => { setCustomHargaIdr(parseNumberInput(event.target.value)); setCustomErrors((e) => ({ ...e, harga: undefined })); }}
                  />
                  {customErrors.harga ? <p className="text-xs text-red-600">{customErrors.harga}</p> : null}
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold text-rpb-ink-soft">
                  Jumlah
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="rpb-btn-ghost h-11 w-11 shrink-0 aspect-square text-xl"
                      onClick={() => setCustomQty((qty) => Math.max(1, qty - 1))}
                      aria-label="Kurangi quantity custom item"
                    >
                      -
                    </button>
                    <input
                      className={`rpb-input h-11 w-24 text-center ${customErrors.qty ? "border-red-400" : ""}`}
                      type="text"
                      inputMode="numeric"
                      value={customQty}
                      onFocus={selectInputOnFocus}
                      onChange={(event) => { setCustomQty(Math.max(1, Math.floor(parseNumberInput(event.target.value)))); setCustomErrors((e) => ({ ...e, qty: undefined })); }}
                    />
                    <button
                      type="button"
                      className="rpb-btn-primary h-11 w-11 shrink-0 aspect-square text-xl font-semibold"
                      onClick={() => setCustomQty((qty) => qty + 1)}
                      aria-label="Tambah quantity custom item"
                    >
                      +
                    </button>
                  </div>
                  {customErrors.qty ? <p className="text-xs text-red-600">{customErrors.qty}</p> : null}
                </label>
              </div>

              <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_290px]">
                <div className="text-xs text-rpb-ink-soft">
                  Quantity custom item bisa diatur sesuai kebutuhan.
                </div>
                <div className="border-t border-rpb-border px-4 py-2">
                  <p className="text-xs text-rpb-ink-soft">Total Harga</p>
                  <p className="text-lg font-semibold">
                    {formatRupiah(customHargaIdr * customQty)}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="rpb-btn-ghost px-4 py-2 text-sm font-semibold"
                  onClick={closeCustomModal}
                >
                  Batal
                </button>
                <button
                  type="button"
                  className="rpb-btn-primary px-4 py-2 text-sm font-semibold"
                  onClick={handleAddCustomOther}
                >
                  Tambah
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </RpbPageFrame>
  );
}
