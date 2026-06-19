import {
  useQuery,
  useMutation,
  type UseQueryOptions,
  type UseMutationOptions,
} from "@tanstack/react-query";

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  const json = JSON.parse(text);
  if (!res.ok) throw Object.assign(new Error(json?.error ?? "Request failed"), { status: res.status, data: json });
  return json;
}

type QueryOpts<T> = { query?: Omit<UseQueryOptions<T>, "queryKey" | "queryFn"> };
type MutOpts<T = unknown, V = unknown> = { mutation?: UseMutationOptions<T, Error, V> };

// ── Query key helpers ──────────────────────────────────────────────────────

export const getGetCurrentUserQueryKey = () => ["getCurrentUser"] as const;
export const getListDemoUsersQueryKey = () => ["listDemoUsers"] as const;
export const getGetDashboardOverviewQueryKey = () => ["getDashboardOverview"] as const;
export const getGetQuarterlyBoardQueryKey = () => ["getQuarterlyBoard"] as const;
export const getListInventoryQueryKey = (params?: object) => ["listInventory", params] as const;
export const getGetInventoryItemQueryKey = (id: number) => ["getInventoryItem", id] as const;
export const getGetPackagingSpecQueryKey = (id: number) => ["getPackagingSpec", id] as const;
export const getListItemNotesQueryKey = (id: number) => ["listItemNotes", id] as const;
export const getListExceptionsQueryKey = () => ["listExceptions"] as const;
export const getListIntegrationsQueryKey = () => ["listIntegrations"] as const;
export const getListSyncJobsQueryKey = () => ["listSyncJobs"] as const;
export const getListClientsQueryKey = () => ["listClients"] as const;
export const getListSuppliersQueryKey = () => ["listSuppliers"] as const;
export const getListWarehousesQueryKey = () => ["listWarehouses"] as const;
export const getGetCapacityBoardQueryKey = (params?: object) => ["getCapacityBoard", params] as const;
export const getGetRunSheetQueryKey = (params?: object) => ["getRunSheet", params] as const;
export const getGetReservationManifestQueryKey = (id: number) => ["getReservationManifest", id] as const;
export const getListAuditLogsQueryKey = (params?: object) => ["listAuditLogs", params] as const;

// ── Query hooks ────────────────────────────────────────────────────────────

export function useGetCurrentUser(_p?: undefined, opts?: QueryOpts<any>) {
  return useQuery({ queryKey: getGetCurrentUserQueryKey(), queryFn: () => apiFetch("/auth/me"), ...opts?.query });
}

export function useListDemoUsers(_p?: undefined, opts?: QueryOpts<any>) {
  return useQuery({ queryKey: getListDemoUsersQueryKey(), queryFn: () => apiFetch("/auth/demo-users"), ...opts?.query });
}

export function useGetDashboardOverview(_p?: undefined, opts?: QueryOpts<any>) {
  return useQuery({ queryKey: getGetDashboardOverviewQueryKey(), queryFn: () => apiFetch("/dashboard/overview"), ...opts?.query });
}

export function useGetQuarterlyBoard(_p?: undefined, opts?: QueryOpts<any>) {
  return useQuery({ queryKey: getGetQuarterlyBoardQueryKey(), queryFn: () => apiFetch("/dashboard/quarterly-board"), ...opts?.query });
}

export function useListInventory(
  params?: {
    status?: string; search?: string; quarter?: string;
    warehouseId?: number; clientId?: number; supplierId?: number;
    limit?: number; offset?: number;
  },
  opts?: QueryOpts<any>,
) {
  return useQuery({
    queryKey: getListInventoryQueryKey(params),
    queryFn: () => {
      const q = new URLSearchParams();
      if (params?.status) q.set("status", params.status);
      if (params?.search) q.set("search", params.search);
      if (params?.quarter) q.set("quarter", params.quarter);
      if (params?.warehouseId != null) q.set("warehouseId", String(params.warehouseId));
      if (params?.clientId != null) q.set("clientId", String(params.clientId));
      if (params?.supplierId != null) q.set("supplierId", String(params.supplierId));
      if (params?.limit != null) q.set("limit", String(params.limit));
      if (params?.offset != null) q.set("offset", String(params.offset));
      const qs = q.toString();
      return apiFetch(`/inventory${qs ? `?${qs}` : ""}`);
    },
    ...opts?.query,
  });
}

export function useGetInventoryItem(id: number, opts?: QueryOpts<any>) {
  return useQuery({ queryKey: getGetInventoryItemQueryKey(id), queryFn: () => apiFetch(`/inventory/${id}`), ...opts?.query });
}

export function useGetPackagingSpec(id: number, opts?: QueryOpts<any>) {
  return useQuery({ queryKey: getGetPackagingSpecQueryKey(id), queryFn: () => apiFetch(`/inventory/${id}/packaging`), ...opts?.query });
}

export function useListItemNotes(id: number, opts?: QueryOpts<any>) {
  return useQuery({ queryKey: getListItemNotesQueryKey(id), queryFn: () => apiFetch(`/inventory/${id}/notes`), ...opts?.query });
}

export function useListExceptions(_p?: undefined, opts?: QueryOpts<any>) {
  return useQuery({ queryKey: getListExceptionsQueryKey(), queryFn: () => apiFetch("/exceptions"), ...opts?.query });
}

export function useListIntegrations(_p?: undefined, opts?: QueryOpts<any>) {
  return useQuery({ queryKey: getListIntegrationsQueryKey(), queryFn: () => apiFetch("/integrations"), ...opts?.query });
}

export function useListSyncJobs(_p?: undefined, opts?: QueryOpts<any>) {
  return useQuery({ queryKey: getListSyncJobsQueryKey(), queryFn: () => apiFetch("/integrations/sync-jobs"), ...opts?.query });
}

export function useListClients(_p?: undefined, opts?: QueryOpts<any>) {
  return useQuery({ queryKey: getListClientsQueryKey(), queryFn: () => apiFetch("/directory/clients"), ...opts?.query });
}

export function useListSuppliers(_p?: undefined, opts?: QueryOpts<any>) {
  return useQuery({ queryKey: getListSuppliersQueryKey(), queryFn: () => apiFetch("/directory/suppliers"), ...opts?.query });
}

export function useListWarehouses(_p?: undefined, opts?: QueryOpts<any>) {
  return useQuery({ queryKey: getListWarehousesQueryKey(), queryFn: () => apiFetch("/directory/warehouses"), ...opts?.query });
}

export function useGetCapacityBoard(
  params?: { weekStart?: string; warehouseId?: number },
  opts?: QueryOpts<any>,
) {
  return useQuery({
    queryKey: getGetCapacityBoardQueryKey(params),
    queryFn: () => {
      const q = new URLSearchParams();
      if (params?.weekStart) q.set("weekStart", params.weekStart);
      if (params?.warehouseId != null) q.set("warehouseId", String(params.warehouseId));
      const qs = q.toString();
      return apiFetch(`/capacity/board${qs ? `?${qs}` : ""}`);
    },
    ...opts?.query,
  });
}

export function useGetRunSheet(
  params?: { date?: string; warehouseId?: number },
  opts?: QueryOpts<any>,
) {
  return useQuery({
    queryKey: getGetRunSheetQueryKey(params),
    queryFn: () => {
      const q = new URLSearchParams();
      if (params?.date) q.set("date", params.date);
      if (params?.warehouseId != null) q.set("warehouseId", String(params.warehouseId));
      const qs = q.toString();
      return apiFetch(`/capacity/run-sheet${qs ? `?${qs}` : ""}`);
    },
    ...opts?.query,
  });
}

export function useGetReservationManifest(id: number, opts?: QueryOpts<any>) {
  return useQuery({
    queryKey: getGetReservationManifestQueryKey(id),
    queryFn: () => apiFetch(`/capacity/manifest/${id}`),
    enabled: Number.isFinite(id),
    ...opts?.query,
  });
}

export function useListAuditLogs(params?: { limit?: number }, opts?: QueryOpts<any>) {
  return useQuery({
    queryKey: getListAuditLogsQueryKey(params),
    queryFn: () => {
      const q = new URLSearchParams();
      if (params?.limit != null) q.set("limit", String(params.limit));
      const qs = q.toString();
      return apiFetch(`/audit-logs${qs ? `?${qs}` : ""}`);
    },
    ...opts?.query,
  });
}

// ── Mutation hooks ─────────────────────────────────────────────────────────

export function useLoginUser(opts?: MutOpts<any, { data: { username: string; password: string } }>) {
  return useMutation({
    mutationFn: ({ data }: { data: { username: string; password: string } }) =>
      apiFetch("/auth/login", { method: "POST", body: JSON.stringify(data) }),
    ...opts?.mutation,
  });
}

export function useLogoutUser(opts?: MutOpts) {
  return useMutation({
    mutationFn: () => apiFetch("/auth/logout", { method: "POST" }),
    ...opts?.mutation,
  });
}

export function useUpdateInventoryItem(opts?: MutOpts<any, { id: number; data: Record<string, unknown> }>) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      apiFetch(`/inventory/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    ...opts?.mutation,
  });
}

export function useUpdatePackagingSpec(opts?: MutOpts<any, { id: number; data: Record<string, unknown> }>) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      apiFetch(`/inventory/${id}/packaging`, { method: "PATCH", body: JSON.stringify(data) }),
    ...opts?.mutation,
  });
}

export function useCreateItemNote(opts?: MutOpts<any, { id: number; data: Record<string, unknown> }>) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      apiFetch(`/inventory/${id}/notes`, { method: "POST", body: JSON.stringify(data) }),
    ...opts?.mutation,
  });
}

export function useRecomputeExceptions(opts?: MutOpts) {
  return useMutation({
    mutationFn: () => apiFetch("/exceptions/recompute", { method: "POST" }),
    ...opts?.mutation,
  });
}

export function useCreateSlotReservation(opts?: MutOpts<any, { data: Record<string, unknown> }>) {
  return useMutation({
    mutationFn: ({ data }: { data: Record<string, unknown> }) =>
      apiFetch("/capacity/reservations", { method: "POST", body: JSON.stringify(data) }),
    ...opts?.mutation,
  });
}

export function useUpdateSlotReservation(opts?: MutOpts<any, { id: number; data: Record<string, unknown> }>) {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      apiFetch(`/capacity/reservations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    ...opts?.mutation,
  });
}

export function useDeleteSlotReservation(opts?: MutOpts<any, { id: number }>) {
  return useMutation({
    mutationFn: ({ id }: { id: number }) =>
      apiFetch(`/capacity/reservations/${id}`, { method: "DELETE" }),
    ...opts?.mutation,
  });
}
