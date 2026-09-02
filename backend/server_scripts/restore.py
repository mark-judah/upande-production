#!/usr/bin/env python3
"""
Restore / sync Frappe Server Scripts from this folder to an instance.

Each scripts/*.json is the full definition of one Server Script. This tool
upserts them via the REST API (create if missing, update if present) so the
backend can always be rebuilt from the codebase.

Usage:
  python3 restore.py --instance local                 # uses .kaitet-credentials.json
  python3 restore.py --url http://kaitet.local:8001 --token KEY:SECRET
  python3 restore.py --instance local --only productionGetGreenhouseSpec
  python3 restore.py --instance local --dry-run
"""
import argparse, json, os, sys, urllib.parse, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS_DIR = os.path.join(HERE, "scripts")
CREDS = "/home/jk/Projects/upande-quality/.kaitet-credentials.json"
FIELDS = ["script_type", "api_method", "doctype_event", "reference_doctype", "module", "disabled", "script"]


def resolve_instance(instance):
    c = json.load(open(CREDS))["instances"][instance]
    return c["url"].rstrip("/"), c["api_key"] + ":" + c["api_secret"]


def req(url, token, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method,
                               headers={"Authorization": "token " + token,
                                        "Content-Type": "application/json"})
    return urllib.request.urlopen(r, timeout=60)


def exists(base, token, name):
    url = base + "/api/resource/Server%20Script/" + urllib.parse.quote(name, safe="")
    try:
        req(url, token, "GET"); return True
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        raise


def upsert(base, token, rec, dry):
    name = rec["name"]
    payload = {k: rec.get(k) for k in FIELDS}
    if dry:
        print("  would " + ("update" if exists(base, token, name) else "create") + ": " + name)
        return "dry"
    if exists(base, token, name):
        url = base + "/api/resource/Server%20Script/" + urllib.parse.quote(name, safe="")
        req(url, token, "PUT", payload)
        return "updated"
    body = dict(payload); body["doctype"] = "Server Script"; body["name"] = name
    req(base + "/api/resource/Server%20Script", token, "POST", body)
    return "created"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--instance", choices=["local", "group", "cloud"])
    ap.add_argument("--url"); ap.add_argument("--token")
    ap.add_argument("--only", help="restore a single script by name")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if a.instance:
        base, token = resolve_instance(a.instance)
    elif a.url and a.token:
        base, token = a.url.rstrip("/"), a.token
    else:
        sys.exit("Provide --instance OR --url and --token")
    files = sorted(f for f in os.listdir(SCRIPTS_DIR) if f.endswith(".json"))
    counts = {"created": 0, "updated": 0, "dry": 0, "error": 0}
    for f in files:
        rec = json.load(open(os.path.join(SCRIPTS_DIR, f)))
        if a.only and rec["name"] != a.only:
            continue
        try:
            r = upsert(base, token, rec, a.dry_run)
            counts[r] = counts.get(r, 0) + 1
            print("[" + r + "] " + rec["name"])
        except urllib.error.HTTPError as e:
            counts["error"] += 1
            print("[error] " + rec["name"] + " -> " + str(e.code) + " " + e.read().decode()[:200])
        except Exception as e:
            counts["error"] += 1
            print("[error] " + rec["name"] + " -> " + str(e)[:200])
    print("done:", counts)


if __name__ == "__main__":
    main()
