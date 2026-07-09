import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isInvalidAuthSessionError } from "@/lib/supabase/auth-errors";
import type {
  FormulaVariableSection,
  FormulaVariableSetting,
  KonstruksiMasterItem,
  OtherItem,
  RpbDraftSnapshot,
  RpbMasterData,
  SavedSummaryRecord,
  UserRole,
  ProfileMasterItem,
} from "@/types/rpb";

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const LEGACY_USD_TO_IDR = 16_900;

const mapProfileItem = (row: Record<string, unknown>): ProfileMasterItem => ({
  id: String(row.id ?? ""),
  code: String(row.code ?? ""),
  name: String(row.name ?? ""),
  unit: String(row.unit ?? "pc"),
  sortOrder: Number(row.sort_order ?? 0),
  formulaExpr: String(row.formula_expr ?? "0"),
  priceIdr30: toNumber(
    row.price_idr_30,
    toNumber(row.price_usd_30) * LEGACY_USD_TO_IDR,
  ),
  priceIdr45: toNumber(
    row.price_idr_45,
    toNumber(row.price_usd_45) * LEGACY_USD_TO_IDR,
  ),
  isActive: Boolean(row.is_active ?? true),
});

const mapKonstruksiItem = (row: Record<string, unknown>): KonstruksiMasterItem => ({
  id: String(row.id ?? ""),
  code: String(row.code ?? ""),
  name: String(row.name ?? ""),
  unit: String(row.unit ?? "pc"),
  sortOrder: Number(row.sort_order ?? 0),
  formulaExpr: String(row.formula_expr ?? "0"),
  unitPriceIdr: toNumber(
    row.unit_price_idr,
    toNumber(row.unit_price_usd) * LEGACY_USD_TO_IDR,
  ),
  isActive: Boolean(row.is_active ?? true),
});

const mapOtherItem = (row: Record<string, unknown>): OtherItem => ({
  id: String(row.id ?? ""),
  name: String(row.name ?? ""),
  category: String(row.category ?? "Other"),
  model: String(row.model ?? "-"),
  unit: String(row.unit ?? "pc"),
  priceIdr: toNumber(row.price_idr, toNumber(row.price_usd) * LEGACY_USD_TO_IDR),
});

const mapFormulaVariable = (row: Record<string, unknown>): FormulaVariableSetting => ({
  id: String(row.id ?? ""),
  section: row.section === "konstruksi" ? "konstruksi" : "profile",
  key: String(row.key ?? ""),
  label: String(row.label ?? ""),
  defaultValue: toNumber(row.default_value),
  isDefault: Boolean(row.is_default ?? false),
  sortOrder: Number(row.sort_order ?? 0),
});

const isMissingFormulaVariablesTableError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };
  if (maybeError.code === "42P01") {
    return true;
  }

  return typeof maybeError.message === "string"
    ? maybeError.message.toLowerCase().includes("rpb_formula_variables")
    : false;
};

export const fetchRpbMasterData = async (supabase: SupabaseClient): Promise<RpbMasterData> => {
  const [{ data: profileRows, error: profileError }, { data: konstruksiRows, error: konstruksiError }, { data: otherRows, error: otherError }, { data: variableRows, error: variableError }] =
    await Promise.all([
      supabase
        .from("rpb_profile_items")
        .select("id, code, name, unit, sort_order, formula_expr, price_idr_30, price_idr_45, is_active"),
      supabase
        .from("rpb_konstruksi_items")
        .select("id, code, name, unit, sort_order, formula_expr, unit_price_idr, is_active"),
      supabase
        .from("rpb_other_items")
        .select("id, name, category, model, unit, price_idr, is_active")
        .order("category", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("rpb_formula_variables")
        .select("id, section, key, label, default_value, is_default, sort_order")
        .order("section", { ascending: true })
        .order("sort_order", { ascending: true }),
    ]);

  if (profileError) {
    throw profileError;
  }
  if (konstruksiError) {
    throw konstruksiError;
  }
  if (otherError) {
    throw otherError;
  }
  if (variableError && !isMissingFormulaVariablesTableError(variableError)) {
    throw variableError;
  }

  return {
    profileItems: ((profileRows ?? []) as Record<string, unknown>[]).map(mapProfileItem),
    konstruksiItems: ((konstruksiRows ?? []) as Record<string, unknown>[]).map(mapKonstruksiItem),
    otherItems: ((otherRows ?? []) as Record<string, unknown>[]).map(mapOtherItem),
    formulaVariables:
      variableError && isMissingFormulaVariablesTableError(variableError)
        ? []
        : ((variableRows ?? []) as Record<string, unknown>[]).map(mapFormulaVariable),
  };
};

export const fetchCurrentUserRole = async (
  supabase: SupabaseClient,
  userOverride?: User | null,
): Promise<UserRole | null> => {
  let user = userOverride ?? null;

  if (userOverride === undefined) {
    const {
      data: { user: authUser },
      error,
    } = await supabase.auth.getUser();

    if (isInvalidAuthSessionError(error)) {
      return null;
    }

    if (error) {
      throw error;
    }

    user = authUser ?? null;
  }

  if (!user) {
    return null;
  }

  const metadataRole = user.user_metadata?.role;
  if (metadataRole === "admin" || metadataRole === "user") {
    return metadataRole;
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.role === "admin" ? "admin" : "user";
};

export const saveSummaryHistory = async (
  supabase: SupabaseClient,
  payload: {
    title: string;
    customerName: string;
    projectName: string;
    snapshot: RpbDraftSnapshot;
  },
): Promise<SavedSummaryRecord> => {
  const { data, error } = await supabase
    .from("rpb_saved_summaries")
    .insert({
      title: payload.title,
      customer_name: payload.customerName,
      project_name: payload.projectName,
      snapshot_json: payload.snapshot,
    })
    .select("id, user_id, title, customer_name, project_name, snapshot_json, is_deleted, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: String(data.id),
    userId: String(data.user_id ?? ""),
    createdByEmail: "",
    title: String(data.title ?? "Untitled"),
    customerName: String(data.customer_name ?? ""),
    projectName: String(data.project_name ?? ""),
    snapshot: data.snapshot_json as RpbDraftSnapshot,
    isDeleted: Boolean(data.is_deleted ?? false),
    createdAt: String(data.created_at ?? ""),
    updatedAt: String(data.updated_at ?? ""),
  };
};

export const updateSummaryHistory = async (
  supabase: SupabaseClient,
  id: string,
  payload: {
    title: string;
    customerName: string;
    projectName: string;
    snapshot: RpbDraftSnapshot;
  },
): Promise<SavedSummaryRecord | null> => {
  const { data, error } = await supabase
    .from("rpb_saved_summaries")
    .update({
      title: payload.title,
      customer_name: payload.customerName,
      project_name: payload.projectName,
      snapshot_json: payload.snapshot,
    })
    .eq("id", id)
    .eq("is_deleted", false)
    .select("id, user_id, title, customer_name, project_name, snapshot_json, is_deleted, created_at, updated_at")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: String(data.id),
    userId: String(data.user_id ?? ""),
    createdByEmail: "",
    title: String(data.title ?? "Untitled"),
    customerName: String(data.customer_name ?? ""),
    projectName: String(data.project_name ?? ""),
    snapshot: data.snapshot_json as RpbDraftSnapshot,
    isDeleted: Boolean(data.is_deleted ?? false),
    createdAt: String(data.created_at ?? ""),
    updatedAt: String(data.updated_at ?? ""),
  };
};

export const fetchSummaryHistoryById = async (
  supabase: SupabaseClient,
  id: string,
): Promise<SavedSummaryRecord | null> => {
  const { data, error } = await supabase
    .from("rpb_saved_summaries")
    .select("id, user_id, title, customer_name, project_name, snapshot_json, is_deleted, created_at, updated_at")
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: String(data.id),
    userId: String(data.user_id ?? ""),
    createdByEmail: "",
    title: String(data.title ?? "Untitled"),
    customerName: String(data.customer_name ?? ""),
    projectName: String(data.project_name ?? ""),
    snapshot: data.snapshot_json as RpbDraftSnapshot,
    isDeleted: Boolean(data.is_deleted ?? false),
    createdAt: String(data.created_at ?? ""),
    updatedAt: String(data.updated_at ?? ""),
  };
};

export const fetchSummaryHistory = async (
  supabase: SupabaseClient,
  options?: {
    limit?: number;
  },
): Promise<SavedSummaryRecord[]> => {
  const limit = options?.limit;
  let query = supabase
    .from("rpb_saved_summaries")
    .select("id, user_id, title, customer_name, project_name, snapshot_json, is_deleted, created_at, updated_at")
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false });

  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    query = query.limit(Math.floor(limit));
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const userIds = Array.from(
    new Set(rows.map((row) => String(row.user_id ?? "")).filter((value) => value.length > 0)),
  );
  const emailByUserId = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("user_profiles")
      .select("id, email")
      .in("id", userIds);

    for (const profile of profileRows ?? []) {
      emailByUserId.set(String(profile.id ?? ""), String(profile.email ?? ""));
    }
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    userId: String(row.user_id ?? ""),
    createdByEmail: emailByUserId.get(String(row.user_id ?? "")) ?? "",
    title: String(row.title ?? "Untitled"),
    customerName: String(row.customer_name ?? ""),
    projectName: String(row.project_name ?? ""),
    snapshot: row.snapshot_json as RpbDraftSnapshot,
    isDeleted: Boolean(row.is_deleted ?? false),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  }));
};

export const deleteSummaryHistory = async (
  supabase: SupabaseClient,
  id: string,
): Promise<void> => {
  const { error } = await supabase
    .from("rpb_saved_summaries")
    .update({ is_deleted: true })
    .eq("id", id)
    .eq("is_deleted", false);
  if (error) {
    throw error;
  }
};

export const upsertProfileMasterItem = async (
  supabase: SupabaseClient,
  item: ProfileMasterItem,
): Promise<void> => {
  const { error } = await supabase.from("rpb_profile_items").upsert({
    id: item.id,
    code: item.code,
    name: item.name,
    unit: item.unit,
    sort_order: item.sortOrder,
    formula_expr: item.formulaExpr,
    price_idr_30: item.priceIdr30,
    price_idr_45: item.priceIdr45,
    is_active: item.isActive,
  });

  if (error) {
    throw error;
  }
};

export const upsertProfileMasterItems = async (
  supabase: SupabaseClient,
  items: ProfileMasterItem[],
): Promise<void> => {
  if (items.length === 0) {
    return;
  }

  const payload = items.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    unit: item.unit,
    sort_order: item.sortOrder,
    formula_expr: item.formulaExpr,
    price_idr_30: item.priceIdr30,
    price_idr_45: item.priceIdr45,
    is_active: item.isActive,
  }));

  const { error } = await supabase.from("rpb_profile_items").upsert(payload);
  if (error) {
    throw error;
  }
};

export const upsertKonstruksiMasterItem = async (
  supabase: SupabaseClient,
  item: KonstruksiMasterItem,
): Promise<void> => {
  const { error } = await supabase.from("rpb_konstruksi_items").upsert({
    id: item.id,
    code: item.code,
    name: item.name,
    unit: item.unit,
    sort_order: item.sortOrder,
    formula_expr: item.formulaExpr,
    unit_price_idr: item.unitPriceIdr,
    is_active: item.isActive,
  });

  if (error) {
    throw error;
  }
};

export const upsertKonstruksiMasterItems = async (
  supabase: SupabaseClient,
  items: KonstruksiMasterItem[],
): Promise<void> => {
  if (items.length === 0) {
    return;
  }

  const payload = items.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    unit: item.unit,
    sort_order: item.sortOrder,
    formula_expr: item.formulaExpr,
    unit_price_idr: item.unitPriceIdr,
    is_active: item.isActive,
  }));

  const { error } = await supabase.from("rpb_konstruksi_items").upsert(payload);
  if (error) {
    throw error;
  }
};

export const deleteProfileMasterItem = async (
  supabase: SupabaseClient,
  id: string,
): Promise<void> => {
  const { error } = await supabase.from("rpb_profile_items").delete().eq("id", id);
  if (error) {
    throw error;
  }
};

export const deleteKonstruksiMasterItem = async (
  supabase: SupabaseClient,
  id: string,
): Promise<void> => {
  const { error } = await supabase.from("rpb_konstruksi_items").delete().eq("id", id);
  if (error) {
    throw error;
  }
};

export const upsertOtherMasterItem = async (
  supabase: SupabaseClient,
  item: {
    id?: string;
    name: string;
    category: OtherItem["category"];
    model: string;
    unit: string;
    priceIdr: number;
    isActive?: boolean;
  },
): Promise<void> => {
  const payload = {
    name: item.name,
    category: item.category,
    model: item.model,
    unit: item.unit,
    price_idr: item.priceIdr,
    is_active: item.isActive ?? true,
  };

  const query = item.id
    ? supabase.from("rpb_other_items").update(payload).eq("id", item.id)
    : supabase.from("rpb_other_items").insert(payload);

  const { error } = await query;
  if (error) {
    throw error;
  }
};

export const deleteOtherMasterItem = async (
  supabase: SupabaseClient,
  id: string,
): Promise<void> => {
  const { error } = await supabase.from("rpb_other_items").delete().eq("id", id);
  if (error) {
    throw error;
  }
};

export const upsertFormulaVariableSetting = async (
  supabase: SupabaseClient,
  item: {
    id?: string;
    section: FormulaVariableSection;
    key: string;
    label: string;
    defaultValue: number;
    isDefault?: boolean;
    sortOrder: number;
  },
): Promise<void> => {
  const payload = {
    section: item.section,
    key: item.key,
    label: item.label,
    default_value: item.defaultValue,
    is_default: item.isDefault ?? false,
    sort_order: item.sortOrder,
  };

  const query = item.id
    ? supabase.from("rpb_formula_variables").update(payload).eq("id", item.id)
    : supabase.from("rpb_formula_variables").insert(payload);

  const { error } = await query;
  if (error) {
    throw error;
  }
};

export const deleteFormulaVariableSetting = async (
  supabase: SupabaseClient,
  id: string,
): Promise<void> => {
  const { error } = await supabase.from("rpb_formula_variables").delete().eq("id", id);
  if (error) {
    throw error;
  }
};
