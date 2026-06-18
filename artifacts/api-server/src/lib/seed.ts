import { sql } from "drizzle-orm";
import {
  db,
  usersTable,
  clientsTable,
  suppliersTable,
  warehousesTable,
  inventoryItemsTable,
  packagingSpecsTable,
  itemNotesTable,
  integrationsTable,
} from "@workspace/db";
import { hashPassword } from "./auth";
import { recomputeAllFlags } from "./exceptions";
import type { Logger } from "pino";

export async function seedDatabaseIfEmpty(log: Logger): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable);
  if (count > 0) {
    log.info({ users: count }, "Seed: skipping (database already populated)");
    return;
  }

  log.info("Seed: populating warehouse coordination hub demo data");

  // Directory ----------------------------------------------------------
  const [globex] = await db
    .insert(clientsTable)
    .values([
      { name: "Globex Industrial", code: "GLOBEX" },
      { name: "Initech Manufacturing", code: "INITECH" },
    ])
    .returning();
  const [, initech] = await db
    .select()
    .from(clientsTable)
    .orderBy(clientsTable.id);

  const [acme, northstar] = await db
    .insert(suppliersTable)
    .values([
      { name: "Acme Components Co.", code: "ACME" },
      { name: "Northstar Logistics", code: "NORTHSTAR" },
    ])
    .returning();

  const [whEast, whWest] = await db
    .insert(warehousesTable)
    .values([
      { name: "East Coast Hub", code: "WH-EAST", location: "Newark, NJ" },
      { name: "West Coast Hub", code: "WH-WEST", location: "Long Beach, CA" },
    ])
    .returning();

  // Users --------------------------------------------------------------
  const passwordHash = await hashPassword("demo");
  await db.insert(usersTable).values([
    {
      username: "admin",
      passwordHash,
      displayName: "Avery Park",
      role: "admin",
    },
    {
      username: "manager",
      passwordHash,
      displayName: "Morgan Vega",
      role: "warehouse_manager",
      warehouseId: whEast.id,
    },
    {
      username: "acme",
      passwordHash,
      displayName: "Sasha Lin (Acme)",
      role: "supplier",
      supplierId: acme.id,
    },
    {
      username: "northstar",
      passwordHash,
      displayName: "Devon Cole (Northstar)",
      role: "supplier",
      supplierId: northstar.id,
    },
    {
      username: "globex",
      passwordHash,
      displayName: "Riley Mendes (Globex)",
      role: "client",
      clientId: globex.id,
    },
    {
      username: "initech",
      passwordHash,
      displayName: "Jordan Ahmed (Initech)",
      role: "client",
      clientId: initech.id,
    },
    {
      username: "auditor",
      passwordHash,
      displayName: "Quinn Rivers",
      role: "auditor",
    },
  ]);

  // Inventory ----------------------------------------------------------
  const items = [
    {
      sku: "ACM-PWR-2410",
      partNumber: "PWR-2410",
      serialNumber: "SN-PWR-100231",
      stockNumber: "STK-44120",
      poNumber: "PO-9001",
      workOrderNumber: "WO-77123",
      supplierRef: "ACME-INV-22019",
      carrierRef: "FX-ESTRIP-A",
      shipmentRef: "SHP-2026-Q1-001",
      asnNumber: "ASN-77001",
      description: "Industrial Power Supply 2410W",
      quantityOnHand: 240,
      quantityRequested: 200,
      reorderPoint: 80,
      warehouseLocation: "A-12-04",
      warehouseId: whEast.id,
      supplierId: acme.id,
      clientId: globex.id,
      status: "ReadyForPicking",
      priority: "high",
      quarter: "Q1",
      year: 2026,
    },
    {
      sku: "ACM-CAB-0807",
      partNumber: "CAB-0807",
      stockNumber: "STK-44121",
      poNumber: "PO-9002",
      supplierRef: "ACME-INV-22020",
      description: "Shielded Industrial Cable 8AWG, 7ft",
      quantityOnHand: 60,
      quantityRequested: 800,
      reorderPoint: 100,
      warehouseLocation: "A-13-02",
      warehouseId: whEast.id,
      supplierId: acme.id,
      clientId: globex.id,
      status: "PendingSupplier",
      priority: "high",
      quarter: "Q1",
      year: 2026,
    },
    {
      sku: "ACM-SEN-0034",
      partNumber: "SEN-0034",
      stockNumber: "STK-44122",
      description: "Precision Vibration Sensor",
      quantityOnHand: 12,
      quantityRequested: 150,
      reorderPoint: 30,
      warehouseLocation: "B-04-09",
      warehouseId: whEast.id,
      supplierId: acme.id,
      clientId: initech.id,
      status: "Backordered",
      priority: "high",
      quarter: "Q1",
      year: 2026,
    },
    {
      sku: "NSL-PKG-1100",
      partNumber: "PKG-1100",
      poNumber: "PO-9003",
      shipmentRef: "SHP-2026-Q1-002",
      description: "Reinforced Pallet Wrap (Roll)",
      quantityOnHand: 540,
      quantityRequested: 500,
      reorderPoint: 100,
      warehouseLocation: "C-01-01",
      warehouseId: whWest.id,
      supplierId: northstar.id,
      clientId: initech.id,
      status: "ReadyForPacking",
      priority: "medium",
      quarter: "Q1",
      year: 2026,
    },
    {
      sku: "NSL-CHM-0210",
      partNumber: "CHM-0210",
      stockNumber: "STK-55001",
      supplierRef: "NSL-INV-30910",
      description: "Industrial Solvent (UN1170 Hazmat)",
      quantityOnHand: 96,
      quantityRequested: 90,
      reorderPoint: 20,
      warehouseLocation: "H-02-01",
      warehouseId: whWest.id,
      supplierId: northstar.id,
      clientId: globex.id,
      status: "PendingClient",
      priority: "critical",
      quarter: "Q2",
      year: 2026,
    },
    {
      sku: "ACM-FRG-0501",
      partNumber: "FRG-0501",
      stockNumber: "STK-44130",
      description: "Glass Optical Lens (Fragile)",
      quantityOnHand: 220,
      quantityRequested: 220,
      reorderPoint: 50,
      warehouseLocation: "D-07-04",
      warehouseId: whEast.id,
      supplierId: acme.id,
      clientId: initech.id,
      status: "ReadyForStaging",
      priority: "high",
      quarter: "Q2",
      year: 2026,
    },
    {
      sku: "NSL-MTR-1200",
      partNumber: "MTR-1200",
      poNumber: "PO-9101",
      description: "Servo Motor 1.2kW",
      quantityOnHand: 0,
      quantityRequested: 60,
      reorderPoint: 10,
      warehouseLocation: "B-09-01",
      warehouseId: whWest.id,
      supplierId: northstar.id,
      clientId: globex.id,
      status: "Delayed",
      priority: "high",
      quarter: "Q2",
      year: 2026,
    },
    {
      sku: "ACM-BRK-0015",
      partNumber: "BRK-0015",
      description: "Steel Mounting Bracket",
      quantityOnHand: 1500,
      quantityRequested: 1200,
      reorderPoint: 300,
      warehouseLocation: "A-02-01",
      warehouseId: whEast.id,
      supplierId: acme.id,
      clientId: globex.id,
      status: "ReadyForLoading",
      priority: "medium",
      quarter: "Q2",
      year: 2026,
    },
    {
      sku: "NSL-LBL-0001",
      partNumber: "LBL-0001",
      description: "Compliance Label Stock (10k)",
      quantityOnHand: 320,
      quantityRequested: 300,
      reorderPoint: 50,
      warehouseLocation: "C-02-04",
      warehouseId: whWest.id,
      supplierId: northstar.id,
      clientId: initech.id,
      status: "ReadyForShipment",
      priority: "low",
      quarter: "Q3",
      year: 2026,
    },
    {
      sku: "ACM-PCB-0099",
      partNumber: "PCB-0099",
      stockNumber: "STK-44190",
      description: "Control Board Rev C",
      quantityOnHand: 80,
      quantityRequested: 250,
      reorderPoint: 60,
      warehouseLocation: "B-05-12",
      warehouseId: whEast.id,
      supplierId: acme.id,
      clientId: initech.id,
      status: "PendingWarehouse",
      priority: "medium",
      quarter: "Q3",
      year: 2026,
    },
    {
      sku: "NSL-TMP-2200",
      partNumber: "TMP-2200",
      description: "Cold-Chain Insulated Carton",
      quantityOnHand: 40,
      quantityRequested: 200,
      reorderPoint: 40,
      warehouseLocation: "T-01-01",
      warehouseId: whWest.id,
      supplierId: northstar.id,
      clientId: globex.id,
      status: "PendingSupplier",
      priority: "high",
      quarter: "Q3",
      year: 2026,
    },
    {
      sku: "ACM-ENC-0701",
      partNumber: "ENC-0701",
      description: "Outdoor Enclosure NEMA 4X",
      quantityOnHand: 180,
      quantityRequested: 150,
      reorderPoint: 30,
      warehouseLocation: "A-15-09",
      warehouseId: whEast.id,
      supplierId: acme.id,
      clientId: globex.id,
      status: "Available",
      priority: "low",
      quarter: "Q4",
      year: 2026,
    },
    {
      sku: "NSL-HRD-0040",
      partNumber: "HRD-0040",
      description: "Stainless Hardware Kit",
      quantityOnHand: 700,
      quantityRequested: 600,
      reorderPoint: 100,
      warehouseLocation: "C-03-08",
      warehouseId: whWest.id,
      supplierId: northstar.id,
      clientId: initech.id,
      status: "Available",
      priority: "low",
      quarter: "Q4",
      year: 2026,
    },
    {
      sku: "ACM-DSP-1600",
      partNumber: "DSP-1600",
      shipmentRef: "SHP-2026-Q4-014",
      description: "16in Industrial Display Module",
      quantityOnHand: 24,
      quantityRequested: 80,
      reorderPoint: 20,
      warehouseLocation: "D-02-02",
      warehouseId: whEast.id,
      supplierId: acme.id,
      clientId: globex.id,
      status: "PendingClient",
      priority: "medium",
      quarter: "Q4",
      year: 2026,
    },
    {
      sku: "NSL-FUS-0100",
      partNumber: "FUS-0100",
      description: "Industrial Fuse Assortment",
      quantityOnHand: 410,
      quantityRequested: 400,
      reorderPoint: 80,
      warehouseLocation: "C-04-01",
      warehouseId: whWest.id,
      supplierId: northstar.id,
      clientId: initech.id,
      status: "Closed",
      priority: "low",
      quarter: "Q4",
      year: 2026,
    },
  ];

  const insertedItems = await db
    .insert(inventoryItemsTable)
    .values(items)
    .returning();
  const bySku = new Map(insertedItems.map((i) => [i.sku, i]));

  // Packaging specs (some intentionally incomplete to trigger exceptions) ---
  await db.insert(packagingSpecsTable).values([
    {
      itemId: bySku.get("ACM-PWR-2410")!.id,
      packageLength: 24, packageWidth: 18, packageHeight: 10, packageWeight: 38,
      palletLength: 48, palletWidth: 40, palletHeight: 60, palletWeight: 950,
      unitsPerCase: 1, casesPerPallet: 16, unitOfMeasure: "EA",
      maxStackHeight: 3, stackable: true, fragile: false,
      orientationRequirement: "This side up",
      carrierRequirement: "FedEx Freight",
      dockAssignment: "Dock 4", loadSequence: 1,
      freightClass: "85",
      packagingMaterials: "Double-walled corrugated, foam corners",
      labelingRequirements: "Globex 4x6 carton label, lot + serial",
      barcodeRequired: true, qrCodeRequired: true, asnRequired: true,
      clientPackagingNotes: "Place pick ticket on right-side panel.",
      supplierComplianceNotes: "RoHS certified.",
      warehouseHandlingNotes: "Forklift load only.",
      lastVerifiedDate: "2026-04-01", verifiedBy: "Morgan Vega",
    },
    {
      itemId: bySku.get("ACM-CAB-0807")!.id,
      packageLength: 36, packageWidth: 12, packageHeight: 12, packageWeight: 22,
      palletLength: 48, palletWidth: 40, palletHeight: 48, palletWeight: 720,
      unitsPerCase: 5, casesPerPallet: 24, unitOfMeasure: "CASE",
      maxStackHeight: 4, stackable: true, fragile: false,
      carrierRequirement: "OldDominion",
      dockAssignment: "Dock 2",
      freightClass: "70",
      packagingMaterials: "Single-walled corrugated",
      labelingRequirements: "AWG marking visible on long edge",
      barcodeRequired: true, qrCodeRequired: false, asnRequired: true,
      supplierComplianceNotes: "UL listed.",
      warehouseHandlingNotes: "Stack up to 4 high.",
      lastVerifiedDate: "2026-03-12", verifiedBy: "Morgan Vega",
    },
    {
      itemId: bySku.get("ACM-SEN-0034")!.id,
      packageLength: 6, packageWidth: 4, packageHeight: 3, packageWeight: 0.4,
      unitsPerCase: 25, casesPerPallet: 40, unitOfMeasure: "EA",
      stackable: true, fragile: true,
      labelingRequirements: "ESD-safe label, lot code",
      barcodeRequired: true,
      // Intentionally missing: pallet dims, carrier, dock, handling notes → flags
    },
    {
      itemId: bySku.get("NSL-PKG-1100")!.id,
      packageLength: 22, packageWidth: 22, packageHeight: 18, packageWeight: 14,
      palletLength: 48, palletWidth: 40, palletHeight: 72, palletWeight: 800,
      unitsPerCase: 6, casesPerPallet: 18, unitOfMeasure: "ROLL",
      maxStackHeight: 2, stackable: true, fragile: false,
      carrierRequirement: "Northstar Internal",
      dockAssignment: "Dock 1", loadSequence: 4,
      freightClass: "100",
      packagingMaterials: "Stretch wrap",
      labelingRequirements: "Lot + roll length",
      barcodeRequired: true, asnRequired: false,
      warehouseHandlingNotes: "Keep dry.",
      lastVerifiedDate: "2026-04-10", verifiedBy: "Morgan Vega",
    },
    {
      itemId: bySku.get("NSL-CHM-0210")!.id,
      packageLength: 12, packageWidth: 12, packageHeight: 14, packageWeight: 18,
      palletLength: 48, palletWidth: 40, palletHeight: 48, palletWeight: 760,
      unitsPerCase: 4, casesPerPallet: 24, unitOfMeasure: "CASE",
      maxStackHeight: 1, stackable: false, fragile: false, hazmatFlag: true,
      restrictedMaterialFlag: true, temperatureControlRequired: false,
      orientationRequirement: "Upright only",
      // Intentionally missing carrier/compliance/client notes → critical hazmat flags
      labelingRequirements: "UN1170 placard, hazmat diamond",
      barcodeRequired: true, asnRequired: true,
    },
    {
      itemId: bySku.get("ACM-FRG-0501")!.id,
      packageLength: 10, packageWidth: 10, packageHeight: 6, packageWeight: 1.4,
      palletLength: 48, palletWidth: 40, palletHeight: 36, palletWeight: 420,
      unitsPerCase: 12, casesPerPallet: 30, unitOfMeasure: "EA",
      maxStackHeight: 2, stackable: true, fragile: true,
      orientationRequirement: "Fragile — do not stack heavy items above",
      carrierRequirement: "FedEx Priority",
      dockAssignment: "Dock 3", loadSequence: 2, freightClass: "92.5",
      packagingMaterials: "Foam-lined, corrugated, void fill",
      labelingRequirements: "Fragile label all four sides",
      barcodeRequired: true, qrCodeRequired: true, asnRequired: false,
      clientPackagingNotes: "Initech requires anti-static bag inside.",
      warehouseHandlingNotes: "Hand-carry from rack to staging.",
      lastVerifiedDate: "2026-04-19", verifiedBy: "Morgan Vega",
    },
    {
      itemId: bySku.get("NSL-MTR-1200")!.id,
      packageLength: 16, packageWidth: 16, packageHeight: 14, packageWeight: 28,
      palletLength: 48, palletWidth: 40, palletHeight: 50, palletWeight: 980,
      unitsPerCase: 1, casesPerPallet: 12, unitOfMeasure: "EA",
      maxStackHeight: 2, stackable: true, fragile: false,
      // Missing carrier despite Delayed status → flag
      dockAssignment: "Dock 5", freightClass: "85",
      packagingMaterials: "Wood crate", labelingRequirements: "Heavy label",
      barcodeRequired: true,
      warehouseHandlingNotes: "Forklift only.",
    },
    {
      itemId: bySku.get("ACM-BRK-0015")!.id,
      packageLength: 12, packageWidth: 8, packageHeight: 6, packageWeight: 6,
      palletLength: 48, palletWidth: 40, palletHeight: 42, palletWeight: 1100,
      unitsPerCase: 50, casesPerPallet: 40, unitOfMeasure: "EA",
      maxStackHeight: 5, stackable: true, fragile: false,
      carrierRequirement: "XPO Logistics",
      dockAssignment: "Dock 2", loadSequence: 6, freightClass: "65",
      packagingMaterials: "Single-walled corrugated",
      labelingRequirements: "Globex bracket label",
      barcodeRequired: true, asnRequired: true,
      warehouseHandlingNotes: "Stack up to 5 high.",
      lastVerifiedDate: "2026-04-05", verifiedBy: "Morgan Vega",
    },
    {
      itemId: bySku.get("NSL-LBL-0001")!.id,
      packageLength: 14, packageWidth: 10, packageHeight: 8, packageWeight: 5,
      palletLength: 48, palletWidth: 40, palletHeight: 46, palletWeight: 540,
      unitsPerCase: 20, casesPerPallet: 36, unitOfMeasure: "ROLL",
      maxStackHeight: 4, stackable: true, fragile: false,
      carrierRequirement: "USPS Priority",
      dockAssignment: "Dock 1", loadSequence: 8, freightClass: "55",
      packagingMaterials: "Plain corrugated",
      labelingRequirements: "Initech compliance label set",
      barcodeRequired: true,
      lastVerifiedDate: "2026-04-15", verifiedBy: "Morgan Vega",
    },
    {
      itemId: bySku.get("ACM-PCB-0099")!.id,
      packageLength: 8, packageWidth: 8, packageHeight: 2, packageWeight: 0.6,
      unitsPerCase: 25, casesPerPallet: 60, unitOfMeasure: "EA",
      stackable: true, fragile: true,
      labelingRequirements: "ESD label",
      barcodeRequired: true, qrCodeRequired: true,
      // Missing pallet/carrier/dock + fragile w/ no handling → multiple flags
    },
    {
      itemId: bySku.get("NSL-TMP-2200")!.id,
      packageLength: 22, packageWidth: 18, packageHeight: 14, packageWeight: 4,
      palletLength: 48, palletWidth: 40, palletHeight: 60, palletWeight: 320,
      unitsPerCase: 4, casesPerPallet: 24, unitOfMeasure: "EA",
      maxStackHeight: 2, stackable: true, fragile: false,
      temperatureControlRequired: true,
      // Missing carrier despite temp control → flag
      labelingRequirements: "Temperature gauge sticker",
      barcodeRequired: true, asnRequired: true,
      warehouseHandlingNotes: "Keep refrigerated until staging.",
    },
    {
      itemId: bySku.get("ACM-ENC-0701")!.id,
      packageLength: 30, packageWidth: 24, packageHeight: 16, packageWeight: 22,
      palletLength: 48, palletWidth: 40, palletHeight: 56, palletWeight: 880,
      unitsPerCase: 1, casesPerPallet: 20, unitOfMeasure: "EA",
      maxStackHeight: 3, stackable: true, fragile: false,
      carrierRequirement: "OldDominion", dockAssignment: "Dock 4",
      freightClass: "85",
      packagingMaterials: "Double-walled corrugated",
      labelingRequirements: "NEMA rating label",
      barcodeRequired: true,
      lastVerifiedDate: "2026-03-30", verifiedBy: "Morgan Vega",
    },
    {
      itemId: bySku.get("NSL-HRD-0040")!.id,
      packageLength: 10, packageWidth: 8, packageHeight: 6, packageWeight: 8,
      palletLength: 48, palletWidth: 40, palletHeight: 42, palletWeight: 990,
      unitsPerCase: 25, casesPerPallet: 48, unitOfMeasure: "KIT",
      maxStackHeight: 5, stackable: true, fragile: false,
      carrierRequirement: "FedEx Ground", dockAssignment: "Dock 1",
      freightClass: "70",
      packagingMaterials: "Plain corrugated",
      labelingRequirements: "Kit barcode + lot",
      barcodeRequired: true,
      lastVerifiedDate: "2026-04-12", verifiedBy: "Morgan Vega",
    },
    {
      itemId: bySku.get("ACM-DSP-1600")!.id,
      packageLength: 22, packageWidth: 18, packageHeight: 6, packageWeight: 9,
      palletLength: 48, palletWidth: 40, palletHeight: 48, palletWeight: 620,
      unitsPerCase: 1, casesPerPallet: 30, unitOfMeasure: "EA",
      maxStackHeight: 2, stackable: true, fragile: true,
      orientationRequirement: "Screen up",
      carrierRequirement: "FedEx Priority", dockAssignment: "Dock 3",
      freightClass: "92.5",
      packagingMaterials: "Anti-static foam, corrugated",
      labelingRequirements: "Fragile + Globex display label",
      barcodeRequired: true, qrCodeRequired: true,
      clientPackagingNotes: "Globex requires screen protector film attached.",
      warehouseHandlingNotes: "Two-person carry above 4 units.",
      lastVerifiedDate: "2026-04-18", verifiedBy: "Morgan Vega",
    },
    {
      itemId: bySku.get("NSL-FUS-0100")!.id,
      packageLength: 8, packageWidth: 6, packageHeight: 4, packageWeight: 2,
      palletLength: 48, palletWidth: 40, palletHeight: 40, palletWeight: 380,
      unitsPerCase: 50, casesPerPallet: 60, unitOfMeasure: "ASSORT",
      maxStackHeight: 5, stackable: true, fragile: false,
      carrierRequirement: "USPS Ground", dockAssignment: "Dock 1",
      freightClass: "60",
      packagingMaterials: "Plain corrugated",
      labelingRequirements: "Assortment label",
      barcodeRequired: true,
      lastVerifiedDate: "2026-04-22", verifiedBy: "Morgan Vega",
    },
  ]);

  // Notes (visibility variety) -----------------------------------------
  const adminUser = (await db.select().from(usersTable))[0];
  const managerUser = (await db.select().from(usersTable))[1];
  const acmeUser = (await db.select().from(usersTable))[2];
  const globexUser = (await db.select().from(usersTable))[4];

  await db.insert(itemNotesTable).values([
    {
      itemId: bySku.get("ACM-CAB-0807")!.id,
      body: "Need 800 units by end of Q1. Please confirm production capacity.",
      visibility: "shared",
      category: "planning",
      authorId: globexUser.id,
    },
    {
      itemId: bySku.get("ACM-CAB-0807")!.id,
      body: "Acme: confirmed — building first 400 this week, balance next week.",
      visibility: "supplier_visible",
      category: "planning",
      authorId: acmeUser.id,
    },
    {
      itemId: bySku.get("ACM-PWR-2410")!.id,
      body: "Picking sequence finalized; load Dock 4 priority at 06:00.",
      visibility: "warehouse_internal",
      category: "loading",
      authorId: managerUser.id,
    },
    {
      itemId: bySku.get("NSL-CHM-0210")!.id,
      body: "Hazmat compliance docs still missing; client cannot accept shipment until provided.",
      visibility: "shared",
      category: "exception",
      authorId: adminUser.id,
    },
    {
      itemId: bySku.get("ACM-FRG-0501")!.id,
      body: "Initech: please add anti-static bagging instruction to packaging spec.",
      visibility: "client_visible",
      category: "packaging",
      authorId: managerUser.id,
    },
  ]);

  // Integrations -------------------------------------------------------
  const next = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(integrationsTable).values([
    {
      name: "SAP ERP (mock)",
      kind: "sap",
      status: "connected",
      lastSyncStatus: "success",
      lastSyncMessage: "Initial seed complete.",
      lastSyncAt: new Date(),
      nextSyncAt: next,
    },
    {
      name: "Manhattan WMS (mock)",
      kind: "manhattan",
      status: "connected",
      lastSyncStatus: "success",
      lastSyncMessage: "Initial seed complete.",
      lastSyncAt: new Date(),
      nextSyncAt: next,
    },
    {
      name: "AWS Logistics (mock)",
      kind: "aws",
      status: "connected",
      lastSyncStatus: "success",
      lastSyncMessage: "Initial seed complete.",
      lastSyncAt: new Date(),
      nextSyncAt: next,
    },
    {
      name: "Tableau Export Feed",
      kind: "tableau",
      status: "connected",
      lastSyncStatus: "success",
      lastSyncMessage: "CSV endpoint ready at /api/export/inventory.csv",
      lastSyncAt: new Date(),
      nextSyncAt: next,
    },
  ]);

  // (Dock slots & reservations are seeded by seedCapacityIfEmpty on startup.)
  /* removed inline capacity seed
  const dockSlotsSeed: Array<{
    warehouseId: number;
    label: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    palletCapacity: number;
  }> = [];
  const slotsByWarehouse = [
    {
      wh: whEast,
      slots: [
        { label: "Dock 1 — Inbound", start: "06:00", end: "10:00", cap: 24 },
        { label: "Dock 2 — Outbound", start: "10:00", end: "14:00", cap: 24 },
        { label: "Dock 3 — Outbound", start: "14:00", end: "18:00", cap: 18 },
      ],
    },
    {
      wh: whWest,
      slots: [
        { label: "Dock A — Inbound", start: "07:00", end: "11:00", cap: 20 },
        { label: "Dock B — Outbound", start: "11:00", end: "15:00", cap: 20 },
      ],
    },
  ];
  for (const group of slotsByWarehouse) {
    for (let day = 1; day <= 5; day++) {
      for (const s of group.slots) {
        dockSlotsSeed.push({
          warehouseId: group.wh.id,
          label: s.label,
          dayOfWeek: day,
          startTime: s.start,
          endTime: s.end,
          palletCapacity: s.cap,
        });
      }
    }
  }
  const insertedSlots = await db
    .insert(dockSlotsTable)
    .values(dockSlotsSeed)
    .returning();

  // Sample reservations for the current Monday
  const now = new Date();
  const day = now.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + offset);
  const weekStart = monday.toISOString().slice(0, 10);

  const eastDock1Mon = insertedSlots.find(
    (s) =>
      s.warehouseId === whEast.id && s.dayOfWeek === 1 && s.label.startsWith("Dock 1"),
  );
  const eastDock2Tue = insertedSlots.find(
    (s) =>
      s.warehouseId === whEast.id && s.dayOfWeek === 2 && s.label.startsWith("Dock 2"),
  );
  const eastDock3Wed = insertedSlots.find(
    (s) =>
      s.warehouseId === whEast.id && s.dayOfWeek === 3 && s.label.startsWith("Dock 3"),
  );
  const westDockAThu = insertedSlots.find(
    (s) =>
      s.warehouseId === whWest.id && s.dayOfWeek === 4 && s.label.startsWith("Dock A"),
  );

  const sampleReservations: Array<typeof slotReservationsTable.$inferInsert> = [];
  if (eastDock1Mon) {
    sampleReservations.push({
      slotId: eastDock1Mon.id,
      weekStart,
      supplierId: acme.id,
      clientId: globex.id,
      itemId: bySku.get("ACM-PWR-2410")!.id,
      palletCount: 8,
      reference: "PO-9001 inbound",
      status: "confirmed",
      createdById: managerUser.id,
    });
  }
  if (eastDock2Tue) {
    sampleReservations.push({
      slotId: eastDock2Tue.id,
      weekStart,
      supplierId: acme.id,
      clientId: globex.id,
      itemId: bySku.get("ACM-BRK-0015")!.id,
      palletCount: 12,
      reference: "Globex outbound batch",
      status: "confirmed",
      createdById: managerUser.id,
    });
  }
  if (eastDock3Wed) {
    sampleReservations.push({
      slotId: eastDock3Wed.id,
      weekStart,
      supplierId: acme.id,
      clientId: initech.id,
      itemId: bySku.get("ACM-FRG-0501")!.id,
      palletCount: 4,
      reference: "Fragile lens shipment",
      status: "planned",
      createdById: acmeUser.id,
    });
  }
  if (westDockAThu) {
    sampleReservations.push({
      slotId: westDockAThu.id,
      weekStart,
      supplierId: northstar.id,
      clientId: initech.id,
      itemId: bySku.get("NSL-PKG-1100")!.id,
      palletCount: 6,
      reference: "Pallet wrap restock",
      status: "confirmed",
      createdById: managerUser.id,
    });
  }
  if (sampleReservations.length > 0) {
    await db.insert(slotReservationsTable).values(sampleReservations);
  }
  */

  // Run exception engine
  const result = await recomputeAllFlags();
  log.info(result, "Seed: exception engine complete");
}
