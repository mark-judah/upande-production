# Restore all server scripts from ./scripts/*.json into a Frappe site, using bench
# (no API token needed). Run from the bench directory:
#
#   echo "exec(open('/home/jk/Projects/upande-production/backend/server_scripts/restore_via_bench.py').read())" \
#       | bench --site kaitet.local console
#
def _run():
    import json, os
    d = "/home/jk/Projects/upande-production/backend/server_scripts/scripts"
    FIELDS = ["script_type", "api_method", "doctype_event", "reference_doctype", "module", "disabled", "script"]
    created = []
    updated = []
    for f in sorted(os.listdir(d)):
        if not f.endswith(".json"):
            continue
        rec = json.load(open(os.path.join(d, f)))
        name = rec["name"]
        if frappe.db.exists("Server Script", name):
            doc = frappe.get_doc("Server Script", name)
            for k in FIELDS:
                doc.set(k, rec.get(k))
            doc.save(ignore_permissions=True)
            updated.append(name)
        else:
            payload = {"doctype": "Server Script", "name": name}
            for k in FIELDS:
                payload[k] = rec.get(k)
            frappe.get_doc(payload).insert(ignore_permissions=True)
            created.append(name)
    frappe.db.commit()
    print("RESTORE created=" + str(len(created)) + " updated=" + str(len(updated)))
    if created:
        print("  new: " + ", ".join(sorted(created)))
_run()
