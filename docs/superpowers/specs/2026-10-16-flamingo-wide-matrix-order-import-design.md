# Flamingo Wide-Matrix Sales Order Import — Design

## Problem

The existing Sales Order CSV/Excel import (`upande_packhouse`) assumes every
file is a flat table: one header row naming columns, one data row per order
line, optionally split into several orders via a single "multi-order" column
(`Order Import Platform.multi_order_column`). This is fully data-driven today
— adding a new platform in that shape is pure configuration (a new `Order
Import Platform` doc + `Order Import Field Mapping` rows), no code changes.

A new source, Flamingo (customer "Sandy", internal reference "KARE01"), sends
files in a materially different shape: one physical file is a **wide matrix**
with several days'/POs' worth of orders laid out as side-by-side column
groups, under a multi-row header, with item lines resolved against the same
`Specifications` mechanism the existing spec-based import path already uses.
The current engine has no way to parse this shape; this spec designs the
extension that lets it.

This is the first of (at least) two new source platforms being integrated;
a second, differently-shaped CSV is still to be scoped as a follow-up spec.

## Reference file

`/home/jk/Downloads/FLAMINGO.xls` ("KARE01 PO lines by date", currency GBP).
Confirmed layout (rows/columns 0-indexed as they arrive in the raw grid; the
user-added legend row at the bottom, `LINE CODE | LINE | RATE | BUNCH RATE |
| BUNCHES`, is reference-only, not data, and defines the two data-column
labels used throughout this spec):

| Row | Content |
|---|---|
| 0 | Title row: `"KARE01 PO lines by date"`, currency `GBP`, date range |
| 1 | Customer name, e.g. `"SANDY"` |
| 2 | Colour/group labels, one pair of columns per group: `Green, Pink, Orange, White, Blue, Red` (a file may have a different number of groups — parsing must not assume exactly 6) |
| 3 | Order date per group |
| 4 | Delivery date per group |
| 5 | PO number per group (first column of the pair), the pair's second column header reads `"confirmation"` |
| 6..N | Item rows: `LINE CODE`, `LINE` (description, e.g. `"PAS ROSE BQ PASTEL MIX A x22 STEMS"`), `RATE`, `BUNCH RATE`, then per group a column pair: **ordered bunches**, **confirmed bunches** |
| N+1 | Blank separator |
| N+2 | `Total` row — end-of-items marker |
| below | Blank rows, then the user's legend row (ignore) |

Confirmed against a real existing order (`SAL-ORD-2026-01944`, customer
"FLAMINGO  UK") that a mix-type `LINE` (e.g. `"SAWTMXRMXDO107 PASTEL MIX
52CM"`) already expands into one Sales Order Item row per approved colour in
that Specification, each carrying the *same* bunch/box count, differing only
in each colour's own pack size (stems-per-bunch) — see "Mix-spec expansion"
below for why this already works unmodified.

## Decisions carried from discussion with the user

- **Quantity**: the *ordered* bunches column drives the Sales Order quantity
  (not the *confirmed* column).
- **Customer**: this platform is always one fixed, pre-configured Customer —
  not parsed from the file's row-1 text.
- **Item/spec matching key**: `LINE` (description text) is the match key into
  the existing Specification-resolution mechanism, exactly like the existing
  XPOL-style platforms already use `custom_line`. `LINE CODE` is not used for
  matching.
- **Non-exact bunches→boxes division**: flagged for manual review, never
  silently rounded.
- **Pricing**: the file's own `RATE` column is never mapped to the Sales
  Order Item's rate — pricing continues to come from the system's price
  list, same as every other platform today.

## Mix-spec expansion — already solved, no changes needed

`order_import.py:_resolve_spec_row` (api/order_import.py:932) is the existing
code path `buildPreview()` already uses whenever an imported row's
`custom_line` names a Specification. For a flat (non-bunch-aware) spec, it
groups the spec's `Approved Varieties` by colour, picks each colour's primary
variety (`is_primary`, sorted exactly as `_bunch_shape` sorts its own
candidates), and builds one `{box_idx, variety, boxes}` selection **per
colour, each given the full imported box count** — then calls
`spec_autofill.build_spec_rows()`. This is exactly the shape confirmed in
`SAL-ORD-2026-01944`: 4 colours, each a separate Sales Order Item row, same
box count (13) and same bunch count (260) on 3 of the 4 varieties, differing
only via each variety's own `stems_per_bunch`/`pack_rate`
(`spec_autofill.py:774`, `:794`: `stems_per_box = bi.pack_rate`,
`uom = _uom_for(bi.stems_per_bunch)`). Flamingo rows need no new expansion
logic — they flow into this unchanged, once `custom_line` and a box count are
present on the row.

## New work, part 1: wide-matrix layout mode

### `Order Import Platform` — new field

A new Select field `layout_type` ("Standard Rows" default / "Wide Matrix").
When "Wide Matrix", a parallel section of Int/Data fields records the file's
fixed row/column positions (filled in once per platform, by hand, reading the
real file — not auto-detected):

| Field | Meaning |
|---|---|
| `matrix_group_label_row` | 0-indexed row holding colour/group names |
| `matrix_order_date_row` | 0-indexed row holding each group's order date |
| `matrix_delivery_date_row` | 0-indexed row holding each group's delivery date |
| `matrix_po_row` | 0-indexed row holding each group's PO number (first column of the pair) |
| `matrix_items_start_row` | 0-indexed row where item lines begin |
| `matrix_code_column` | 0-indexed column of `LINE CODE` |
| `matrix_description_column` | 0-indexed column of `LINE` |
| `matrix_bunch_rate_column` | 0-indexed column of `BUNCH RATE` |
| `matrix_first_group_column` | 0-indexed column where group 1's *ordered* column starts |
| `matrix_group_column_width` | columns per group pair (default 2: ordered, confirmed) |
| `matrix_stop_value` | text that marks end-of-items in the code column (default `"Total"`) |

Existing fields are reused unchanged: `multi_order_column` is set to the
literal string `"PO Number"` (the synthetic column `expand_wide_matrix`
always produces — see below), so the platform's order-splitting still goes
through the *existing*, untouched grouping logic in `buildPreview`
(api/order_import.py:1120-1129) rather than a second implementation of it.
`default_field_mappings` is reused unchanged too, mapping the pivoted
file's synthetic column names onto real targets, same table/UI as any other
platform:

| Synthetic column (produced by the pivot) | Target doctype | Target field |
|---|---|---|
| `Specification` | Sales Order Item | `custom_line` |
| `Bunches Ordered` | Sales Order Item | `_bunches_ordered` (new virtual field, see part 2) |
| `PO Number` | Sales Order | `po_no` |
| `Order Date` | Sales Order | `transaction_date` |
| `Delivery Date` | Sales Order | `delivery_date` |

`LINE CODE` is carried through only as an informational value available to
`_row_fingerprint` (api/order_import.py:1029) for error messages — it is not
mapped to any target field, matching the user's confirmation that matching
is done on `LINE`, not `LINE CODE`.

### `expand_wide_matrix()` — new function in `order_import.py`

```
expand_wide_matrix(header, rows, platform_doc) -> (new_header, new_rows)
```

Called from `buildPreview()` immediately after `platform_doc` is loaded
(api/order_import.py:1071), replacing `header`/`rows` before the existing
`col_index`/`split_col`/grouping code (api/order_import.py:1085 onward) runs
completely unchanged:

```python
platform_doc = frappe.get_doc("Order Import Platform", platform)
if platform_doc.layout_type == "Wide Matrix":
    header, rows = expand_wide_matrix(header, rows, platform_doc)
shared = bool(platform_doc.customer_differentiator_column)
...
```

Algorithm:
1. Starting at `matrix_first_group_column`, step by `matrix_group_column_width`
   through `matrix_group_label_row`, collecting one group per non-blank label,
   stopping at the first blank label. This makes the group count dynamic per
   file (not hardcoded to 6).
2. For each group, read its PO number (`matrix_po_row`, the pair's first
   column), order date (`matrix_order_date_row`), delivery date
   (`matrix_delivery_date_row`).
3. Walk item rows starting at `matrix_items_start_row`, stopping at the first
   row whose `matrix_code_column` cell is blank or equals `matrix_stop_value`
   (case-insensitive compare).
4. For each (item row × group) cell: if that group's *ordered* column (the
   pair's first column) is blank or `0`, **skip** — no row emitted. Otherwise
   emit one new "long" row: `[LINE (desc), ordered bunches, group's PO
   number, group's order date, group's delivery date]`, alongside the fixed
   synthetic header `["Specification", "Bunches Ordered", "PO Number", "Order
   Date", "Delivery Date"]`.
5. Returns the synthetic header and the full flattened row list. Every row
   carries which group (PO) it came from purely via its `PO Number` cell —
   grouping back into separate orders is left entirely to `buildPreview`'s
   existing `multi_order_column` logic, unchanged.

`BUNCH RATE` is read per item row (step 3/4) and threaded through as an
internal value (not a mapped field) purely to drive the soft cross-check in
part 2.

## New work, part 2: bunches→boxes conversion in `_resolve_spec_row`

Today, `_resolve_spec_row` (api/order_import.py:932) requires
`item_row["custom_number_of_boxes"]` to already be a box count:

```python
boxes = int(item_row.get("custom_number_of_boxes") or 0)
if boxes <= 0:
    return None, "needs Number of Boxes set on this row"
```

Flamingo supplies **bunches**, not boxes, and the conversion ratio
(`bunches_per_box`) lives only on the Specification's `Spec Box Item` rows —
it cannot be computed before the spec is resolved. Extend the function,
immediately after `spec_doc` is loaded and its issues/shape are checked
(api/order_import.py:964-971), to accept bunches as an alternative input:

```python
boxes = int(item_row.get("custom_number_of_boxes") or 0)
bunches_ordered = item_row.get("_bunches_ordered")
if boxes <= 0 and bunches_ordered:
    boxes, box_err = _boxes_from_bunches(spec_doc, bunches_ordered)
    if box_err:
        return None, box_err
if boxes <= 0:
    return None, "needs Number of Boxes set on this row"
```

New helper `_boxes_from_bunches(spec_doc, bunches_ordered)`:
- Reads `bunches_per_box` off the spec's primary variety's `Spec Box Item`
  row (the same box-item lookup `_box_idxs_by_variety`/the flat branch
  already performs at api/order_import.py:998-1005, reused rather than
  re-derived).
- If `bunches_per_box` is unset/zero: returns an error ("Specification has no
  Bunches Per Box set") — same "incomplete spec" family of errors
  `_spec_issues` already raises for other missing pack fields.
- `boxes, remainder = divmod(int(bunches_ordered), bunches_per_box)`. If
  `remainder != 0`: returns `(None, "<bunches_ordered> bunches doesn't divide
  evenly into boxes of <bunches_per_box> for this Specification")` — the
  calling row is tagged `_unresolved_item` and surfaced in the existing
  review/fix queue (api/order_import.py:1197-1204), identical treatment to
  today's "spec not found" and "incomplete spec" cases. No auto-rounding.
- Otherwise returns `(boxes, None)`.

### `getFieldCatalog()` — new virtual field

`_bunches_ordered` is added to `VIRTUAL_ITEM_FIELDS`
(api/order_import.py:29-31), alongside the existing `_stems_per_bunch`/
`_bunches_per_box` virtuals, so it appears in the Desk mapping picker the
same way: `{"fieldname": "_bunches_ordered", "label": "Bunches Ordered
(converts to boxes via the Specification)", "fieldtype": "Int"}`. It is never
a real Sales Order Item DocField — like the other two virtuals, it only ever
exists as a transient key on the in-memory `item_row` dict during preview
building, consumed and discarded by `_resolve_spec_row` before a real row is
shaped by `build_spec_rows`.

### `BUNCH RATE` — soft cross-check, not load-bearing

Flamingo's `BUNCH RATE` (stems-per-bunch, redundant with the Specification's
own `stems_per_bunch`) is compared, once the spec resolves, against the
resolved primary variety's `Spec Box Item.stems_per_bunch`. A mismatch adds a
non-blocking warning to the row's preview (same `msgprint`-style soft-warning
precedent already used elsewhere in this app for disabled-override cases),
flagging a probable wrong-Specification match without failing the import —
it is a safety net, not a validation gate.

## Non-goals

- The second platform's CSV (different shape, not yet shared) — out of
  scope for this spec; will get its own design once reviewed.
- No change to `Standard Rows` platforms or any existing platform's
  behavior — `layout_type` defaults to `"Standard Rows"`, and
  `expand_wide_matrix` is only invoked when a platform explicitly opts in.
- No multi-customer differentiator support for this platform (fixed single
  customer, per the user's decision above).
- The colour/group label text (Green/Pink/...) itself is not stored anywhere
  — it is a human-readable grouping aid in the source file with no meaning
  downstream.
- `RATE` is never written to any Sales Order Item field.
- No change to `spec_autofill.build_spec_rows` or the bunch-aware branch of
  `_resolve_spec_row` — only the flat branch's box-count derivation gains a
  new input path.

## Error handling summary

| Condition | Behavior |
|---|---|
| Group label row runs out (blank label) | Stop collecting groups — file may have fewer or more than 6 groups |
| Item rows reach `matrix_stop_value` or a blank code cell | Stop collecting item rows |
| A group's ordered-quantity cell is blank/0 for a given item row | Skip — no row emitted, not an error |
| `LINE` text doesn't match any `Specifications.name`, and isn't in this customer's remembered `spec_mapping` | Existing unresolved-spec flow: `_unresolved_spec_name`, search/confirm/remember via `searchSpecification` → `resolveImportSpecRow` |
| Specification found but incomplete (missing `bunches_per_box` etc.) | Existing "is incomplete" error path, unchanged |
| Bunches don't divide evenly into boxes | New error, surfaced via the existing unresolved-item review queue — no silent rounding |
| `BUNCH RATE` disagrees with the resolved spec's `stems_per_bunch` | Soft warning only, order still created |

## Testing

Standard Frappe test run: `bench --site kaitet.local run-tests --app
upande_packhouse`. New coverage needed:

1. `expand_wide_matrix` against a trimmed, real-shaped fixture (a handful of
   item rows × 2-3 groups, including at least one fully-zero row and one
   group with a blank label after it) — asserts the correct synthetic
   header/rows and that group count isn't hardcoded.
2. `_boxes_from_bunches`: exact division succeeds; non-exact division
   returns the error tuple, not a rounded guess; missing `bunches_per_box`
   returns the "incomplete" error.
3. End-to-end `buildPreview()` with `layout_type="Wide Matrix"` against the
   fixture — asserts N previews (one per PO/group) with correct `po_no`,
   `transaction_date`, `delivery_date`, and that a known mix `LINE` expands
   into one Sales Order Item row per its Specification's approved colours.
4. `BUNCH RATE` mismatch produces a non-blocking warning without failing the
   row.

## Rollout

1. Migrate the new `layout_type` field and the `Wide Matrix Layout` fields
   onto `Order Import Platform`, plus the `_bunches_ordered` virtual field in
   `VIRTUAL_ITEM_FIELDS`.
2. Create one new `Order Import Platform` doc for Flamingo (platform name
   e.g. "Flamingo UK (Sandy)"), `layout_type = "Wide Matrix"`,
   `multi_order_column = "PO Number"`, the five field mappings from the table
   above, and the matrix layout position fields filled in from the real
   file's actual row/column numbers.
3. Verify manually via the existing `sales-order-v2.html` import wizard
   against a real (sanitized) Flamingo file before treating it as live —
   confirm the right number of Sales Orders, correct PO numbers/dates, and
   that at least one known mix line expands exactly as `SAL-ORD-2026-01944`
   did.

## Open question

Which Customer record is "Sandy"/Flamingo — needs to be identified or
created before the new `Order Import Platform` doc is configured. Not
blocking for this spec or its implementation plan, but blocking for rollout
step 2.
