import {
  pgTable,
  integer,
  text,
  boolean,
  timestamp,
  doublePrecision,
  date,
} from "drizzle-orm/pg-core";

export const packagingSpecsTable = pgTable("packaging_specs", {
  itemId: integer("item_id").primaryKey(),
  packageLength: doublePrecision("package_length"),
  packageWidth: doublePrecision("package_width"),
  packageHeight: doublePrecision("package_height"),
  packageWeight: doublePrecision("package_weight"),
  palletLength: doublePrecision("pallet_length"),
  palletWidth: doublePrecision("pallet_width"),
  palletHeight: doublePrecision("pallet_height"),
  palletWeight: doublePrecision("pallet_weight"),
  unitsPerCase: integer("units_per_case"),
  casesPerPallet: integer("cases_per_pallet"),
  unitOfMeasure: text("unit_of_measure"),
  maxStackHeight: integer("max_stack_height"),
  stackable: boolean("stackable").notNull().default(true),
  fragile: boolean("fragile").notNull().default(false),
  hazmatFlag: boolean("hazmat_flag").notNull().default(false),
  restrictedMaterialFlag: boolean("restricted_material_flag")
    .notNull()
    .default(false),
  temperatureControlRequired: boolean("temperature_control_required")
    .notNull()
    .default(false),
  orientationRequirement: text("orientation_requirement"),
  carrierRequirement: text("carrier_requirement"),
  dockAssignment: text("dock_assignment"),
  loadSequence: integer("load_sequence"),
  freightClass: text("freight_class"),
  packagingMaterials: text("packaging_materials"),
  labelingRequirements: text("labeling_requirements"),
  barcodeRequired: boolean("barcode_required").notNull().default(true),
  qrCodeRequired: boolean("qr_code_required").notNull().default(false),
  asnRequired: boolean("asn_required").notNull().default(false),
  clientPackagingNotes: text("client_packaging_notes"),
  supplierComplianceNotes: text("supplier_compliance_notes"),
  warehouseHandlingNotes: text("warehouse_handling_notes"),
  lastVerifiedDate: date("last_verified_date"),
  verifiedBy: text("verified_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type PackagingSpec = typeof packagingSpecsTable.$inferSelect;
export type InsertPackagingSpec = typeof packagingSpecsTable.$inferInsert;
