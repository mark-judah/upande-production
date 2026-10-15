# upande_gateway — Design Spec

Date: 2026-10-15
Status: Draft, pending user review

## 1. Problem

The Upande fleet's Frappe backends (`upande_packhouse`, `upande_quality`, and
others such as `upande_agriculture`) are live, actively-used production
systems. When a deployed whitelisted endpoint has a bug, the fix cannot ship
immediately — deploys are restricted to safe windows because the system is in
active use, not because of a scheduling policy. Today the only way to patch
a misbehaving endpoint is: wait for a deploy window, ship a code change, and
restart. There is no way to apply a quick fix or revert to known-good
behavior in the meantime.

Separately, this codebase already has (and is slowly migrating away from) a
precedent for live-editable backend logic: Frappe's core **Server Script**
doctype (type "API"). `upande_quality` still runs 13 such scripts today,
defined and edited entirely through the Desk UI, with no deploy or restart
required for a change to take effect.

## 2. Goal

Build a small, standalone Frappe app, **`upande_gateway`**, that lets an
operator instantly reroute a chosen, pre-registered endpoint from its normal
compiled implementation to a live-editable Server Script "hotfix" — and back
— with zero deploy, zero restart, and (after one one-time registration step
per endpoint) zero further code changes. This turns an incident that would
otherwise require an out-of-window deploy into a Desk-side configuration
change.

`upande_gateway` must be fully generic: it has no dependency on and no
knowledge of `upande_packhouse`, `upande_quality`, or any other app. Any
Frappe app in the fleet — present or future — can opt an endpoint in.

## 3. Non-goals

- Routing/switching among multiple pre-deployed Python implementations of an
  endpoint (that would require anticipating variants in advance; the actual
  ask here is "let me patch it live right now, after I've already found the
  bug").
- Protecting all ~356 existing whitelisted endpoints up front. Initial
  rollout is an opt-in pilot set, chosen by the user, wrapped one at a time.
- A general request router / load balancer for traffic shaping, rate
  limiting, or blue-green deployment. This is strictly an emergency-override
  mechanism for backend logic bugs.
- Any change to how the mobile/desk clients resolve or call endpoints.
  Dotted paths the clients already call do not change.

## 4. How it works

### 4.1 Registering a route (one-time, per endpoint, needs a normal deploy)

The owning app adds one entry to its own `hooks.py`:

```python
override_whitelisted_methods = {
    "upande_packhouse.mobile.api.allocateBuckets": "upande_gateway.dispatch.resolve_and_call",
}
```

This is Frappe's native override hook — no decorator is added to the
function, no file containing the real function is touched, nothing about
the function's own module changes. This one line, in a file the owning app
already has, is the entire "touch" required to make a route protectable,
and it is a one-time cost per route, not a recurring one.

A `Gateway Route` document is then created (name = the dotted path itself,
e.g. `upande_packhouse.mobile.api.allocateBuckets`) to register it in the
gateway's own registry. Until a `Gateway Route` doc exists for a given path,
`resolve_and_call` falls through to calling the original function directly
(fail-open to normal behavior), so a hooks.py registration with no matching
`Gateway Route` doc yet is harmless.

### 4.2 Normal operation

`frappe.form_dict.cmd` still carries the originally-requested dotted path
even when dispatch has been overridden (to be confirmed against the actual
v16 dispatcher during implementation — see §8). `resolve_and_call` reads it,
looks up the matching `Gateway Route` (cached; see §4.5), finds
`mode = Normal`, and calls the real function via
`frappe.get_attr(path)(**frappe.form_dict)` with `cmd` stripped out —
functionally identical to the client having called it directly.

### 4.3 Flipping to an override (the incident-response path)

1. An operator (System Manager-equivalent role — see §6) opens the route's
   `Gateway Route` document in Desk.
2. They click **"Seed hotfix from current implementation"**, which pulls the
   real function's source via `inspect.getsource()` and creates a new,
   pre-filled Server Script (type API) — so the fix starts from the actual
   broken code, not a blank page.
3. They edit the Server Script body in the ordinary Desk Server Script
   editor and save it. This step already requires no deploy or restart —
   it is ordinary Frappe behavior, unchanged.
4. They set the `Gateway Route`'s `mode` to `Override`, pick that script,
   and save.
5. The very next call to that route executes the Server Script's body
   instead of the original function (`ServerScript.execute_method()` —
   reusing Frappe's own sandboxed execution path, not a new one).

### 4.4 Rolling back

Flip `mode` back to `Normal` and save. Takes effect on the next call. No
deploy, no restart, reversible by the same operator who flipped it, with no
dependency on anyone else's availability.

### 4.5 Instant effect (cache busting)

`resolve_and_call` reads route state from `frappe.cache()`, keyed by route
path. `Gateway Route`'s `on_update` hook deletes that cache key, so a saved
change is visible to the very next request — this is the mechanism that
makes the switch "instant" rather than requiring a worker restart.

## 5. Data model

### `Gateway Route` (standard doctype)

| Field | Type | Notes |
|---|---|---|
| `name` | — | autoname, literally the dotted path, e.g. `upande_packhouse.mobile.api.allocateBuckets` |
| `mode` | Select (`Normal`, `Override`) | default `Normal` |
| `override_script` | Link → Server Script | filtered to `script_type = API`; required when `mode = Override` (enforced in `validate()`) |
| `notes` | Small Text | free-form, e.g. "incident ref", "reason for override" |
| `last_switched_by` | Data, read-only | auto-set |
| `last_switched_at` | Datetime, read-only | auto-set |

### `Gateway Route Log` (child table on `Gateway Route`)

| Field | Type | Notes |
|---|---|---|
| `changed_at` | Datetime | auto |
| `changed_by` | Data | auto, from `frappe.session.user` |
| `from_mode` / `to_mode` | Data | |
| `override_script` | Data | snapshot of the script linked at that point, if any |
| `note` | Small Text | copied from the route's `notes` at save time |

Appended automatically in `before_save` by diffing against the DB values —
never hand-edited. This is the full audit trail: who switched what, when,
and to what.

## 6. Permissions

Editing `Gateway Route` and `Server Script` is restricted to the same role
bar Frappe already enforces for Server Script editing (effectively System
Manager). This tool is, by design, live code injection into production
request handling — it must not open a lower-privilege path to that
capability than already exists for Server Script today.

## 7. Error handling

- **Misconfiguration is rejected at save time**, not at call time:
  `mode = Override` without `override_script` set cannot be saved.
- **A broken hotfix fails like any other endpoint bug** — Frappe surfaces
  the exception normally. Recovery is the same one-step rollback as §4.4,
  available to the same operator, not dependent on a deploy.
- **No `Gateway Route` doc yet for a registered path** → fail-open, call the
  real function directly (see §4.1). A route that's registered in hooks.py
  but never had its gateway doc created behaves exactly as if the gateway
  didn't exist.

## 8. Open technical assumption to validate during implementation

The design depends on `frappe.form_dict.cmd` (or equivalent) still holding
the client's originally-requested dotted path when a request has been
redirected via `override_whitelisted_methods`, so that one shared
`resolve_and_call` function can serve every protected route without a
per-route wrapper. This should be confirmed directly against the installed
Frappe version on kaitet-group/local v16 bench before implementation
proceeds past the first pilot route. If it does not hold, the fallback is a
tiny one-line per-route wrapper function (still no change to the original
function's file) instead of one shared resolver — strictly more lines, same
overall design.

## 9. Testing

- Controller tests for `Gateway Route`: `validate()` rejects
  `Override` without a script; `before_save` appends exactly one log row per
  actual change, none on a no-op save.
- A dispatch-level test: register a dummy whitelisted function behind
  `resolve_and_call` in a throwaway test route, flip to Override pointing at
  a trivial Server Script, assert the override's response is returned
  instead of the real function's; flip back, assert reversion.
- Manual smoke test on kaitet-group, for the first real pilot route, using
  this session's established verification pattern (deploy, call the live
  endpoint, confirm response) before and after each flip.

## 10. Rollout

Ship the app and mechanism generically first. Pilot set of protected routes
is chosen by the user afterward, one route at a time (opt-in, per §3), each
costing one `hooks.py` line + one deploy, after which that route is
permanently Desk-switchable with no further deploys ever required for an
override or rollback on it.
