import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Alert } from '@/src/components/Card';
import { Pill } from '@/src/components/Pill';
import { Segmented } from '@/src/components/Segmented';
import { Spinner } from '@/src/components/Spinner';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { usePlanningStore } from '@/src/stores/planningStore';
import { PlanDetailSheet, StatePill } from './planning';

type Stage = 'Pending Approval' | 'Pending Verification';

/** Plans waiting on the farm manager: new plans to approve, and finished
 *  plans whose actuals need verifying. */
export default function ApprovalsScreen() {
  const approvals = usePlanningStore((st) => st.approvals);
  const loading = usePlanningStore((st) => st.approvalsLoading);
  const loadApprovals = usePlanningStore((st) => st.loadApprovals);
  const open = usePlanningStore((st) => st.open);
  const detail = usePlanningStore((st) => st.detail);
  const closeDetail = usePlanningStore((st) => st.closeDetail);
  const [stage, setStage] = useState<Stage>('Pending Approval');
  const [refreshing, setRefreshing] = useState(false);

  useRefreshOnFocus(() => {
    loadApprovals();
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await loadApprovals();
    setRefreshing(false);
  };

  const count = (st: Stage) => approvals.filter((p) => p.workflowState === st).length;
  const rows = approvals.filter((p) => p.workflowState === stage);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Segmented
          value={stage}
          onChange={(v) => setStage(v as Stage)}
          options={[
            { value: 'Pending Approval', label: `To approve (${count('Pending Approval')})` },
            { value: 'Pending Verification', label: `To verify (${count('Pending Verification')})` },
          ]}
        />

        {loading && approvals.length === 0 ? (
          <Card>
            <Spinner label="Loading plans…" />
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <Alert tone="info">
              {stage === 'Pending Approval' ? 'No plans waiting for approval.' : 'No plans waiting for verification.'}
            </Alert>
          </Card>
        ) : (
          rows.map((p) => (
            <Pressable
              key={p.name}
              onPress={() => open(p.name)}
              style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
            >
              <View style={s.rowHeader}>
                <Text style={s.rowTitle} numberOfLines={1}>
                  {`W${p.planWeek} ${p.planYear} — ${p.greenhouse}`}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
              <Text style={s.rowSub} numberOfLines={1}>
                {[p.farm, p.company].filter(Boolean).join(' · ') || '—'}
              </Text>
              <View style={s.rowPills}>
                <StatePill state={p.workflowState} docstatus={p.docstatus} />
                <Pill label="Tasks" value={`${p.tasksDone}/${p.tasksTotal} done`} />
                {p.plannedStems ? <Pill label="Planned" value={`${p.plannedStems.toLocaleString()} stems`} /> : null}
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {detail ? <PlanDetailSheet onClose={closeDetail} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 96, gap: spacing.md },
  row: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text, flex: 1 },
  rowSub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  rowPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
});
