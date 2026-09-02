# Backend Server Scripts (mirror)

Version-controlled copies of the Frappe **Server Scripts** that power the
Upande Production backend. If the scripts are ever lost on an instance, restore
them from here.

## Layout
- `scripts/<name>.json` — one file per Server Script (full definition: body +
  `script_type`, `api_method`, `doctype_event`, `reference_doctype`, `module`,
  `disabled`).
- `restore.py` — upserts every script in `scripts/` to a target instance over
  the REST API (creates if missing, updates if present).


## Restore via bench (no token needed - recommended)
From the bench host:
```bash
cd /home/jk/Projects/upande-local-bench
echo "exec(open('/home/jk/Projects/upande-production/backend/server_scripts/restore_via_bench.py').read())" \
    | bench --site kaitet.local console
```
This upserts every `scripts/*.json` (create if missing, update if present).
Use this if the REST API token is unavailable/expired.

## Restore (REST)
```bash
# uses /home/jk/Projects/upande-quality/.kaitet-credentials.json
python3 restore.py --instance local
# or explicit
python3 restore.py --url http://kaitet.local:8001 --token <api_key>:<api_secret>
# preview only / single script
python3 restore.py --instance local --dry-run
python3 restore.py --instance local --only productionGetGreenhouseSpec
```
Requires `server_script_enabled: 1` in the target site config.

## Back up (refresh the mirror from an instance)
Run the dump from the bench host:
```bash
cd /home/jk/Projects/upande-local-bench
echo "exec(open('backend_dump_server_scripts.py').read())" | bench --site kaitet.local console
```
(see `dump.md` for the snippet) — or just edit the JSON files directly; the body
is plain text under the `script` key.

## Notes
- `Bed Autocreation` and `Block Autocreation` are kept `disabled` — the current
  Crop Cycle model populates `individual_beds` via `Crop Cycle Range Validate`
  (Before Save), not the old `bed_numbers` / `block_numbers` tables.
- DocType Event scripts (`Crop Cycle Range Validate`, etc.) carry their
  `reference_doctype` + `doctype_event`; API scripts carry `api_method`.
