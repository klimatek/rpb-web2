import {
  calculateFixedBreakdowns,
} from "@/lib/rpb-calculator";
import type {
  AdjustmentValues,
  AhuDraft,
  CustomOtherItem,
  Dimensions,
  KonstruksiMasterItem,
  OtherItem,
  PanelThickness,
  ProfileMasterItem,
  SummaryLineItem,
} from "@/types/rpb";

const pctToValue = (subtotal: number, pct: number): number => subtotal * (pct / 100);

export const buildSummaryLineItems = (params: {
  dimensions: Dimensions;
  panelThickness: PanelThickness;
  profileItems: ProfileMasterItem[];
  konstruksiItems: KonstruksiMasterItem[];
  otherItems: OtherItem[];
  selectedOther: Record<string, number>;
  customOtherItems: CustomOtherItem[];
}): {
  lineItems: SummaryLineItem[];
  profileIdr: number;
  konstruksiIdr: number;
} => {
  const {
    dimensions,
    panelThickness,
    profileItems,
    konstruksiItems,
    otherItems,
    selectedOther,
    customOtherItems,
  } = params;

  const { profileTotalIdr: profileIdr, konstruksiTotalIdr: konstruksiIdr } =
    calculateFixedBreakdowns(dimensions, panelThickness, profileItems, konstruksiItems);

  const baseItems: SummaryLineItem[] = [
    {
      id: "profile",
      jenis: "PROFILE",
      keterangan: "Profile Aluminium - layer 1",
      satuan: "Lot",
      jenisSpec: String(panelThickness),
      qty: 1,
      hargaIdr: profileIdr,
    },
    {
      id: "konstruksi",
      jenis: "KONSTRUKSI",
      keterangan: "Konstruksi",
      satuan: "Lot",
      jenisSpec: "1",
      qty: 1,
      hargaIdr: konstruksiIdr,
    },
  ];

  const selectedStockItems = otherItems.filter((item) => (selectedOther[item.id] ?? 0) > 0);
  const stockLines: SummaryLineItem[] = selectedStockItems.map((item) => ({
    id: `stock-${item.id}`,
    jenis: item.category,
    keterangan: item.model === "-" ? item.name : item.model,
    satuan: item.unit,
    jenisSpec: item.name,
    qty: selectedOther[item.id] ?? 0,
    hargaIdr: item.priceIdr,
  }));

  const customLines: SummaryLineItem[] = customOtherItems.map((item) => ({
    id: `custom-${item.id}`,
    jenis: item.jenis,
    keterangan: item.keterangan,
    satuan: item.satuan,
    jenisSpec: item.jenisSpec,
    qty: item.qty,
    hargaIdr: item.hargaIdr,
  }));

  return {
    lineItems: [...baseItems, ...stockLines, ...customLines],
    profileIdr,
    konstruksiIdr,
  };
};

export const buildAhuLineItems = (params: {
  ahu: AhuDraft;
  profileItems: ProfileMasterItem[];
  konstruksiItems: KonstruksiMasterItem[];
  otherItems: OtherItem[];
}) =>
  buildSummaryLineItems({
    dimensions: params.ahu.dimensions,
    panelThickness: params.ahu.panelThickness,
    profileItems: params.profileItems,
    konstruksiItems: params.konstruksiItems,
    otherItems: params.otherItems,
    selectedOther: params.ahu.selectedOther,
    customOtherItems: params.ahu.customOtherItems,
  });

export const computeAhuGrandTotal = (params: {
  subtotalIdr: number;
  adjustments: AdjustmentValues;
}): number => {
  const breakdown = computeAhuAdjustmentBreakdown(params);
  return breakdown.grandTotalIdr;
};

export const computeAhuAdjustmentBreakdown = (params: {
  subtotalIdr: number;
  adjustments: AdjustmentValues;
}): {
  stockReturnIdr: number;
  marketingCostIdr: number;
  servicesIdr: number;
  profitIdr: number;
  grandTotalIdr: number;
} => {
  const stockReturnIdr = pctToValue(params.subtotalIdr, params.adjustments.stockReturn);
  const marketingCostIdr = pctToValue(params.subtotalIdr, params.adjustments.marketingCost);
  const servicesIdr = pctToValue(params.subtotalIdr, params.adjustments.services);
  const baseAfterAdjustIdr =
    params.subtotalIdr + stockReturnIdr + marketingCostIdr + servicesIdr;
  const profitIdr = pctToValue(baseAfterAdjustIdr, params.adjustments.profit);
  const grandTotalIdr = baseAfterAdjustIdr + profitIdr;

  return {
    stockReturnIdr,
    marketingCostIdr,
    servicesIdr,
    profitIdr,
    grandTotalIdr,
  };
};

export const buildAhuSummaries = (params: {
  ahus: AhuDraft[];
  profileItems: ProfileMasterItem[];
  konstruksiItems: KonstruksiMasterItem[];
  otherItems: OtherItem[];
}) => {
  const ahuSummaries = params.ahus.map((ahu) => {
    const { lineItems, profileIdr, konstruksiIdr } = buildAhuLineItems({
      ahu,
      profileItems: params.profileItems,
      konstruksiItems: params.konstruksiItems,
      otherItems: params.otherItems,
    });
    const subtotalIdr = lineItems.reduce((sum, item) => sum + item.hargaIdr * item.qty, 0);
    const adjustmentBreakdown = computeAhuAdjustmentBreakdown({
      subtotalIdr,
      adjustments: ahu.adjustments,
    });

    return {
      ahu,
      lineItems,
      profileIdr,
      konstruksiIdr,
      subtotalIdr,
      ...adjustmentBreakdown,
    };
  });

  const subtotalIdr = ahuSummaries.reduce((sum, item) => sum + item.subtotalIdr, 0);
  const stockReturnIdr = ahuSummaries.reduce((sum, item) => sum + item.stockReturnIdr, 0);
  const marketingCostIdr = ahuSummaries.reduce((sum, item) => sum + item.marketingCostIdr, 0);
  const servicesIdr = ahuSummaries.reduce((sum, item) => sum + item.servicesIdr, 0);
  const profitIdr = ahuSummaries.reduce((sum, item) => sum + item.profitIdr, 0);
  const grandTotalIdr = ahuSummaries.reduce((sum, item) => sum + item.grandTotalIdr, 0);

  return {
    ahuSummaries,
    totals: {
      subtotalIdr,
      stockReturnIdr,
      marketingCostIdr,
      servicesIdr,
      profitIdr,
      grandTotalIdr,
    },
  };
};
