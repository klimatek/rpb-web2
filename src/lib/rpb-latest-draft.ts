import type { RpbDraftSnapshot } from "@/types/rpb";

const LATEST_DRAFT_KEY = "rpb-latest-draft-v1";

const DEFAULT_DIMENSIONS = {
  length: 3550,
  width: 1100,
  height: 950,
} as const;
const DEFAULT_QUOTATION_QTY = 1;

const DEFAULT_ADJUSTMENTS = {
  stockReturn: 3,
  marketingCost: 3,
  services: 3,
  profit: 25,
} as const;

export interface LatestDraftPayload {
  snapshot: RpbDraftSnapshot;
  updatedAt: string;
}

const isFinitePositive = (value: number): boolean => Number.isFinite(value) && value > 0;

export const isMeaningfulDraftSnapshot = (snapshot: RpbDraftSnapshot): boolean => {
  const hasText =
    snapshot.customerName.trim().length > 0 ||
    snapshot.projectName.trim().length > 0 ||
    snapshot.customerAddress.trim().length > 0;

  const hasAhuChanges = snapshot.ahus.some((ahu) => {
    const hasDimensionChanges =
      ahu.dimensions.length !== DEFAULT_DIMENSIONS.length ||
      ahu.dimensions.width !== DEFAULT_DIMENSIONS.width ||
      ahu.dimensions.height !== DEFAULT_DIMENSIONS.height;

    const hasPanelChange = ahu.panelThickness !== 30;
    const hasStockSelections = Object.values(ahu.selectedOther).some((qty) => isFinitePositive(qty));
    const hasCustomSelections = ahu.customOtherItems.some((item) => isFinitePositive(item.qty));
    const hasDescription = ahu.quotationDescription.trim().length > 0 && ahu.quotationDescription !== ahu.name;
    const hasQuotationQtyChange = ahu.quotationQty !== DEFAULT_QUOTATION_QTY;
    const hasNameChange = ahu.name.trim().length > 0 && ahu.name !== "AHU 1";

    return (
      hasDimensionChanges ||
      hasPanelChange ||
      hasStockSelections ||
      hasCustomSelections ||
      hasDescription ||
      hasQuotationQtyChange ||
      hasNameChange
    );
  });

  const hasMultipleAhus = snapshot.ahus.length > 1;

  const hasAdjustmentChanges =
    snapshot.adjustments.stockReturn !== DEFAULT_ADJUSTMENTS.stockReturn ||
    snapshot.adjustments.marketingCost !== DEFAULT_ADJUSTMENTS.marketingCost ||
    snapshot.adjustments.services !== DEFAULT_ADJUSTMENTS.services ||
    snapshot.adjustments.profit !== DEFAULT_ADJUSTMENTS.profit;

  return (
    hasText ||
    hasAhuChanges ||
    hasMultipleAhus ||
    hasAdjustmentChanges
  );
};

export const saveLatestDraft = (snapshot: RpbDraftSnapshot): LatestDraftPayload | null => {
  if (typeof window === "undefined" || !isMeaningfulDraftSnapshot(snapshot)) {
    return null;
  }

  const payload: LatestDraftPayload = {
    snapshot,
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(LATEST_DRAFT_KEY, JSON.stringify(payload));
  return payload;
};

export const loadLatestDraft = (): LatestDraftPayload | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(LATEST_DRAFT_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LatestDraftPayload>;
    if (!parsed || typeof parsed !== "object" || !parsed.snapshot) {
      return null;
    }

    return {
      snapshot: parsed.snapshot as RpbDraftSnapshot,
      updatedAt:
        typeof parsed.updatedAt === "string" && parsed.updatedAt.length > 0
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

export const clearLatestDraft = (): void => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(LATEST_DRAFT_KEY);
};

const ACTIVE_DRAFT_ID_KEY = "rpb-active-draft-id-v1";

export const getActiveDraftId = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(ACTIVE_DRAFT_ID_KEY);
  return value && value.length > 0 ? value : null;
};

export const setActiveDraftId = (id: string): void => {
  if (typeof window === "undefined" || !id) {
    return;
  }

  window.localStorage.setItem(ACTIVE_DRAFT_ID_KEY, id);
};

export const clearActiveDraftId = (): void => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACTIVE_DRAFT_ID_KEY);
};
