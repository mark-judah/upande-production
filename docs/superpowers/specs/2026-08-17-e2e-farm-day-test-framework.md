# End-to-end "Day at the Farm" test framework — spec

**Date:** 2026-08-17
**Bench:** v16 `kaitet.local` → web server `http://kaitet.local:8002`
**Goal:** Simulate a full production day by calling the **exact HTTP APIs the mobile apps
call** (not `frappe.get_doc` shortcuts), from harvest → receive → shelve → allocate →
issue → pack → stage → load → dispatch, across all three apps, including the remote-farm
transfer/reshelve flow. Build it so an agent can run it at scale once proven.

## Principle
Every action is a `POST/GET {base}/api/method/<method>` with a **session cookie** from
`/api/method/login` (form `usr`/`pwd`) — identical to what upande-production /
upande-quality / upande-packhouse send. No direct ORM writes for the flow itself
(ORM only for master-data setup + assertions).

## API map (authoritative, from app source + deployed Server Scripts)

### Auth
- `POST /api/method/login` form-urlencoded `usr`, `pwd` → session cookie `sid`.

### Harvest (upande-production)
- Pre-fetch: `productionListFarms {search,limit}`, `productionListGreenhouses {search,farm,limit}`,
  `productionListVarieties {search,limit}`, `getGreenhouseData {greenhouse_name}`,
  `GET /api/resource/Stem Length`.
- **Standard:** `POST createHarvestStockEntry {farm, greenhouse, harvester, bucket_id, stem_length, item_code, quantity, cut_stage}`.
  Blocks Spray Roses; blocks bucket already "In Use"; resolves harvester→Employee; creates Bucket QR if absent.
- **Spray (grading):** `POST fetchStockEntryByBunch {custom_bunch_id, action:"grading"}` then
  `POST createGradingStockEntry {farm, stock_entry_type:"Grading", graded_by, bunch_id, qty:1, rose_type:"Spray Roses", source_warehouse, bucket_id}`.
  Requires an existing **Bunch QR Code** (farm, stem_length, item_code, bunch_size UOM); variety must be in the greenhouse's Crop Cycle.
  Multi-variety-per-bucket = reuse `bucket_id` across bunches. `fetchBucketContents {bucket_id}` for the tally.

### Receive (upande-quality)
- `POST createReceivingStockEntry {bucket_id, custom_receiving_batch_id}` → moves greenhouse→`{farm} Receiving Cold Store - UFL`, UOM "Stems", groups unreceived harvests by variety, links `custom_receiving_entry`.

### Shelve (upande-quality)
- `POST createShelvingEntry {farm, shelf_id, bucket_id}` (shelf scanned first, capacity 2/shelf).
  Validates: received, harvest-receiving gap, stale date, dup, 2-per-shelf. `getShelvingDemand {farm}` (info only).

### Allocate (packhouse desk page — whitelisted)
- `upande_packhouse...page.sales_allocation.sales_allocation.*`: `get_pending_sales_orders`,
  `get_sales_order_items_with_buckets`, `allocate_stock_with_buckets`, remote-farm transfer/reshelve.

### Issue → Dispatch (upande-packhouse)
- Issue: `getReadySaleOrderItemsData {custom_order_name}` → `issueBucketToSaleOrderItem {bucket, sale_order_item, opl_name}`.
- Pack: `fetchPicklists {date}` → `get_pick_list_with_farm_pack_list {pick_list_id}` →
  `fetchStockEntryByBunch {custom_bunch_id, action:"packing"}` → `createOrUpdateFarmPackList {custom_farm, custom_customer, custom_sales_order, custom_order_pick_list, items[]}`.
- Stage: `createStagingEntry {box_label, location}`.
- Load: `fetchLoadingData {farm, vehicle}` → `createLoadingEntry {data:{box_label_name, vehicle, temperature, delivery_date}}`.
- Dispatch: `fetchDispatchLoadedOrders {delivery_date}` → `createOrUpdateDispatch {delivery_date}`.

## Master-data prerequisites (create if missing; source from v15 local bench when unknown)
1. Company "Upande Farms Limited" (abbr UFL, cost center). ✓
2. Farms: Timau (Nanyuki, sales), Sawmill (Ravine, remote), Delamare (Naivasha, remote). ✓
3. Warehouses per farm: `<Farm> GH 01` (greenhouse) + `<Farm> Receiving Cold Store - UFL`. ✓
4. **Stock Entry Types**: Harvesting, Receiving, Grading — verify purpose configured.
5. **UOM**: "Stems"; bunch UOMs e.g. "Bunch (10)" for each spray bunch size.
6. Stem Length: 42CM / 52CM / 62CM. ✓
7. Items: 75 varieties enriched from v15 (Spray Roses 25 / Standard Roses 40 / …). ✓
8. **Crop Cycles** per greenhouse with `varieties_grown` = the varieties to harvest there.
9. **Employees** (harvesters + graders) + **Employee Greenhouse** links (drives getGreenhouseData).
10. **Cut Stage** records.
11. Harvest Item Group Config (max stems/bucket) — leave 0/unset (no cap) for the test.
12. **Bunch QR Codes** for spray bunches (farm, stem_length, item_code, bunch_size).
13. **Shelf** records per sales farm (for shelving).
14. Sales Orders (from imported specs) for allocation/issue; map some varieties to remote farms.
15. Scan Location Mapping `<farm>-MAP` only if non-spray grading is exercised (not needed for standard harvest→receive).

## Test data plan
- ~10 buckets per variety. Distinct bucket IDs per (variety, i) since a bucket is locked "In Use" until received.
- Standards → direct harvest; Sprays → grading via pre-made Bunch QR Codes; some spray buckets hold 2+ varieties.
- Remote-farm flow: plant/harvest some varieties at Sawmill/Delamare (remote), allocate at Timau (sales), exercise transfer→reshelve.
- Assert after each phase: harvested==received==shelved counts; allocation buckets; OPL/FPL/box-label/loading/dispatch created.

## Execution phases
0. **Setup:** ensure all master data (idempotent). Login, cache cookie.
1. **Smoke (1 bucket):** standard harvest → receive → shelve one bucket; assert. Fix failures.
2. **Smoke sprays (1 bucket):** bunch QR → grade → receive → shelve; assert.
3. **Scale harvest/receive/shelve:** N varieties × 10 buckets, standards + sprays (+ multi-variety buckets).
4. **Allocation** incl. remote-farm mapping + transfer/reshelve.
5. **Issue → pack → stage → load → dispatch.**
6. **Reconciliation report:** counts at every stage; list any orphans (harvested-not-received, etc.).

## Scaling
Once phases 1–2 pass reliably and 3–5 pass at small N, hand the full spec to a background agent to run at full scale and produce the reconciliation report.

## v16 bugs found & fixed (via this E2E run — real defects, not scaffolding)
1. **Remote pick-list routing** — `create_straight_box_pick_list.py` / `create_mixed_box_picklist.py`
   `_get_shelf_farm_for_location()` returned `None` for a remote location (no local sales farm in
   the v16 one-farm-per-location topology), so callers fell back to a hardcoded v15 farm `"Karen"`
   → "No shelves found for farm Karen". **Fix:** fall back to the global sales-shelf farm (Timau).
2. **Shelving transfer detection (field renames)** — `Shelving Entry` server script read v15 Pick List
   Item fields `custom_awaiting_transfer / custom_in_transit / custom_bucket / custom_loaded_in_trolley
   / custom_shelved / custom_shelf`, and gated the whole transfer path on a `custom_bucket` **Custom
   Field** that doesn't exist on v16. v16 uses the plain `awaiting_transfer / in_transit / bucket /
   loaded_in_trolley / shelved / shelf` (standard `bucket`). **Fix:** renamed all + changed the gate to
   `frappe.get_meta("Pick List Item").get_field("bucket")`. (Word-boundary edits preserve the genuine
   Stock-Entry `custom_bucket_id` / `custom_shelved_at_kapkolia`.)
3. **OPL child table rename** — `Shelving Entry` iterated `opl_doc.locations` (v15); v16's Order Pick
   List child table is **`table_ytkc`** → `'NoneType' object is not iterable`. **Fix:** `opl_doc.table_ytkc`.
Net effect: remote allocate → transfer → re-shelve at the sales farm now works (bucket physically
moves Delamare→Timau, stale remote Shelf Item removed, PLI flags cleared, marked shelved).
Open follow-on: the draft remote OPL's **auto-submit** (`check_and_submit_opl`) did not fire after
re-shelve — needs a closer look (transfer state commits correctly regardless).

## Harness location
`scratchpad/e2e/` — a Python `requests` client (`client.py`), master-data setup (`setup.py`, ORM),
and phase runners (`phase_*.py`). Config: base URL + admin creds.
