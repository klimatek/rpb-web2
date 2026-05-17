import type {
  AdjustmentKey,
  AdjustmentValues,
  AhuDraft,
  CustomOtherItem,
  DimensionKey,
  PanelThickness,
  RpbDraftSnapshot,
} from "@/types/rpb";
import { create } from "zustand";

const DEFAULT_DIMENSIONS = {
  length: 3550,
  width: 1100,
  height: 950,
} as const;

const DEFAULT_PANEL_THICKNESS: PanelThickness = 30;
const DEFAULT_QUOTATION_QTY = 1;

const DEFAULT_ADJUSTMENTS: AdjustmentValues = {
  stockReturn: 3,
  marketingCost: 3,
  services: 3,
  profit: 25,
};

const LEGACY_RPB_STORE_KEY = "rpb-store-v1";

const safeNumber = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
};

const safePercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
};

const safeInteger = (value: number, fallback = 0): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
};

const createAhuId = (): string => `ahu-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const sanitizeAhuName = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : fallback;
};

const cloneCustomOtherItems = (items: CustomOtherItem[]): CustomOtherItem[] =>
  items.map((item) => ({ ...item }));

const cloneSelectedOther = (selectedOther: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(selectedOther).map(([key, value]) => [key, safeNumber(value)]));

const createDefaultAhu = (index = 0): AhuDraft => {
  const name = `AHU ${index + 1}`;

  return {
    id: createAhuId(),
    name,
    dimensions: { ...DEFAULT_DIMENSIONS },
    panelThickness: DEFAULT_PANEL_THICKNESS,
    selectedOther: {},
    customOtherItems: [],
    quotationDescription: name,
    quotationQty: DEFAULT_QUOTATION_QTY,
  };
};

const sanitizeAhu = (ahu: AhuDraft, index: number): AhuDraft => {
  const fallbackName = `AHU ${index + 1}`;
  const name = sanitizeAhuName(ahu.name, fallbackName);

  return {
    id: ahu.id || createAhuId(),
    name,
    dimensions: {
      length: safeNumber(ahu.dimensions?.length ?? DEFAULT_DIMENSIONS.length),
      width: safeNumber(ahu.dimensions?.width ?? DEFAULT_DIMENSIONS.width),
      height: safeNumber(ahu.dimensions?.height ?? DEFAULT_DIMENSIONS.height),
    },
    panelThickness: ahu.panelThickness === 45 ? 45 : 30,
    selectedOther: cloneSelectedOther(ahu.selectedOther ?? {}),
    customOtherItems: cloneCustomOtherItems(ahu.customOtherItems ?? [])
      .map((item) => ({
        ...item,
        qty: safeNumber(item.qty),
        hargaIdr: safeNumber(item.hargaIdr),
      }))
      .filter((item) => item.qty > 0),
    quotationDescription: sanitizeAhuName(ahu.quotationDescription ?? name, name).slice(0, 400),
    quotationQty: Math.max(1, safeInteger(ahu.quotationQty, DEFAULT_QUOTATION_QTY)),
  };
};

const buildLegacyAhuFromSnapshot = (snapshot: Partial<RpbDraftSnapshot>): AhuDraft => ({
  id: createAhuId(),
  name: "AHU 1",
  dimensions: {
    length: safeNumber(
      (snapshot as unknown as { dimensions?: { length?: number } }).dimensions?.length ??
        DEFAULT_DIMENSIONS.length,
    ),
    width: safeNumber(
      (snapshot as unknown as { dimensions?: { width?: number } }).dimensions?.width ??
        DEFAULT_DIMENSIONS.width,
    ),
    height: safeNumber(
      (snapshot as unknown as { dimensions?: { height?: number } }).dimensions?.height ??
        DEFAULT_DIMENSIONS.height,
    ),
  },
  panelThickness:
    (snapshot as unknown as { panelThickness?: PanelThickness }).panelThickness === 45 ? 45 : 30,
  selectedOther: cloneSelectedOther(
    (snapshot as unknown as { selectedOther?: Record<string, number> }).selectedOther ?? {},
  ),
  customOtherItems: cloneCustomOtherItems(
    (snapshot as unknown as { customOtherItems?: CustomOtherItem[] }).customOtherItems ?? [],
  )
    .map((item) => ({
      ...item,
      qty: safeNumber(item.qty),
      hargaIdr: safeNumber(
        item.hargaIdr ?? (((item as unknown as { hargaUsd?: number }).hargaUsd ?? 0) * 16_900),
      ),
    }))
    .filter((item) => item.qty > 0),
  quotationDescription: snapshot.projectName?.trim() || "AHU 1",
  quotationQty: DEFAULT_QUOTATION_QTY,
});

const normalizeSnapshotAhus = (snapshot: Partial<RpbDraftSnapshot>): AhuDraft[] => {
  if (Array.isArray(snapshot.ahus) && snapshot.ahus.length > 0) {
    return snapshot.ahus.map((ahu, index) => sanitizeAhu(ahu, index));
  }

  return [buildLegacyAhuFromSnapshot(snapshot)];
};

const getAhuById = (ahus: AhuDraft[], activeAhuId: string): AhuDraft =>
  ahus.find((ahu) => ahu.id === activeAhuId) ?? ahus[0];

const updateAhuById = (
  ahus: AhuDraft[],
  ahuId: string,
  updater: (ahu: AhuDraft) => AhuDraft,
): AhuDraft[] => ahus.map((ahu, index) => (ahu.id === ahuId ? sanitizeAhu(updater(ahu), index) : ahu));

if (typeof window !== "undefined") {
  window.localStorage.removeItem(LEGACY_RPB_STORE_KEY);
}

interface RpbStore {
  customerName: string;
  projectName: string;
  customerAddress: string;
  ahus: AhuDraft[];
  activeAhuId: string;
  adjustments: AdjustmentValues;
  quotationContent: string;
  setCustomerName: (value: string) => void;
  setProjectName: (value: string) => void;
  setCustomerAddress: (value: string) => void;
  setDimension: (key: DimensionKey, value: number) => void;
  setPanelThickness: (value: PanelThickness) => void;
  addOtherQty: (itemId: string, qty: number) => void;
  setOtherQty: (itemId: string, qty: number) => void;
  setAhuOtherQty: (ahuId: string, itemId: string, qty: number) => void;
  addCustomOtherItem: (item: Omit<CustomOtherItem, "id">) => void;
  setCustomOtherItemQty: (itemId: string, qty: number) => void;
  setAhuCustomOtherItemQty: (ahuId: string, itemId: string, qty: number) => void;
  removeCustomOtherItem: (itemId: string) => void;
  removeOther: (itemId: string) => void;
  setAdjustment: (key: AdjustmentKey, value: number) => void;
  setQuotationContent: (value: string) => void;
  resetOtherSelections: () => void;
  addAhu: () => void;
  removeAhu: (ahuId: string) => void;
  setActiveAhu: (ahuId: string) => void;
  renameAhu: (ahuId: string, name: string) => void;
  setAhuQuotationDescription: (ahuId: string, value: string) => void;
  setAhuQuotationQty: (ahuId: string, qty: number) => void;
  getActiveAhu: () => AhuDraft;
  getSnapshot: () => RpbDraftSnapshot;
  loadSnapshot: (snapshot: RpbDraftSnapshot) => void;
  resetDraft: () => void;
}

const initialAhu = createDefaultAhu(0);

export const useRpbStore = create<RpbStore>()((set, get) => ({
  customerName: "",
  projectName: "",
  customerAddress: "",
  ahus: [initialAhu],
  activeAhuId: initialAhu.id,
  adjustments: { ...DEFAULT_ADJUSTMENTS },
  quotationContent: "",
  setCustomerName: (value) => set({ customerName: value }),
  setProjectName: (value) => set({ projectName: value }),
  setCustomerAddress: (value) => set({ customerAddress: value }),
  setDimension: (key, value) =>
    set((state) => ({
      ahus: updateAhuById(state.ahus, state.activeAhuId, (ahu) => ({
        ...ahu,
        dimensions: {
          ...ahu.dimensions,
          [key]: safeNumber(value),
        },
      })),
    })),
  setPanelThickness: (value) =>
    set((state) => ({
      ahus: updateAhuById(state.ahus, state.activeAhuId, (ahu) => ({
        ...ahu,
        panelThickness: value,
      })),
    })),
  addOtherQty: (itemId, qty) => {
    const state = get();
    state.setAhuOtherQty(state.activeAhuId, itemId, (state.getActiveAhu().selectedOther[itemId] ?? 0) + qty);
  },
  setOtherQty: (itemId, qty) => {
    const state = get();
    state.setAhuOtherQty(state.activeAhuId, itemId, qty);
  },
  setAhuOtherQty: (ahuId, itemId, qty) =>
    set((state) => ({
      ahus: updateAhuById(state.ahus, ahuId, (ahu) => {
        const next = { ...ahu.selectedOther };
        const nextQty = safeNumber(qty);

        if (nextQty <= 0) {
          delete next[itemId];
        } else {
          next[itemId] = nextQty;
        }

        return {
          ...ahu,
          selectedOther: next,
        };
      }),
    })),
  addCustomOtherItem: (item) =>
    set((state) => ({
      ahus: updateAhuById(state.ahus, state.activeAhuId, (ahu) => ({
        ...ahu,
        customOtherItems: [
          ...ahu.customOtherItems,
          {
            ...item,
            qty: safeNumber(item.qty),
            hargaIdr: safeNumber(item.hargaIdr),
            id: `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          },
        ],
      })),
    })),
  setCustomOtherItemQty: (itemId, qty) => {
    const state = get();
    state.setAhuCustomOtherItemQty(state.activeAhuId, itemId, qty);
  },
  setAhuCustomOtherItemQty: (ahuId, itemId, qty) =>
    set((state) => ({
      ahus: updateAhuById(state.ahus, ahuId, (ahu) => ({
        ...ahu,
        customOtherItems: ahu.customOtherItems
          .map((item) => {
            if (item.id !== itemId) {
              return item;
            }

            return {
              ...item,
              qty: safeNumber(qty),
            };
          })
          .filter((item) => item.qty > 0),
      })),
    })),
  removeCustomOtherItem: (itemId) =>
    set((state) => ({
      ahus: updateAhuById(state.ahus, state.activeAhuId, (ahu) => ({
        ...ahu,
        customOtherItems: ahu.customOtherItems.filter((item) => item.id !== itemId),
      })),
    })),
  removeOther: (itemId) =>
    set((state) => ({
      ahus: updateAhuById(state.ahus, state.activeAhuId, (ahu) => {
        const next = { ...ahu.selectedOther };
        delete next[itemId];

        return {
          ...ahu,
          selectedOther: next,
        };
      }),
    })),
  setAdjustment: (key, value) =>
    set((state) => ({
      adjustments: {
        ...state.adjustments,
        [key]: safePercent(value),
      },
    })),
  setQuotationContent: (value) => set({ quotationContent: value }),
  resetOtherSelections: () =>
    set((state) => ({
      ahus: updateAhuById(state.ahus, state.activeAhuId, (ahu) => ({
        ...ahu,
        selectedOther: {},
        customOtherItems: [],
      })),
    })),
  addAhu: () =>
    set((state) => {
      const sourceAhu = getAhuById(state.ahus, state.activeAhuId);
      const nextIndex = state.ahus.length;
      const nextName = `AHU ${nextIndex + 1}`;
      const nextAhu: AhuDraft = {
        id: createAhuId(),
        name: nextName,
        dimensions: { ...sourceAhu.dimensions },
        panelThickness: sourceAhu.panelThickness,
        selectedOther: cloneSelectedOther(sourceAhu.selectedOther),
        customOtherItems: cloneCustomOtherItems(sourceAhu.customOtherItems).map((item) => ({
          ...item,
          id: `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        })),
        quotationDescription: nextName,
        quotationQty: DEFAULT_QUOTATION_QTY,
      };

      return {
        ahus: [...state.ahus, nextAhu],
        activeAhuId: nextAhu.id,
      };
    }),
  removeAhu: (ahuId) =>
    set((state) => {
      if (state.ahus.length <= 1) {
        return state;
      }

      const removeIndex = state.ahus.findIndex((ahu) => ahu.id === ahuId);
      if (removeIndex === -1) {
        return state;
      }

      const nextAhus = state.ahus.filter((ahu) => ahu.id !== ahuId);
      const nextActiveAhu =
        state.activeAhuId === ahuId
          ? nextAhus[Math.max(0, removeIndex - 1)] ?? nextAhus[0]
          : getAhuById(nextAhus, state.activeAhuId);

      return {
        ahus: nextAhus,
        activeAhuId: nextActiveAhu.id,
      };
    }),
  setActiveAhu: (ahuId) =>
    set((state) => ({
      activeAhuId: state.ahus.some((ahu) => ahu.id === ahuId) ? ahuId : state.activeAhuId,
    })),
  renameAhu: (ahuId, name) =>
    set((state) => ({
      ahus: updateAhuById(state.ahus, ahuId, (ahu) => ({
        ...ahu,
        name: sanitizeAhuName(name, ahu.name),
      })),
    })),
  setAhuQuotationDescription: (ahuId, value) =>
    set((state) => ({
      ahus: updateAhuById(state.ahus, ahuId, (ahu) => ({
        ...ahu,
        quotationDescription: value.slice(0, 400),
      })),
    })),
  setAhuQuotationQty: (ahuId, qty) =>
    set((state) => ({
      ahus: updateAhuById(state.ahus, ahuId, (ahu) => ({
        ...ahu,
        quotationQty: Math.max(1, safeInteger(qty, DEFAULT_QUOTATION_QTY)),
      })),
    })),
  getActiveAhu: () => {
    const state = get();
    return getAhuById(state.ahus, state.activeAhuId);
  },
  getSnapshot: () => {
    const state = get();

    return {
      customerName: state.customerName,
      projectName: state.projectName,
      customerAddress: state.customerAddress,
      ahus: state.ahus.map((ahu, index) => sanitizeAhu(ahu, index)),
      adjustments: { ...state.adjustments },
    };
  },
  loadSnapshot: (snapshot) => {
    const nextAhus = normalizeSnapshotAhus(snapshot);

    set({
      customerName: snapshot.customerName ?? "",
      projectName: snapshot.projectName ?? "",
      customerAddress: snapshot.customerAddress ?? "",
      ahus: nextAhus,
      activeAhuId: nextAhus[0]?.id ?? createDefaultAhu(0).id,
      adjustments: {
        stockReturn: safePercent(
          snapshot.adjustments?.stockReturn ?? DEFAULT_ADJUSTMENTS.stockReturn,
        ),
        marketingCost: safePercent(
          snapshot.adjustments?.marketingCost ?? DEFAULT_ADJUSTMENTS.marketingCost,
        ),
        services: safePercent(snapshot.adjustments?.services ?? DEFAULT_ADJUSTMENTS.services),
        profit: safePercent(snapshot.adjustments?.profit ?? DEFAULT_ADJUSTMENTS.profit),
      },
    });
  },
  resetDraft: () => {
    const nextAhu = createDefaultAhu(0);

    set({
      customerName: "",
      projectName: "",
      customerAddress: "",
      ahus: [nextAhu],
      activeAhuId: nextAhu.id,
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      quotationContent: "",
    });
  },
}));
