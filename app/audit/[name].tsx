import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card, Alert } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { Dropdown } from '@/src/components/Dropdown';
import { LabeledInput } from '@/src/components/LabeledInput';
import { DateField } from '@/src/components/DateField';
import { Spinner } from '@/src/components/Spinner';
import { useToast } from '@/src/components/Toast';
import { showDialog } from '@/src/components/DialogHost';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useCropCycleStore } from '@/src/stores/cropCycleStore';
import { mapAxiosError } from '@/src/services/api';
import { storage } from '@/src/services/storage';
import { AUDIT_TYPES, auditsApi, type AuditDetail, type AuditSection, type AuditType } from '@/src/services/audits';

const AUTOSAVE_MS = 1500;
const draftKey = (type: AuditType, name: string) => `audit-draft:${type}:${name || 'new'}`;

function toPayload(type: AuditType, a: AuditDetail, submit: boolean) {
  return {
    audit_type: type,
    name: a.name || undefined,
    audit_date: a.auditDate,
    farm: a.farm,
    greenhouse: a.greenhouse,
    zone: a.zone,
    zone_leader: a.zoneLeader,
    auditor: a.auditor,
    auditee: a.auditee,
    sections: Object.fromEntries(
      a.sections.map((sec) => [sec.table, sec.rows.map((r) => ({ score: r.score, comments: r.comments }))]),
    ),
    submit,
  };
}

function sectionTotals(sec: AuditSection) {
  let score = 0;
  let max = 0;
  let scored = 0;
  for (const r of sec.rows) {
    max += r.maxScore;
    if (r.score !== '') {
      score += Number(r.score);
      scored += 1;
    }
  }
  return { score, max, scored };
}

export default function AuditScreen() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ name?: string; type?: string }>();
  const auditType: AuditType = params.type === 'DMS' ? 'DMS' : '5S';
  const typeLabel = AUDIT_TYPES.find((t) => t.value === auditType)?.label ?? auditType;

  const greenhouses = useCropCycleStore((st) => st.greenhouses);
  const farms = useCropCycleStore((st) => st.farms);
  const employees = useCropCycleStore((st) => st.employees);
  const loadPickers = useCropCycleStore((st) => st.loadPickers);
  const loadPeople = useCropCycleStore((st) => st.loadPeople);

  const [audit, setAudit] = useState<AuditDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [syncState, setSyncState] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'offline'>('idle');
  // Bumped on every edit; a server save only replaces local state when no
  // edit landed while it was in flight.
  const [edits, setEdits] = useState(0);
  const editsRef = useRef(0);
  const savingRef = useRef(false);
  const auditRef = useRef<AuditDetail | null>(null);
  auditRef.current = audit;

  useEffect(() => {
    loadPickers();
    loadPeople();
    const name = params.name && params.name !== 'new' ? params.name : '';
    (async () => {
      // A copy kept on the phone (unsynced edits, or a new audit not yet on
      // the server) wins over the server's: it's where the auditor left off.
      let local: AuditDetail | null = null;
      try {
        const raw = await storage.get(draftKey(auditType, name));
        local = raw ? (JSON.parse(raw) as AuditDetail) : null;
      } catch {
        local = null;
      }
      try {
        const remote = await auditsApi.get(auditType, name || undefined);
        const a = local && remote.docstatus === 0 ? { ...local, name: local.name || remote.name, docstatus: 0 } : remote;
        setAudit(a);
        const firstOpen = a.sections.find((sec) => sec.rows.some((r) => r.score === '')) ?? a.sections[0];
        if (firstOpen) setOpen({ [firstOpen.table]: true });
        if (local) {
          setSyncState('pending');
          editsRef.current += 1;
          setEdits(editsRef.current);
        }
      } catch (err) {
        if (local) {
          setAudit(local);
          setSyncState('offline');
        } else {
          setError(mapAxiosError(err).message);
        }
      }
    })();
  }, [auditType, params.name, loadPickers, loadPeople]);

  const autosave = useCallback(async () => {
    const current = auditRef.current;
    if (!current || current.docstatus !== 0 || savingRef.current) return;
    if (!current.greenhouse || !current.auditor || !current.auditDate) return;
    const seq = editsRef.current;
    savingRef.current = true;
    setSyncState('saving');
    try {
      const saved = await auditsApi.save(toPayload(auditType, current, false));
      if (!current.name) await storage.remove(draftKey(auditType, ''));
      if (editsRef.current === seq) {
        setAudit(saved);
        await storage.remove(draftKey(auditType, saved.name));
        setSyncState('saved');
      } else {
        // Edited meanwhile: keep the newer local copy, just learn the name.
        setAudit((a) => (a ? { ...a, name: saved.name } : a));
        setSyncState('pending');
      }
    } catch {
      setSyncState('offline');
    } finally {
      savingRef.current = false;
    }
  }, [auditType]);

  // Every edit: keep it on the phone at once, then sync after a pause.
  useEffect(() => {
    if (!edits || !audit || audit.docstatus !== 0) return;
    storage.set(draftKey(auditType, audit.name), JSON.stringify(audit)).catch(() => {});
    setSyncState((st) => (st === 'saving' ? st : 'pending'));
    const t = setTimeout(autosave, AUTOSAVE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits]);

  const touch = () => {
    editsRef.current += 1;
    setEdits(editsRef.current);
  };

  const employeeOptions = useMemo(
    () => employees.map((e) => ({ value: e.name, label: e.label, sublabel: e.name })),
    [employees],
  );

  const readOnly = (audit?.docstatus ?? 0) !== 0;
  const patch = (p: Partial<AuditDetail>) => {
    setAudit((a) => (a ? { ...a, ...p } : a));
    touch();
  };
  const farmOf = (gh: string) => greenhouses.find((g) => g.name === gh)?.farm ?? '';

  // Changing the farm clears a greenhouse that belongs to some other farm.
  const onFarm = (farm: string) => {
    if (!audit) return;
    patch({ farm, greenhouse: audit.greenhouse && farmOf(audit.greenhouse) !== farm ? '' : audit.greenhouse });
  };
  const onGreenhouse = (greenhouse: string) => {
    if (!audit) return;
    patch({ greenhouse, farm: audit.farm || farmOf(greenhouse) });
  };

  const setRow = (table: string, idx: number, p: { score?: string; comments?: string }) => {
    touch();
    setAudit((a) =>
      a
        ? {
            ...a,
            sections: a.sections.map((sec) =>
              sec.table === table ? { ...sec, rows: sec.rows.map((r, i) => (i === idx ? { ...r, ...p } : r)) } : sec,
            ),
          }
        : a,
    );
  };

  const totals = useMemo(() => {
    let score = 0;
    let max = 0;
    for (const sec of audit?.sections ?? []) {
      const t = sectionTotals(sec);
      score += t.score;
      max += t.max;
    }
    return { score, max, pct: max ? Math.round((score * 10000) / max) / 100 : 0 };
  }, [audit]);

  const save = async (submit: boolean) => {
    if (!audit) return;
    if (!audit.greenhouse || !audit.auditor || !audit.auditDate) {
      toast.showError('Date, greenhouse and auditor are required.');
      return;
    }
    if (submit) {
      const missing = audit.sections.find((sec) => sec.rows.some((r) => r.score === ''));
      if (missing) {
        setOpen((o) => ({ ...o, [missing.table]: true }));
        toast.showError(`Score every row in ${missing.section} before submitting.`);
        return;
      }
    }
    setSaving(true);
    try {
      const saved = await auditsApi.save(toPayload(auditType, audit, submit));
      editsRef.current += 1;
      setAudit(saved);
      setSyncState('saved');
      await storage.remove(draftKey(auditType, ''));
      await storage.remove(draftKey(auditType, saved.name));
      toast.showSuccess(saved.message ?? 'Saved.');
      if (submit) router.back();
    } catch (err) {
      toast.showError(mapAxiosError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmSubmit = () =>
    showDialog(
      'Submit audit',
      `Submit with ${totals.score}/${totals.max} (${totals.pct}%)? It can't be edited after.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Submit', onPress: () => save(true) },
      ],
      { name: 'clipboard-outline', tone: 'info' },
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={s.headerBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle} numberOfLines={1}>{audit?.name || typeLabel}</Text>
          {audit && !readOnly && syncState !== 'idle' ? (
            <Text style={[s.syncText, syncState === 'offline' && { color: colors.danger }]}>
              {syncState === 'saving'
                ? 'Saving…'
                : syncState === 'saved'
                  ? 'Saved'
                  : syncState === 'offline'
                    ? 'Not synced'
                    : 'Saved on phone'}
            </Text>
          ) : null}
        </View>
        <View style={s.headerBtn} />
      </View>

      {error ? (
        <View style={s.scroll}><Alert tone="danger">{error}</Alert></View>
      ) : !audit ? (
        <Card><Spinner label="Loading checklist…" /></Card>
      ) : (
        <KeyboardAwareScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          enableOnAndroid
          extraScrollHeight={40}
        >
          <Card title={typeLabel}>
            <View style={{ gap: spacing.xs }} pointerEvents={readOnly ? 'none' : 'auto'}>
              <DateField label="Date" value={audit.auditDate} onChange={(v) => patch({ auditDate: v })} />
              <Dropdown
                label="Farm"
                value={audit.farm}
                onChange={onFarm}
                options={farms.map((f) => ({ value: f.name, label: f.label }))}
                placeholder="Pick a farm"
              />
              <Dropdown
                label="Greenhouse"
                value={audit.greenhouse}
                onChange={onGreenhouse}
                options={greenhouses
                  .filter((g) => !audit.farm || g.farm === audit.farm)
                  .map((g) => ({ value: g.name, label: g.label }))}
                placeholder="Pick a greenhouse"
              />
              <LabeledInput label="Zone" value={audit.zone} onChangeText={(v) => patch({ zone: v })} iconLeft="map-outline" />
              <Dropdown label="Zone Leader" value={audit.zoneLeader} onChange={(v) => patch({ zoneLeader: v })} options={employeeOptions} placeholder="Pick the zone leader" />
              <Dropdown label="Auditor" value={audit.auditor} onChange={(v) => patch({ auditor: v })} options={employeeOptions} placeholder="Pick the auditor" />
              <Dropdown label="Auditee" value={audit.auditee} onChange={(v) => patch({ auditee: v })} options={employeeOptions} placeholder="Pick the auditee" />
            </View>
          </Card>

          {audit.sections.map((sec) => {
            const t = sectionTotals(sec);
            const expanded = !!open[sec.table];
            return (
              <View key={sec.table} style={s.section}>
                <TouchableOpacity
                  style={s.sectionHead}
                  onPress={() => setOpen((o) => ({ ...o, [sec.table]: !expanded }))}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.sectionTitle}>{sec.section}</Text>
                    <Text style={s.sectionSub}>{`${t.scored}/${sec.rows.length} scored`}</Text>
                  </View>
                  <Text style={s.sectionScore}>{`${t.score}/${t.max}`}</Text>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
                </TouchableOpacity>

                {expanded
                  ? sec.rows.map((r, i) => (
                      <View key={`${sec.table}-${i}`} style={s.item}>
                        {r.lookAt ? <Text style={s.lookAt}>{r.lookAt}</Text> : null}
                        <Text style={s.observation}>{r.observation}</Text>
                        {r.lookFor ? <Text style={s.lookFor}>{r.lookFor}</Text> : null}
                        <View style={s.scoreRow}>
                          {audit.scores.map((sc) => {
                            const active = r.score === sc;
                            return (
                              <TouchableOpacity
                                key={sc}
                                disabled={readOnly}
                                onPress={() => setRow(sec.table, i, { score: active ? '' : sc })}
                                style={[s.scoreChip, active && s.scoreChipActive]}
                              >
                                <Text style={[s.scoreText, active && s.scoreTextActive]}>{sc}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        <TextInput
                          value={r.comments}
                          editable={!readOnly}
                          onChangeText={(v) => setRow(sec.table, i, { comments: v })}
                          placeholder="Comments"
                          placeholderTextColor={colors.textMuted}
                          style={s.comment}
                          multiline
                        />
                      </View>
                    ))
                  : null}
              </View>
            );
          })}

          <Card>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Total</Text>
              <Text style={s.totalValue}>{`${totals.score}/${totals.max} · ${totals.pct}%`}</Text>
            </View>
            {readOnly ? null : (
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                <Button label="Save" iconLeft="save-outline" variant="outline" onPress={() => save(false)} disabled={saving} />
                <Button label="Submit" iconLeft="checkmark" onPress={confirmSubmit} disabled={saving} />
              </View>
            )}
          </Card>
        </KeyboardAwareScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  syncText: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
  headerTitle: { textAlign: 'center', fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  section: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  sectionTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  sectionSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  sectionScore: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },

  item: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  lookAt: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  observation: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  lookFor: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  scoreRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  scoreChip: {
    flex: 1,
    height: 40,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  scoreChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  scoreText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  scoreTextActive: { color: colors.textOnPrimary },
  comment: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  totalValue: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
});
