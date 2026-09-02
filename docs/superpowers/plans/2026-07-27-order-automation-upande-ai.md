# Order Automation (upande_ai) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FAC-MCP order-automation pipeline (email + WhatsApp → LLM extraction → reviewable Draft Order → one-click draft Sales Order) as the `upande_ai` Frappe app, with Frappe-native visibility web pages.

**Architecture:** Frappe owns ingestion + a queue doctype (cheap keyword detection via `after_insert` hooks, no LLM in the sandbox). Claude driving FAC MCP owns extraction only, writing Draft Orders back through a validated whitelisted endpoint. Confirm is a plain whitelisted Python method that builds a `docstatus=0` Sales Order. Four Frappe Pages give sales + dev visibility.

**Tech Stack:** Frappe/ERPNext v15, Python 3.11 (app server-side), `frappe.tests.utils.FrappeTestCase`, `frappe_whatsapp` (WhatsApp Message source), FAC MCP (external agent, out of scope to code here).

**Source spec:** `docs/superpowers/specs/2026-07-22-order-automation-mcp-design.md`
**Code target:** `/home/jk/Projects/upande-local-bench/apps/upande_ai` (module: **Upande Ai**, module slug `upande_ai`). Doctype path root: `upande_ai/upande_ai/upande_ai/doctype/`.

## Global Constraints

- Frappe v15; Python server-side app code is **full Python** (NOT the Server Script sandbox) — imports allowed, `_`-names allowed. Do not confuse with the sandbox rules that apply to Server Scripts elsewhere in the fleet.
- Build + unit-test on the **local bench** site (`kaitet.local`, at `/home/jk/Projects/upande-local-bench`). The live data (`Communication`, `WhatsApp Message`, `Sales Order`) is on **kaitet-group**; deployment there (Task 12) is a separate, later step. Never write to production `upande-kaitet2`.
- All new doctypes: `"module": "Upande Ai"`, `"app": "upande_ai"`, `"custom": 0` (shipped in the app, exported as JSON).
- Field names on Draft Order / Draft Order Item mirror the real `Sales Order` custom fields **verbatim** (see spec §4.3–4.4) so the confirm-mapper is 1:1.
- Confirm creates `docstatus=0` only. Never call `submit()` in this phase.
- Every doctype JSON must include `"naming_rule"`/`autoname` exactly as specified per task.
- Run each doctype task's migration with: `bench --site kaitet.local migrate` and tests with `bench --site kaitet.local run-tests --app upande_ai --module <module>`.
- Commit after every task with Conventional Commit messages; end each commit body with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure (decomposition)

```
apps/upande_ai/upande_ai/
  hooks.py                              # doc_events, scheduler_events, fixtures, website_route_rules  (Task 3, 8, 10, 11)
  ingest.py                             # ingestion: detection + enqueue + sweeps          (Task 6)
  extraction.py                         # whitelisted ingest_extraction(queue, payload)     (Task 7)
  confirm.py                            # whitelisted create_sales_order(draft_order)        (Task 9)
  matching.py                           # resolve_customer / resolve_item helpers            (Task 5)
  api.py                                # dashboard data endpoints (queue/draft feeds)        (Task 10)
  upande_ai/doctype/
    order_detection_rule/               # master (Task 2)
    order_intake_queue/                 # transaction + Order Intake Attempt child (Task 4)
    order_intake_attempt/               # child (Task 4)
    draft_order/                        # transaction + children (Task 5? -> Task 4b)  (Task 4)
    draft_order_item/                   # child (Task 4)
    draft_order_source/                 # child (Task 4)
    repeat_order_template/              # master + child (Task 8)
    repeat_order_item/                  # child (Task 8)
  www/order-desk/                       # Order Desk page (Task 10)
  www/order-review/                     # Draft Order Review page (Task 10)
  www/order-ops/                        # Ops/Dev dashboard page (Task 10)
  fixtures/                             # roles, workspace, number cards (Task 11)
  tests/                                # FrappeTestCase modules per component
```

Build order rationale: doctypes first (everything depends on the schema), then matching helpers, then the two write paths (extraction ingest, confirm), then ingestion hooks, then pages, then roles/fixtures, then deploy.

---

### Task 1: App bootstrap — module, required app, dev site install

**Files:**
- Modify: `apps/upande_ai/upande_ai/hooks.py` (add `required_apps`)
- Verify: `apps/upande_ai/upande_ai/modules.txt` (already contains `Upande Ai`)

**Interfaces:**
- Produces: an installed, migratable `upande_ai` app on `kaitet.local` with `frappe_whatsapp` present so `WhatsApp Message` exists for the ingestion hook.

- [ ] **Step 1: Confirm frappe_whatsapp is on the bench**

Run: `ls /home/jk/Projects/upande-local-bench/apps | grep -E 'frappe_whatsapp$'`
Expected: `frappe_whatsapp`. If absent, note it and proceed — the `WhatsApp Message` doc_event will be registered but dormant until the app is present (email ingestion still works).

- [ ] **Step 2: Declare the dependency (only if frappe_whatsapp is installed on the target)**

In `hooks.py`, set:
```python
required_apps = ["frappe/erpnext"]
# frappe_whatsapp is an optional integration source; guard its hook at runtime, do not hard-require.
```

- [ ] **Step 3: Ensure app installed on the dev site**

Run: `bench --site kaitet.local list-apps | grep upande_ai || bench --site kaitet.local install-app upande_ai`
Expected: `upande_ai` present.

- [ ] **Step 4: Baseline migrate**

Run: `bench --site kaitet.local migrate`
Expected: completes without error.

- [ ] **Step 5: Commit**

```bash
cd /home/jk/Projects/upande-local-bench/apps/upande_ai
git add upande_ai/hooks.py
git commit -m "chore: bootstrap upande_ai order-automation module"
```

---

### Task 2: `Order Detection Rule` doctype (master)

**Files:**
- Create: `upande_ai/upande_ai/upande_ai/doctype/order_detection_rule/order_detection_rule.json`
- Create: `.../order_detection_rule/order_detection_rule.py`
- Create: `.../order_detection_rule/__init__.py`
- Test: `upande_ai/upande_ai/tests/test_order_detection_rule.py`

**Interfaces:**
- Produces: doctype `Order Detection Rule` with fields `enabled`(Check), `source_type`(Select: Any/Email/WhatsApp), `keywords`(Small Text), `match_type`(Select: Contains/Exact/Starts With/Regex), `match_field`(Select: Subject/Body/Sender/Any), `case_sensitive`(Check), `priority`(Int), `sender_allowlist`(Small Text), `sender_blocklist`(Small Text), `active_from`(Datetime), `active_until`(Datetime), `default_business_unit`(Data), `default_company`(Link Company). `autoname` = `field:rule_name` with a `rule_name`(Data, reqd, unique) field.
- Produces (controller): `OrderDetectionRule.matches(text: str, field_value: str, sender: str, now: datetime) -> bool`.

- [ ] **Step 1: Write the failing test**

```python
# test_order_detection_rule.py
import frappe
from frappe.tests.utils import FrappeTestCase

class TestOrderDetectionRule(FrappeTestCase):
    def _rule(self, **kw):
        d = dict(doctype="Order Detection Rule", rule_name=frappe.generate_hash(length=8),
                 enabled=1, source_type="Any", match_type="Contains",
                 match_field="Body", keywords="order,PO", priority=10)
        d.update(kw)
        return frappe.get_doc(d)

    def test_contains_match_case_insensitive(self):
        r = self._rule()
        self.assertTrue(r.matches(text="Please place this ORDER", field_value="Please place this ORDER", sender="x@y.com", now=frappe.utils.now_datetime()))

    def test_regex_match(self):
        r = self._rule(match_type="Regex", keywords=r"PO-\d+")
        self.assertTrue(r.matches(text="ref PO-2026", field_value="ref PO-2026", sender="", now=frappe.utils.now_datetime()))
        self.assertFalse(r.matches(text="no code", field_value="no code", sender="", now=frappe.utils.now_datetime()))

    def test_blocklisted_sender_never_matches(self):
        r = self._rule(sender_blocklist="spam@bad.com")
        self.assertFalse(r.matches(text="order", field_value="order", sender="spam@bad.com", now=frappe.utils.now_datetime()))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bench --site kaitet.local run-tests --app upande_ai --module upande_ai.tests.test_order_detection_rule`
Expected: FAIL — doctype `Order Detection Rule` does not exist.

- [ ] **Step 3: Create the doctype JSON**

Author `order_detection_rule.json` with the fields in the Interfaces block, `"autoname": "field:rule_name"`, `"module": "Upande Ai"`, `"custom": 0`, and a permission for role `Order Desk Manager` (create/read/write/delete) + `System Manager`.

- [ ] **Step 4: Implement the controller**

```python
# order_detection_rule.py
import re
from frappe.model.document import Document

class OrderDetectionRule(Document):
    def matches(self, text, field_value, sender, now):
        if self.active_from and now < self.active_from: return False
        if self.active_until and now > self.active_until: return False
        if self.sender_blocklist and sender and sender.lower() in _csv(self.sender_blocklist):
            return False
        if self.sender_allowlist and sender and sender.lower() not in _csv(self.sender_allowlist):
            return False
        hay = field_value or ""
        needles = [k.strip() for k in (self.keywords or "").split(",") if k.strip()]
        if not self.case_sensitive:
            hay_cmp = hay.lower(); needles_cmp = [n.lower() for n in needles]
        else:
            hay_cmp = hay; needles_cmp = needles
        mt = self.match_type
        for n in needles_cmp:
            if mt == "Exact" and hay_cmp == n: return True
            if mt == "Contains" and n in hay_cmp: return True
            if mt == "Starts With" and hay_cmp.startswith(n): return True
            if mt == "Regex" and re.search(n, hay, 0 if self.case_sensitive else re.I): return True
        return False

def _csv(v):
    return {x.strip().lower() for x in (v or "").split(",") if x.strip()}
```

- [ ] **Step 5: Migrate + run tests**

Run: `bench --site kaitet.local migrate && bench --site kaitet.local run-tests --app upande_ai --module upande_ai.tests.test_order_detection_rule`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add upande_ai/upande_ai/doctype/order_detection_rule upande_ai/tests/test_order_detection_rule.py
git commit -m "feat: Order Detection Rule doctype + matcher"
```

---

### Task 3: `Order Intake Queue` + `Order Intake Attempt` doctypes

**Files:**
- Create: `.../doctype/order_intake_attempt/order_intake_attempt.json` (child, `istable:1`)
- Create: `.../doctype/order_intake_queue/order_intake_queue.json` + `.py` + `__init__.py`
- Test: `upande_ai/upande_ai/tests/test_order_intake_queue.py`

**Interfaces:**
- Produces child `Order Intake Attempt`: `attempt_no`(Int), `started_on`(Datetime), `agent`(Data), `outcome`(Select: Success/Failed), `confidence`(Percent), `notes`(Small Text).
- Produces `Order Intake Queue` (autoname `OIQ-.YYYY.-`): `source_type`(Select Email/WhatsApp), `source_doctype`(Link DocType), `source_name`(Dynamic Link → source_doctype), `source_hash`(Data, unique, reqd), `sender`(Data), `conversation_key`(Data), `subject_or_snippet`(Small Text), `matched_rule`(Link Order Detection Rule), `has_attachments`(Check), `status`(Select: Pending/Processing/Extracted/Confirmed/Failed/Ignored/Duplicate, default Pending), `attempts`(Int), `last_error`(Long Text), `draft_order`(Link Draft Order), `attempt_log`(Table → Order Intake Attempt).
- Produces (controller): `OrderIntakeQueue.log_attempt(agent, outcome, confidence=None, notes=None)`.

- [ ] **Step 1: Write the failing test**

```python
# test_order_intake_queue.py
import frappe
from frappe.tests.utils import FrappeTestCase

class TestOrderIntakeQueue(FrappeTestCase):
    def test_source_hash_unique(self):
        h = frappe.generate_hash(length=10)
        frappe.get_doc(dict(doctype="Order Intake Queue", source_type="Email",
            source_doctype="Communication", source_name="x", source_hash=h)).insert()
        with self.assertRaises(frappe.exceptions.DuplicateEntryError):
            frappe.get_doc(dict(doctype="Order Intake Queue", source_type="Email",
                source_doctype="Communication", source_name="y", source_hash=h)).insert()

    def test_log_attempt_appends_and_counts(self):
        q = frappe.get_doc(dict(doctype="Order Intake Queue", source_type="Email",
            source_doctype="Communication", source_name="z",
            source_hash=frappe.generate_hash(length=10))).insert()
        q.log_attempt(agent="tester", outcome="Failed", notes="boom")
        q.reload()
        self.assertEqual(len(q.attempt_log), 1)
        self.assertEqual(q.attempts, 1)
```

- [ ] **Step 2: Run to verify it fails**

Run: `bench --site kaitet.local run-tests --app upande_ai --module upande_ai.tests.test_order_intake_queue`
Expected: FAIL — doctype missing.

- [ ] **Step 3: Create both doctype JSONs** (child first, then parent referencing it). Unique on `source_hash`; permissions: `Order Desk User` read; `Order Desk Manager`/`System Manager` write.

- [ ] **Step 4: Implement controller**

```python
# order_intake_queue.py
import frappe
from frappe.model.document import Document

class OrderIntakeQueue(Document):
    def log_attempt(self, agent, outcome, confidence=None, notes=None):
        n = (self.attempts or 0) + 1
        self.append("attempt_log", dict(attempt_no=n, started_on=frappe.utils.now_datetime(),
            agent=agent, outcome=outcome, confidence=confidence, notes=notes))
        self.attempts = n
        self.save(ignore_permissions=True)
```

- [ ] **Step 5: Migrate + test.** Run the module tests; Expected: PASS.

- [ ] **Step 6: Commit** `feat: Order Intake Queue + attempt log`.

---

### Task 4: `Draft Order` + `Draft Order Item` + `Draft Order Source` doctypes

**Files:**
- Create children `draft_order_item` (istable), `draft_order_source` (istable) JSONs.
- Create `draft_order.json` + `.py` + `__init__.py`.
- Test: `upande_ai/upande_ai/tests/test_draft_order.py`

**Interfaces:**
- `Draft Order Item` (child): `raw_text`(Small Text), `raw_variety`(Data), `item_code`(Link Item), `item_name`(Data), `match_status`(Select: Matched/Fuzzy/Unmatched, default Unmatched), `match_confidence`(Percent), `custom_length`(Data), `custom_packrate_mixed_box`(Int), `custom_box_type`(Data), `custom_mixed_box`(Check), `custom_mixed_bunch`(Check), `custom_mix_group`(Data), `custom_mix_name`(Data), `uom`(Link UOM), `conversion_factor`(Float), `qty`(Float), `stems`(Float), `warehouse`(Link Warehouse), `custom_source_warehouse`(Link Warehouse), `rate`(Currency).
- `Draft Order Source` (child): `source_doctype`(Link DocType), `source_name`(Dynamic Link), `role`(Select: Original/Reply/Attachment/Correction), `received_on`(Datetime).
- `Draft Order` (autoname `DFT-ORD-.YYYY.-`): header fields per spec §4.3 (`status`, `source_queue` Link, `raw_customer`, `customer` Link Customer, `customer_match_status`, `custom_order_name`, `custom_sales_order_type`, `custom_business_unit`, `custom_farm` Link Warehouse, `company` Link, `transaction_date` Date, `delivery_date` Date, `custom_week`, `po_no`, `custom_statescountry`, `custom_consignee`, `custom_consignee_country`, `custom_mode_of_transport`, `custom_delivery_point`, `custom_truck_details`, `currency` Link, `selling_price_list` Link, `conversion_rate` Float, `custom_is_standing_order` Check, `custom_frequency` Select, `extraction_confidence` Percent, `needs_review` Check, `review_notes` Text, `raw_extraction` Code, `sales_order` Link Sales Order, `items` Table Draft Order Item, `sources` Table Draft Order Source).
- Produces (controller): `DraftOrder.recompute_review()` — sets `needs_review=1` if any item `match_status != "Matched"` or `customer_match_status != "Matched"` or `extraction_confidence < 70`, and sets `status` to `Needs Review`/`Ready` accordingly (unless already Confirmed/Rejected).

- [ ] **Step 1: Write failing test**

```python
# test_draft_order.py
import frappe
from frappe.tests.utils import FrappeTestCase

class TestDraftOrder(FrappeTestCase):
    def _draft(self, **kw):
        d = dict(doctype="Draft Order", raw_customer="FASHION GARDEN",
                 customer_match_status="Matched", extraction_confidence=90, status="Draft")
        d.update(kw); return frappe.get_doc(d)

    def test_unmatched_item_forces_review(self):
        d = self._draft()
        d.append("items", dict(raw_variety="Radiant Rebecca", match_status="Unmatched", qty=4))
        d.insert()
        d.recompute_review()
        self.assertTrue(d.needs_review)
        self.assertEqual(d.status, "Needs Review")

    def test_all_matched_high_conf_is_ready(self):
        d = self._draft()
        d.append("items", dict(raw_variety="Femke", item_code=None, match_status="Matched", qty=4))
        d.insert()
        d.recompute_review()
        self.assertFalse(d.needs_review)
        self.assertEqual(d.status, "Ready")
```

- [ ] **Step 2: Run — Expected FAIL** (doctype missing).

- [ ] **Step 3: Create the three doctype JSONs.** Permissions: `Order Desk User` read/write, `System Manager` all.

- [ ] **Step 4: Implement controller**

```python
# draft_order.py
from frappe.model.document import Document

class DraftOrder(Document):
    def recompute_review(self):
        if self.status in ("Confirmed", "Rejected"):
            return
        bad_items = any((i.match_status or "Unmatched") != "Matched" for i in self.items)
        bad_cust = (self.customer_match_status or "Unmatched") != "Matched"
        low_conf = (self.extraction_confidence or 0) < 70
        self.needs_review = 1 if (bad_items or bad_cust or low_conf) else 0
        self.status = "Needs Review" if self.needs_review else "Ready"
        self.save(ignore_permissions=True)
```

- [ ] **Step 5: Migrate + test — Expected PASS.**

- [ ] **Step 6: Commit** `feat: Draft Order + items + sources doctypes`.

---

### Task 5: `matching.py` — customer/item resolvers (exact, never guess)

**Files:**
- Create: `upande_ai/upande_ai/matching.py`
- Test: `upande_ai/upande_ai/tests/test_matching.py`

**Interfaces:**
- Consumes: Frappe `Customer`, `Item` masters.
- Produces:
  - `resolve_customer(raw: str) -> tuple[str|None, str]` → `(customer_name_or_None, match_status)` where status ∈ Matched/Fuzzy/Unmatched.
  - `resolve_item(raw_variety: str) -> tuple[str|None, str, float]` → `(item_code_or_None, match_status, confidence)`.
- Rule (from mcp-erpnext write-path): exact/unique match → Matched; single fuzzy `like` hit → Fuzzy; zero or ambiguous → Unmatched. Never return a code on ambiguity.

- [ ] **Step 1: Write failing test** (uses seeded test Items/Customers)

```python
# test_matching.py
import frappe
from frappe.tests.utils import FrappeTestCase
from upande_ai.matching import resolve_customer, resolve_item

class TestMatching(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if not frappe.db.exists("Item", "Femke"):
            frappe.get_doc(dict(doctype="Item", item_code="Femke", item_name="Femke",
                item_group="All Item Groups", stock_uom="Nos")).insert(ignore_permissions=True)

    def test_exact_item(self):
        code, status, conf = resolve_item("Femke")
        self.assertEqual(code, "Femke"); self.assertEqual(status, "Matched")

    def test_unknown_item_is_unmatched(self):
        code, status, conf = resolve_item("Nonexistent Variety ZZZ")
        self.assertIsNone(code); self.assertEqual(status, "Unmatched")
```

- [ ] **Step 2: Run — Expected FAIL** (module missing).

- [ ] **Step 3: Implement**

```python
# matching.py
import frappe

def resolve_item(raw_variety):
    raw = (raw_variety or "").strip()
    if not raw: return None, "Unmatched", 0.0
    if frappe.db.exists("Item", raw):
        return raw, "Matched", 100.0
    exact = frappe.get_all("Item", filters={"item_name": raw}, pluck="name", limit=2)
    if len(exact) == 1: return exact[0], "Matched", 100.0
    like = frappe.get_all("Item", filters={"item_name": ["like", f"%{raw}%"]}, pluck="name", limit=2)
    if len(like) == 1: return like[0], "Fuzzy", 60.0
    return None, "Unmatched", 0.0

def resolve_customer(raw):
    raw = (raw or "").strip()
    if not raw: return None, "Unmatched"
    if frappe.db.exists("Customer", raw): return raw, "Matched"
    exact = frappe.get_all("Customer", filters={"customer_name": raw}, pluck="name", limit=2)
    if len(exact) == 1: return exact[0], "Matched"
    like = frappe.get_all("Customer", filters={"customer_name": ["like", f"%{raw}%"]}, pluck="name", limit=2)
    if len(like) == 1: return like[0], "Fuzzy"
    return None, "Unmatched"
```

- [ ] **Step 4: Run — Expected PASS.**
- [ ] **Step 5: Commit** `feat: exact-match customer/item resolvers`.

---

### Task 6: `extraction.py` — whitelisted `ingest_extraction(queue, payload)`

The FAC MCP agent calls this instead of hand-writing child rows, so validation + resolution + review-state live server-side and are testable. The agent's job shrinks to "produce the payload JSON".

**Files:**
- Create: `upande_ai/upande_ai/extraction.py`
- Test: `upande_ai/upande_ai/tests/test_extraction.py`

**Interfaces:**
- Consumes: `matching.resolve_customer/resolve_item`, doctypes from Tasks 3–4.
- Produces: `@frappe.whitelist() def ingest_extraction(queue: str, payload: dict|str) -> str` returning the new `Draft Order` name. `payload` schema: `{header:{...}, items:[{raw_text, raw_variety, custom_length, custom_packrate_mixed_box, custom_box_type, uom, conversion_factor, qty, stems, warehouse, custom_source_warehouse}], sources:[{source_doctype, source_name, role, received_on}], confidence, review_notes}`. Resolves each item + customer, sets match statuses, stores `raw_extraction`, links `queue.draft_order`, sets queue `status=Extracted` and logs a success attempt; on exception sets `status=Failed` + `last_error` and re-raises.

- [ ] **Step 1: Write failing test**

```python
# test_extraction.py
import json, frappe
from frappe.tests.utils import FrappeTestCase
from upande_ai.extraction import ingest_extraction

class TestExtraction(FrappeTestCase):
    def _queue(self):
        return frappe.get_doc(dict(doctype="Order Intake Queue", source_type="Email",
            source_doctype="Communication", source_name="c1",
            source_hash=frappe.generate_hash(length=10), status="Pending")).insert()

    def test_ingest_creates_linked_draft_and_marks_extracted(self):
        q = self._queue()
        payload = dict(header=dict(raw_customer="FASHION GARDEN", custom_order_name="GRD-ISKRA",
            delivery_date="2026-07-30"),
            items=[dict(raw_variety="Nonexistent ZZZ", qty=4, stems=40, uom="Bunch (10)",
                        conversion_factor=10)],
            sources=[], confidence=80, review_notes="")
        name = ingest_extraction(q.name, json.dumps(payload))
        d = frappe.get_doc("Draft Order", name)
        self.assertEqual(d.items[0].match_status, "Unmatched")  # unknown variety
        self.assertTrue(d.needs_review)
        q.reload()
        self.assertEqual(q.status, "Extracted")
        self.assertEqual(q.draft_order, name)
```

- [ ] **Step 2: Run — Expected FAIL.**

- [ ] **Step 3: Implement**

```python
# extraction.py
import json, frappe
from upande_ai.matching import resolve_customer, resolve_item

@frappe.whitelist()
def ingest_extraction(queue, payload):
    if isinstance(payload, str): payload = json.loads(payload)
    q = frappe.get_doc("Order Intake Queue", queue)
    q.db_set("status", "Processing")
    try:
        h = payload.get("header", {})
        cust, cstatus = resolve_customer(h.get("raw_customer"))
        d = frappe.new_doc("Draft Order")
        d.update({k: h.get(k) for k in h if d.meta.has_field(k)})
        d.raw_customer = h.get("raw_customer")
        d.customer = cust; d.customer_match_status = cstatus
        d.source_queue = q.name
        d.extraction_confidence = payload.get("confidence") or 0
        d.review_notes = payload.get("review_notes")
        d.raw_extraction = json.dumps(payload, indent=1)
        for it in payload.get("items", []):
            code, mstatus, conf = resolve_item(it.get("raw_variety"))
            row = {k: it.get(k) for k in it}
            row.update(item_code=code, match_status=mstatus, match_confidence=conf)
            d.append("items", row)
        for sname in payload.get("sources", []):
            d.append("sources", sname)
        d.insert(ignore_permissions=True)
        d.recompute_review()
        q.db_set("draft_order", d.name)
        q.db_set("status", "Extracted")
        q.reload(); q.log_attempt(agent=frappe.session.user, outcome="Success",
                                  confidence=d.extraction_confidence)
        return d.name
    except Exception as e:
        q.reload(); q.db_set("last_error", frappe.get_traceback())
        q.db_set("status", "Failed")
        q.log_attempt(agent=frappe.session.user, outcome="Failed", notes=str(e)[:140])
        raise
```

- [ ] **Step 4: Run — Expected PASS.**
- [ ] **Step 5: Commit** `feat: whitelisted extraction ingest endpoint`.

---

### Task 7: `confirm.py` — whitelisted `create_sales_order(draft_order)`

**Files:**
- Create: `upande_ai/upande_ai/confirm.py`
- Test: `upande_ai/upande_ai/tests/test_confirm.py`

**Interfaces:**
- Consumes: `Draft Order` (Task 4).
- Produces: `@frappe.whitelist() def create_sales_order(draft_order: str) -> str` → new `Sales Order` name (docstatus=0). Refuses if any item `match_status != "Matched"` or `d.customer` empty (raise `frappe.ValidationError` with a readable message). Maps header + line custom fields per spec §7, sets `delivery_date` on header AND each line, builds `Confirmed Stems` rows (farm from header `custom_farm`, `stems` per line, linked to the created `sales_order_item`), sets `d.sales_order`, `d.status=Confirmed`, queue `status=Confirmed`. Idempotent: if `d.sales_order` already set, returns it.
- Produces: `decode_server_messages(exc) -> str` helper (mirrors mcp-erpnext `_server_messages` decoding) used to write readable errors to the queue.

- [ ] **Step 1: Write failing test**

```python
# test_confirm.py
import frappe
from frappe.tests.utils import FrappeTestCase
from upande_ai.confirm import create_sales_order

class TestConfirm(FrappeTestCase):
    def test_refuses_unmatched_item(self):
        d = frappe.get_doc(dict(doctype="Draft Order", raw_customer="X",
            customer_match_status="Unmatched", status="Needs Review"))
        d.append("items", dict(raw_variety="ZZZ", match_status="Unmatched", qty=1))
        d.insert()
        with self.assertRaises(frappe.ValidationError):
            create_sales_order(d.name)

    def test_idempotent_returns_existing(self):
        d = frappe.get_doc(dict(doctype="Draft Order", raw_customer="X",
            customer="X", customer_match_status="Matched", status="Confirmed",
            sales_order="SO-EXISTING")).insert()
        self.assertEqual(create_sales_order(d.name), "SO-EXISTING")
```

*(Note: a full green-path SO-creation test requires seeded Customer/Item/Warehouse/price-list; add it as `test_confirm_greenpath` guarded by `frappe.db.exists` seeding, following Task 5's seed style. Include it — do not leave the happy path untested.)*

- [ ] **Step 2: Run — Expected FAIL.**

- [ ] **Step 3: Implement** (`create_sales_order` with the header map from spec §7, per-line map carrying every `custom_*` + `uom`/`conversion_factor` + header/line `delivery_date`, Confirmed Stems build, `insert()` only — no submit; wrap the `insert()` in try/except that writes `decode_server_messages` to the linked queue's `last_error`).

- [ ] **Step 4: Run — Expected PASS** (both refusal + idempotency; green-path passes with seeds).
- [ ] **Step 5: Commit** `feat: confirm Draft Order into draft Sales Order`.

---

### Task 8: `Repeat Order Template` + `Repeat Order Item` doctypes (no scheduler)

**Files:** child + master JSONs + `__init__.py`; test `test_repeat_order_template.py`.

**Interfaces:** `Repeat Order Template` (autoname `STO-.YYYY.-`): `template_name`(Data reqd), `customer`(Link Customer), `active`(Check), `frequency`(Select Daily/Weekly/Monthly), `daily_time`(Time), `weekly_day`(Select), `day_of_month`(Int), header default fields (`custom_business_unit`, `custom_farm`, `custom_consignee`, `custom_mode_of_transport`, `currency`, `selling_price_list`), `last_generated_on`(Datetime), `next_run_on`(Datetime), `items`(Table Repeat Order Item). `Repeat Order Item`: same resolved shape as Draft Order Item (`item_code`, `custom_length`, `custom_packrate_mixed_box`, `custom_box_type`, `uom`, `conversion_factor`, `qty`, `stems`, `warehouse`, `custom_source_warehouse`).

- [ ] **Step 1: Failing test** — assert a template with one item inserts and reads back its child row.
- [ ] **Step 2: Run — Expected FAIL.**
- [ ] **Step 3: Create JSONs** (no controller logic needed this phase).
- [ ] **Step 4: Migrate + test — Expected PASS.**
- [ ] **Step 5: Commit** `feat: Repeat Order Template doctype (scheduler deferred)`.

---

### Task 9: Ingestion hooks — `ingest.py` + `hooks.py` wiring

**Files:**
- Create: `upande_ai/upande_ai/ingest.py`
- Modify: `upande_ai/upande_ai/hooks.py` (`doc_events`, `scheduler_events`)
- Test: `upande_ai/upande_ai/tests/test_ingest.py`

**Interfaces:**
- Produces: `on_communication(doc, method=None)`, `on_whatsapp_message(doc, method=None)`, `enqueue_source(source_type, doc, matched_rule)`, `sweep_missed_sources()`, `retry_failed_intake()`.
- Rule (from frappe_whatsapp_chatbot): never raise (wrap + `frappe.log_error`); WhatsApp guard `type=="Incoming"` and `content_type in {text,document,image,order}`; email guard `sent_or_received=="Received"`; dedupe by `source_hash=doc.name`; first matching enabled rule by `priority desc`; insert queue row `status=Pending` and return.

- [ ] **Step 1: Write failing test**

```python
# test_ingest.py
import frappe
from frappe.tests.utils import FrappeTestCase
from upande_ai.ingest import enqueue_source

class TestIngest(FrappeTestCase):
    def setUp(self):
        if not frappe.db.exists("Order Detection Rule", "t-order"):
            frappe.get_doc(dict(doctype="Order Detection Rule", rule_name="t-order",
                enabled=1, source_type="Any", match_type="Contains", match_field="Body",
                keywords="order", priority=1)).insert()

    def test_enqueue_is_idempotent_on_source_name(self):
        class Fake:  # stand-in for a Communication doc
            name="COMM-1"; sender="a@b.com"; subject="please order"; content="please order"
        enqueue_source("Email", Fake(), "t-order")
        enqueue_source("Email", Fake(), "t-order")  # duplicate
        rows = frappe.get_all("Order Intake Queue", filters={"source_hash": "COMM-1"})
        self.assertEqual(len(rows), 1)
```

- [ ] **Step 2: Run — Expected FAIL.**

- [ ] **Step 3: Implement `ingest.py`** with the guards above; `enqueue_source` catches `DuplicateEntryError` and marks/ignores; `on_*` handlers select the rule via `Order Detection Rule.matches(...)`, wrapped so they never raise.

- [ ] **Step 4: Wire `hooks.py`**

```python
doc_events = {
    "Communication": {"after_insert": "upande_ai.ingest.on_communication"},
    "WhatsApp Message": {"after_insert": "upande_ai.ingest.on_whatsapp_message"},
}
scheduler_events = {
    "cron": {"*/10 * * * *": ["upande_ai.ingest.sweep_missed_sources"]},
    "hourly": ["upande_ai.ingest.retry_failed_intake"],
}
```

- [ ] **Step 5: Migrate + test — Expected PASS.**
- [ ] **Step 6: Commit** `feat: ingestion hooks (email + WhatsApp) with dedupe`.

---

### Task 10: Visibility web pages (`www/`) + dashboard data API

**Files:**
- Create: `upande_ai/upande_ai/api.py` (whitelisted read endpoints: `queue_feed(filters)`, `draft_detail(name)`, `ops_stats()`).
- Create: `www/order-desk.html` + `.py`, `www/order-review.html` + `.py`, `www/order-ops.html` + `.py`.
- Test: `upande_ai/upande_ai/tests/test_api.py` (assert `ops_stats()` returns counts by status; assert `draft_detail` returns items + source render data).

**Interfaces:** Frappe website pages under `/order-desk`, `/order-review?name=<draft>`, `/order-ops`; each `.py` `get_context` enforces role (`Order Desk User` for desk/review, `System Manager`/dev for ops) and passes data from `api.py`. Confirm button on `/order-review` calls `upande_ai.confirm.create_sales_order`.

- [ ] **Step 1: Failing test for `ops_stats()`** (counts Pending/Failed/Confirmed).
- [ ] **Step 2: Run — Expected FAIL.**
- [ ] **Step 3: Implement `api.py`** endpoints; **Step 4:** build the three pages (server-rendered lists + the review split-view calling the confirm method via `frappe.call`).
- [ ] **Step 5: Manual check** — `bench --site kaitet.local serve`, visit `/order-ops`, confirm cards render; run `test_api` — Expected PASS.
- [ ] **Step 6: Commit** `feat: order-desk/review/ops visibility pages`.

---

### Task 11: Roles, permissions, workspace + number cards (fixtures)

**Files:** Modify `hooks.py` (`fixtures`); create `fixtures/` exports for `Role` (`Order Desk User`, `Order Desk Manager`), `Workspace` (Order Automation), `Number Card`/`Dashboard Chart`.

- [ ] **Step 1:** Create the two roles on the dev site; assign doctype permissions (already declared in Task 2–4 JSONs — verify).
- [ ] **Step 2:** Build a Workspace "Order Automation" with shortcuts to the doctypes + the three pages + number cards (Pending / Failed today / Confirmed today / avg confidence).
- [ ] **Step 3:** `bench --site kaitet.local export-fixtures --app upande_ai`; declare `fixtures` in hooks.
- [ ] **Step 4:** Fresh-migrate check on a scratch or re-migrate; roles/workspace import cleanly.
- [ ] **Step 5: Commit** `feat: roles, workspace, dashboard cards`.

---

### Task 12: Deploy to kaitet-group (separate, gated)

**Not run during local build.** Documented for handoff.

- [ ] Push `upande_ai` to its git remote; on the kaitet-group bench `bench get-app` + `bench --site kaitet-group install-app upande_ai`; `bench --site kaitet-group migrate`.
- [ ] Verify prerequisite `Sales Order` / `Sales Order Item` / `Confirmed Stems` custom fields exist on kaitet-group (spec §10) before first confirm.
- [ ] Seed `Order Detection Rule`s for known buyers / subjects / WhatsApp `content_type=order`.
- [ ] Provision the `order-agent` user + API key (scoped roles per spec §9).
- [ ] Smoke test: drop a test order email → queue row appears → run the FAC agent → Draft Order → review page → confirm → draft Sales Order.

---

## Self-Review

**Spec coverage:** §3 architecture → Tasks 6/7/9/10; §4 doctypes → Tasks 2,3,4,8; §5 ingestion → Task 9; §6 extraction (server side of it) → Task 6 (the LLM agent itself is external, out of code scope — noted); §7 confirm→SO → Task 7; §8 web pages → Task 10; §9 roles/errors → Tasks 7,11; §10 deploy → Task 12; §11 phasing → repeat scheduler explicitly deferred (Task 8 note). No uncovered section.

**Placeholder scan:** green-path confirm test called out explicitly with seed instructions rather than left vague; no TBD/TODO remain.

**Type consistency:** `matches()`, `log_attempt()`, `recompute_review()`, `ingest_extraction()`, `resolve_customer/resolve_item`, `create_sales_order()`, `enqueue_source()` names are used identically across tasks. Draft Order / Sales Order custom field names match spec §4/§7 verbatim.

**Known gap (intentional):** the extraction *agent* (Claude prompt + FAC MCP orchestration) is not app code — it's an operational runbook that calls `ingest_extraction`. Flagged for a separate agent-runbook doc, not a code task here.
