# ==========================================================================
#  SIMULATE HARVEST RECEIVING + SHELVING   —  System Console edition
#
#  Desk -> System Console -> Type: Python -> paste -> Run.
#  Tick "Commit" so the console keeps the transaction (this script also calls
#  frappe.db.commit() itself when it writes).
#
#  For each variety it does the FULL flow, for both Spray and Standard roses:
#     1. HARVEST RECEIVING — a submitted "Harvesting" Stock Entry (Material
#        Receipt) that brings the stems into the greenhouse warehouse. This is
#        the real stock ledger movement.
#     2. A Bucket QR Code, linked to that receiving entry (last_stock_entry).
#     3. A Shelf Item row placing the graded bucket on that farm's shelves.
#        Saving the Shelf fires the existing "Log Shelving Events" Server Script,
#        which writes the "Shelved" Shelving Log rows itself — we never write those.
#  Bucket Allocation Status is deliberately not created; that is produced at
#  allocation time by the Sales Allocation page.
#
#  Everything is tagged with MARKER so CLEANUP can remove it again (it cancels
#  and deletes the simulated Stock Entries too).
#
#  IMPORTANT — System Console runs under RestrictedPython (safe_exec):
#     * no import statements (frappe is already in scope)
#     * no print() — use log()
#     * names may not start with "_"
#     * "".format() is blocked — use %-formatting only
#     * frappe.db.delete / write-SQL / augmented item assignment are blocked
#  This version obeys all of that.
#
#  NOTE — CLEANUP cancels the submitted receiving Stock Entries, which makes
#  ERPNext enqueue a stock-repost job. That needs the bench's redis queue to be
#  up (run the full `bench start`, or at least `redis-server config/redis_queue.conf`);
#  otherwise CLEANUP errors on the cancel. Creating stock (DRY_RUN=False) does not
#  need the queue. Varieties are auto-picked from the CHILD groups under each
#  AUTO_GROUPS entry (items rarely sit on the parent group itself).
# ==========================================================================

# ----------------------------- CONFIG (edit me) -----------------------------
BUCKETS_PER_VARIETY = 5                          # buckets to receive + shelve per variety
STEMS_PER_BUCKET    = 40                         # stems in each bucket
FARM                = "Kapkolia"                 # farm the harvest is received at

STEM_LENGTHS        = ["42CM", "52CM", "62CM"]   # cycled across a variety's buckets
CUT_STAGE           = "2.0-2.5"                  # used only if it exists as a Cut Stage
BUSINESS_UNIT       = "Roses"                    # mandatory on the harvest Stock Entry

VARIETIES           = ["Giselle", "Athena", "Mirabel", "Marisa", "Moonwalk"]   # empty = auto-pick from AUTO_GROUPS
AUTO_GROUPS         = ["Standard Roses", "Spray Roses"]   # both groups get represented
AUTO_LIMIT          = 6                          # total varieties (split across the groups)

DRY_RUN             = True                       # True = show the plan, write nothing
CLEANUP             = False                      # True = undo a previous run, then stop
MARKER              = "SIMBKT"                   # id prefix / tag for simulated data
# ---------------------------------------------------------------------------

lines = []
DASH = "-" * 60

# =============================== CLEANUP ===================================
if CLEANUP:
    buckets = frappe.get_all("Bucket QR Code", filters={"id": ["like", MARKER + "-%"]}, pluck="name")
    lines.append("CLEANUP - %s simulated buckets tagged '%s'" % (len(buckets), MARKER))

    # receiving Stock Entries these buckets point at, plus any tagged batch
    se_names = []
    for r in frappe.get_all("Bucket QR Code", filters={"id": ["like", MARKER + "-%"]},
                            fields=["name", "last_stock_entry"]):
        if r.last_stock_entry and r.last_stock_entry not in se_names:
            se_names.append(r.last_stock_entry)
    for r in frappe.get_all("Stock Entry", filters={"custom_receiving_batch_id": ["like", MARKER + "-%"]},
                            pluck="name"):
        if r not in se_names:
            se_names.append(r)

    if not buckets and not se_names:
        lines.append("Nothing to remove.")
    else:
        # 1) drop Shelf Item child rows by re-saving their parent shelves
        removed_rows = 0
        touched = 0
        if buckets:
            for shelf_name in frappe.get_all("Shelf", pluck="name", order_by="name"):
                shelf = frappe.get_doc("Shelf", shelf_name)
                kept = []
                hits = 0
                for row in shelf.items:
                    if row.bucket_id and row.bucket_id in buckets:
                        hits = hits + 1
                    else:
                        kept.append(row)
                if hits:
                    shelf.set("items", kept)
                    shelf.flags.ignore_permissions = True
                    shelf.save(ignore_permissions=True)
                    removed_rows = removed_rows + hits
                    touched = touched + 1
        lines.append("Removed %s Shelf Item rows across %s shelves." % (removed_rows, touched))

        # 1b) delete shelves this tool auto-created (empty now that their items are gone)
        killed_shelves = 0
        for sname in frappe.get_all("Shelf", filters={"shelf_id": ["like", "%" + MARKER + "-SHELF-%"]}, pluck="name"):
            shelf = frappe.get_doc("Shelf", sname)
            if not shelf.items:
                frappe.delete_doc("Shelf", sname, force=1, ignore_permissions=True)
                killed_shelves = killed_shelves + 1
        lines.append("Deleted %s auto-created shelves." % killed_shelves)

        # 2) Shelving Logs written by the After Save server script
        killed_logs = 0
        if buckets:
            for name in frappe.get_all("Shelving Log", filters={"bucket_id": ["in", buckets]}, pluck="name"):
                frappe.delete_doc("Shelving Log", name, force=1, ignore_permissions=True)
                killed_logs = killed_logs + 1
        lines.append("Deleted %s Shelving Log rows." % killed_logs)

        # 3) any Bucket Allocation Status that leaked in
        killed_bas = 0
        if buckets and frappe.db.exists("DocType", "Bucket Allocation Status"):
            for name in frappe.get_all("Bucket Allocation Status", filters={"bucket_id": ["in", buckets]}, pluck="name"):
                frappe.delete_doc("Bucket Allocation Status", name, force=1, ignore_permissions=True)
                killed_bas = killed_bas + 1
        lines.append("Deleted %s Bucket Allocation Status rows." % killed_bas)

        # 4) the buckets themselves (must go before their receiving entries)
        killed_buckets = 0
        for name in buckets:
            frappe.delete_doc("Bucket QR Code", name, force=1, ignore_permissions=True)
            killed_buckets = killed_buckets + 1
        lines.append("Deleted %s Bucket QR Codes." % killed_buckets)

        # 5) cancel + delete the receiving Stock Entries (reverses the stock ledger)
        killed_se = 0
        for name in se_names:
            try:
                d = frappe.get_doc("Stock Entry", name)
                if d.docstatus == 1:
                    d.flags.ignore_permissions = True
                    d.cancel()
                frappe.delete_doc("Stock Entry", name, force=1, ignore_permissions=True)
                killed_se = killed_se + 1
            except Exception as err:
                lines.append("  ! Stock Entry %s: %s" % (name, err))
        lines.append("Cancelled + deleted %s receiving Stock Entries." % killed_se)

        frappe.db.commit()

# =========================== SIMULATE / PLAN ===============================
else:
    # ---- resolve varieties: pull an even split from EACH group ----
    varieties = []
    for v in VARIETIES:
        varieties.append(v)
    if not varieties:
        per_group = AUTO_LIMIT // len(AUTO_GROUPS)
        if per_group < 1:
            per_group = 1
        for grp in AUTO_GROUPS:
            # Varieties live in the CHILD groups (e.g. "Standard Roses - Premium"),
            # not the parent itself, so gather every descendant group via the
            # Item Group tree (nested set: lft/rgt) and search all of them.
            group_names = [grp]
            if frappe.db.exists("Item Group", grp):
                bounds = frappe.db.get_value("Item Group", grp, ["lft", "rgt"], as_dict=True)
                if bounds and bounds.get("lft") is not None:
                    for ig in frappe.get_all("Item Group",
                                             filters={"lft": [">=", bounds.get("lft")],
                                                      "rgt": ["<=", bounds.get("rgt")]},
                                             pluck="name"):
                        if ig not in group_names:
                            group_names.append(ig)
            for x in frappe.get_all("Item",
                                    filters={"item_group": ["in", group_names], "disabled": 0,
                                             "is_stock_item": 1, "has_variants": 0},
                                    pluck="name", order_by="name", limit=per_group):
                if x not in varieties:
                    varieties.append(x)
    varieties = [v for v in varieties if frappe.db.exists("Item", v)]
    if not varieties:
        frappe.throw("No valid varieties resolved. Set VARIETIES or check AUTO_GROUPS.")

    # ---- resolve farm, shelves, warehouses ----
    if not frappe.db.exists("Farm", FARM):
        frappe.throw("Farm '%s' does not exist." % FARM)

    # Shelves: the packing app auto-creates a shelf during shelving, so a farm with
    # no shelves yet is NOT a blocker — mirror that and stand up a small pool tagged
    # with MARKER (so CLEANUP removes them). In DRY_RUN we only name them for the plan.
    shelves = frappe.get_all("Shelf", filters={"farm": FARM}, pluck="name", order_by="name")
    shelves_auto = []
    if not shelves:
        prefix = FARM[:3].upper()
        i = 1
        while i <= 10:
            sid = "%s-%s-SHELF-%s" % (prefix, MARKER, i)
            shelves.append(sid)
            shelves_auto.append(sid)
            if not DRY_RUN and not frappe.db.exists("Shelf", sid):
                sh = frappe.new_doc("Shelf")
                sh.shelf_id = sid
                sh.farm = FARM
                sh.flags.ignore_permissions = True
                sh.insert(ignore_permissions=True)
            i = i + 1

    # Greenhouse + receiving warehouses: resolve by pattern so the farm's actual
    # suffix (- UFL, - KR, ...) doesn't matter. Fall back to any matching group=0 WH.
    greenhouse = "%s GH 01 - UFL" % FARM
    if not frappe.db.exists("Warehouse", greenhouse):
        gh = frappe.get_all("Warehouse", filters={"name": ["like", FARM + " GH%"], "is_group": 0},
                            pluck="name", order_by="name", limit=1)
        if gh:
            greenhouse = gh[0]
        else:
            frappe.throw("No greenhouse warehouse found for farm '%s' (looked for '%s GH ...')." % (FARM, FARM))

    receiving_wh = "%s Receiving Cold Store - UFL" % FARM
    if not frappe.db.exists("Warehouse", receiving_wh):
        rw = frappe.get_all("Warehouse", filters={"name": ["like", FARM + " Receiving Cold Store%"], "is_group": 0},
                            pluck="name", limit=1)
        receiving_wh = rw[0] if rw else greenhouse

    wh_company = frappe.db.get_value("Warehouse", greenhouse, "company")
    cut_stage_ok = frappe.db.exists("Cut Stage", CUT_STAGE)

    lengths = [x for x in STEM_LENGTHS if frappe.db.exists("Stem Length", x)]
    if not lengths:
        lengths = ["42CM"]

    # each variety receives in its own stock UOM (roses = "Nos", factor 1)
    uom_cache = {}
    for v in varieties:
        uom_cache[v] = frappe.db.get_value("Item", v, "stock_uom") or "Nos"

    tdy = frappe.utils.today()
    total_buckets = len(varieties) * BUCKETS_PER_VARIETY

    if DRY_RUN:
        mode = "DRY RUN - nothing written"
    else:
        mode = "LIVE"

    lines.append("HARVEST RECEIVING + SHELVING  (%s)" % mode)
    lines.append("Farm            : %s   Company: %s" % (FARM, wh_company))
    lines.append("Varieties       : %s" % ", ".join(varieties))
    lines.append("Buckets/variety : %s   Stems/bucket: %s" % (BUCKETS_PER_VARIETY, STEMS_PER_BUCKET))
    lines.append("Lengths cycled  : %s" % ", ".join(lengths))
    lines.append("Receive into    : %s (greenhouse)" % greenhouse)
    lines.append("Shelf warehouse : %s" % receiving_wh)
    lines.append("Shelves (pool)  : %s%s" % (len(shelves), ("  (%s auto-created for this farm)" % len(shelves_auto)) if shelves_auto else ""))
    lines.append("Planned buckets : %s   Planned stems: %s" % (total_buckets, total_buckets * STEMS_PER_BUCKET))
    lines.append(DASH)

    if DRY_RUN:
        for v in varieties:
            lines.append("  %-28s %s buckets x %s stems = %s stems  (uom %s)" % (
                v, BUCKETS_PER_VARIETY, STEMS_PER_BUCKET, BUCKETS_PER_VARIETY * STEMS_PER_BUCKET, uom_cache[v]))
        lines.append(DASH)
        lines.append("Set DRY_RUN = False (and tick Commit) to receive + shelf these.")
    else:
        # collision-proof run id from whitelisted utils only
        run_id = frappe.utils.now()
        for ch in ["-", ":", " ", ".", "T"]:
            run_id = run_id.replace(ch, "")
        run_id = run_id[:14]
        batch_tag = "%s-%s" % (MARKER, run_id)

        seq = 0
        created_ids = []
        se_ids = []
        shelf_cache = {}
        touched_shelves = []

        for v in varieties:
            stock_uom = uom_cache[v]
            b = 0
            while b < BUCKETS_PER_VARIETY:
                seq = seq + 1
                bucket_id = "%s-%s-%s" % (MARKER, run_id, seq)
                length = lengths[b % len(lengths)]
                shelf_name = shelves[(seq - 1) % len(shelves)]

                # 1) HARVEST RECEIVING — a submitted "Harvesting" Stock Entry
                se = frappe.new_doc("Stock Entry")
                se.stock_entry_type = "Harvesting"          # sets purpose = Material Receipt
                se.company = wh_company
                se.custom_business_unit = BUSINESS_UNIT
                se.custom_farm = FARM
                se.custom_greenhouse = greenhouse
                se.custom_stem_length = length
                se.custom_harvest_date = tdy
                se.custom_receiving_batch_id = batch_tag
                if cut_stage_ok:
                    se.custom_cut_stage = CUT_STAGE
                se.append("items", {
                    "item_code": v,
                    "qty": STEMS_PER_BUCKET,
                    "uom": stock_uom,
                    "conversion_factor": 1,
                    "t_warehouse": greenhouse,
                    "allow_zero_valuation_rate": 1,
                    "basic_rate": 0,
                })
                se.flags.ignore_permissions = True
                se.insert(ignore_permissions=True)
                se.submit()

                # 2) the bucket, linked to its receiving entry
                bqr = frappe.new_doc("Bucket QR Code")
                bqr.id = bucket_id
                bqr.status = "Available"
                bqr.last_stock_entry = se.name
                bqr.insert(ignore_permissions=True, ignore_mandatory=True)
                frappe.db.set_value("Stock Entry", se.name, "custom_bucket_id", bucket_id)

                # 3) the shelved stock
                shelf = shelf_cache.get(shelf_name)
                if not shelf:
                    shelf = frappe.get_doc("Shelf", shelf_name)
                    shelf_cache[shelf_name] = shelf
                    touched_shelves.append(shelf_name)
                shelf.append("items", {
                    "variety": v,
                    "farm": FARM,
                    "warehouse": receiving_wh,
                    "greenhouse": greenhouse,
                    "bucket_id": bucket_id,
                    "stem_qty": STEMS_PER_BUCKET,
                    "stem_length": length,
                    "cut_stage": CUT_STAGE,
                    "date_added": frappe.utils.now(),
                    "harvest_date": tdy,
                    "receiving_date": tdy,
                })
                created_ids.append(bucket_id)
                se_ids.append(se.name)
                b = b + 1

        # Save each touched shelf once. "Log Shelving Events" (Shelf -> After
        # Save) writes the "Shelved" Shelving Log rows for us.
        for shelf_name in touched_shelves:
            shelf = shelf_cache[shelf_name]
            shelf.flags.ignore_permissions = True
            shelf.save(ignore_permissions=True)

        frappe.db.commit()

        log_count = 0
        if created_ids:
            log_count = frappe.db.count("Shelving Log", {"bucket_id": ["in", created_ids]})

        lines.append("Received %s Stock Entries, made %s buckets, %s shelf items, %s shelving logs across %s shelves." % (
            len(se_ids), len(created_ids), len(created_ids), log_count, len(touched_shelves)))
        lines.append(DASH)

        # confirm the stock actually landed in the greenhouse
        for v in varieties:
            qty = frappe.db.get_value("Bin", {"item_code": v, "warehouse": greenhouse}, "actual_qty") or 0
            lines.append("  %-28s in stock (%s): %s" % (v, greenhouse, qty))

        lines.append(DASH)
        lines.append("To undo this run: set CLEANUP = True and Run again.")

# ================================ OUTPUT ===================================
text = "\n".join(lines)
try:
    log(text)
except Exception:
    frappe.errprint(text)
frappe.msgprint("<pre>" + text + "</pre>", title="Harvest Simulation")
