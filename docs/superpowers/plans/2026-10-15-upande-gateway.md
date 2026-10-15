# upande_gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `upande_gateway`, a standalone Frappe app that lets an operator reroute a registered whitelisted endpoint to a live-editable Server Script hotfix and back, with no deploy or restart after a one-time per-route registration step.

**Architecture:** Protecting a route costs one `override_whitelisted_methods` entry in the *owning* app's `hooks.py`, pointing at a single shared function, `upande_gateway.dispatch.resolve_and_call`. That function reads the client's originally-requested dotted path off `frappe.form_dict.cmd` (confirmed below to survive the override, straight from Frappe core source — this is not an assumption anymore), looks up a `Gateway Route` doc keyed by that path (cached, cache-busted on save), and either calls the real function (`Normal`) or executes a linked Server Script (`Override`) via Frappe's own `ServerScript.execute_method()` — reusing the exact mechanism the 13 legacy Server Scripts in `upande_quality` already use.

**Tech Stack:** Frappe v16.50.0 (this bench's installed version; `pyproject.toml` floor is `>=16.0.0,<=17.0.0`), Python, `bench` CLI, `frappe.tests.IntegrationTestCase`.

**Spec:** `/home/jk/Projects/upande-production/docs/superpowers/specs/2026-10-15-upande-gateway-design.md`

## Global Constraints

- `upande_gateway` has zero dependency on `upande_packhouse`, `upande_quality`, or any other app — no `required_apps` entry, no import of their code. (Spec §2.)
- Editing `Gateway Route` or `Server Script` is restricted to the **Script Manager** role — the exact role Frappe's own `Server Script` doctype already uses (`apps/frappe/frappe/core/doctype/server_script/server_script.json:170`), not a new, looser permission bar. (Spec §6.)
- A `Gateway Route` with `mode = Override` must have `override_script` set — enforced at save time, never discoverable only at call time. (Spec §7.)
- A protected route with no matching `Gateway Route` doc yet must fail open — call the real function exactly as if the gateway didn't exist. (Spec §7.)
- Hotfix Server Scripts created via "seed hotfix" must be left with `api_method` blank, so they are reachable only through the gateway's override path, never as an independent native Server-Script endpoint in their own right.
- `resolve_and_call` and `seed_hotfix` are `@frappe.whitelist()` with no `methods=` restriction (default allows GET/POST/PUT/DELETE — confirmed in `apps/frappe/frappe/__init__.py:454-455`), since one shared function must serve routes with different original HTTP-method restrictions.

## Review Focus

- A `Gateway Route` saved with `mode = Override` and no `override_script` — must be rejected by `validate()`, not merely discouraged. (Task 2)
- A protected function that reads `frappe.form_dict` directly with no named parameters (the dominant style in this fleet, e.g. `getBucketLogistics()`) — `resolve_and_call`'s Normal-mode path must still call it correctly with zero args, not just the typed-kwarg style. (Task 3)
- Saving a `Gateway Route` with only `notes` changed (mode/script unchanged) must **not** append a spurious `Gateway Route Log` row. (Task 2)
- An Override Server Script that raises an exception must propagate as an ordinary Frappe error response — not be swallowed or reported as if the Normal path had run. (Task 3)
- The very first call to a route after it's registered in `hooks.py` but before any `Gateway Route` doc exists for it must fail open to Normal, not throw. (Task 3)

---

## Task 1: Scaffold the app and install it on kaitet.local

**Files:**
- Create: `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/` (full `bench new-app` output)
- Modify: `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/upande_gateway/hooks.py:1-6`

**Interfaces:**
- Produces: an installed, empty Frappe app named `upande_gateway` on site `kaitet.local`, ready for doctypes in Task 2.

- [ ] **Step 1: Scaffold the app non-interactively**

Run from the bench root:

```bash
cd /home/jk/Projects/upande-local-bench-v16
printf 'Upande Gateway\nUpande Gateway Customizations\nUpande\ndev@upande.com\nmit\nn\n\n' | bench new-app upande_gateway --no-git
```

The piped lines answer, in order: App Title, App Description, App Publisher, App Email, App License, "Create GitHub Workflow action for unittests" (n), Branch Name (blank = accept default). This matches the exact prompt sequence in `apps/frappe/frappe/utils/boilerplate.py:44-61`. The publisher/email/license/description values match this fleet's existing convention exactly — see `apps/upande_packhouse/upande_packhouse/hooks.py:1-6`.

- [ ] **Step 2: Verify the generated hooks.py**

Open `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/upande_gateway/hooks.py` and confirm lines 1-6 read:

```python
app_name = "upande_gateway"
app_title = "Upande Gateway"
app_publisher = "Upande"
app_description = "Upande Gateway Customizations"
app_email = "dev@upande.com"
app_license = "mit"
```

Do not add `required_apps` — this app depends on nothing.

- [ ] **Step 3: Add package.json matching this fleet's convention**

Create `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/package.json` (`bench new-app` does not generate this file; it's a fleet-wide addition on top of the scaffold — see `apps/upande_packhouse/package.json` for the pattern this mirrors exactly):

```json
{
  "name": "upande_gateway",
  "version": "1.0.0",
  "description": "Upande Gateway Customizations",
  "private": true,
  "author": "Upande LTD <dev@upande.com>",
  "license": "MIT",
  "type": "commonjs",
  "scripts": {}
}
```

Note the deliberate difference from `hooks.py`: `license` here is `"MIT"` (uppercase) and `author` is the fuller `"Upande LTD <dev@upande.com>"` — this matches `upande_packhouse/package.json` byte-for-byte in shape, which uses different casing/format conventions for `hooks.py` (Python-side, consumed by `get_license_text()`, expects lowercase `"mit"`) versus `package.json` (npm-side convention, uppercase SPDX identifier) than hooks.py does. Don't "fix" this inconsistency — it's the existing fleet-wide pattern, not a typo.

- [ ] **Step 4: Install on kaitet.local**

```bash
cd /home/jk/Projects/upande-local-bench-v16
bench --site kaitet.local install-app upande_gateway
```

- [ ] **Step 5: Verify installation**

```bash
bench --site kaitet.local list-apps
```

Expected: `upande_gateway` appears in the output alongside `frappe`, `upande_packhouse`, `upande_quality`.

- [ ] **Step 6: Commit**

```bash
cd /home/jk/Projects/upande-local-bench-v16
git -C apps/upande_gateway add -A
git -C apps/upande_gateway commit -m "chore: scaffold upande_gateway app"
```

(This app was created with `--no-git`, so initialize git for it first if the scaffold step didn't: `git -C apps/upande_gateway init && git -C apps/upande_gateway add -A && git -C apps/upande_gateway commit -m "chore: scaffold upande_gateway app"`.)

---

## Task 2: Gateway Route and Gateway Route Log doctypes

**Files:**
- Create: `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/upande_gateway/upande_gateway/doctype/gateway_route_log/gateway_route_log.json`
- Create: `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/upande_gateway/upande_gateway/doctype/gateway_route_log/gateway_route_log.py`
- Create: `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/upande_gateway/upande_gateway/doctype/gateway_route_log/__init__.py`
- Create: `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/upande_gateway/upande_gateway/doctype/gateway_route/gateway_route.json`
- Create: `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/upande_gateway/upande_gateway/doctype/gateway_route/gateway_route.py`
- Create: `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/upande_gateway/upande_gateway/doctype/gateway_route/gateway_route.js`
- Create: `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/upande_gateway/upande_gateway/doctype/gateway_route/__init__.py`
- Create: `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/upande_gateway/upande_gateway/doctype/gateway_route/test_gateway_route.py`

**Interfaces:**
- Produces:
  - `GatewayRoute` document, name = the dotted path it protects (e.g. `upande_packhouse.mobile.api.allocateBuckets`), fields `mode` (`"Normal"`/`"Override"`), `override_script` (Link → Server Script), `notes`, `last_switched_by`, `last_switched_at`, child table `gateway_route_log`.
  - Cache key convention `f"upande_gateway:route:{route_name}"`, deleted in `GatewayRoute.on_update` — Task 3 relies on this exact key format.

- [ ] **Step 1: Create the doctype folders and `__init__.py` files**

```bash
cd /home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/upande_gateway/upande_gateway
mkdir -p doctype/gateway_route_log doctype/gateway_route
touch doctype/gateway_route_log/__init__.py doctype/gateway_route/__init__.py
```

- [ ] **Step 2: Write `gateway_route_log.json`**

```json
{
 "actions": [],
 "creation": "2026-10-15 00:00:00.000000",
 "doctype": "DocType",
 "editable_grid": 1,
 "engine": "InnoDB",
 "field_order": [
  "changed_at",
  "changed_by",
  "from_mode",
  "to_mode",
  "override_script",
  "note"
 ],
 "fields": [
  {
   "fieldname": "changed_at",
   "fieldtype": "Datetime",
   "label": "Changed At",
   "read_only": 1
  },
  {
   "fieldname": "changed_by",
   "fieldtype": "Data",
   "label": "Changed By",
   "read_only": 1
  },
  {
   "fieldname": "from_mode",
   "fieldtype": "Data",
   "label": "From Mode",
   "read_only": 1
  },
  {
   "fieldname": "to_mode",
   "fieldtype": "Data",
   "label": "To Mode",
   "read_only": 1
  },
  {
   "fieldname": "override_script",
   "fieldtype": "Data",
   "label": "Override Script",
   "read_only": 1
  },
  {
   "fieldname": "note",
   "fieldtype": "Small Text",
   "label": "Note",
   "read_only": 1
  }
 ],
 "index_web_pages_for_search": 1,
 "istable": 1,
 "links": [],
 "modified": "2026-10-15 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Upande Gateway",
 "name": "Gateway Route Log",
 "owner": "Administrator",
 "permissions": [],
 "row_format": "Dynamic",
 "sort_field": "creation",
 "sort_order": "DESC",
 "states": []
}
```

- [ ] **Step 3: Write `gateway_route_log.py`**

```python
import frappe
from frappe.model.document import Document


class GatewayRouteLog(Document):
	pass
```

- [ ] **Step 4: Write `gateway_route.json`**

```json
{
 "actions": [],
 "autoname": "Prompt",
 "creation": "2026-10-15 00:00:00.000000",
 "doctype": "DocType",
 "editable_grid": 1,
 "engine": "InnoDB",
 "field_order": [
  "mode",
  "override_script",
  "column_break_1",
  "last_switched_by",
  "last_switched_at",
  "notes_section",
  "notes",
  "log_section",
  "gateway_route_log"
 ],
 "fields": [
  {
   "default": "Normal",
   "fieldname": "mode",
   "fieldtype": "Select",
   "in_list_view": 1,
   "in_standard_filter": 1,
   "label": "Mode",
   "options": "Normal\nOverride",
   "reqd": 1
  },
  {
   "fieldname": "override_script",
   "fieldtype": "Link",
   "in_list_view": 1,
   "label": "Override Script",
   "options": "Server Script"
  },
  {
   "fieldname": "column_break_1",
   "fieldtype": "Column Break"
  },
  {
   "fieldname": "last_switched_by",
   "fieldtype": "Data",
   "label": "Last Switched By",
   "read_only": 1
  },
  {
   "fieldname": "last_switched_at",
   "fieldtype": "Datetime",
   "label": "Last Switched At",
   "read_only": 1
  },
  {
   "fieldname": "notes_section",
   "fieldtype": "Section Break",
   "label": "Notes"
  },
  {
   "fieldname": "notes",
   "fieldtype": "Small Text",
   "label": "Notes"
  },
  {
   "fieldname": "log_section",
   "fieldtype": "Section Break",
   "label": "Log"
  },
  {
   "fieldname": "gateway_route_log",
   "fieldtype": "Table",
   "label": "Log",
   "options": "Gateway Route Log",
   "read_only": 1
  }
 ],
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-10-15 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Upande Gateway",
 "name": "Gateway Route",
 "naming_rule": "Set by user",
 "owner": "Administrator",
 "permissions": [
  {
   "create": 1,
   "delete": 1,
   "email": 1,
   "export": 1,
   "print": 1,
   "read": 1,
   "report": 1,
   "role": "Script Manager",
   "share": 1,
   "write": 1
  }
 ],
 "row_format": "Dynamic",
 "sort_field": "creation",
 "sort_order": "DESC",
 "states": [],
 "track_changes": 1
}
```

- [ ] **Step 5: Write `gateway_route.py`**

```python
import frappe
from frappe.model.document import Document


def cache_key(route: str) -> str:
	return f"upande_gateway:route:{route}"


class GatewayRoute(Document):
	def validate(self):
		if self.mode == "Override" and not self.override_script:
			frappe.throw("Override Script is required when Mode is Override.")

	def before_save(self):
		if self.is_new():
			return

		previous = frappe.db.get_value(
			"Gateway Route", self.name, ["mode", "override_script"], as_dict=True
		)
		if not previous:
			return
		if previous.mode == self.mode and previous.override_script == self.override_script:
			return

		self.append(
			"gateway_route_log",
			{
				"changed_at": frappe.utils.now_datetime(),
				"changed_by": frappe.session.user,
				"from_mode": previous.mode,
				"to_mode": self.mode,
				"override_script": self.override_script,
				"note": self.notes,
			},
		)
		self.last_switched_by = frappe.session.user
		self.last_switched_at = frappe.utils.now_datetime()

	def on_update(self):
		frappe.cache().delete_value(cache_key(self.name))
```

- [ ] **Step 6: Write `gateway_route.js`**

```javascript
frappe.ui.form.on("Gateway Route", {
	refresh(frm) {
		if (frm.is_new()) {
			return;
		}
		frm.add_custom_button(__("Seed Hotfix From Current Implementation"), () => {
			frappe.call({
				method: "upande_gateway.api.seed_hotfix",
				args: { route: frm.doc.name },
				callback(r) {
					if (r.message) {
						frappe.set_route("Form", "Server Script", r.message);
					}
				},
			});
		});
	},
});
```

- [ ] **Step 7: Migrate so the doctypes exist in the database**

```bash
cd /home/jk/Projects/upande-local-bench-v16
bench --site kaitet.local migrate
```

- [ ] **Step 8: Write the failing tests**

Create `test_gateway_route.py`:

```python
import frappe
from frappe.tests import IntegrationTestCase


class IntegrationTestGatewayRoute(IntegrationTestCase):
	def tearDown(self):
		frappe.db.delete("Gateway Route", {"name": ["like", "test.gateway.route.%"]})
		frappe.db.delete("Server Script", {"name": ["like", "GW Test Script%"]})
		frappe.db.commit()

	def make_script(self, name="GW Test Script"):
		if frappe.db.exists("Server Script", name):
			return name
		doc = frappe.new_doc("Server Script")
		doc.name = name
		doc.script_type = "API"
		doc.script = 'frappe.response["message"] = {"ok": True}'
		doc.insert(ignore_permissions=True)
		return doc.name

	def test_override_requires_script(self):
		route = frappe.new_doc("Gateway Route")
		route.name = "test.gateway.route.requires_script"
		route.mode = "Override"
		with self.assertRaises(frappe.ValidationError):
			route.insert(ignore_permissions=True)

	def test_mode_change_appends_log_row(self):
		script = self.make_script()
		route = frappe.new_doc("Gateway Route")
		route.name = "test.gateway.route.logging"
		route.mode = "Normal"
		route.insert(ignore_permissions=True)

		route.reload()
		route.mode = "Override"
		route.override_script = script
		route.save(ignore_permissions=True)

		route.reload()
		self.assertEqual(len(route.gateway_route_log), 1)
		self.assertEqual(route.gateway_route_log[0].from_mode, "Normal")
		self.assertEqual(route.gateway_route_log[0].to_mode, "Override")

	def test_noop_save_does_not_append_log_row(self):
		route = frappe.new_doc("Gateway Route")
		route.name = "test.gateway.route.noop"
		route.mode = "Normal"
		route.insert(ignore_permissions=True)

		route.reload()
		route.notes = "just a note, mode unchanged"
		route.save(ignore_permissions=True)

		route.reload()
		self.assertEqual(len(route.gateway_route_log), 0)

	def test_save_busts_cache(self):
		from upande_gateway.upande_gateway.doctype.gateway_route.gateway_route import cache_key

		route = frappe.new_doc("Gateway Route")
		route.name = "test.gateway.route.cachebust"
		route.mode = "Normal"
		route.insert(ignore_permissions=True)

		frappe.cache().set_value(cache_key(route.name), {"mode": "Normal"}, expires_in_sec=300)
		route.mode = "Override"
		route.override_script = self.make_script()
		route.save(ignore_permissions=True)

		self.assertIsNone(frappe.cache().get_value(cache_key(route.name)))
```

- [ ] **Step 9: Run the tests and verify they pass**

```bash
cd /home/jk/Projects/upande-local-bench-v16
bench --site kaitet.local run-tests --module upande_gateway.upande_gateway.doctype.gateway_route.test_gateway_route
```

Expected: 4 passed.

- [ ] **Step 10: Commit**

```bash
git -C /home/jk/Projects/upande-local-bench-v16/apps/upande_gateway add -A
git -C /home/jk/Projects/upande-local-bench-v16/apps/upande_gateway commit -m "feat: add Gateway Route and Gateway Route Log doctypes"
```

---

## Task 3: `resolve_and_call` dispatcher

**Files:**
- Create: `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/upande_gateway/dispatch.py`
- Create: `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/upande_gateway/tests/__init__.py`
- Create: `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/upande_gateway/tests/test_dispatch.py`

**Interfaces:**
- Consumes: `Gateway Route` doctype and `cache_key(route)` from Task 2 (`upande_gateway.upande_gateway.doctype.gateway_route.gateway_route.cache_key`).
- Produces: `upande_gateway.dispatch.resolve_and_call(**kwargs)` — the function every protected route's `hooks.py` entry points at.

- [ ] **Step 1: Write the failing tests**

```python
import frappe
from frappe.tests import IntegrationTestCase

from upande_gateway.dispatch import resolve_and_call


@frappe.whitelist()
def _dummy_kwargs(name=None, farm=None):
	return {"via": "original", "name": name, "farm": farm}


@frappe.whitelist()
def _dummy_form_dict_reader():
	return {"via": "original", "farm": frappe.form_dict.get("farm")}


class IntegrationTestDispatch(IntegrationTestCase):
	def tearDown(self):
		frappe.db.delete("Gateway Route", {"name": ["like", "test.dispatch.%"]})
		frappe.db.delete("Server Script", {"name": ["like", "GW Dispatch Test%"]})
		frappe.db.commit()
		frappe.local.form_dict = frappe._dict()

	def call_as(self, route, **kwargs):
		frappe.local.form_dict = frappe._dict(cmd=route, **kwargs)
		return resolve_and_call(**frappe.local.form_dict)

	def test_no_gateway_route_fails_open_to_original(self):
		result = self.call_as(
			"upande_gateway.tests.test_dispatch._dummy_kwargs", name="Reflex", farm="Chepsito"
		)
		self.assertEqual(result, {"via": "original", "name": "Reflex", "farm": "Chepsito"})

	def test_normal_mode_calls_original_form_dict_reader(self):
		route = frappe.new_doc("Gateway Route")
		route.name = "test.dispatch.form_dict_reader"
		route.mode = "Normal"
		route.insert(ignore_permissions=True)

		result = self.call_as(
			"upande_gateway.tests.test_dispatch._dummy_form_dict_reader", farm="Torongo"
		)
		self.assertEqual(result, {"via": "original", "farm": "Torongo"})

	def test_override_mode_calls_server_script(self):
		script = frappe.new_doc("Server Script")
		script.name = "GW Dispatch Test Override"
		script.script_type = "API"
		script.script = 'frappe.response["message"] = {"via": "override"}'
		script.insert(ignore_permissions=True)

		route = frappe.new_doc("Gateway Route")
		route.name = "test.dispatch.override"
		route.mode = "Override"
		route.override_script = script.name
		route.insert(ignore_permissions=True)

		result = self.call_as(
			"upande_gateway.tests.test_dispatch._dummy_kwargs", name="X", farm="Y"
		)
		self.assertEqual(result, {"via": "override"})

	def test_broken_override_script_raises(self):
		script = frappe.new_doc("Server Script")
		script.name = "GW Dispatch Test Broken"
		script.script_type = "API"
		script.script = "raise Exception('deliberately broken hotfix')"
		script.insert(ignore_permissions=True)

		route = frappe.new_doc("Gateway Route")
		route.name = "test.dispatch.broken"
		route.mode = "Override"
		route.override_script = script.name
		route.insert(ignore_permissions=True)

		with self.assertRaises(Exception):
			self.call_as("upande_gateway.tests.test_dispatch._dummy_kwargs", name="X", farm="Y")

	def test_cache_bust_takes_effect_on_next_call(self):
		route = frappe.new_doc("Gateway Route")
		route.name = "test.dispatch.flip"
		route.mode = "Normal"
		route.insert(ignore_permissions=True)

		result = self.call_as(
			"upande_gateway.tests.test_dispatch._dummy_kwargs", name="A", farm="B"
		)
		self.assertEqual(result["via"], "original")

		script = frappe.new_doc("Server Script")
		script.name = "GW Dispatch Test Flip"
		script.script_type = "API"
		script.script = 'frappe.response["message"] = {"via": "override"}'
		script.insert(ignore_permissions=True)

		route.reload()
		route.mode = "Override"
		route.override_script = script.name
		route.save(ignore_permissions=True)

		result = self.call_as(
			"upande_gateway.tests.test_dispatch._dummy_kwargs", name="A", farm="B"
		)
		self.assertEqual(result["via"], "override")
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/jk/Projects/upande-local-bench-v16
bench --site kaitet.local run-tests --module upande_gateway.tests.test_dispatch
```

Expected: FAIL / ImportError — `upande_gateway.dispatch` does not exist yet.

- [ ] **Step 3: Write `dispatch.py`**

```python
import frappe

from upande_gateway.upande_gateway.doctype.gateway_route.gateway_route import cache_key


def _get_route_state(route: str) -> dict:
	cache = frappe.cache()
	key = cache_key(route)
	cached = cache.get_value(key)
	if cached is not None:
		return cached

	state = (
		frappe.db.get_value("Gateway Route", route, ["mode", "override_script"], as_dict=True)
		or {}
	)
	cache.set_value(key, state, expires_in_sec=300)
	return state


@frappe.whitelist()
def resolve_and_call(**kwargs):
	"""Shared target for every route protected via `override_whitelisted_methods`.

	Frappe still carries the client's originally-requested dotted path on
	`frappe.form_dict.cmd` even once dispatch has been overridden
	(`frappe/handler.py:68` reassigns only the local `cmd` variable inside
	`execute_cmd`, never `frappe.local.form_dict.cmd` itself) — confirmed
	against this bench's installed frappe v16.50.0 source, not assumed.
	"""
	route = frappe.form_dict.get("cmd")
	if not route:
		frappe.throw("upande_gateway.dispatch.resolve_and_call was called without a cmd")

	state = _get_route_state(route)

	if state.get("mode") == "Override" and state.get("override_script"):
		response = frappe.get_doc("Server Script", state["override_script"]).execute_method()
		# Mirrors frappe/handler.py:90-97 exactly: some scripts return output
		# via frappe.flags (non-empty dict), others set frappe.response
		# directly and return {} — don't overwrite frappe.response in that case.
		if response != {}:
			return response
		return

	return frappe.call(route, **frappe.form_dict)
```

- [ ] **Step 4: Run the tests and verify they pass**

```bash
cd /home/jk/Projects/upande-local-bench-v16
bench --site kaitet.local run-tests --module upande_gateway.tests.test_dispatch
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git -C /home/jk/Projects/upande-local-bench-v16/apps/upande_gateway add -A
git -C /home/jk/Projects/upande-local-bench-v16/apps/upande_gateway commit -m "feat: add resolve_and_call dispatcher"
```

---

## Task 4: Seed-hotfix helper

**Files:**
- Create: `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/upande_gateway/api.py`
- Modify: `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/upande_gateway/tests/test_api.py`

**Interfaces:**
- Consumes: nothing new from earlier tasks besides `Gateway Route` existing as a doctype (Task 2).
- Produces: `upande_gateway.api.seed_hotfix(route)` — called by `gateway_route.js`'s custom button (Task 2, Step 6).

- [ ] **Step 1: Write the failing tests**

Create `test_api.py`:

```python
import frappe
from frappe.tests import IntegrationTestCase

from upande_gateway.api import seed_hotfix


@frappe.whitelist()
def _sample_protected_fn(farm=None):
	if not farm:
		return {"ok": False}
	return {"ok": True, "farm": farm}


class IntegrationTestSeedHotfix(IntegrationTestCase):
	def tearDown(self):
		frappe.db.delete("Gateway Route", {"name": ["like", "test.seed.%"]})
		frappe.db.delete("Server Script", {"script": ["like", "%_sample_protected_fn%"]})
		frappe.db.commit()

	def test_seed_hotfix_creates_server_script_with_banner_and_body(self):
		route = frappe.new_doc("Gateway Route")
		route.name = "test.seed.fn"
		route.mode = "Normal"
		route.insert(ignore_permissions=True)

		import upande_gateway.tests.test_api as this_module

		script_name = seed_hotfix(f"{this_module.__name__}._sample_protected_fn")
		script = frappe.get_doc("Server Script", script_name)

		self.assertEqual(script.script_type, "API")
		self.assertEqual(script.api_method, "")
		# The banner instructs manual cleanup (replace `return`, drop the
		# `def` line) — seed_hotfix deliberately does not attempt that
		# rewrite itself (fragile for arbitrary real functions), so the
		# raw `def` line and `return` are expected to still be present here.
		self.assertIn("upande_gateway seed: review before use", script.script)
		self.assertIn("def _sample_protected_fn(farm=None):", script.script)
		self.assertIn("if not farm:", script.script)

	def test_seed_hotfix_requires_existing_route(self):
		with self.assertRaises(frappe.ValidationError):
			seed_hotfix("test.seed.does_not_exist")
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/jk/Projects/upande-local-bench-v16
bench --site kaitet.local run-tests --module upande_gateway.tests.test_api
```

Expected: FAIL / ImportError — `upande_gateway.api` does not exist yet.

- [ ] **Step 3: Write `api.py`**

```python
import inspect
import textwrap

import frappe

HOTFIX_BANNER = (
	"# --- upande_gateway seed: review before use ---\n"
	"# This body was copied from the live function below. Server Scripts\n"
	'# cannot use `return` or a `def` wrapper at the top level: replace any\n'
	'# `return X` with `frappe.response["message"] = X`, drop the function\n'
	"# signature line, and keep the body dedented, before switching this\n"
	"# route to Override.\n"
	"# ---\n"
)


@frappe.whitelist()
def seed_hotfix(route: str) -> str:
	frappe.only_for("Script Manager")

	if not frappe.db.exists("Gateway Route", route):
		frappe.throw(f"No Gateway Route named {route}")

	fn = inspect.unwrap(frappe.get_attr(route))
	source = textwrap.dedent(inspect.getsource(fn))

	script = frappe.new_doc("Server Script")
	script.script_type = "API"
	script.module = "Upande Gateway"
	script.api_method = ""
	script.script = HOTFIX_BANNER + source
	script.insert()

	return script.name
```

- [ ] **Step 4: Run the tests and verify they pass**

```bash
cd /home/jk/Projects/upande-local-bench-v16
bench --site kaitet.local run-tests --module upande_gateway.tests.test_api
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git -C /home/jk/Projects/upande-local-bench-v16/apps/upande_gateway add -A
git -C /home/jk/Projects/upande-local-bench-v16/apps/upande_gateway commit -m "feat: add seed_hotfix helper"
```

---

## Task 5: End-to-end self-test on kaitet.local

This proves the entire mechanism — `hooks.py` registration, Normal dispatch, flipping to Override, and rolling back — against the real, running dev bench, using a deliberately synthetic, zero-risk route. It does **not** touch any real `upande_packhouse`/`upande_quality` endpoint; which real production route to protect first is an open question for the user (see Open Questions below), to be done as a follow-up task once this self-test is green.

**Files:**
- Create: `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/upande_gateway/selftest.py`
- Modify: `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/upande_gateway/hooks.py`

**Interfaces:**
- Consumes: `upande_gateway.dispatch.resolve_and_call` (Task 3).
- Produces: a live, curl-able proof point — `upande_gateway.selftest.ping`.

- [ ] **Step 1: Write the self-test route**

```python
import frappe


@frappe.whitelist()
def ping():
	return {"pong": True, "via": "original"}
```

- [ ] **Step 2: Register it in hooks.py**

Append to `/home/jk/Projects/upande-local-bench-v16/apps/upande_gateway/upande_gateway/hooks.py`:

```python
override_whitelisted_methods = {
	"upande_gateway.selftest.ping": "upande_gateway.dispatch.resolve_and_call",
}
```

- [ ] **Step 3: Restart so the new hooks.py entry is loaded**

```bash
cd /home/jk/Projects/upande-local-bench-v16
bench --site kaitet.local clear-cache
bench restart
```

- [ ] **Step 4: Confirm Normal mode (no Gateway Route doc yet — fail-open path)**

```bash
curl -s http://kaitet.local:8001/api/method/upande_gateway.selftest.ping \
  -H "Authorization: token <api_key>:<api_secret>"
```

Expected: `{"message": {"pong": true, "via": "original"}}`.

- [ ] **Step 5: Create the Gateway Route doc (mode Normal) and confirm behavior is unchanged**

Via Desk (or `bench --site kaitet.local console`):

```python
import frappe
route = frappe.new_doc("Gateway Route")
route.name = "upande_gateway.selftest.ping"
route.mode = "Normal"
route.insert()
frappe.db.commit()
```

Re-run the Step 4 curl command. Expected: identical response.

- [ ] **Step 6: Create a hotfix Server Script and flip to Override**

```python
import frappe
script = frappe.new_doc("Server Script")
script.name = "Selftest Ping Hotfix"
script.script_type = "API"
script.script = 'frappe.response["message"] = {"pong": True, "via": "override"}'
script.insert()

route = frappe.get_doc("Gateway Route", "upande_gateway.selftest.ping")
route.mode = "Override"
route.override_script = script.name
route.save()
frappe.db.commit()
```

- [ ] **Step 7: Confirm Override takes effect with no restart**

```bash
curl -s http://kaitet.local:8001/api/method/upande_gateway.selftest.ping \
  -H "Authorization: token <api_key>:<api_secret>"
```

Expected: `{"message": {"pong": true, "via": "override"}}` — proves the cache-bust-on-save (Task 2) makes the switch instant.

- [ ] **Step 8: Roll back and confirm reversion**

```python
import frappe
route = frappe.get_doc("Gateway Route", "upande_gateway.selftest.ping")
route.mode = "Normal"
route.save()
frappe.db.commit()
```

Re-run the Step 4 curl command. Expected: back to `{"message": {"pong": true, "via": "original"}}`.

- [ ] **Step 9: Confirm the audit log**

```python
import frappe
route = frappe.get_doc("Gateway Route", "upande_gateway.selftest.ping")
for row in route.gateway_route_log:
	print(row.from_mode, "->", row.to_mode, row.changed_by, row.changed_at)
```

Expected: two rows — Normal→Override, then Override→Normal.

- [ ] **Step 10: Commit**

```bash
git -C /home/jk/Projects/upande-local-bench-v16/apps/upande_gateway add -A
git -C /home/jk/Projects/upande-local-bench-v16/apps/upande_gateway commit -m "test: add end-to-end selftest route for upande_gateway"
```

---

## Open Questions

1. **Which real endpoint should be the first pilot route?** The user named allocation as the motivating example but said packhouse/quality were "just examples" — the actual first candidate(s) to wrap in production, in the owning app's own `hooks.py`, need to be chosen before that follow-up work is scoped.
2. **Who holds the Script Manager role today?** The plan assumes this role already exists and is assigned to the right operators (it's a Frappe core role used by Server Script); confirm who should get it for `Gateway Route` access before this goes beyond the dev bench.
