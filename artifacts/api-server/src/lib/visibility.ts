import { and, eq, or, type SQL } from "drizzle-orm";
import {
  inventoryItemsTable,
  itemNotesTable,
  type User,
} from "@workspace/db";

/**
 * Returns a Drizzle SQL expression scoping inventory items to what `user` may see.
 * - admin / warehouse_manager / auditor: everything
 * - supplier: items where supplier_id matches their account
 * - client: items where client_id matches their account
 */
export function inventoryScopeForUser(user: User): SQL | undefined {
  if (
    user.role === "admin" ||
    user.role === "warehouse_manager" ||
    user.role === "auditor"
  ) {
    return undefined;
  }
  if (user.role === "supplier" && user.supplierId != null) {
    return eq(inventoryItemsTable.supplierId, user.supplierId);
  }
  if (user.role === "client" && user.clientId != null) {
    return eq(inventoryItemsTable.clientId, user.clientId);
  }
  // Misconfigured account → see nothing.
  return eq(inventoryItemsTable.id, -1);
}

/**
 * Returns a Drizzle SQL expression scoping notes by what visibility this user may see.
 */
export function noteVisibilityScopeForUser(user: User): SQL {
  const visibilities = visibleVisibilitiesForUser(user);
  if (visibilities.length === 0) {
    return eq(itemNotesTable.id, -1);
  }
  return or(
    ...visibilities.map((v) => eq(itemNotesTable.visibility, v)),
  ) as SQL;
}

export function visibleVisibilitiesForUser(user: User): string[] {
  switch (user.role) {
    case "admin":
      return [
        "shared",
        "client_visible",
        "supplier_visible",
        "warehouse_internal",
        "admin_only",
      ];
    case "warehouse_manager":
      return [
        "shared",
        "client_visible",
        "supplier_visible",
        "warehouse_internal",
      ];
    case "auditor":
      return [
        "shared",
        "client_visible",
        "supplier_visible",
        "warehouse_internal",
        "admin_only",
      ];
    case "supplier":
      return ["shared", "supplier_visible"];
    case "client":
      return ["shared", "client_visible"];
    default:
      return [];
  }
}

export function canPostNoteWithVisibility(
  user: User,
  visibility: string,
): boolean {
  if (user.role === "auditor") return false;
  switch (user.role) {
    case "admin":
      return [
        "shared",
        "client_visible",
        "supplier_visible",
        "warehouse_internal",
        "admin_only",
      ].includes(visibility);
    case "warehouse_manager":
      return [
        "shared",
        "client_visible",
        "supplier_visible",
        "warehouse_internal",
      ].includes(visibility);
    case "supplier":
      return ["shared", "supplier_visible"].includes(visibility);
    case "client":
      return ["shared", "client_visible"].includes(visibility);
    default:
      return false;
  }
}

export function canSeeItem(user: User, item: { supplierId: number | null; clientId: number | null }): boolean {
  if (
    user.role === "admin" ||
    user.role === "warehouse_manager" ||
    user.role === "auditor"
  ) {
    return true;
  }
  if (user.role === "supplier") {
    return item.supplierId != null && item.supplierId === user.supplierId;
  }
  if (user.role === "client") {
    return item.clientId != null && item.clientId === user.clientId;
  }
  return false;
}

export function combineFilters(
  ...filters: Array<SQL | undefined>
): SQL | undefined {
  const present = filters.filter((f): f is SQL => f !== undefined);
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  return and(...present);
}
