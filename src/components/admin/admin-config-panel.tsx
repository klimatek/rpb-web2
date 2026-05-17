"use client";

import type { TextareaHTMLAttributes } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import {
  deleteKonstruksiMasterItem,
  deleteOtherMasterItem,
  deleteProfileMasterItem,
  deleteFormulaVariableSetting,
  fetchRpbMasterData,
  upsertFormulaVariableSetting,
  upsertKonstruksiMasterItem,
  upsertOtherMasterItem,
  upsertProfileMasterItem,
} from "@/lib/rpb-db";
import { evaluateFormulaQuantity, validateFormulaExpression } from "@/lib/rpb-formula";
import { useRpbStore } from "@/store/rpb-store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { invalidateRpbMasterDataCache } from "@/hooks/use-rpb-master-data";
import type {
  FormulaVariableSection,
  FormulaVariableSetting,
  KonstruksiMasterItem,
  OtherItem,
  ProfileMasterItem,
  RpbMasterData,
} from "@/types/rpb";

type ConfigSection = "profile" | "konstruksi" | "other";

const CONFIG_NAV_ITEMS: Array<{
  key: ConfigSection;
  label: string;
  description: string;
}> = [
  { key: "profile", label: "Profile", description: "Formula qty + harga panel 30/45" },
  { key: "konstruksi", label: "Konstruksi", description: "Formula qty + harga satuan" },
  { key: "other", label: "Other", description: "Master item tambahan permanen" },
];

const IDR_INPUT_FORMATTER = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

const formatIdrInput = (value: number) =>
  IDR_INPUT_FORMATTER.format(Number.isFinite(value) ? Math.max(0, value) : 0);

const parseIdrInput = (value: string) => {
  const digitsOnly = value.replace(/[^\d]/g, "");
  if (!digitsOnly) {
    return 0;
  }

  const parsed = Number.parseInt(digitsOnly, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDecimalInput = (value: string) => {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatQtyPreview = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "0";
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toLocaleString("id-ID", { maximumFractionDigits: 3 });
};

const OTHER_CATEGORY_DATALIST_ID = "other-category-options";

const toVariableKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_]/g, "");

const RESERVED_FORMULA_KEYS = new Set([
  "width",
  "length",
  "height",
  "panel_thickness",
  "panelthickness",
  "p",
  "t",
]);

const isReservedFormulaKey = (value: string): boolean =>
  RESERVED_FORMULA_KEYS.has(value.trim().toLowerCase());

const newOtherDefault = {
  name: "",
  category: "",
  model: "",
  unit: "",
  priceIdr: 0,
};

const newProfileDefault = {
  code: "",
  name: "",
  unit: "pc",
  formulaExpr: "0",
  priceIdr30: 0,
  priceIdr45: 0,
};

const newKonstruksiDefault = {
  code: "",
  name: "",
  unit: "pc",
  formulaExpr: "0",
  unitPriceIdr: 0,
};

const makeClientUuid = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

function FormulaHelpBox() {
  const functionDescriptions = [
    {
      name: "ROUND(x, digit)",
      desc: "Membulatkan nilai ke jumlah desimal tertentu.",
      usage: "ROUND((width * length) / 1000000, 2)",
    },
    {
      name: "CEIL(x)",
      desc: "Membulatkan ke atas ke bilangan bulat terdekat.",
      usage: "CEIL((length / 1200) * 8)",
    },
    {
      name: "FLOOR(x)",
      desc: "Membulatkan ke bawah ke bilangan bulat terdekat.",
      usage: "FLOOR((width + length) / 1000)",
    },
    {
      name: "ABS(x)",
      desc: "Mengubah nilai negatif menjadi positif.",
      usage: "ABS(width - length)",
    },
    {
      name: "MIN(a,b,...)",
      desc: "Mengambil nilai paling kecil.",
      usage: "MIN(width, length, height)",
    },
    {
      name: "MAX(a,b,...)",
      desc: "Mengambil nilai paling besar.",
      usage: "MAX(width, length, height)",
    },
    {
      name: "PCT(base,persen)",
      desc: "Menghitung persentase dari nilai dasar.",
      usage: "PCT(panel, 5)",
    },
    {
      name: "PERSEN(base,persen)",
      desc: "Sama seperti PCT, alias bahasa Indonesia.",
      usage: "PERSEN(panel, 10)",
    },
    {
      name: "IF(syarat, nilaiTrue, nilaiFalse)",
      desc: "Jika syarat benar (tidak nol), hasilnya nilaiTrue. Jika salah, hasilnya nilaiFalse.",
      usage: "IF(panel_thickness > 30, 10, 5)",
    },
  ];

  return (
    <div className="mt-4 rounded-xl border border-rpb-border bg-[#eceef8] p-3.5 text-sm text-rpb-ink-soft">
      <p className="font-semibold text-foreground">Fungsi Formula yang didukung</p>
      <p className="mt-1">
        Operator: <span className="font-mono">+</span>, <span className="font-mono">-</span>,{" "}
        <span className="font-mono">*</span>, <span className="font-mono">/</span>,{" "}
        <span className="font-mono">^</span>, kurung, literal persen seperti{" "}
        <span className="font-mono">10%</span>, dan operator perbandingan{" "}
        <span className="font-mono">&gt;</span>, <span className="font-mono">&lt;</span>,{" "}
        <span className="font-mono">&gt;=</span>, <span className="font-mono">&lt;=</span>,{" "}
        <span className="font-mono">==</span>, <span className="font-mono">!=</span>.
      </p>
      <p className="mt-1">
        Variabel yang bisa dipakai: <span className="font-mono">width</span>,{" "}
        <span className="font-mono">length</span>, <span className="font-mono">height</span>,{" "}
        <span className="font-mono">panel_thickness</span> (bisa disingkat{" "}
        <span className="font-mono">p</span> atau <span className="font-mono">t</span>), dan
        kode item sebelumnya (termasuk kode profile untuk dipakai di formula konstruksi).
      </p>
      <div className="mt-2 overflow-x-auto rounded-lg border border-rpb-border bg-white">
        <table className="w-full min-w-[680px] table-fixed text-xs">
          <thead className="bg-[#eceef8]">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-rpb-ink-soft">
              <th className="w-[24%] px-3 py-2">Fungsi</th>
              <th className="w-[34%] px-3 py-2">Penjelasan</th>
              <th className="w-[42%] px-3 py-2">Cara Pakai</th>
            </tr>
          </thead>
          <tbody>
            {functionDescriptions.map((item) => (
              <tr key={item.name} className="border-t border-rpb-border align-top">
                <td className="px-3 py-2 font-mono text-foreground">{item.name}</td>
                <td className="px-3 py-2">{item.desc}</td>
                <td className="px-3 py-2 font-mono text-foreground">{item.usage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-xs">
        Contoh: ROUND(((width * length) / 1000000), 2)
      </p>
      <p className="mt-2 font-mono text-xs">
        Contoh IF: IF(panel_thickness &gt; 30, 10, 5) -&gt; hasilnya 10 jika tebal 45, 5 jika 30
      </p>
    </div>
  );
}

function AutoSizeFormulaTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const value = typeof props.value === "string" ? props.value : "";

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 40)}px`;
  }, [value]);

  return (
    <textarea
      {...props}
      ref={textareaRef}
      rows={1}
      className={`${props.className ?? ""} resize-none overflow-hidden`.trim()}
    />
  );
}

function VariableSettingsCard({
  section,
  rows,
  previewValues,
  busy,
  onChange,
  onSave,
  onDelete,
  onAdd,
}: {
  section: FormulaVariableSection;
  rows: FormulaVariableSetting[];
  previewValues: Record<string, number>;
  busy: string | null;
  onChange: (id: string, patch: Partial<FormulaVariableSetting>) => void;
  onSave: (row: FormulaVariableSetting) => Promise<void>;
  onDelete: (row: FormulaVariableSetting) => Promise<void>;
  onAdd: () => void;
}) {
  const title = section === "profile" ? "Variable Setting Profile" : "Variable Setting Konstruksi";
  const defaultRows = rows.filter((row) => row.isDefault);
  const customRows = rows.filter((row) => !row.isDefault);

  return (
    <div className="mt-4 rounded-xl border border-rpb-border bg-white p-3.5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <button
          type="button"
          className="rpb-btn-ghost inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold"
          onClick={onAdd}
        >
          <Plus size={14} />
          Variabel
        </button>
      </div>

      <div className="rounded-lg border border-rpb-border bg-[#eceef8] p-2.5">
        <p className="text-xs font-semibold text-rpb-ink-soft">Variabel Default (read-only)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {defaultRows.map((row) => (
            <span
              key={row.id}
              className="inline-flex items-center rounded-full border border-rpb-border bg-white px-3 py-1 text-xs font-semibold text-foreground"
            >
              {row.label}: {formatQtyPreview(previewValues[row.key] ?? row.defaultValue)}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-rpb-ink-soft">
          Diambil dari input user pada halaman beranda.
        </p>
      </div>

      <div className="mt-3 space-y-2">
        {customRows.map((row) => {
          const rowBusyKey = `variable:${row.id}`;
          const deleteBusyKey = `variable:delete:${row.id}`;

          return (
            <div key={row.id} className="rounded-lg border border-rpb-border bg-[#eceef8] p-2.5">
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_auto]">
                <input
                  className="rpb-input"
                  placeholder="Nama Variabel"
                  value={row.label}
                  onChange={(event) => {
                    const label = event.target.value;
                    onChange(row.id, { label, key: toVariableKey(label) });
                  }}
                />
                <input
                  className="rpb-input"
                  type="number"
                  step="any"
                  value={row.defaultValue}
                  onChange={(event) => onChange(row.id, { defaultValue: parseDecimalInput(event.target.value) })}
                />
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    className="rpb-btn-primary px-3 py-2 text-xs font-semibold"
                    onClick={() => void onSave(row)}
                    disabled={busy === rowBusyKey}
                  >
                    {busy === rowBusyKey ? "..." : "Simpan"}
                  </button>
                  <button
                    type="button"
                    className="rpb-btn-ghost inline-flex h-11 w-11 items-center justify-center border-red-200 p-0 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                    onClick={() => void onDelete(row)}
                    disabled={busy === deleteBusyKey}
                    aria-label={`Hapus variabel ${row.label || row.key}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-rpb-ink-soft">
                Nama variabel tidak boleh mengandung spasi.
              </p>
            </div>
          );
        })}
        {customRows.length === 0 ? (
          <p className="text-xs text-rpb-ink-soft">Belum ada variabel custom. Tambah lewat tombol `+ Variabel`.</p>
        ) : null}
      </div>
    </div>
  );
}

export function AdminConfigPanel({ initialData }: { initialData: RpbMasterData }) {
  const [data, setData] = useState<RpbMasterData>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dimensions = useRpbStore((state) => state.getActiveAhu().dimensions);
  const [profileRows, setProfileRows] = useState<ProfileMasterItem[]>([]);
  const [konstruksiRows, setKonstruksiRows] = useState<KonstruksiMasterItem[]>([]);
  const [otherRows, setOtherRows] = useState<OtherItem[]>([]);
  const [variableRows, setVariableRows] = useState<FormulaVariableSetting[]>([]);
  const [newOther, setNewOther] = useState(newOtherDefault);
  const [isOtherModalOpen, setIsOtherModalOpen] = useState(false);
  const [newProfile, setNewProfile] = useState(newProfileDefault);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [newKonstruksi, setNewKonstruksi] = useState(newKonstruksiDefault);
  const [isKonstruksiModalOpen, setIsKonstruksiModalOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<ConfigSection>("profile");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const latestData = await fetchRpbMasterData(supabase);
      setData(latestData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data master.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!data) {
      return;
    }
    setProfileRows((data.profileItems ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder));
    setKonstruksiRows((data.konstruksiItems ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder));
    setOtherRows((data.otherItems ?? []).slice());
    setVariableRows((data.formulaVariables ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder));
  }, [data]);

  const profileVariables = useMemo(
    () => variableRows.filter((row) => row.section === "profile").sort((a, b) => a.sortOrder - b.sortOrder),
    [variableRows],
  );
  const konstruksiVariables = useMemo(
    () =>
      variableRows.filter((row) => row.section === "konstruksi").sort((a, b) => a.sortOrder - b.sortOrder),
    [variableRows],
  );
  const otherCategoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          otherRows
            .map((row) => row.category.trim())
            .filter((category) => category.length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [otherRows],
  );
  const defaultVariablePreviewValues = useMemo(
    () => ({
      width: Number.isFinite(dimensions.width) ? dimensions.width : 0,
      length: Number.isFinite(dimensions.length) ? dimensions.length : 0,
      height: Number.isFinite(dimensions.height) ? dimensions.height : 0,
    }),
    [dimensions.height, dimensions.length, dimensions.width],
  );
  const { profileQtyPreview, konstruksiQtyPreview } = useMemo(() => {
    const ctx: Record<string, number> = {
      panel_thickness: 30,
      panelThickness: 30,
      width: defaultVariablePreviewValues.width,
      length: defaultVariablePreviewValues.length,
      height: defaultVariablePreviewValues.height,
    };
    [...profileVariables, ...konstruksiVariables].forEach((variable) => {
      if (variable.key === "width" || variable.key === "length" || variable.key === "height") {
        return;
      }
      ctx[variable.key] = Number.isFinite(variable.defaultValue) ? variable.defaultValue : 0;
    });

    const profileQtyPreviewMap = profileRows.reduce<Record<string, number>>((acc, row) => {
      const qty = evaluateFormulaQuantity(row.formulaExpr, ctx);
      acc[row.id] = qty;
      if (!isReservedFormulaKey(row.code)) {
        ctx[row.code] = qty;
      }
      return acc;
    }, {});

    const konstruksiQtyPreviewMap = konstruksiRows.reduce<Record<string, number>>((acc, row) => {
      const qty = evaluateFormulaQuantity(row.formulaExpr, ctx);
      acc[row.id] = qty;
      if (!isReservedFormulaKey(row.code)) {
        ctx[row.code] = qty;
      }
      return acc;
    }, {});

    return {
      profileQtyPreview: profileQtyPreviewMap,
      konstruksiQtyPreview: konstruksiQtyPreviewMap,
    };
  }, [
    defaultVariablePreviewValues.height,
    defaultVariablePreviewValues.length,
    defaultVariablePreviewValues.width,
    konstruksiRows,
    konstruksiVariables,
    profileRows,
    profileVariables,
  ]);

  const validateProfileRow = (row: ProfileMasterItem): string | null => {
    const normalizedCode = row.code.trim().toLowerCase();
    if (!normalizedCode) {
      return "Code item Profile wajib diisi.";
    }
    if (profileRows.some((item) => item.id !== row.id && item.code.trim().toLowerCase() === normalizedCode)) {
      return `Code Profile duplikat: ${row.code}`;
    }
    if (!row.name.trim()) {
      return `Name item Profile (${row.code}) wajib diisi.`;
    }
    if (!row.unit.trim()) {
      return `Unit item Profile (${row.code}) wajib diisi.`;
    }
    const formulaError = validateFormulaExpression(row.formulaExpr);
    if (formulaError) {
      return `Formula PROFILE ${row.code} tidak valid: ${formulaError}`;
    }
    return null;
  };

  const validateKonstruksiRow = (row: KonstruksiMasterItem): string | null => {
    const normalizedCode = row.code.trim().toLowerCase();
    if (!normalizedCode) {
      return "Code item Konstruksi wajib diisi.";
    }
    if (konstruksiRows.some((item) => item.id !== row.id && item.code.trim().toLowerCase() === normalizedCode)) {
      return `Code Konstruksi duplikat: ${row.code}`;
    }
    if (!row.name.trim()) {
      return `Name item Konstruksi (${row.code}) wajib diisi.`;
    }
    if (!row.unit.trim()) {
      return `Unit item Konstruksi (${row.code}) wajib diisi.`;
    }
    const formulaError = validateFormulaExpression(row.formulaExpr);
    if (formulaError) {
      return `Formula KONSTRUKSI ${row.code} tidak valid: ${formulaError}`;
    }
    return null;
  };

  const saveProfileRow = async (row: ProfileMasterItem) => {
    const validation = validateProfileRow(row);
    if (validation) {
      setMessage(validation);
      return;
    }

    setBusy(`profile:${row.id}`);
    setMessage(null);
    try {
      const supabase = getSupabaseBrowserClient();
      await upsertProfileMasterItem(supabase, {
        ...row,
        code: row.code.trim(),
        name: row.name.trim(),
        unit: row.unit.trim(),
      });
      invalidateRpbMasterDataCache();
      setMessage(`Item Profile ${row.name || row.code} berhasil disimpan.`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal simpan item Profile.");
    } finally {
      setBusy(null);
    }
  };

  const saveKonstruksiRow = async (row: KonstruksiMasterItem) => {
    const validation = validateKonstruksiRow(row);
    if (validation) {
      setMessage(validation);
      return;
    }

    setBusy(`konstruksi:${row.id}`);
    setMessage(null);
    try {
      const supabase = getSupabaseBrowserClient();
      await upsertKonstruksiMasterItem(supabase, {
        ...row,
        code: row.code.trim(),
        name: row.name.trim(),
        unit: row.unit.trim(),
      });
      invalidateRpbMasterDataCache();
      setMessage(`Item Konstruksi ${row.name || row.code} berhasil disimpan.`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal simpan item Konstruksi.");
    } finally {
      setBusy(null);
    }
  };

  const deleteProfileRow = async (row: ProfileMasterItem) => {
    const confirmed = window.confirm(`Hapus item Profile "${row.name || row.code || "(baru)"}"?`);
    if (!confirmed) {
      return;
    }

    const existsInDb = data.profileItems.some((item) => item.id === row.id);
    if (!existsInDb) {
      setProfileRows((rows) => rows.filter((item) => item.id !== row.id));
      setMessage("Item Profile draft dihapus.");
      return;
    }

    setBusy(`profile:delete:${row.id}`);
    setMessage(null);
    try {
      const supabase = getSupabaseBrowserClient();
      await deleteProfileMasterItem(supabase, row.id);
      invalidateRpbMasterDataCache();
      setMessage(`Item Profile ${row.name || row.code} berhasil dihapus.`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal hapus item Profile.");
    } finally {
      setBusy(null);
    }
  };

  const deleteKonstruksiRow = async (row: KonstruksiMasterItem) => {
    const confirmed = window.confirm(`Hapus item Konstruksi "${row.name || row.code || "(baru)"}"?`);
    if (!confirmed) {
      return;
    }

    const existsInDb = data.konstruksiItems.some((item) => item.id === row.id);
    if (!existsInDb) {
      setKonstruksiRows((rows) => rows.filter((item) => item.id !== row.id));
      setMessage("Item Konstruksi draft dihapus.");
      return;
    }

    setBusy(`konstruksi:delete:${row.id}`);
    setMessage(null);
    try {
      const supabase = getSupabaseBrowserClient();
      await deleteKonstruksiMasterItem(supabase, row.id);
      invalidateRpbMasterDataCache();
      setMessage(`Item Konstruksi ${row.name || row.code} berhasil dihapus.`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal hapus item Konstruksi.");
    } finally {
      setBusy(null);
    }
  };

  const saveVariable = async (row: FormulaVariableSetting) => {
    const label = row.label.trim();
    if (!label) {
      setMessage("Nama variabel wajib diisi.");
      return;
    }
    if (/\s/.test(label)) {
      setMessage("Nama variabel tidak boleh mengandung spasi.");
      return;
    }
    const normalizedKey = toVariableKey(label);
    if (!normalizedKey) {
      setMessage("Nama variabel harus berisi huruf/angka yang valid.");
      return;
    }

    setBusy(`variable:${row.id}`);
    setMessage(null);
    try {
      const supabase = getSupabaseBrowserClient();
      await upsertFormulaVariableSetting(supabase, {
        id: row.id.startsWith("temp-") ? undefined : row.id,
        section: row.section,
        key: normalizedKey,
        label,
        defaultValue: row.defaultValue,
        isDefault: row.isDefault,
        sortOrder: row.sortOrder,
      });
      setMessage(`Variabel ${row.label} berhasil disimpan.`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal simpan variabel.");
    } finally {
      setBusy(null);
    }
  };

  const deleteVariable = async (row: FormulaVariableSetting) => {
    if (row.isDefault) {
      setMessage("Variabel default tidak bisa dihapus.");
      return;
    }

    if (row.id.startsWith("temp-")) {
      setVariableRows((list) => list.filter((item) => item.id !== row.id));
      return;
    }

    setBusy(`variable:delete:${row.id}`);
    setMessage(null);
    try {
      const supabase = getSupabaseBrowserClient();
      await deleteFormulaVariableSetting(supabase, row.id);
      setMessage(`Variabel ${row.label} berhasil dihapus.`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal hapus variabel.");
    } finally {
      setBusy(null);
    }
  };

  const addVariable = (section: FormulaVariableSection) => {
    const nextOrder =
      Math.max(0, ...variableRows.filter((row) => row.section === section).map((row) => row.sortOrder)) + 1;
    setVariableRows((list) => [
      ...list,
      {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        section,
        key: "",
        label: "",
        defaultValue: 0,
        isDefault: false,
        sortOrder: nextOrder,
      },
    ]);
  };

  const saveOtherRow = async (row: OtherItem) => {
    setBusy(`other:${row.id}`);
    setMessage(null);
    try {
      const supabase = getSupabaseBrowserClient();
      await upsertOtherMasterItem(supabase, {
        id: row.id,
        name: row.name,
        category: row.category,
        model: row.model,
        unit: row.unit,
        priceIdr: row.priceIdr,
      });
      invalidateRpbMasterDataCache();
      setMessage(`Item ${row.name} berhasil disimpan.`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal simpan item other.");
    } finally {
      setBusy(null);
    }
  };

  const addProfilePermanent = async () => {
    const nextSortOrder = Math.max(0, ...profileRows.map((row) => row.sortOrder)) + 1;
    const newRow: ProfileMasterItem = {
      id: makeClientUuid(),
      code: newProfile.code.trim(),
      name: newProfile.name.trim(),
      unit: (newProfile.unit.trim() || "pc"),
      sortOrder: nextSortOrder,
      formulaExpr: newProfile.formulaExpr.trim() || "0",
      priceIdr30: Math.max(0, newProfile.priceIdr30),
      priceIdr45: Math.max(0, newProfile.priceIdr45),
      isActive: true,
    };

    const validation = validateProfileRow(newRow);
    if (validation) {
      setMessage(validation);
      return;
    }

    setBusy("profile:new");
    setMessage(null);
    try {
      const supabase = getSupabaseBrowserClient();
      await upsertProfileMasterItem(supabase, newRow);
      invalidateRpbMasterDataCache();
      setNewProfile(newProfileDefault);
      setIsProfileModalOpen(false);
      setMessage(`Item Profile ${newRow.name || newRow.code} berhasil ditambahkan.`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menambah item Profile.");
    } finally {
      setBusy(null);
    }
  };

  const addKonstruksiPermanent = async () => {
    const nextSortOrder = Math.max(0, ...konstruksiRows.map((row) => row.sortOrder)) + 1;
    const newRow: KonstruksiMasterItem = {
      id: makeClientUuid(),
      code: newKonstruksi.code.trim(),
      name: newKonstruksi.name.trim(),
      unit: (newKonstruksi.unit.trim() || "pc"),
      sortOrder: nextSortOrder,
      formulaExpr: newKonstruksi.formulaExpr.trim() || "0",
      unitPriceIdr: Math.max(0, newKonstruksi.unitPriceIdr),
      isActive: true,
    };

    const validation = validateKonstruksiRow(newRow);
    if (validation) {
      setMessage(validation);
      return;
    }

    setBusy("konstruksi:new");
    setMessage(null);
    try {
      const supabase = getSupabaseBrowserClient();
      await upsertKonstruksiMasterItem(supabase, newRow);
      invalidateRpbMasterDataCache();
      setNewKonstruksi(newKonstruksiDefault);
      setIsKonstruksiModalOpen(false);
      setMessage(`Item Konstruksi ${newRow.name || newRow.code} berhasil ditambahkan.`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menambah item Konstruksi.");
    } finally {
      setBusy(null);
    }
  };

  const addOtherPermanent = async () => {
    if (!newOther.name.trim()) {
      setMessage("Nama item other wajib diisi.");
      return;
    }

    setBusy("other:new");
    setMessage(null);
    try {
      const supabase = getSupabaseBrowserClient();
      await upsertOtherMasterItem(supabase, {
        name: newOther.name.trim(),
        category: newOther.category.trim() || "Other",
        model: newOther.model.trim() || "-",
        unit: newOther.unit.trim() || "pc",
        priceIdr: Math.max(0, newOther.priceIdr),
      });
      invalidateRpbMasterDataCache();
      setNewOther(newOtherDefault);
      setIsOtherModalOpen(false);
      setMessage("Item other permanen berhasil ditambahkan.");
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menambah item other.");
    } finally {
      setBusy(null);
    }
  };

  const deleteOtherRow = async (row: OtherItem) => {
    const confirmed = window.confirm(`Hapus item "${row.name}" dari master Other?`);
    if (!confirmed) {
      return;
    }

    setBusy(`other:delete:${row.id}`);
    setMessage(null);
    try {
      const supabase = getSupabaseBrowserClient();
      await deleteOtherMasterItem(supabase, row.id);
      invalidateRpbMasterDataCache();
      setMessage(`Item ${row.name} berhasil dihapus.`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal hapus item other.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 pb-3 md:pb-4">
      {loading ? <div className="rpb-section rpb-delayed-loader p-4 text-sm text-rpb-ink-soft">Memuat data master...</div> : null}
      {error ? (
        <div className="rpb-alert rpb-alert-error">{error}</div>
      ) : null}
      {message ? (
        <div className="rpb-alert rpb-alert-info">
          {message}
        </div>
      ) : null}

      <nav className="rpb-section p-2.5" aria-label="Navigasi konfigurasi RPB">
        <div className="overflow-x-auto">
          <div className="inline-flex min-w-full rounded-xl border border-rpb-border bg-[#eceef8] p-1">
            {CONFIG_NAV_ITEMS.map((item) => {
              const isActive = activeSection === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`flex min-h-11 flex-1 flex-col justify-center rounded-lg px-3 py-2 text-left transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(55,61,119,0.25)] ${
                    isActive
                      ? "bg-rpb-primary text-white shadow-[0_6px_14px_rgba(55,61,119,0.2)]"
                      : "text-rpb-ink-soft hover:bg-white hover:text-rpb-primary"
                  }`}
                  onClick={() => setActiveSection(item.key)}
                  aria-pressed={isActive}
                >
                  <div className="text-sm font-semibold">{item.label}</div>
                  <div className={`text-xs ${isActive ? "text-white/85" : "text-rpb-ink-soft"}`}>
                    {item.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {activeSection === "profile" ? (
        <section className="rpb-section p-3.5 md:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="rpb-h-title text-base font-semibold">Profile</h2>
            <button
              type="button"
              className="rpb-btn-primary inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-semibold"
              onClick={() => {
                setNewProfile(newProfileDefault);
                setIsProfileModalOpen(true);
              }}
            >
              <Plus size={14} />
              Tambah Item
            </button>
          </div>

          <div className="space-y-2 md:hidden">
            {profileRows.map((row) => (
              <article key={row.id} className="rounded-xl border border-rpb-border bg-white p-3.5 shadow-[0_4px_12px_rgba(30,36,88,0.04)]">
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    className="rpb-btn-primary inline-flex h-9 w-9 items-center justify-center p-0"
                    onClick={() => void saveProfileRow(row)}
                    disabled={busy === `profile:${row.id}`}
                    aria-label={`Simpan item Profile ${row.name || row.code || ""}`}
                  >
                    {busy === `profile:${row.id}` ? "..." : <Save size={14} />}
                  </button>
                  <button
                    type="button"
                    className="rpb-btn-ghost inline-flex h-9 w-9 items-center justify-center border-red-200 p-0 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                    onClick={() => void deleteProfileRow(row)}
                    disabled={busy === `profile:delete:${row.id}`}
                    aria-label={`Hapus item Profile ${row.name || row.code || ""}`}
                  >
                    {busy === `profile:delete:${row.id}` ? "..." : <Trash2 size={14} />}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-semibold text-rpb-ink-soft">
                    Code
                    <input
                      className="rpb-input mt-1"
                      value={row.code}
                      onChange={(event) =>
                        setProfileRows((list) =>
                          list.map((item) =>
                            item.id === row.id ? { ...item, code: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="text-xs font-semibold text-rpb-ink-soft">
                    Unit
                    <input
                      className="rpb-input mt-1"
                      value={row.unit}
                      onChange={(event) =>
                        setProfileRows((list) =>
                          list.map((item) =>
                            item.id === row.id ? { ...item, unit: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <label className="mt-2 block text-xs font-semibold text-rpb-ink-soft">
                  Name
                  <input
                    className="rpb-input mt-1"
                    value={row.name}
                    onChange={(event) =>
                      setProfileRows((list) =>
                        list.map((item) =>
                          item.id === row.id ? { ...item, name: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
                <label className="mt-2 block text-xs font-semibold text-rpb-ink-soft">
                  <span className="flex items-center justify-between gap-2">
                    <span>Formula Qty</span>
                    <span className="rounded-md border border-rpb-border bg-[#eceef8] px-2 py-0.5 font-mono text-[11px] text-foreground">
                      Qty: {formatQtyPreview(profileQtyPreview[row.id] ?? 0)}
                    </span>
                  </span>
                  <div className="mt-1 grid grid-cols-[minmax(0,1fr)_84px] gap-2">
                    <AutoSizeFormulaTextarea
                      className="rpb-input whitespace-pre-wrap break-words font-mono"
                      value={row.formulaExpr}
                      onChange={(event) =>
                        setProfileRows((list) =>
                          list.map((item) => (item.id === row.id ? { ...item, formulaExpr: event.target.value } : item)),
                        )
                      }
                    />
                    <div className="rpb-input flex items-center justify-center bg-[#eceef8] font-mono text-xs">
                      {formatQtyPreview(profileQtyPreview[row.id] ?? 0)}
                    </div>
                  </div>
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-xs font-semibold text-rpb-ink-soft">
                    Harga 30
                    <input
                      className="rpb-input mt-1"
                      type="text"
                      inputMode="numeric"
                      value={formatIdrInput(row.priceIdr30)}
                      onChange={(event) =>
                        setProfileRows((list) =>
                          list.map((item) =>
                            item.id === row.id ? { ...item, priceIdr30: parseIdrInput(event.target.value) } : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="text-xs font-semibold text-rpb-ink-soft">
                    Harga 45
                    <input
                      className="rpb-input mt-1"
                      type="text"
                      inputMode="numeric"
                      value={formatIdrInput(row.priceIdr45)}
                      onChange={(event) =>
                        setProfileRows((list) =>
                          list.map((item) =>
                            item.id === row.id ? { ...item, priceIdr45: parseIdrInput(event.target.value) } : item,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>
          <div className="hidden md:block">
            <div className="overflow-hidden rounded-xl border border-rpb-border">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-[#eceef8]">
                  <tr className="text-left text-xs font-semibold text-rpb-ink-soft">
                    <th className="w-[12%] px-3 py-2">Code</th>
                    <th className="w-[16%] px-3 py-2">Name</th>
                    <th className="w-[8%] px-3 py-2">Unit</th>
                    <th className="w-[30%] px-3 py-2">Formula Qty</th>
                    <th className="w-[14%] px-3 py-2">Harga 30</th>
                    <th className="w-[14%] px-3 py-2">Harga 45</th>
                    <th className="w-[10%] px-3 py-2 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {profileRows.map((row) => (
                    <tr key={row.id} className="border-t border-rpb-border align-top">
                      <td className="px-3 py-2">
                        <input
                          className="rpb-input w-full"
                          value={row.code}
                          onChange={(event) =>
                            setProfileRows((list) =>
                              list.map((item) =>
                                item.id === row.id ? { ...item, code: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="rpb-input w-full"
                          value={row.name}
                          onChange={(event) =>
                            setProfileRows((list) =>
                              list.map((item) =>
                                item.id === row.id ? { ...item, name: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="rpb-input w-full"
                          value={row.unit}
                          onChange={(event) =>
                            setProfileRows((list) =>
                              list.map((item) =>
                                item.id === row.id ? { ...item, unit: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="grid grid-cols-[minmax(0,1fr)_84px] gap-2">
                          <AutoSizeFormulaTextarea
                            className="rpb-input w-full whitespace-pre-wrap break-words font-mono text-xs"
                            value={row.formulaExpr}
                            onChange={(event) =>
                              setProfileRows((list) =>
                                list.map((item) => (item.id === row.id ? { ...item, formulaExpr: event.target.value } : item)),
                              )
                            }
                          />
                          <div className="rpb-input flex items-center justify-center bg-[#eceef8] font-mono text-xs">
                            {formatQtyPreview(profileQtyPreview[row.id] ?? 0)}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="rpb-input w-full"
                          type="text"
                          inputMode="numeric"
                          value={formatIdrInput(row.priceIdr30)}
                          onChange={(event) =>
                            setProfileRows((list) =>
                              list.map((item) =>
                                item.id === row.id ? { ...item, priceIdr30: parseIdrInput(event.target.value) } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="rpb-input w-full"
                          type="text"
                          inputMode="numeric"
                          value={formatIdrInput(row.priceIdr45)}
                          onChange={(event) =>
                            setProfileRows((list) =>
                              list.map((item) =>
                                item.id === row.id ? { ...item, priceIdr45: parseIdrInput(event.target.value) } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            className="rpb-btn-primary inline-flex h-9 w-9 items-center justify-center p-0"
                            onClick={() => void saveProfileRow(row)}
                            disabled={busy === `profile:${row.id}`}
                            aria-label={`Simpan item Profile ${row.name || row.code || ""}`}
                          >
                            {busy === `profile:${row.id}` ? "..." : <Save size={14} />}
                          </button>
                          <button
                            type="button"
                            className="rpb-btn-ghost inline-flex h-9 w-9 items-center justify-center border-red-200 p-0 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                            onClick={() => void deleteProfileRow(row)}
                            disabled={busy === `profile:delete:${row.id}`}
                            aria-label={`Hapus item Profile ${row.name || row.code || ""}`}
                          >
                            {busy === `profile:delete:${row.id}` ? "..." : <Trash2 size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <VariableSettingsCard
            section="profile"
            rows={profileVariables}
            previewValues={defaultVariablePreviewValues}
            busy={busy}
            onAdd={() => addVariable("profile")}
            onChange={(id, patch) =>
              setVariableRows((list) => list.map((row) => (row.id === id ? { ...row, ...patch } : row)))
            }
            onSave={saveVariable}
            onDelete={deleteVariable}
          />
          <FormulaHelpBox />
        </section>
      ) : null}

      {isProfileModalOpen ? (
        <div className="rpb-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-[#15172b]/45 p-4 backdrop-blur-[2px]">
          <div className="rpb-modal-panel w-full max-w-4xl rounded-xl border border-rpb-border bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="rpb-h-title text-base font-semibold">Tambah Item Profile</h3>
              <button
                type="button"
                className="rpb-btn-ghost px-3 py-2 text-xs font-semibold"
                onClick={() => setIsProfileModalOpen(false)}
              >
                Tutup
              </button>
            </div>
            <form
              className="grid gap-3 md:grid-cols-6"
              onSubmit={(event) => {
                event.preventDefault();
                void addProfilePermanent();
              }}
            >
              <label>
                <span className="mb-1 block text-xs font-semibold text-rpb-ink-soft">Code</span>
                <input
                  className="rpb-input"
                  value={newProfile.code}
                  onChange={(event) => setNewProfile((value) => ({ ...value, code: event.target.value }))}
                />
              </label>
              <label className="md:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-rpb-ink-soft">Name</span>
                <input
                  className="rpb-input"
                  value={newProfile.name}
                  onChange={(event) => setNewProfile((value) => ({ ...value, name: event.target.value }))}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold text-rpb-ink-soft">Unit</span>
                <input
                  className="rpb-input"
                  value={newProfile.unit}
                  onChange={(event) => setNewProfile((value) => ({ ...value, unit: event.target.value }))}
                />
              </label>
              <label className="md:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-rpb-ink-soft">Formula Qty</span>
                <input
                  className="rpb-input font-mono"
                  value={newProfile.formulaExpr}
                  onChange={(event) => setNewProfile((value) => ({ ...value, formulaExpr: event.target.value }))}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold text-rpb-ink-soft">Harga 30</span>
                <input
                  className="rpb-input"
                  type="text"
                  inputMode="numeric"
                  value={formatIdrInput(newProfile.priceIdr30)}
                  onChange={(event) =>
                    setNewProfile((value) => ({ ...value, priceIdr30: parseIdrInput(event.target.value) }))
                  }
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold text-rpb-ink-soft">Harga 45</span>
                <input
                  className="rpb-input"
                  type="text"
                  inputMode="numeric"
                  value={formatIdrInput(newProfile.priceIdr45)}
                  onChange={(event) =>
                    setNewProfile((value) => ({ ...value, priceIdr45: parseIdrInput(event.target.value) }))
                  }
                />
              </label>
              <div className="flex justify-end md:col-span-6">
                <button
                  type="submit"
                  className="rpb-btn-primary inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold"
                  disabled={busy === "profile:new"}
                >
                  <Plus size={14} />
                  {busy === "profile:new" ? "..." : "Tambah"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {activeSection === "konstruksi" ? (
        <section className="rpb-section p-3.5 md:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="rpb-h-title text-base font-semibold">Konstruksi</h2>
            <button
              type="button"
              className="rpb-btn-primary inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-semibold"
              onClick={() => {
                setNewKonstruksi(newKonstruksiDefault);
                setIsKonstruksiModalOpen(true);
              }}
            >
              <Plus size={14} />
              Tambah Item
            </button>
          </div>

          <div className="space-y-2 md:hidden">
            {konstruksiRows.map((row) => (
              <article key={row.id} className="rounded-xl border border-rpb-border bg-white p-3.5 shadow-[0_4px_12px_rgba(30,36,88,0.04)]">
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    className="rpb-btn-primary inline-flex h-9 w-9 items-center justify-center p-0"
                    onClick={() => void saveKonstruksiRow(row)}
                    disabled={busy === `konstruksi:${row.id}`}
                    aria-label={`Simpan item Konstruksi ${row.name || row.code || ""}`}
                  >
                    {busy === `konstruksi:${row.id}` ? "..." : <Save size={14} />}
                  </button>
                  <button
                    type="button"
                    className="rpb-btn-ghost inline-flex h-9 w-9 items-center justify-center border-red-200 p-0 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                    onClick={() => void deleteKonstruksiRow(row)}
                    disabled={busy === `konstruksi:delete:${row.id}`}
                    aria-label={`Hapus item Konstruksi ${row.name || row.code || ""}`}
                  >
                    {busy === `konstruksi:delete:${row.id}` ? "..." : <Trash2 size={14} />}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-semibold text-rpb-ink-soft">
                    Code
                    <input
                      className="rpb-input mt-1"
                      value={row.code}
                      onChange={(event) =>
                        setKonstruksiRows((list) =>
                          list.map((item) =>
                            item.id === row.id ? { ...item, code: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="text-xs font-semibold text-rpb-ink-soft">
                    Unit
                    <input
                      className="rpb-input mt-1"
                      value={row.unit}
                      onChange={(event) =>
                        setKonstruksiRows((list) =>
                          list.map((item) =>
                            item.id === row.id ? { ...item, unit: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <label className="mt-2 block text-xs font-semibold text-rpb-ink-soft">
                  Name
                  <input
                    className="rpb-input mt-1"
                    value={row.name}
                    onChange={(event) =>
                      setKonstruksiRows((list) =>
                        list.map((item) =>
                          item.id === row.id ? { ...item, name: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
                <label className="mt-2 block text-xs font-semibold text-rpb-ink-soft">
                  <span className="flex items-center justify-between gap-2">
                    <span>Formula Qty</span>
                    <span className="rounded-md border border-rpb-border bg-[#eceef8] px-2 py-0.5 font-mono text-[11px] text-foreground">
                      Qty: {formatQtyPreview(konstruksiQtyPreview[row.id] ?? 0)}
                    </span>
                  </span>
                  <div className="mt-1 grid grid-cols-[minmax(0,1fr)_84px] gap-2">
                    <AutoSizeFormulaTextarea
                      className="rpb-input whitespace-pre-wrap break-words font-mono"
                      value={row.formulaExpr}
                      onChange={(event) =>
                        setKonstruksiRows((list) =>
                          list.map((item) => (item.id === row.id ? { ...item, formulaExpr: event.target.value } : item)),
                        )
                      }
                    />
                    <div className="rpb-input flex items-center justify-center bg-[#eceef8] font-mono text-xs">
                      {formatQtyPreview(konstruksiQtyPreview[row.id] ?? 0)}
                    </div>
                  </div>
                </label>
                <label className="mt-2 block text-xs font-semibold text-rpb-ink-soft">
                  Harga Satuan
                  <input
                    className="rpb-input mt-1"
                    type="text"
                    inputMode="numeric"
                    value={formatIdrInput(row.unitPriceIdr)}
                    onChange={(event) =>
                      setKonstruksiRows((list) =>
                        list.map((item) =>
                          item.id === row.id ? { ...item, unitPriceIdr: parseIdrInput(event.target.value) } : item,
                        ),
                      )
                    }
                  />
                </label>
              </article>
            ))}
          </div>
          <div className="hidden md:block">
            <div className="overflow-hidden rounded-xl border border-rpb-border">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-[#eceef8]">
                  <tr className="text-left text-xs font-semibold text-rpb-ink-soft">
                    <th className="w-[12%] px-3 py-2">Code</th>
                    <th className="w-[20%] px-3 py-2">Name</th>
                    <th className="w-[10%] px-3 py-2">Unit</th>
                    <th className="w-[32%] px-3 py-2">Formula Qty</th>
                    <th className="w-[20%] px-3 py-2">Harga Satuan</th>
                    <th className="w-[10%] px-3 py-2 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {konstruksiRows.map((row) => (
                    <tr key={row.id} className="border-t border-rpb-border align-top">
                      <td className="px-3 py-2">
                        <input
                          className="rpb-input w-full"
                          value={row.code}
                          onChange={(event) =>
                            setKonstruksiRows((list) =>
                              list.map((item) =>
                                item.id === row.id ? { ...item, code: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="rpb-input w-full"
                          value={row.name}
                          onChange={(event) =>
                            setKonstruksiRows((list) =>
                              list.map((item) =>
                                item.id === row.id ? { ...item, name: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="rpb-input w-full"
                          value={row.unit}
                          onChange={(event) =>
                            setKonstruksiRows((list) =>
                              list.map((item) =>
                                item.id === row.id ? { ...item, unit: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="grid grid-cols-[minmax(0,1fr)_84px] gap-2">
                          <AutoSizeFormulaTextarea
                            className="rpb-input w-full whitespace-pre-wrap break-words font-mono text-xs"
                            value={row.formulaExpr}
                            onChange={(event) =>
                              setKonstruksiRows((list) =>
                                list.map((item) => (item.id === row.id ? { ...item, formulaExpr: event.target.value } : item)),
                              )
                            }
                          />
                          <div className="rpb-input flex items-center justify-center bg-[#eceef8] font-mono text-xs">
                            {formatQtyPreview(konstruksiQtyPreview[row.id] ?? 0)}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="rpb-input w-full"
                          type="text"
                          inputMode="numeric"
                          value={formatIdrInput(row.unitPriceIdr)}
                          onChange={(event) =>
                            setKonstruksiRows((list) =>
                              list.map((item) =>
                                item.id === row.id ? { ...item, unitPriceIdr: parseIdrInput(event.target.value) } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            className="rpb-btn-primary inline-flex h-9 w-9 items-center justify-center p-0"
                            onClick={() => void saveKonstruksiRow(row)}
                            disabled={busy === `konstruksi:${row.id}`}
                            aria-label={`Simpan item Konstruksi ${row.name || row.code || ""}`}
                          >
                            {busy === `konstruksi:${row.id}` ? "..." : <Save size={14} />}
                          </button>
                          <button
                            type="button"
                            className="rpb-btn-ghost inline-flex h-9 w-9 items-center justify-center border-red-200 p-0 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                            onClick={() => void deleteKonstruksiRow(row)}
                            disabled={busy === `konstruksi:delete:${row.id}`}
                            aria-label={`Hapus item Konstruksi ${row.name || row.code || ""}`}
                          >
                            {busy === `konstruksi:delete:${row.id}` ? "..." : <Trash2 size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <VariableSettingsCard
            section="konstruksi"
            rows={konstruksiVariables}
            previewValues={defaultVariablePreviewValues}
            busy={busy}
            onAdd={() => addVariable("konstruksi")}
            onChange={(id, patch) =>
              setVariableRows((list) => list.map((row) => (row.id === id ? { ...row, ...patch } : row)))
            }
            onSave={saveVariable}
            onDelete={deleteVariable}
          />
          <FormulaHelpBox />
        </section>
      ) : null}

      {isKonstruksiModalOpen ? (
        <div className="rpb-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-[#15172b]/45 p-4 backdrop-blur-[2px]">
          <div className="rpb-modal-panel w-full max-w-4xl rounded-xl border border-rpb-border bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="rpb-h-title text-base font-semibold">Tambah Item Konstruksi</h3>
              <button
                type="button"
                className="rpb-btn-ghost px-3 py-2 text-xs font-semibold"
                onClick={() => setIsKonstruksiModalOpen(false)}
              >
                Tutup
              </button>
            </div>
            <form
              className="grid gap-3 md:grid-cols-5"
              onSubmit={(event) => {
                event.preventDefault();
                void addKonstruksiPermanent();
              }}
            >
              <label>
                <span className="mb-1 block text-xs font-semibold text-rpb-ink-soft">Code</span>
                <input
                  className="rpb-input"
                  value={newKonstruksi.code}
                  onChange={(event) =>
                    setNewKonstruksi((value) => ({ ...value, code: event.target.value }))
                  }
                />
              </label>
              <label className="md:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-rpb-ink-soft">Name</span>
                <input
                  className="rpb-input"
                  value={newKonstruksi.name}
                  onChange={(event) =>
                    setNewKonstruksi((value) => ({ ...value, name: event.target.value }))
                  }
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold text-rpb-ink-soft">Unit</span>
                <input
                  className="rpb-input"
                  value={newKonstruksi.unit}
                  onChange={(event) =>
                    setNewKonstruksi((value) => ({ ...value, unit: event.target.value }))
                  }
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold text-rpb-ink-soft">Harga Satuan</span>
                <input
                  className="rpb-input"
                  type="text"
                  inputMode="numeric"
                  value={formatIdrInput(newKonstruksi.unitPriceIdr)}
                  onChange={(event) =>
                    setNewKonstruksi((value) => ({
                      ...value,
                      unitPriceIdr: parseIdrInput(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="md:col-span-4">
                <span className="mb-1 block text-xs font-semibold text-rpb-ink-soft">Formula Qty</span>
                <input
                  className="rpb-input font-mono"
                  value={newKonstruksi.formulaExpr}
                  onChange={(event) =>
                    setNewKonstruksi((value) => ({ ...value, formulaExpr: event.target.value }))
                  }
                />
              </label>
              <div className="flex justify-end md:col-span-5">
                <button
                  type="submit"
                  className="rpb-btn-primary inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold"
                  disabled={busy === "konstruksi:new"}
                >
                  <Plus size={14} />
                  {busy === "konstruksi:new" ? "..." : "Tambah"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {activeSection === "other" ? (
        <section className="rpb-section p-3.5 md:p-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="rpb-h-title text-base font-semibold">Other (Permanen)</h2>
            <button
              type="button"
              className="rpb-btn-primary inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold"
              onClick={() => {
                setNewOther(newOtherDefault);
                setIsOtherModalOpen(true);
              }}
            >
              <Plus size={14} />
              Tambah Item
            </button>
          </div>

          <datalist id={OTHER_CATEGORY_DATALIST_ID}>
            {otherCategoryOptions.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>

          <div className="space-y-2 md:hidden">
            {otherRows.map((row) => (
              <article key={row.id} className="rounded-xl border border-rpb-border bg-white p-3.5 shadow-[0_4px_12px_rgba(30,36,88,0.04)]">
                <div className="grid gap-2 md:grid-cols-2">
                  <input
                    className="rpb-input"
                    list={OTHER_CATEGORY_DATALIST_ID}
                    placeholder="Category"
                    value={row.category}
                    onChange={(event) =>
                      setOtherRows((list) =>
                        list.map((item) =>
                          item.id === row.id ? { ...item, category: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <input
                    className="rpb-input"
                    value={row.name}
                    onChange={(event) =>
                      setOtherRows((list) =>
                        list.map((item) => (item.id === row.id ? { ...item, name: event.target.value } : item)),
                      )
                    }
                  />
                  <input
                    className="rpb-input"
                    value={row.model}
                    onChange={(event) =>
                      setOtherRows((list) =>
                        list.map((item) => (item.id === row.id ? { ...item, model: event.target.value } : item)),
                      )
                    }
                  />
                  <input
                    className="rpb-input"
                    value={row.unit}
                    onChange={(event) =>
                      setOtherRows((list) =>
                        list.map((item) => (item.id === row.id ? { ...item, unit: event.target.value } : item)),
                      )
                    }
                  />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className="rpb-input"
                    type="text"
                    inputMode="numeric"
                    value={formatIdrInput(row.priceIdr)}
                    onChange={(event) =>
                      setOtherRows((list) =>
                        list.map((item) =>
                          item.id === row.id ? { ...item, priceIdr: parseIdrInput(event.target.value) } : item,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="rpb-btn-primary inline-flex h-11 w-11 items-center justify-center p-0"
                    onClick={() => void saveOtherRow(row)}
                    disabled={busy === `other:${row.id}`}
                    aria-label={`Simpan item ${row.name}`}
                  >
                    {busy === `other:${row.id}` ? "..." : <Save size={14} />}
                  </button>
                  <button
                    type="button"
                    className="rpb-btn-ghost inline-flex h-11 w-11 items-center justify-center border-red-200 p-0 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                    onClick={() => void deleteOtherRow(row)}
                    disabled={busy === `other:delete:${row.id}`}
                    aria-label={`Hapus item ${row.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="hidden md:block">
            <div className="overflow-hidden rounded-xl border border-rpb-border">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-[#eceef8]">
                  <tr className="text-left text-xs font-semibold text-rpb-ink-soft">
                    <th className="w-[14%] px-3 py-2">Category</th>
                    <th className="w-[22%] px-3 py-2">Name</th>
                    <th className="w-[20%] px-3 py-2">Model</th>
                    <th className="w-[10%] px-3 py-2">Unit</th>
                    <th className="w-[18%] px-3 py-2">Harga</th>
                    <th className="w-[16%] px-3 py-2">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {otherRows.map((row) => (
                    <tr key={row.id} className="border-t border-rpb-border align-top">
                      <td className="px-3 py-2">
                        <input
                          className="rpb-input w-full"
                          list={OTHER_CATEGORY_DATALIST_ID}
                          placeholder="Category"
                          value={row.category}
                          onChange={(event) =>
                            setOtherRows((list) =>
                              list.map((item) =>
                                item.id === row.id ? { ...item, category: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="rpb-input w-full"
                          value={row.name}
                          onChange={(event) =>
                            setOtherRows((list) =>
                              list.map((item) => (item.id === row.id ? { ...item, name: event.target.value } : item)),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="rpb-input w-full"
                          value={row.model}
                          onChange={(event) =>
                            setOtherRows((list) =>
                              list.map((item) => (item.id === row.id ? { ...item, model: event.target.value } : item)),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="rpb-input w-full"
                          value={row.unit}
                          onChange={(event) =>
                            setOtherRows((list) =>
                              list.map((item) => (item.id === row.id ? { ...item, unit: event.target.value } : item)),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="rpb-input w-full"
                          type="text"
                          inputMode="numeric"
                          value={formatIdrInput(row.priceIdr)}
                          onChange={(event) =>
                            setOtherRows((list) =>
                              list.map((item) =>
                                item.id === row.id ? { ...item, priceIdr: parseIdrInput(event.target.value) } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rpb-btn-primary inline-flex h-11 w-11 items-center justify-center p-0"
                            onClick={() => void saveOtherRow(row)}
                            disabled={busy === `other:${row.id}`}
                            aria-label={`Simpan item ${row.name}`}
                          >
                            {busy === `other:${row.id}` ? "..." : <Save size={14} />}
                          </button>
                          <button
                            type="button"
                            className="rpb-btn-ghost inline-flex h-11 w-11 items-center justify-center border-red-200 p-0 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                            onClick={() => void deleteOtherRow(row)}
                            disabled={busy === `other:delete:${row.id}`}
                            aria-label={`Hapus item ${row.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {isOtherModalOpen ? (
            <div className="rpb-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-[#15172b]/45 p-4 backdrop-blur-[2px]">
              <div className="rpb-modal-panel w-full max-w-4xl rounded-xl border border-rpb-border bg-white p-4 shadow-xl">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="rpb-h-title text-base font-semibold">Tambah Item Other</h3>
                  <button
                    type="button"
                    className="rpb-btn-ghost px-3 py-2 text-xs font-semibold"
                    onClick={() => setIsOtherModalOpen(false)}
                  >
                    Tutup
                  </button>
                </div>
                <form
                  className="grid gap-3 md:grid-cols-7"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void addOtherPermanent();
                  }}
                >
                  <label className="md:col-span-2">
                    <span className="mb-1 block text-xs font-semibold text-rpb-ink-soft">Name</span>
                    <input
                      className="rpb-input"
                      placeholder="Name"
                      value={newOther.name}
                      onChange={(event) => setNewOther((value) => ({ ...value, name: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-semibold text-rpb-ink-soft">Category</span>
                    <input
                      className="rpb-input"
                      list={OTHER_CATEGORY_DATALIST_ID}
                      placeholder="Category"
                      value={newOther.category}
                      onChange={(event) => setNewOther((value) => ({ ...value, category: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-semibold text-rpb-ink-soft">Model</span>
                    <input
                      className="rpb-input"
                      placeholder="Model"
                      value={newOther.model}
                      onChange={(event) => setNewOther((value) => ({ ...value, model: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-semibold text-rpb-ink-soft">Unit</span>
                    <input
                      className="rpb-input"
                      placeholder="Unit"
                      value={newOther.unit}
                      onChange={(event) => setNewOther((value) => ({ ...value, unit: event.target.value }))}
                    />
                  </label>
                  <div className="md:col-span-2">
                    <span className="mb-1 block text-xs font-semibold text-rpb-ink-soft">Harga (Rp)</span>
                    <div className="flex gap-2">
                      <input
                        className="rpb-input flex-1 min-w-0"
                        type="text"
                        inputMode="numeric"
                        placeholder="Harga"
                        value={formatIdrInput(newOther.priceIdr)}
                        onChange={(event) =>
                          setNewOther((value) => ({ ...value, priceIdr: parseIdrInput(event.target.value) }))
                        }
                      />
                      <button
                        type="submit"
                        className="rpb-btn-primary inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold"
                        disabled={busy === "other:new"}
                      >
                        <Plus size={14} />
                        {busy === "other:new" ? "..." : "Tambah"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
