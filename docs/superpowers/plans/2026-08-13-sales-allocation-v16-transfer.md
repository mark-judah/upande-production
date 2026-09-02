# Sales Allocation → v16 Transfer Plan

**Goal:** Transfer the `sales_allocation` desk Page + backend from v15 `upande_kaitet` to v16 **`upande_packhouse`**, adapted to v16's evolved Stock Entry / Shelf / Order Pick List model, with no loss of functionality. End state: allocate a **straight box**, a **mixed box**, and a **mixed bunch** on v16.

**Source (v15):** `/home/jk/Projects/upande-local-bench/apps/upande_kaitet/upande_kaitet/`
- `upande_kaitet/page/sales_allocation/sales_allocation.{py,js,json}` (1920-line backend, 1556-line JS)
- `server_scripts/create_straight_box_pick_list.py`, `create_mixed_box_picklist.py`, `create_mixed_bunch_picklist.py`, `opl_qr_code_gen.py`

**Target (v16):** local bench `kaitet.local:8002`, app `upande_packhouse`. Backend as server scripts / app module; Page under upande_packhouse. Method namespace repoints from `upande_kaitet.upande_kaitet.page.sales_allocation.sales_allocation.*`.

## Locked decisions
1. **OPL schema:** adapt to v16 **native** Order Pick List / Pick List Item fields (not v15 custom_ fields).
2. **Confirmed Stems:** transfer the subsystem (doctype + `Sales Order.custom_confirmed_stems_table`).
3. **Discard Request:** transfer `Discard Request` + `Discard Request Bucket`.

## Enhancements (the "carry data forward" win)
- **Aging:** replace `_get_latest_harvest_dates` (window scan over all Stock Entries, called 3×/request) with `Shelf Item.harvest_date` (now carried forward). Fallback to the Stock Entry lookup only if a row lacks it.
- **Incoming stems:** rewrite `_attach_incoming_stems` (uses REMOVED `custom_received_bucket_id`) to `custom_bucket_id` + `custom_receiving_entry`.
- **Farm→location:** v15 `Farm.custom_location` → v16 native `Farm.location`.
- **Teams:** hardcoded `{Team A,B,Jamafa,Eldama,Bravo}` → `Packing Teams` doctype lookup.

## OPL / Pick List Item field mapping (v15 write → v16 native)
Order Pick List: `locations`→`table_ytkc` child; `custom_farm`→`farm`; `custom_team`→`team` (Link Packing Teams); `custom_mix_group`→`mix_group`; `custom_bunch_group`→`bunch_group`; `custom_bouquet_guide`→`table_nade` (Bouquet Packing Guide). MISSING on v16 (add as custom or map): `custom_total_stems`, `for_qty`, `custom_business_unit`, `custom_allocated_pick_list`, `custom_qr_code`, `purpose`, `date_created`(exists).
Pick List Item: `custom_bucket`/`custom_bucket_id`→`bucket`; `custom_stem_length`/`length`→`stem_length`; `custom_team`→`team`; `custom_shelf`→`shelf`; `custom_awaiting_transfer`→`awaiting_transfer`; `custom_in_transit`→`in_transit`; `custom_shelved`→`shelved`; `custom_loaded_in_trolley`→`loaded_in_trolley`(+`trolley_id`); `custom_downgrade_reason`→`downgrade_reason`; `custom_available_stems_of_exact_length`→`available_stems_of_exact_length`; `custom_packrate`→`packrate`; `custom_truck`→`transit_truck`; native `farm`,`source_warehouse`,`issued`,`picked_qty`. Box fields DROPPED by v16 redesign — re-add as custom fields on Pick List Item: `custom_box_id`, `custom_box_label`, `custom_consignee`, `custom_flower_food`, `custom_ready_for_packing`, `custom_sale_order_item`, `rate`(if needed), `against_order_pick_list`.

## v16 gaps to fill (Phase 0)
- Create doctypes (upande_packhouse): **Confirmed Stems** (child: sales_order_item, farm, stems), **Discard Request** + **Discard Request Bucket**.
- Sales Order custom fields: `custom_confirmed_stems_table` (Table→Confirmed Stems), `custom_priority`, `custom_stock_allocated`, `custom_opl`.
- Sales Order Item: `custom_stock_available` (has custom_mixed_box/mix_group/mix_name/mixed_bunch/bunch_group/length/ordered_quantity/opl/fully_allocated already). Verify: custom_consignee, custom_box_label, custom_truck, custom_packrate, custom_packrate_mixed_box, custom_number_of_boxes, custom_flower_food, custom_line, custom_priority.
- Stock Entry: `custom_issued_to`, `custom_location` (or re-plumb incoming to receiving link + custom_farm).
- Pick List Item: the box custom fields above.
- Order Pick List: `custom_total_stems`, `for_qty`, `custom_business_unit`, `custom_allocated_pick_list`, `custom_qr_code`, `purpose`.
- Packrate doctype missing (v16 Pick List Item.packrate is a dangling link) — create or drop the link usage.

## Phases
- **Phase 0 — schema parity:** create the missing doctypes + custom fields above. Verify each with a query.
- **Phase 1 — pick-list builders:** port the 3 builders to upande_packhouse server_scripts, adapted to v16 native OPL/Pick List Item. Port `opl_qr_code_gen`.
- **Phase 2 — allocation backend:** port `sales_allocation.py` helpers + 8 methods; swap harvest-date + incoming-stems to carried-forward fields; Farm.location; Packing Teams whitelist.
- **Phase 3 — Page:** port sales_allocation.js/json under upande_packhouse; repoint method namespace; roles.
- **Phase 4 — enhancement pass + verify** expensive queries removed.
- **Phase 5 — test transactions:** seed a Sales Order with confirmed stems; allocate a straight box, a mixed box, a mixed bunch; verify OPLs + Bucket Allocation Status + unallocate.

## Invariants that must NOT change
- Aging by **true harvest date**, never shelving date; buckets with no harvest date dropped/blocked.
- Exact-length before downgrade; preferred-farm (most exact qty) first; oldest-first FEFO.
- Downgrade requires reason (amber-expired auto-passes).
- Cannot exceed confirmed − already-allocated; cross-location conflict rejected.
- Remote-farm buckets → in_transit=1, available zeroed (whole-bucket lock).
- Straight = 1 OPL/line; mixed box = 1 OPL/mix_group; mixed bunch = 1 OPL/bunch_group; draft until the whole group is covered, then auto-submit.
