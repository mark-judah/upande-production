# Spec + Spec-driven SO Autofill — professional rebuild

**Date:** 2026-08-16
**Bench:** v16 `kaitet.local` (`/home/jk/Projects/upande-local-bench-v16`), app `upande_packhouse`
**Goal:** Replace the vibecoded spec autofill (client script #16 + `getShelfAvailability`)
with a clean, server-owned design that mirrors the Xpol grower-spec standard.

**STATUS: COMPLETE (2026-08-16).** All 6 phases built + verified on v16. Client
shrank ~30 KB → 6.8 KB; `getShelfAvailability` server script removed; availability
now nets allocation + discards everywhere (allocation page + SO popup).

## Decisions (confirmed by user)
- Approved varieties = **multiselect on `Spec Box Item`** (per colour/product line). "Approved list only" (no black/grey lists yet).
- Temporary specs auto-expire by flipping **`status` → `Inactive`** (keeps history), daily scheduler.
- Availability = **shelf − allocated − discard-reserved**, in ONE service, and **fix the allocation page too** (it currently ignores discards).
- Clean up the vibecoded client scripts (rewrite #16 as a thin client over server methods).

## Data model (as-found on v16)
- `Shelf Item` (child of `Shelf`): `bucket_id`, `variety`, `stem_length`, `stem_qty`, `farm`.
- `Bucket Allocation Status`: per-bucket `total_quantity` / `allocated_quantity` / `available_quantity`;
  child `Bucket Allocations` (`sales_order`, `quantity_allocated`, `cancelled`).
- `Discard Request` (`workflow_state`: Draft/Pending Approval/Approved/Rejected) → child
  `Discard Request Bucket` (`bucket_id`, `discarded`).
- Canonical available = `Shelf Item.stem_qty − Bucket Allocation Status.allocated_quantity`,
  **minus** buckets in a `Discard Request` whose `workflow_state != 'Rejected'`.

## Phases

### Phase 1 — Spec model
- New child `Spec Approved Variety` (istable): `variety` Link→Item (in_list_view). For Table MultiSelect.
- `Spec Box Item`: add `approved_varieties` Table MultiSelect → Spec Approved Variety; add `bunch_no` Data.
  Keep `variety` (optional default / back-compat).

### Phase 2 — Auto-expiry scheduler
- `upande_packhouse/spec.py :: expire_temporary_specs()` — set `status='Inactive'` where
  `spec_type='Temporary'` AND `status='Active'` AND `expiry_date < today`.
- Register in `hooks.py` `scheduler_events["daily"]`.

### Phase 3 — Availability service (single source of truth)
- `upande_packhouse/availability.py :: variety_availability(varieties, lengths=None)` (whitelisted)
  → `{ variety: { farm: available_stems } }`, applying shelf − allocated − discard-reserved.
- Helper `reserved_bucket_ids()` → set of bucket_ids in non-Rejected discard requests.
- Replaces `getShelfAvailability` server script (repoint client, then remove old script).

### Phase 4 — Fix allocation page discards
- `sales_allocation.py`: add discard-reserved exclusion to the availability read paths
  (`get_sales_order_items_with_buckets`, `get_available_filters`, `get_substitute_varieties`)
  and refuse discard-reserved buckets in `allocate_stock_with_buckets`.

### Phase 5 — SO spec autofill (server-owned)
- `upande_packhouse/spec_autofill.py`:
  - `get_spec_fill_data(spec)` → colour lines + approved varieties + live availability (via Phase 3).
  - `build_spec_rows(spec, selections)` → SO item rows (qty, packrate, uom factor, mix/bunch groups, detail payload).
- Thin client script `Autofill Sales Order By Specification` (rewrite #16):
  - spec picker filter: `customer == doc.customer AND status=='Active' AND (spec_type=='Permanent' OR expiry_date >= today)`.
  - on `custom_line` → call `get_spec_fill_data` → render one clean dialog → `build_spec_rows` → append.

### Phase 6 — Cleanup
- Remove `getShelfAvailability` server script once client repointed.
- Ensure no duplicate/dead spec logic remains in client scripts.

## Verification
- Auto-expiry: seed a Temporary spec expired yesterday → run job → status Inactive.
- Availability: allocate a bucket + put another in a discard request → service excludes both.
- Autofill: pick a spec on an SO → popup shows approved varieties with live available stems → rows fill correctly (mono/mixed box × mono/mixed bunch, uom factor, packrate).
