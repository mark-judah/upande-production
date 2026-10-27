# Flamingo Wide-Matrix Sales Order Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the existing Sales Order CSV/Excel import engine (`upande_packhouse`) to parse a new "Wide Matrix" file layout (several orders laid out as side-by-side colour-coded column groups under a multi-row header) and to resolve a Specification row's quantity from an ordered-bunches count instead of a direct box count.

**Architecture:** A new pure pivot function (`expand_wide_matrix`) flattens a Wide Matrix file into the same "long" header+rows shape the engine already groups into separate orders; it is invoked from `buildPreview()` only when the platform's new `layout_type` opts in, so every existing platform is byte-for-byte unaffected. A second, independent change teaches `_resolve_spec_row` to derive a box count from bunches once a Specification is resolved, since the bunches→boxes ratio only exists on the Specification, never in the file itself.

**Tech Stack:** Python 3, Frappe framework, `IntegrationTestCase` (`frappe.tests`), `bench --site kaitet.local run-tests --app upande_packhouse`.

**Spec:** `docs/superpowers/specs/2026-10-16-flamingo-wide-matrix-order-import-design.md`

## Global Constraints

- `layout_type` defaults to `"Standard Rows"`. Every existing `Order Import Platform` doc, and every Standard Rows platform's behavior, is byte-for-byte unchanged — `expand_wide_matrix` is only ever invoked when `platform_doc.layout_type == "Wide Matrix"`.
- Bunches→boxes conversion never auto-rounds. An uneven division (`bunches_ordered % bunches_per_box != 0`) is always surfaced as an error for manual review, never floored, ceiled, or rounded silently.
- The bunches-ordered input path applies only to flat (non-bunch-aware) Specifications. A bunch-aware spec given no `custom_number_of_boxes` still returns the existing `"needs Number of Boxes set on this row"` error, unchanged.
- A file's own `RATE` column is never written to any Sales Order Item pricing field — the system price list remains the sole source of pricing, unchanged for every platform.
- No change to `spec_autofill.build_spec_rows`, the bunch-aware branch of `_resolve_spec_row`, or any Standard Rows platform's code path.
- This plan stops at "the mechanism works and is tested." Creating the real Flamingo `Order Import Platform` doc, identifying the real Customer record for "Sandy", and any second CSV platform are explicitly out of scope (see spec's Rollout step 2 and Non-goals).

## Review Focus

- A Wide Matrix platform whose layout Int fields are left at their `0` default must fail with a clear configuration error at parse time, not silently treat row/column `0` as valid data — pinned in Task 1.
- A file with a different number of column groups than the reference file's 6 (fewer or more) must parse correctly — group count is detected dynamically from the label row, never hardcoded — pinned in Task 1.
- A `LINE` resolving to a Specification that is missing pack data (e.g. no Bunches Per Box set on a box item) must surface the exact same `"is incomplete (...)"` error the existing Standard Rows path already gives — even when the row supplies bunches instead of boxes — not a new, confusing message, and not a crash from dividing by zero — pinned in Task 3 and Task 4.
- Bunches that don't divide evenly into boxes must be flagged for manual review (the existing unresolved-item queue), never silently rounded — pinned in Task 3 and Task 4.
- A `BUNCH RATE` mismatch against the resolved Specification's own Stems Per Bunch must produce a non-blocking warning only — it must never fail the row or prevent the Sales Order preview/creation — pinned in Task 4 and confirmed end-to-end in Task 5.

---

## File Structure

- Modify: `upande_packhouse/upande_packhouse/doctype/order_import_platform/order_import_platform.json` — new `layout_type` field + "Wide Matrix Layout" section of position fields.
- Modify: `upande_packhouse/api/order_import.py` — `VIRTUAL_ITEM_FIELDS`, new `expand_wide_matrix()` + `WIDE_MATRIX_SYNTHETIC_HEADER`, new `_boxes_from_bunches()`, `_resolve_spec_row()` extended, `buildPreview()` wired to call `expand_wide_matrix()`.
- Create: `upande_packhouse/tests/test_order_import_wide_matrix.py` — pure pivot-function tests (Task 1).
- Create: `upande_packhouse/tests/test_order_import_boxes_from_bunches.py` — pure conversion-helper tests (Task 3).
- Create: `upande_packhouse/tests/test_order_import_spec_row_bunches.py` — `_resolve_spec_row` integration tests against real Specification fixtures (Task 4).
- Create: `upande_packhouse/tests/test_order_import_wide_matrix_integration.py` — full `buildPreview()` end-to-end test (Task 5).

---

### Task 1: `expand_wide_matrix()` pivot function

**Files:**
- Modify: `upande_packhouse/api/order_import.py` (new code, top-level — add near the top of the file, after `VIRTUAL_ITEM_FIELDS`/`IGNORED_FIELDTYPES`, before `_json_payload`)
- Test: `upande_packhouse/tests/test_order_import_wide_matrix.py`

**Interfaces:**
- Produces: `WIDE_MATRIX_SYNTHETIC_HEADER: list[str]` (the fixed 6-column synthetic header), `expand_wide_matrix(header, rows, platform_doc) -> (new_header: list[str], new_rows: list[list])`, raising `frappe.exceptions.ValidationError` (via `frappe.throw`) on an invalid/unset layout configuration. `platform_doc` is anything exposing the 11 `matrix_*` attributes by dot-access (a real `Order Import Platform` doc, or a `frappe._dict` stand-in in tests).
- Consumes: nothing from other tasks.

- [ ] **Step 1: Write the failing tests**

Create `upande_packhouse/tests/test_order_import_wide_matrix.py`:

```python
import frappe
from frappe.tests import UnitTestCase

from upande_packhouse.api.order_import import WIDE_MATRIX_SYNTHETIC_HEADER, expand_wide_matrix


def _layout(**overrides):
	"""A valid Wide Matrix layout config matching the 2-group fixture below,
	with any field overridden for a specific test."""
	base = {
		"matrix_group_label_row": 2,
		"matrix_order_date_row": 3,
		"matrix_delivery_date_row": 4,
		"matrix_po_row": 5,
		"matrix_items_start_row": 6,
		"matrix_code_column": 0,
		"matrix_description_column": 1,
		"matrix_bunch_rate_column": 3,
		"matrix_first_group_column": 4,
		"matrix_group_column_width": 2,
		"matrix_stop_value": "Total",
	}
	base.update(overrides)
	return frappe._dict(base)


# Synthetic fixture modeled on the real Flamingo file's structure (title row,
# customer row, colour-group label row, order-date row, delivery-date row,
# PO-number+confirmation row, item rows, a Total row, trailing blank/legend
# rows) - values are invented, not real customer data. Two groups only
# (fewer than the reference file's 6), one row that's zero in every group
# (must be skipped entirely), one row present in only one group.
TWO_GROUP_ROWS = [
	["TESTCO01 PO lines by date", "GBP", "01/01/26 - 07/01/26"],  # 0: title
	["TESTCUST"],  # 1: customer name
	["", "", "", "", "Alpha", "", "Beta"],  # 2: group labels
	["", "", "", "", "01/01/2026", "", "02/01/2026"],  # 3: order dates
	["", "", "", "", "03/01/2026", "", "04/01/2026"],  # 4: delivery dates
	["", "", "", "", "PO-1001", "confirmation", "PO-1002", "confirmation"],  # 5: PO numbers
	["ZEROCODE", "Zero Everywhere Spec", "1.0000", "20", "0", "0", "0", "0"],  # 6: all-zero row
	["MIXCODE", "Test Mix Spec x20 STEMS", "1.0000", "20", "40", "40", "0", "0"],  # 7: only Alpha
	["SINGLECODE", "Test Single Spec x10 STEMS", "0.5000", "10", "0", "0", "30", "30"],  # 8: only Beta
	[""],  # 9: blank separator
	["Total", "", "", "", "40", "", "30"],  # 10: Total row - stop marker
	[""],
	["LINE CODE", "LINE", "RATE", "BUNCH RATE", "", "BUNCHES"],  # legend, never reached
]


class UnitTestExpandWideMatrix(UnitTestCase):
	def test_pivots_two_groups_and_skips_all_zero_row(self):
		header, rows = expand_wide_matrix([], TWO_GROUP_ROWS, _layout())
		self.assertEqual(header, WIDE_MATRIX_SYNTHETIC_HEADER)
		# ZEROCODE is dropped entirely (zero in every group); MIXCODE only
		# appears for Alpha, SINGLECODE only for Beta.
		self.assertEqual(
			rows,
			[
				["Test Mix Spec x20 STEMS", 40.0, "20", "PO-1001", "01/01/2026", "03/01/2026"],
				["Test Single Spec x10 STEMS", 30.0, "10", "PO-1002", "02/01/2026", "04/01/2026"],
			],
		)

	def test_stops_at_total_row_and_never_reads_the_legend(self):
		# The legend row below "Total" literally repeats "LINE CODE"/"LINE" as
		# plain text in the code/description columns - if the stop condition
		# didn't fire, it would be mis-read as a bogus extra item line.
		header, rows = expand_wide_matrix([], TWO_GROUP_ROWS, _layout())
		descriptions = [r[0] for r in rows]
		self.assertNotIn("LINE", descriptions)

	def test_detects_fewer_groups_than_a_six_group_reference_file(self):
		# Only 2 groups configured/present here (vs. the real Flamingo file's
		# 6) - group count must come from the label row, not be hardcoded.
		_header, rows = expand_wide_matrix([], TWO_GROUP_ROWS, _layout())
		po_numbers = {r[3] for r in rows}
		self.assertEqual(po_numbers, {"PO-1001", "PO-1002"})

	def test_detects_more_groups_than_two(self):
		four_group_rows = [
			["TESTCO01 PO lines by date"],
			["TESTCUST"],
			["", "", "", "", "A", "", "B", "", "C", "", "D"],
			["", "", "", "", "01/01/2026", "", "02/01/2026", "", "03/01/2026", "", "04/01/2026"],
			["", "", "", "", "05/01/2026", "", "06/01/2026", "", "07/01/2026", "", "08/01/2026"],
			["", "", "", "", "PO-A", "x", "PO-B", "x", "PO-C", "x", "PO-D", "x"],
			["CODE1", "Four Group Spec x10 STEMS", "1.0", "10", "5", "5", "5", "5", "5", "5", "5", "5"],
			["Total"],
		]
		_header, rows = expand_wide_matrix([], four_group_rows, _layout())
		self.assertEqual({r[3] for r in rows}, {"PO-A", "PO-B", "PO-C", "PO-D"})

	def test_rejects_unset_row_layout(self):
		# Every matrix_*_row field left at its doctype default of 0 - must
		# raise a clear configuration error, never silently parse row 0 as
		# every section.
		bad_layout = _layout(
			matrix_group_label_row=0,
			matrix_order_date_row=0,
			matrix_delivery_date_row=0,
			matrix_po_row=0,
			matrix_items_start_row=0,
		)
		with self.assertRaises(frappe.exceptions.ValidationError):
			expand_wide_matrix([], TWO_GROUP_ROWS, bad_layout)

	def test_rejects_colliding_columns(self):
		bad_layout = _layout(matrix_description_column=0)  # same as matrix_code_column
		with self.assertRaises(frappe.exceptions.ValidationError):
			expand_wide_matrix([], TWO_GROUP_ROWS, bad_layout)

	def test_rejects_group_column_width_below_one(self):
		bad_layout = _layout(matrix_group_column_width=0)
		with self.assertRaises(frappe.exceptions.ValidationError):
			expand_wide_matrix([], TWO_GROUP_ROWS, bad_layout)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bench --site kaitet.local run-tests --app upande_packhouse --module upande_packhouse.tests.test_order_import_wide_matrix`
Expected: FAIL / ERROR — `expand_wide_matrix` and `WIDE_MATRIX_SYNTHETIC_HEADER` don't exist yet.

- [ ] **Step 3: Implement `expand_wide_matrix()`**

In `upande_packhouse/api/order_import.py`, add immediately after the existing `VIRTUAL_ITEM_FIELDS` block (after line 32):

```python
# A Wide Matrix file lays out several orders as side-by-side colour-coded
# column groups under a multi-row header (see
# docs/superpowers/specs/2026-10-16-flamingo-wide-matrix-order-import-design.md)
# instead of one named-header row per Standard Rows. expand_wide_matrix
# pivots it into this fixed synthetic header so the rest of buildPreview -
# column mapping, grouping-by-PO-number, everything below - runs completely
# unchanged.
WIDE_MATRIX_SYNTHETIC_HEADER = [
	"Specification",
	"Bunches Ordered",
	"Bunch Rate",
	"PO Number",
	"Order Date",
	"Delivery Date",
]


def _matrix_cell(rows, row_idx, col_idx):
	if row_idx < 0 or row_idx >= len(rows):
		return None
	row = rows[row_idx]
	if col_idx < 0 or col_idx >= len(row):
		return None
	v = row[col_idx]
	return v.strip() if isinstance(v, str) else v


def expand_wide_matrix(header, rows, platform_doc):
	"""Pivot a Wide Matrix platform's raw grid into the same flat "long"
	header/rows shape buildPreview already groups by Multi-Order Split
	Column. `header` is accepted for signature symmetry with the Standard
	Rows path but unused - a Wide Matrix file's column meaning comes
	entirely from platform_doc's own row/column position fields, never from
	column names (there is no single header row to name them)."""
	label_row = int(platform_doc.matrix_group_label_row or 0)
	order_date_row = int(platform_doc.matrix_order_date_row or 0)
	delivery_date_row = int(platform_doc.matrix_delivery_date_row or 0)
	po_row = int(platform_doc.matrix_po_row or 0)
	items_start_row = int(platform_doc.matrix_items_start_row or 0)
	code_col = int(platform_doc.matrix_code_column or 0)
	desc_col = int(platform_doc.matrix_description_column or 0)
	bunch_rate_col = int(platform_doc.matrix_bunch_rate_column or 0)
	first_group_col = int(platform_doc.matrix_first_group_column or 0)
	group_width = int(platform_doc.matrix_group_column_width or 0)
	stop_value = str(platform_doc.matrix_stop_value or "Total").strip().lower()

	row_positions = [label_row, order_date_row, delivery_date_row, po_row, items_start_row]
	if row_positions != sorted(row_positions) or len(set(row_positions)) != len(row_positions):
		frappe.throw(
			"Wide Matrix layout rows must be distinct and in order: Group Label Row < Order "
			"Date Row < Delivery Date Row < PO Number Row < Items Start Row."
		)
	fixed_cols = [code_col, desc_col, bunch_rate_col]
	if len(set(fixed_cols)) != len(fixed_cols) or first_group_col in fixed_cols:
		frappe.throw(
			"Wide Matrix layout columns (Item Code, Description, Bunch Rate, First Group) "
			"must all be distinct."
		)
	if group_width < 1:
		frappe.throw("Wide Matrix Group Column Width must be at least 1.")

	groups = []
	col = first_group_col
	while True:
		label = _matrix_cell(rows, label_row, col)
		if not label:
			break
		groups.append(
			{
				"order_date": _matrix_cell(rows, order_date_row, col),
				"delivery_date": _matrix_cell(rows, delivery_date_row, col),
				"po_number": _matrix_cell(rows, po_row, col),
				"ordered_col": col,
			}
		)
		col += group_width

	new_rows = []
	for row_idx in range(items_start_row, len(rows)):
		code = _matrix_cell(rows, row_idx, code_col)
		if not code or str(code).strip().lower() == stop_value:
			break
		description = _matrix_cell(rows, row_idx, desc_col)
		bunch_rate = _matrix_cell(rows, row_idx, bunch_rate_col)
		for g in groups:
			ordered = _matrix_cell(rows, row_idx, g["ordered_col"])
			try:
				ordered_num = float(ordered) if ordered not in (None, "") else 0.0
			except (TypeError, ValueError):
				ordered_num = 0.0
			if not ordered_num:
				continue
			new_rows.append(
				[
					description,
					ordered_num,
					bunch_rate,
					g["po_number"],
					g["order_date"],
					g["delivery_date"],
				]
			)

	return WIDE_MATRIX_SYNTHETIC_HEADER, new_rows
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bench --site kaitet.local run-tests --app upande_packhouse --module upande_packhouse.tests.test_order_import_wide_matrix`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
cd /home/jk/Projects/upande-local-bench-v16/apps/upande_packhouse
git add upande_packhouse/api/order_import.py upande_packhouse/tests/test_order_import_wide_matrix.py
git commit -m "feat: add expand_wide_matrix pivot for Wide Matrix order import layout"
```

---

### Task 2: `Order Import Platform` schema — layout type + matrix layout fields

**Files:**
- Modify: `upande_packhouse/upande_packhouse/doctype/order_import_platform/order_import_platform.json`
- Modify: `upande_packhouse/api/order_import.py:29-32` (`VIRTUAL_ITEM_FIELDS`)
- Test: `upande_packhouse/tests/test_order_import_wide_matrix.py` (append)

**Interfaces:**
- Produces: `Order Import Platform.layout_type` (Select, default `"Standard Rows"`), 11 new `matrix_*` fields (all consumed by Task 1's `expand_wide_matrix`, already written against these exact names). `VIRTUAL_ITEM_FIELDS` gains `_bunches_ordered` and `_bunch_rate` (consumed by Task 4's `_resolve_spec_row` extension).
- Consumes: nothing (schema-only; Task 1's function already matches these field names since Task 1 used a `frappe._dict` stand-in with the same names).

- [ ] **Step 1: Write the failing test**

Append to `upande_packhouse/tests/test_order_import_wide_matrix.py`:

```python
class UnitTestOrderImportPlatformSchema(UnitTestCase):
	def test_layout_type_defaults_to_standard_rows(self):
		meta = frappe.get_meta("Order Import Platform")
		df = meta.get_field("layout_type")
		self.assertEqual(df.default, "Standard Rows")
		self.assertIn("Wide Matrix", df.options)

	def test_matrix_layout_fields_exist(self):
		meta = frappe.get_meta("Order Import Platform")
		for fieldname in (
			"matrix_group_label_row",
			"matrix_order_date_row",
			"matrix_delivery_date_row",
			"matrix_po_row",
			"matrix_items_start_row",
			"matrix_code_column",
			"matrix_description_column",
			"matrix_bunch_rate_column",
			"matrix_first_group_column",
			"matrix_group_column_width",
			"matrix_stop_value",
		):
			self.assertIsNotNone(meta.get_field(fieldname), f"missing field {fieldname}")

	def test_virtual_item_fields_include_bunches_and_bunch_rate(self):
		from upande_packhouse.api.order_import import VIRTUAL_ITEM_FIELDS

		names = {f["fieldname"] for f in VIRTUAL_ITEM_FIELDS}
		self.assertIn("_bunches_ordered", names)
		self.assertIn("_bunch_rate", names)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bench --site kaitet.local run-tests --app upande_packhouse --module upande_packhouse.tests.test_order_import_wide_matrix`
Expected: FAIL — `layout_type`/`matrix_*` fields and the two new virtual fields don't exist yet.

- [ ] **Step 3: Add the schema**

In `order_import_platform.json`, replace the `field_order` array with:

```json
 "field_order": [
  "platform_name",
  "file_type",
  "layout_type",
  "column_break_1",
  "header_row",
  "multi_order_column",
  "customer_differentiator_column",
  "section_break_matrix",
  "matrix_group_label_row",
  "matrix_order_date_row",
  "matrix_delivery_date_row",
  "matrix_po_row",
  "matrix_items_start_row",
  "column_break_matrix_1",
  "matrix_code_column",
  "matrix_description_column",
  "matrix_bunch_rate_column",
  "matrix_first_group_column",
  "matrix_group_column_width",
  "matrix_stop_value",
  "section_break_1",
  "notes",
  "section_break_2",
  "default_field_mappings"
 ],
```

And add these field definitions into the `fields` array, right after the existing `file_type` field block (which ends at the json's `column_break_1` entry) — insert the new `layout_type` field immediately before the existing `column_break_1` entry, and insert the rest of the new fields immediately after the existing `customer_differentiator_column` field block (before the existing `section_break_1`):

```json
  {
   "default": "Standard Rows",
   "description": "Standard Rows: one header row names every column, one row per order line (the existing behavior). Wide Matrix: several orders laid out as side-by-side column groups under a multi-row header (e.g. a colour/date/PO row per group) - see the Wide Matrix Layout section below.",
   "fieldname": "layout_type",
   "fieldtype": "Select",
   "label": "Layout Type",
   "options": "Standard Rows\nWide Matrix"
  },
```

```json
  {
   "depends_on": "eval:doc.layout_type=='Wide Matrix'",
   "fieldname": "section_break_matrix",
   "fieldtype": "Section Break",
   "label": "Wide Matrix Layout"
  },
  {
   "description": "0-indexed row holding each column-group's label (e.g. a colour name).",
   "fieldname": "matrix_group_label_row",
   "fieldtype": "Int",
   "label": "Group Label Row"
  },
  {
   "description": "0-indexed row holding each group's order date.",
   "fieldname": "matrix_order_date_row",
   "fieldtype": "Int",
   "label": "Order Date Row"
  },
  {
   "description": "0-indexed row holding each group's delivery date.",
   "fieldname": "matrix_delivery_date_row",
   "fieldtype": "Int",
   "label": "Delivery Date Row"
  },
  {
   "description": "0-indexed row holding each group's PO number (the pair's first column).",
   "fieldname": "matrix_po_row",
   "fieldtype": "Int",
   "label": "PO Number Row"
  },
  {
   "description": "0-indexed row where item lines begin.",
   "fieldname": "matrix_items_start_row",
   "fieldtype": "Int",
   "label": "Items Start Row"
  },
  {
   "fieldname": "column_break_matrix_1",
   "fieldtype": "Column Break"
  },
  {
   "description": "0-indexed column of the item's own code (informational only - matching uses Description, not this).",
   "fieldname": "matrix_code_column",
   "fieldtype": "Int",
   "label": "Item Code Column"
  },
  {
   "description": "0-indexed column of the item's description - this is the text matched against a Specification.",
   "fieldname": "matrix_description_column",
   "fieldtype": "Int",
   "label": "Description Column"
  },
  {
   "description": "0-indexed column of the item's stems-per-bunch rate (cross-checked against the resolved Specification, not load-bearing).",
   "fieldname": "matrix_bunch_rate_column",
   "fieldtype": "Int",
   "label": "Bunch Rate Column"
  },
  {
   "description": "0-indexed column where the first group's ordered-quantity column starts.",
   "fieldname": "matrix_first_group_column",
   "fieldtype": "Int",
   "label": "First Group Column"
  },
  {
   "default": "2",
   "description": "Columns per group (e.g. 2 for an ordered/confirmed pair).",
   "fieldname": "matrix_group_column_width",
   "fieldtype": "Int",
   "label": "Group Column Width"
  },
  {
   "default": "Total",
   "description": "Text in the Item Code Column that marks the end of item rows.",
   "fieldname": "matrix_stop_value",
   "fieldtype": "Data",
   "label": "Stop Value"
  },
```

In `upande_packhouse/api/order_import.py`, change `VIRTUAL_ITEM_FIELDS` (lines 29-32) to:

```python
VIRTUAL_ITEM_FIELDS = [
	{"fieldname": "_stems_per_bunch", "label": "Stems Per Bunch (auto Pack Rate + UOM)", "fieldtype": "Int"},
	{"fieldname": "_bunches_per_box", "label": "Bunches Per Box (auto Pack Rate + UOM)", "fieldtype": "Int"},
	{
		"fieldname": "_bunches_ordered",
		"label": "Bunches Ordered (converts to boxes via the Specification)",
		"fieldtype": "Int",
	},
	{
		"fieldname": "_bunch_rate",
		"label": "Bunch Rate (stems/bunch, cross-checked against the Specification)",
		"fieldtype": "Int",
	},
]
```

- [ ] **Step 4: Migrate and run tests to verify they pass**

Run: `cd /home/jk/Projects/upande-local-bench-v16 && bench --site kaitet.local migrate`
Run: `bench --site kaitet.local run-tests --app upande_packhouse --module upande_packhouse.tests.test_order_import_wide_matrix`
Expected: PASS (all tests from Task 1 and Task 2)

- [ ] **Step 5: Commit**

```bash
cd /home/jk/Projects/upande-local-bench-v16/apps/upande_packhouse
git add upande_packhouse/upande_packhouse/doctype/order_import_platform/order_import_platform.json upande_packhouse/api/order_import.py upande_packhouse/tests/test_order_import_wide_matrix.py
git commit -m "feat: add Wide Matrix layout fields to Order Import Platform"
```

---

### Task 3: `_boxes_from_bunches()` conversion helper

**Files:**
- Modify: `upande_packhouse/api/order_import.py` (add near `_resolve_spec_row`, immediately before it — i.e. immediately after `_row_fingerprint`'s preceding code, before line 932 in the current file)
- Test: `upande_packhouse/tests/test_order_import_boxes_from_bunches.py`

**Interfaces:**
- Produces: `_boxes_from_bunches(bi, bunches_ordered) -> (boxes: int | None, error: str | None)`, where `bi` is anything exposing `.bunches_per_box` by dot-access (a real `Spec Box Item` child row, or a `frappe._dict` stand-in in tests).
- Consumes: nothing from other tasks (pure function, no DB).

- [ ] **Step 1: Write the failing tests**

Create `upande_packhouse/tests/test_order_import_boxes_from_bunches.py`:

```python
import frappe
from frappe.tests import UnitTestCase

from upande_packhouse.api.order_import import _boxes_from_bunches


class UnitTestBoxesFromBunches(UnitTestCase):
	def test_exact_division_succeeds(self):
		bi = frappe._dict({"bunches_per_box": 10})
		boxes, error = _boxes_from_bunches(bi, 30)
		self.assertEqual(boxes, 3)
		self.assertIsNone(error)

	def test_uneven_division_is_flagged_not_rounded(self):
		bi = frappe._dict({"bunches_per_box": 10})
		boxes, error = _boxes_from_bunches(bi, 25)
		self.assertIsNone(boxes)
		self.assertIn("doesn't divide evenly", error)

	def test_zero_bunches_per_box_is_flagged(self):
		bi = frappe._dict({"bunches_per_box": 0})
		boxes, error = _boxes_from_bunches(bi, 20)
		self.assertIsNone(boxes)
		self.assertIn("Bunches Per Box", error)

	def test_zero_bunches_ordered_is_flagged_not_zero_boxes(self):
		bi = frappe._dict({"bunches_per_box": 10})
		boxes, error = _boxes_from_bunches(bi, 0)
		self.assertIsNone(boxes)
		self.assertIsNotNone(error)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bench --site kaitet.local run-tests --app upande_packhouse --module upande_packhouse.tests.test_order_import_boxes_from_bunches`
Expected: FAIL — `_boxes_from_bunches` doesn't exist yet.

- [ ] **Step 3: Implement `_boxes_from_bunches()`**

In `upande_packhouse/api/order_import.py`, add immediately before `def _resolve_spec_row(`:

```python
def _boxes_from_bunches(bi, bunches_ordered):
	"""Convert an imported bunches-ordered count into a box count using one
	resolved Spec Box Item's own Bunches Per Box - the ratio a Wide Matrix
	platform's file never states directly (see
	docs/superpowers/specs/2026-10-16-flamingo-wide-matrix-order-import-design.md).
	Returns (boxes, error); never rounds - an uneven division is a data
	problem for a human to see, not something to guess past."""
	bunches_per_box = int(bi.bunches_per_box or 0)
	if bunches_per_box <= 0:
		return None, "has no Bunches Per Box set for its primary variety's pack"
	bunches_ordered = int(bunches_ordered or 0)
	if bunches_ordered <= 0:
		return None, "needs a positive Bunches Ordered value on this row"
	boxes, remainder = divmod(bunches_ordered, bunches_per_box)
	if remainder != 0:
		return None, (
			f"{bunches_ordered} bunches doesn't divide evenly into boxes of "
			f"{bunches_per_box} bunches/box for this Specification"
		)
	return boxes, None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bench --site kaitet.local run-tests --app upande_packhouse --module upande_packhouse.tests.test_order_import_boxes_from_bunches`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd /home/jk/Projects/upande-local-bench-v16/apps/upande_packhouse
git add upande_packhouse/api/order_import.py upande_packhouse/tests/test_order_import_boxes_from_bunches.py
git commit -m "feat: add _boxes_from_bunches conversion helper"
```

---

### Task 4: `_resolve_spec_row` — bunches input + Bunch Rate cross-check

**Files:**
- Modify: `upande_packhouse/api/order_import.py:932-1026` (`_resolve_spec_row`)
- Test: `upande_packhouse/tests/test_order_import_spec_row_bunches.py`

**Interfaces:**
- Consumes: `_boxes_from_bunches` from Task 3; `VIRTUAL_ITEM_FIELDS`' `_bunches_ordered`/`_bunch_rate` keys from Task 2 (used as plain dict keys on `item_row`, no DB dependency on the doctype field actually being migrated — a test can set these dict keys directly).
- Produces: `_resolve_spec_row` now accepts `item_row["_bunches_ordered"]` as an alternative to `item_row["custom_number_of_boxes"]` for flat (non-bunch-aware) specs, and annotates every returned row with `row["_bunch_rate_mismatch"] = "<message>"` when `item_row["_bunch_rate"]` disagrees with the resolved Specification's Stems Per Bunch. Consumed by Task 5's `buildPreview()` integration (no interface change needed there — `buildPreview` already calls `_resolve_spec_row` and extends `item_rows` with whatever keys each returned row carries).

- [ ] **Step 1: Write the failing tests**

Create `upande_packhouse/tests/test_order_import_spec_row_bunches.py`:

```python
import frappe
from frappe.tests import IntegrationTestCase

from upande_packhouse.api.order_import import _resolve_spec_row

CUT_STAGE = "Test Wide Matrix Cut Stage"
BOX_TYPE = "Test Wide Matrix Box Type"
STEM_LENGTH = "52cm"


class IntegrationTestResolveSpecRowBunches(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		if not frappe.db.exists("Cut Stage", CUT_STAGE):
			frappe.get_doc({"doctype": "Cut Stage", "cutstage": CUT_STAGE}).insert(ignore_permissions=True)
		if not frappe.db.exists("Box Type", BOX_TYPE):
			frappe.get_doc({"doctype": "Box Type", "name": BOX_TYPE, "box_name": BOX_TYPE}).insert(
				ignore_permissions=True
			)
		if not frappe.db.exists("Stem Length", STEM_LENGTH):
			frappe.get_doc({"doctype": "Stem Length", "length": STEM_LENGTH}).insert(ignore_permissions=True)
		for color in ("Test Wide Matrix Red", "Test Wide Matrix Blue"):
			if not frappe.db.exists("Colors", color):
				frappe.get_doc({"doctype": "Colors", "color_name": color}).insert(ignore_permissions=True)
		for item in ("Test Wide Matrix Variety Red", "Test Wide Matrix Variety Blue"):
			if not frappe.db.exists("Item", item):
				frappe.get_doc(
					{
						"doctype": "Item",
						"item_code": item,
						"item_name": item,
						"item_group": frappe.db.get_value("Item Group", {}, "name"),
						"stock_uom": "Nos",
					}
				).insert(ignore_permissions=True)
		frappe.db.commit()

	def _make_spec(self, name, colour_items, bunches_per_box=10, stems_per_bunch=5, pack_rate=50):
		"""colour_items: [(colour, item_code, is_primary), ...] - one row per
		approved colour, each paired 1:1 with its own box item (see
		spec_autofill._box_idxs_by_variety: same length, position-paired)."""
		if frappe.db.exists("Specifications", name):
			return frappe.get_doc("Specifications", name)
		doc = frappe.get_doc(
			{
				"doctype": "Specifications",
				"spec_name": name,
				"ftnft": "FT",
				"spec_type": "Permanent",
				"cut_stage": CUT_STAGE,
				"defoliation_length": "20",
				"box_assortment": "Mixed Box" if len(colour_items) > 1 else "Mono Box",
				"box_type": BOX_TYPE,
				"approved_varieties": [
					{"colour": colour, "variety": item, "is_primary": 1 if primary else 0}
					for colour, item, primary in colour_items
				],
				"box_items": [
					{
						"bunch_type": "Mono Bunch",
						"stems_per_bunch": stems_per_bunch,
						"length": STEM_LENGTH,
						"bunches_per_box": bunches_per_box,
						"pack_rate": pack_rate,
					}
					for _ in colour_items
				],
			}
		)
		doc.insert(ignore_permissions=True)
		frappe.db.commit()
		return doc

	def test_mix_spec_expands_one_row_per_colour_via_bunches_input(self):
		self._make_spec(
			"Test Wide Matrix Mix Spec",
			[
				("Test Wide Matrix Red", "Test Wide Matrix Variety Red", True),
				("Test Wide Matrix Blue", "Test Wide Matrix Variety Blue", True),
			],
			bunches_per_box=10,
		)
		item_row = {"custom_line": "Test Wide Matrix Mix Spec", "_bunches_ordered": 30}
		rows, error = _resolve_spec_row(item_row, "Test Customer", {"mix_group": 1, "bunch_group": 1})
		self.assertIsNone(error)
		self.assertEqual(len(rows), 2)
		varieties = {r["item_code"] for r in rows}
		self.assertEqual(varieties, {"Test Wide Matrix Variety Red", "Test Wide Matrix Variety Blue"})
		# 30 bunches / 10 bunches-per-box = 3 boxes, same box count on every colour.
		self.assertEqual(rows[0]["custom_number_of_boxes"], 3)
		self.assertEqual(rows[1]["custom_number_of_boxes"], 3)

	def test_uneven_bunches_is_flagged_not_rounded(self):
		self._make_spec(
			"Test Wide Matrix Single Spec Uneven",
			[("Test Wide Matrix Red", "Test Wide Matrix Variety Red", True)],
			bunches_per_box=10,
		)
		item_row = {"custom_line": "Test Wide Matrix Single Spec Uneven", "_bunches_ordered": 25}
		rows, error = _resolve_spec_row(item_row, "Test Customer", {"mix_group": 1, "bunch_group": 1})
		self.assertIsNone(rows)
		self.assertIn("doesn't divide evenly", error)

	def test_incomplete_spec_gives_existing_incomplete_message_not_a_bunches_message(self):
		doc = self._make_spec(
			"Test Wide Matrix Incomplete Spec",
			[("Test Wide Matrix Red", "Test Wide Matrix Variety Red", True)],
			bunches_per_box=10,
		)
		# Simulate a legacy Specification saved before Bunches Per Box was
		# required - _spec_issues must catch this BEFORE any bunches math
		# runs, exactly as it already does for the boxes-input path.
		frappe.db.set_value("Spec Box Item", doc.box_items[0].name, "bunches_per_box", 0)
		item_row = {"custom_line": "Test Wide Matrix Incomplete Spec", "_bunches_ordered": 20}
		rows, error = _resolve_spec_row(item_row, "Test Customer", {"mix_group": 1, "bunch_group": 1})
		self.assertIsNone(rows)
		self.assertIn("is incomplete", error)

	def test_bunch_rate_mismatch_is_a_non_blocking_warning(self):
		self._make_spec(
			"Test Wide Matrix Spec Bunch Rate",
			[("Test Wide Matrix Red", "Test Wide Matrix Variety Red", True)],
			bunches_per_box=10,
			stems_per_bunch=5,
		)
		item_row = {
			"custom_line": "Test Wide Matrix Spec Bunch Rate",
			"_bunches_ordered": 20,
			"_bunch_rate": 7,  # file says 7, Specification says 5
		}
		rows, error = _resolve_spec_row(item_row, "Test Customer", {"mix_group": 1, "bunch_group": 1})
		self.assertIsNone(error)
		self.assertIn("_bunch_rate_mismatch", rows[0])
		self.assertIn("5", rows[0]["_bunch_rate_mismatch"])

	def test_matching_bunch_rate_has_no_warning(self):
		self._make_spec(
			"Test Wide Matrix Spec Bunch Rate Match",
			[("Test Wide Matrix Red", "Test Wide Matrix Variety Red", True)],
			bunches_per_box=10,
			stems_per_bunch=5,
		)
		item_row = {
			"custom_line": "Test Wide Matrix Spec Bunch Rate Match",
			"_bunches_ordered": 20,
			"_bunch_rate": 5,
		}
		rows, error = _resolve_spec_row(item_row, "Test Customer", {"mix_group": 1, "bunch_group": 1})
		self.assertIsNone(error)
		self.assertNotIn("_bunch_rate_mismatch", rows[0])

	def test_bunch_aware_spec_without_boxes_still_needs_boxes(self):
		# Scoping guard (Global Constraints): bunches-input is flat-spec only.
		# A bunch-aware spec's existing "needs Number of Boxes" error must be
		# unaffected by this change. Reuses the mix spec from the first test
		# — it is NOT bunch_aware (no bunch_id set on any row), so this
		# instead confirms the ordinary "no boxes, no bunches at all" case
		# still errors exactly as before.
		self._make_spec(
			"Test Wide Matrix Mix Spec No Qty",
			[("Test Wide Matrix Red", "Test Wide Matrix Variety Red", True)],
			bunches_per_box=10,
		)
		item_row = {"custom_line": "Test Wide Matrix Mix Spec No Qty"}
		rows, error = _resolve_spec_row(item_row, "Test Customer", {"mix_group": 1, "bunch_group": 1})
		self.assertIsNone(rows)
		self.assertIn("needs Number of Boxes", error)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bench --site kaitet.local run-tests --app upande_packhouse --module upande_packhouse.tests.test_order_import_spec_row_bunches`
Expected: FAIL — `_resolve_spec_row` doesn't yet accept `_bunches_ordered`/`_bunch_rate`.

- [ ] **Step 3: Extend `_resolve_spec_row`**

In `upande_packhouse/api/order_import.py`, replace the body of `_resolve_spec_row` from `boxes = int(item_row.get("custom_number_of_boxes") or 0)` through the end of the flat-branch `selections` loop (i.e. replace api/order_import.py:959-1005) with:

```python
	boxes = int(item_row.get("custom_number_of_boxes") or 0)
	bunches_ordered = item_row.get("_bunches_ordered")
	if boxes <= 0 and not bunches_ordered:
		return None, "needs Number of Boxes set on this row"
	if not frappe.db.exists("Specifications", spec_name):
		return None, "not found"
	spec_doc = frappe.get_doc("Specifications", spec_name)

	issues = spec_autofill._spec_issues(spec_doc)
	if issues:
		return None, "is incomplete (" + "; ".join(issues) + ")"
	bunch_aware, bunches, shape_issues = spec_autofill._bunch_shape(spec_doc)
	if shape_issues:
		return None, "has a bunch_id mismatch (" + "; ".join(shape_issues) + ")"

	picked = item_row.get("item_code") or None
	warehouse = item_row.get("warehouse")
	bunch_rate_warning = None

	if bunch_aware:
		# Bunches-ordered input is flat-spec only (see this plan's Global
		# Constraints) - a bunch-aware spec with no direct box count still
		# gets the same error a Standard Rows platform would.
		if boxes <= 0:
			return None, "needs Number of Boxes set on this row"
		selections = []
		for b in bunches:
			picks = {}
			for slot in b["slots"]:
				candidate_names = {av.variety for av in slot["candidates"]}
				if picked and picked in candidate_names:
					picks[slot["colour"]] = picked
			selections.append({"bunch_id": b["bunch_id"], "boxes": boxes, "picks": picks})
	else:
		# _approved_by_colour discards is_primary (it only returns variety
		# names), so building selections straight from it would default to
		# whichever row happens to be first in the table - not necessarily
		# the primary one. Sorted here the same way _bunch_shape sorts its
		# own candidates, so the flat branch defaults to the primary variety
		# exactly as reliably as the bunch-aware one does.
		rows_by_colour = {}
		for av in spec_doc.approved_varieties or []:
			if av.variety:
				rows_by_colour.setdefault(av.colour or "", []).append(av)
		if not rows_by_colour:
			return None, "has no Approved Varieties configured"
		box_idxs = spec_autofill._box_idxs_by_variety(spec_doc)
		items = spec_doc.box_items or []

		first_av_rows = next(iter(rows_by_colour.values()))
		first_candidates = sorted(first_av_rows, key=lambda a: 0 if a.is_primary else 1)
		first_variety = first_candidates[0].variety
		first_idx = (box_idxs.get(first_variety) or [0])[0]
		first_bi = items[first_idx] if first_idx < len(items) else None

		if boxes <= 0:
			# No direct box count - derive one from the imported bunches
			# total using the first colour's chosen variety's own pack data.
			# build_spec_rows itself requires every colour in one fill to
			# share the same Boxes count, so any colour's ratio is as valid
			# a source as any other.
			if not first_bi:
				return None, "has no matching Box Item for its primary variety"
			boxes, box_err = _boxes_from_bunches(first_bi, bunches_ordered)
			if box_err:
				return None, box_err

		file_bunch_rate = item_row.get("_bunch_rate")
		if file_bunch_rate and first_bi and int(first_bi.stems_per_bunch or 0) != int(file_bunch_rate or 0):
			bunch_rate_warning = (
				f"file's Bunch Rate ({file_bunch_rate}) doesn't match this Specification's "
				f"Stems Per Bunch ({first_bi.stems_per_bunch}) - check the matched Specification "
				"is correct"
			)

		selections = []
		for _colour, av_rows in rows_by_colour.items():
			candidates = sorted(av_rows, key=lambda a: 0 if a.is_primary else 1)
			chosen = next((a for a in candidates if a.variety == picked), None) if picked else None
			variety = (chosen or candidates[0]).variety
			idxs = box_idxs.get(variety) or [0]
			selections.append({"box_idx": idxs[0], "variety": variety, "boxes": boxes})
```

Then, further down in the same function, change:

```python
	rows = result.get("rows") or []
	if not rows:
		return None, "produced no lines - check its Approved Varieties"
```

to:

```python
	rows = result.get("rows") or []
	if not rows:
		return None, "produced no lines - check its Approved Varieties"
	if bunch_rate_warning:
		for r in rows:
			r["_bunch_rate_mismatch"] = bunch_rate_warning
```

(leave the rest of the function — the `counters` bump and final `return rows, None` — unchanged).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bench --site kaitet.local run-tests --app upande_packhouse --module upande_packhouse.tests.test_order_import_spec_row_bunches`
Expected: PASS (7 tests)

Also re-run Task 1 and Task 3's test modules to confirm no regression:
Run: `bench --site kaitet.local run-tests --app upande_packhouse --module upande_packhouse.tests.test_order_import_wide_matrix`
Run: `bench --site kaitet.local run-tests --app upande_packhouse --module upande_packhouse.tests.test_order_import_boxes_from_bunches`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/jk/Projects/upande-local-bench-v16/apps/upande_packhouse
git add upande_packhouse/api/order_import.py upande_packhouse/tests/test_order_import_spec_row_bunches.py
git commit -m "feat: resolve Specification rows from bunches, with Bunch Rate cross-check"
```

---

### Task 5: Wire `expand_wide_matrix` into `buildPreview()` + end-to-end test

**Files:**
- Modify: `upande_packhouse/api/order_import.py:1071` (`buildPreview`, right after `platform_doc` is loaded)
- Test: `upande_packhouse/tests/test_order_import_wide_matrix_integration.py`

**Interfaces:**
- Consumes: `expand_wide_matrix` (Task 1), `Order Import Platform.layout_type`/`matrix_*` fields (Task 2), `_resolve_spec_row`'s bunches-input behavior (Task 4).
- Produces: `buildPreview()` fully supports `layout_type = "Wide Matrix"` platforms end-to-end. No new public interface — this is the integration point everything else was built toward.

- [ ] **Step 1: Write the failing test**

Create `upande_packhouse/tests/test_order_import_wide_matrix_integration.py`:

```python
import json

import frappe
from frappe.tests import IntegrationTestCase

CUSTOMER = "Test Wide Matrix Integration Customer"
PLATFORM = "Test Wide Matrix Integration Platform"
CUT_STAGE = "Test Wide Matrix Integration Cut Stage"
BOX_TYPE = "Test Wide Matrix Integration Box Type"
STEM_LENGTH = "52cm"

# Same synthetic shape as Task 1's fixture, with LINE text set to exactly
# match a real Specification (no rename/alias flow involved - that existing
# mechanism is out of scope here, already covered by its own tests).
TWO_GROUP_ROWS = [
	["TESTCO01 PO lines by date", "GBP"],
	["TESTCUST"],
	["", "", "", "", "Alpha", "", "Beta"],
	["", "", "", "", "01/01/2026", "", "02/01/2026"],
	["", "", "", "", "03/01/2026", "", "04/01/2026"],
	["", "", "", "", "PO-WM-1001", "confirmation", "PO-WM-1002", "confirmation"],
	["MIXCODE", "Test Wide Matrix Integration Mix Spec", "1.0", "10", "30", "30", "0", "0"],
	["SINGLECODE", "Test Wide Matrix Integration Single Spec", "0.5", "5", "0", "0", "20", "20"],
	["Total", "", "", "", "30", "", "20"],
]


class IntegrationTestWideMatrixBuildPreview(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		if not frappe.db.exists("Customer", CUSTOMER):
			frappe.get_doc({"doctype": "Customer", "customer_name": CUSTOMER}).insert(ignore_permissions=True)
		if not frappe.db.exists("Cut Stage", CUT_STAGE):
			frappe.get_doc({"doctype": "Cut Stage", "cutstage": CUT_STAGE}).insert(ignore_permissions=True)
		if not frappe.db.exists("Box Type", BOX_TYPE):
			frappe.get_doc({"doctype": "Box Type", "name": BOX_TYPE, "box_name": BOX_TYPE}).insert(
				ignore_permissions=True
			)
		if not frappe.db.exists("Stem Length", STEM_LENGTH):
			frappe.get_doc({"doctype": "Stem Length", "length": STEM_LENGTH}).insert(ignore_permissions=True)
		for color in ("Test Wide Matrix Integration Red", "Test Wide Matrix Integration Blue"):
			if not frappe.db.exists("Colors", color):
				frappe.get_doc({"doctype": "Colors", "color_name": color}).insert(ignore_permissions=True)
		for item in (
			"Test Wide Matrix Integration Variety Red",
			"Test Wide Matrix Integration Variety Blue",
			"Test Wide Matrix Integration Variety Single",
		):
			if not frappe.db.exists("Item", item):
				frappe.get_doc(
					{
						"doctype": "Item",
						"item_code": item,
						"item_name": item,
						"item_group": frappe.db.get_value("Item Group", {}, "name"),
						"stock_uom": "Nos",
					}
				).insert(ignore_permissions=True)
		if not frappe.db.exists("Specifications", "Test Wide Matrix Integration Mix Spec"):
			frappe.get_doc(
				{
					"doctype": "Specifications",
					"spec_name": "Test Wide Matrix Integration Mix Spec",
					"ftnft": "FT",
					"spec_type": "Permanent",
					"cut_stage": CUT_STAGE,
					"defoliation_length": "20",
					"box_assortment": "Mixed Box",
					"box_type": BOX_TYPE,
					"approved_varieties": [
						{
							"colour": "Test Wide Matrix Integration Red",
							"variety": "Test Wide Matrix Integration Variety Red",
							"is_primary": 1,
						},
						{
							"colour": "Test Wide Matrix Integration Blue",
							"variety": "Test Wide Matrix Integration Variety Blue",
							"is_primary": 1,
						},
					],
					"box_items": [
						{
							"bunch_type": "Mono Bunch",
							"stems_per_bunch": 5,
							"length": STEM_LENGTH,
							"bunches_per_box": 10,
							"pack_rate": 50,
						},
						{
							"bunch_type": "Mono Bunch",
							"stems_per_bunch": 5,
							"length": STEM_LENGTH,
							"bunches_per_box": 10,
							"pack_rate": 50,
						},
					],
				}
			).insert(ignore_permissions=True)
		if not frappe.db.exists("Specifications", "Test Wide Matrix Integration Single Spec"):
			frappe.get_doc(
				{
					"doctype": "Specifications",
					"spec_name": "Test Wide Matrix Integration Single Spec",
					"ftnft": "FT",
					"spec_type": "Permanent",
					"cut_stage": CUT_STAGE,
					"defoliation_length": "20",
					"box_assortment": "Mono Box",
					"box_type": BOX_TYPE,
					"approved_varieties": [
						{
							"colour": "Test Wide Matrix Integration Red",
							"variety": "Test Wide Matrix Integration Variety Single",
							"is_primary": 1,
						}
					],
					"box_items": [
						{
							"bunch_type": "Mono Bunch",
							"stems_per_bunch": 5,
							"length": STEM_LENGTH,
							"bunches_per_box": 4,
							"pack_rate": 20,
						}
					],
				}
			).insert(ignore_permissions=True)
		if not frappe.db.exists("Order Import Platform", PLATFORM):
			frappe.get_doc(
				{
					"doctype": "Order Import Platform",
					"platform_name": PLATFORM,
					"file_type": "Excel",
					"layout_type": "Wide Matrix",
					"multi_order_column": "PO Number",
					"matrix_group_label_row": 2,
					"matrix_order_date_row": 3,
					"matrix_delivery_date_row": 4,
					"matrix_po_row": 5,
					"matrix_items_start_row": 6,
					"matrix_code_column": 0,
					"matrix_description_column": 1,
					"matrix_bunch_rate_column": 3,
					"matrix_first_group_column": 4,
					"matrix_group_column_width": 2,
					"matrix_stop_value": "Total",
					"default_field_mappings": [
						{
							"source_column": "Specification",
							"target_doctype": "Sales Order Item",
							"target_fieldname": "custom_line",
						},
						{
							"source_column": "Bunches Ordered",
							"target_doctype": "Sales Order Item",
							"target_fieldname": "_bunches_ordered",
						},
						{
							"source_column": "Bunch Rate",
							"target_doctype": "Sales Order Item",
							"target_fieldname": "_bunch_rate",
						},
						{
							"source_column": "PO Number",
							"target_doctype": "Sales Order",
							"target_fieldname": "po_no",
						},
						{
							"source_column": "Order Date",
							"target_doctype": "Sales Order",
							"target_fieldname": "transaction_date",
						},
						{
							"source_column": "Delivery Date",
							"target_doctype": "Sales Order",
							"target_fieldname": "delivery_date",
						},
					],
				}
			).insert(ignore_permissions=True)
		frappe.db.commit()

	def test_build_preview_splits_into_one_order_per_po_group(self):
		from upande_packhouse.api.order_import import buildPreview

		frappe.form_dict.data = json.dumps(
			{"customer": CUSTOMER, "platform": PLATFORM, "header": [], "rows": TWO_GROUP_ROWS}
		)
		buildPreview()
		result = frappe.response["message"]
		self.assertTrue(result["success"], result.get("error"))
		orders = result["orders"]
		self.assertEqual(len(orders), 2)

		by_po = {o["header"]["po_no"]: o for o in orders}
		self.assertEqual(set(by_po), {"PO-WM-1001", "PO-WM-1002"})

		mix_order = by_po["PO-WM-1001"]
		self.assertEqual(str(mix_order["header"]["transaction_date"]), "2026-01-01")
		self.assertEqual(str(mix_order["header"]["delivery_date"]), "2026-01-03")
		self.assertEqual(len(mix_order["rows"]), 2)  # mix spec -> one row per colour
		self.assertEqual({r["item_code"] for r in mix_order["rows"]}, {
			"Test Wide Matrix Integration Variety Red",
			"Test Wide Matrix Integration Variety Blue",
		})
		# 30 bunches / 10 per box = 3 boxes, matching bunch rate (10 == spec's 5? no -
		# this fixture's file Bunch Rate column is "10", spec's stems_per_bunch is 5,
		# so a mismatch warning is expected here deliberately.
		self.assertIn("_bunch_rate_mismatch", mix_order["rows"][0])

		single_order = by_po["PO-WM-1002"]
		self.assertEqual(len(single_order["rows"]), 1)
		self.assertEqual(single_order["rows"][0]["item_code"], "Test Wide Matrix Integration Variety Single")
		# 20 bunches / 4 per box = 5 boxes.
		self.assertEqual(single_order["rows"][0]["custom_number_of_boxes"], 5)
		# File Bunch Rate "5" matches this spec's stems_per_bunch (5) - no warning.
		self.assertNotIn("_bunch_rate_mismatch", single_order["rows"][0])

		self.assertEqual(result["unresolved_customers"], [])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bench --site kaitet.local run-tests --app upande_packhouse --module upande_packhouse.tests.test_order_import_wide_matrix_integration`
Expected: FAIL — `buildPreview()` doesn't yet call `expand_wide_matrix` for a Wide Matrix platform, so rows are parsed as Standard Rows (wrong/empty result).

- [ ] **Step 3: Wire `expand_wide_matrix` into `buildPreview()`**

In `upande_packhouse/api/order_import.py`, inside `buildPreview()`, change:

```python
		platform_doc = frappe.get_doc("Order Import Platform", platform)
		shared = bool(platform_doc.customer_differentiator_column)
```

to:

```python
		platform_doc = frappe.get_doc("Order Import Platform", platform)
		if platform_doc.layout_type == "Wide Matrix":
			header, rows = expand_wide_matrix(header, rows, platform_doc)
		shared = bool(platform_doc.customer_differentiator_column)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bench --site kaitet.local run-tests --app upande_packhouse --module upande_packhouse.tests.test_order_import_wide_matrix_integration`
Expected: PASS

Then run the full app test suite to confirm no regressions anywhere else:
Run: `bench --site kaitet.local run-tests --app upande_packhouse`
Expected: PASS (all tests, including every Standard Rows platform's existing tests, unaffected)

- [ ] **Step 5: Commit**

```bash
cd /home/jk/Projects/upande-local-bench-v16/apps/upande_packhouse
git add upande_packhouse/api/order_import.py upande_packhouse/tests/test_order_import_wide_matrix_integration.py
git commit -m "feat: wire expand_wide_matrix into buildPreview for Wide Matrix platforms"
```

---

## Self-Review Notes

**Spec coverage:** Problem/reference layout → Task 1. Mix-spec expansion (already solved) → confirmed unmodified by Task 4/5 tests, no new task needed. New `layout_type`/matrix fields → Task 2. `expand_wide_matrix` algorithm → Task 1. Bunches→boxes conversion → Task 3 + Task 4. New virtual fields → Task 2. `BUNCH RATE` soft cross-check → Task 4, confirmed end-to-end in Task 5. Error handling table → covered across Tasks 1, 3, 4. Testing section's 4 items → Tasks 1, 3, 4, 5 respectively. Rollout steps 1 (migrate) and 3 (manual wizard verification) are structurally covered by Task 2's migrate step and this plan's own test suite; rollout step 2 (real Flamingo platform doc + Customer) is explicitly out of scope per Global Constraints.

**Placeholder scan:** none found — every step carries real, complete code.

**Type consistency:** `expand_wide_matrix(header, rows, platform_doc)` signature is identical everywhere it's declared (Task 1) and called (Task 5). `_boxes_from_bunches(bi, bunches_ordered)` signature is identical in Task 3's definition, Task 4's call site, and Task 3/4's tests. `_bunches_ordered`/`_bunch_rate` dict keys are identical across Task 2's field-mapping table, Task 4's `_resolve_spec_row` reads, and Task 5's `default_field_mappings` fixture.

**Review Focus:** all 5 items map to an owning task's test, listed above the File Structure section.
