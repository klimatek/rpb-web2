import type {
  AhuDraft,
  CustomOtherItem,
  QuotationContent,
  RpbDraftSnapshot,
  SavedSummaryRecord,
} from "@/types/rpb";
import { MAX_AHU_PER_QUOTATION } from "@/types/rpb";

export const RPB_TEMPLATE_KIND = "rpb-template";
export const RPB_TEMPLATE_VERSION = 1;
export const MAX_TEMPLATE_FILE_BYTES = 256 * 1024;

const LEGACY_USD_TO_IDR = 16_900;
const DEFAULT_DIMENSIONS = {
  length: 3550,
  width: 1100,
  height: 950,
} as const;
const DEFAULT_PANEL_THICKNESS = 30;
const DEFAULT_QUOTATION_QTY = 1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeText = (value: unknown, fallback: string, maxLength: number): string => {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, maxLength);
};

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toNonNegativeNumber = (value: unknown, fallback = 0): number =>
  Math.max(0, toNumber(value, fallback));

const toPercent = (value: unknown): number => Math.min(100, toNonNegativeNumber(value));

const toQty = (value: unknown): number => Math.floor(toNonNegativeNumber(value));

const sanitizeCustomId = (value: unknown, index: number): string => {
  const raw = typeof value === "string" ? value.trim() : "";
  const noPrefix = raw.replace(/^custom-/, "");
  const compact = noPrefix.replace(/\s+/g, "-").slice(0, 64);
  return compact || `import-${index + 1}`;
};

const normalizeCustomOtherItems = (value: unknown): CustomOtherItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!isRecord(item)) {
        return null;
      }

      const qty = toQty(item.qty);
      if (qty <= 0) {
        return null;
      }

      return {
        id: sanitizeCustomId(item.id, index),
        jenis: normalizeText(item.jenis, "Lainnya", 120),
        keterangan: normalizeText(item.keterangan, "-", 240),
        satuan: normalizeText(item.satuan, "pc", 40),
        jenisSpec: normalizeText(item.jenisSpec, "-", 180),
        hargaIdr: toNonNegativeNumber(
          item.hargaIdr,
          toNonNegativeNumber(item.hargaUsd) * LEGACY_USD_TO_IDR,
        ),
        qty,
      } satisfies CustomOtherItem;
    })
    .filter((item): item is CustomOtherItem => item !== null);
};

const normalizeSelectedOther = (value: unknown): Record<string, number> => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, qty]) => [key.trim(), toQty(qty)] as const)
      .filter(([key, qty]) => key.length > 0 && qty > 0),
  );
};

const normalizeAhuName = (value: unknown, index: number): string => {
  const fallback = `AHU ${index + 1}`;
  return normalizeText(value, fallback, 120);
};

const normalizeQuotationDescription = (
  value: unknown,
  ahuName: string,
): string => normalizeText(value, ahuName, 400);

const normalizeQuotationQty = (value: unknown): number => {
  const qty = toQty(value);
  return qty > 0 ? qty : DEFAULT_QUOTATION_QTY;
};

const normalizeSingleAhuDraft = (value: unknown, index: number): AhuDraft | null => {
  if (!isRecord(value)) {
    return null;
  }

  const dimensions = isRecord(value.dimensions) ? value.dimensions : {};
  const name = normalizeAhuName(value.name, index);

  return {
    id: normalizeText(value.id, `ahu-${index + 1}`, 80),
    name,
    dimensions: {
      length: toNonNegativeNumber(dimensions.length, DEFAULT_DIMENSIONS.length),
      width: toNonNegativeNumber(dimensions.width, DEFAULT_DIMENSIONS.width),
      height: toNonNegativeNumber(dimensions.height, DEFAULT_DIMENSIONS.height),
    },
    panelThickness: value.panelThickness === 45 ? 45 : DEFAULT_PANEL_THICKNESS,
    selectedOther: normalizeSelectedOther(value.selectedOther),
    customOtherItems: normalizeCustomOtherItems(value.customOtherItems),
    quotationDescription: normalizeQuotationDescription(value.quotationDescription, name),
    quotationQty: normalizeQuotationQty(value.quotationQty),
  };
};

const normalizeAhus = (value: unknown, projectName: string): AhuDraft[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, MAX_AHU_PER_QUOTATION)
    .map((ahu, index) => normalizeSingleAhuDraft(ahu, index))
    .filter((ahu): ahu is AhuDraft => ahu !== null)
    .map((ahu, index) => ({
      ...ahu,
      id: ahu.id || `ahu-${index + 1}`,
      name: ahu.name || `AHU ${index + 1}`,
      quotationDescription:
        ahu.quotationDescription || projectName || ahu.name || `AHU ${index + 1}`,
    }));
};

const buildLegacySingleAhu = (value: Record<string, unknown>, projectName: string): AhuDraft => {
  const dimensions = isRecord(value.dimensions) ? value.dimensions : {};
  const name = "AHU 1";

  return {
    id: "ahu-1",
    name,
    dimensions: {
      length: toNonNegativeNumber(dimensions.length, DEFAULT_DIMENSIONS.length),
      width: toNonNegativeNumber(dimensions.width, DEFAULT_DIMENSIONS.width),
      height: toNonNegativeNumber(dimensions.height, DEFAULT_DIMENSIONS.height),
    },
    panelThickness: value.panelThickness === 45 ? 45 : DEFAULT_PANEL_THICKNESS,
    selectedOther: normalizeSelectedOther(value.selectedOther),
    customOtherItems: normalizeCustomOtherItems(value.customOtherItems),
    quotationDescription: projectName || name,
    quotationQty: DEFAULT_QUOTATION_QTY,
  };
};

const normalizeQuotationContent = (value: unknown): QuotationContent | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    attn: typeof value.attn === "string" ? value.attn : "",
    discount: typeof value.discount === "string" ? value.discount : "25%",
    additionalDiscount: typeof value.additionalDiscount === "string" ? value.additionalDiscount : "",
    additionalInformation:
      typeof value.additionalInformation === "string" ? value.additionalInformation : "",
    preparedForOverride:
      typeof value.preparedForOverride === "string" ? value.preparedForOverride : "",
    customerAddressOverride:
      typeof value.customerAddressOverride === "string" ? value.customerAddressOverride : "",
    contactPersonOverride:
      typeof value.contactPersonOverride === "string" ? value.contactPersonOverride : "",
    phoneNumberOverride:
      typeof value.phoneNumberOverride === "string" ? value.phoneNumberOverride : "",
    salesNameOverride:
      typeof value.salesNameOverride === "string" ? value.salesNameOverride : "",
    salesEmailOverride:
      typeof value.salesEmailOverride === "string" ? value.salesEmailOverride : "",
  };
};

export const normalizeRpbDraftSnapshot = (value: unknown): RpbDraftSnapshot => {
  if (!isRecord(value)) {
    throw new Error("Snapshot template tidak valid.");
  }

  const dimensions = isRecord(value.dimensions) ? value.dimensions : {};
  const adjustments = isRecord(value.adjustments) ? value.adjustments : {};
  const projectName = normalizeText(value.projectName, "", 180);
  const ahus = normalizeAhus(value.ahus, projectName);
  const normalizedAhus =
    ahus.length > 0
      ? ahus
      : [
          buildLegacySingleAhu(
            {
              dimensions,
              panelThickness: value.panelThickness,
              selectedOther: value.selectedOther,
              customOtherItems: value.customOtherItems,
            },
            projectName,
          ),
        ];

  const snapshot: RpbDraftSnapshot = {
    customerName: normalizeText(value.customerName, "", 180),
    projectName,
    customerAddress: normalizeText(value.customerAddress, "", 240),
    ahus: normalizedAhus,
    adjustments: {
      stockReturn: toPercent(adjustments.stockReturn),
      marketingCost: toPercent(adjustments.marketingCost),
      services: toPercent(adjustments.services),
      profit: toPercent(adjustments.profit),
    },
  };

  const quotationContent = normalizeQuotationContent(value.quotationContent);
  if (quotationContent) {
    snapshot.quotationContent = quotationContent;
  }

  if (typeof value.schemaVersion === "number" && Number.isFinite(value.schemaVersion)) {
    snapshot.schemaVersion = value.schemaVersion;
  }

  return snapshot;
};

export interface RpbTemplatePayload {
  kind: typeof RPB_TEMPLATE_KIND;
  version: typeof RPB_TEMPLATE_VERSION;
  name: string;
  exportedAt: string;
  source: {
    app: "rpb-web";
  };
  snapshot: RpbDraftSnapshot;
}

const normalizeTemplateName = (value: unknown, fallback: string): string =>
  normalizeText(value, fallback, 180);

export const buildTemplatePayloadFromHistory = (
  record: SavedSummaryRecord,
): RpbTemplatePayload => {
  const snapshot = normalizeRpbDraftSnapshot(record.snapshot);
  const fallbackName = record.title.trim() || snapshot.projectName || "RPB Template";

  return {
    kind: RPB_TEMPLATE_KIND,
    version: RPB_TEMPLATE_VERSION,
    name: normalizeTemplateName(record.title, fallbackName),
    exportedAt: new Date().toISOString(),
    source: {
      app: "rpb-web",
    },
    snapshot,
  };
};

const parseIsoString = (value: unknown): string => {
  if (typeof value !== "string") {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const normalizeTemplatePayload = (value: unknown): RpbTemplatePayload => {
  if (!isRecord(value)) {
    throw new Error("Isi file template tidak valid.");
  }

  if (value.kind !== RPB_TEMPLATE_KIND) {
    if (isRecord(value.snapshot) || isRecord(value.dimensions)) {
      const snapshotCandidate = isRecord(value.snapshot) ? value.snapshot : value;
      const snapshot = normalizeRpbDraftSnapshot(snapshotCandidate);
      return {
        kind: RPB_TEMPLATE_KIND,
        version: RPB_TEMPLATE_VERSION,
        name: normalizeTemplateName(value.name, snapshot.projectName || "Imported Template"),
        exportedAt: parseIsoString(value.exportedAt),
        source: {
          app: "rpb-web",
        },
        snapshot,
      };
    }

    throw new Error("Jenis template tidak dikenali.");
  }

  const version = toNumber(value.version, NaN);
  if (version !== RPB_TEMPLATE_VERSION) {
    throw new Error(`Versi template tidak didukung: ${String(value.version)}`);
  }

  const snapshot = normalizeRpbDraftSnapshot(value.snapshot);
  return {
    kind: RPB_TEMPLATE_KIND,
    version: RPB_TEMPLATE_VERSION,
    name: normalizeTemplateName(value.name, snapshot.projectName || "Imported Template"),
    exportedAt: parseIsoString(value.exportedAt),
    source: {
      app: "rpb-web",
    },
    snapshot,
  };
};

export const parseTemplateText = (rawText: string): RpbTemplatePayload => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    throw new Error("File bukan JSON yang valid.");
  }

  return normalizeTemplatePayload(parsed);
};

export const stringifyTemplate = (template: RpbTemplatePayload): string =>
  JSON.stringify(template, null, 2);

export const buildTemplateFileName = (name: string): string => {
  const slug = name
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${slug || "rpb-template"}.json`;
};
