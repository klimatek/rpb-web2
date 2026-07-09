export type PanelThickness = 30 | 45;

export type StockCategory = string;
export type UserRole = "admin" | "user";

export type DimensionKey = "length" | "width" | "height";

export type AdjustmentKey =
  | "stockReturn"
  | "marketingCost"
  | "services"
  | "profit";

export interface Dimensions {
  length: number;
  width: number;
  height: number;
}

export interface AdjustmentValues {
  stockReturn: number;
  marketingCost: number;
  services: number;
  profit: number;
}

export interface OtherItem {
  id: string;
  name: string;
  category: StockCategory;
  model: string;
  unit: string;
  priceIdr: number;
}

export interface CustomOtherItem {
  id: string;
  jenis: string;
  keterangan: string;
  satuan: string;
  jenisSpec: string;
  hargaIdr: number;
  qty: number;
}

export interface AhuDraft {
  id: string;
  name: string;
  dimensions: Dimensions;
  panelThickness: PanelThickness;
  adjustments: AdjustmentValues;
  selectedOther: Record<string, number>;
  customOtherItems: CustomOtherItem[];
  quotationDescription: string;
  quotationQty: number;
}

export const MAX_AHU_PER_QUOTATION = 10;

export interface SummaryLineItem {
  id: string;
  jenis: string;
  keterangan: string;
  satuan: string;
  jenisSpec: string;
  qty: number;
  hargaIdr: number;
}

export interface ProfileMasterItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  sortOrder: number;
  formulaExpr: string;
  priceIdr30: number;
  priceIdr45: number;
  isActive: boolean;
}

export interface KonstruksiMasterItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  sortOrder: number;
  formulaExpr: string;
  unitPriceIdr: number;
  isActive: boolean;
}

export type FormulaVariableSection = "profile" | "konstruksi";

export interface FormulaVariableSetting {
  id: string;
  section: FormulaVariableSection;
  key: string;
  label: string;
  defaultValue: number;
  isDefault: boolean;
  sortOrder: number;
}

export interface RpbMasterData {
  profileItems: ProfileMasterItem[];
  konstruksiItems: KonstruksiMasterItem[];
  otherItems: OtherItem[];
  formulaVariables: FormulaVariableSetting[];
}

export interface QuotationContent {
  quotationNo: string;
  attn: string;
  discount: string;
  additionalDiscount: string;
  additionalInformation: string;
  preparedForOverride: string;
  customerAddressOverride: string;
  contactPersonOverride: string;
  phoneNumberOverride: string;
  salesNameOverride: string;
  salesEmailOverride: string;
}

export interface RpbDraftSnapshot {
  customerName: string;
  projectName: string;
  customerAddress: string;
  ahus: AhuDraft[];
  adjustments: AdjustmentValues;
  quotationContent?: QuotationContent;
  schemaVersion?: number;
}

export interface SavedSummaryRecord {
  id: string;
  userId: string;
  createdByEmail: string;
  title: string;
  customerName: string;
  projectName: string;
  snapshot: RpbDraftSnapshot;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}
