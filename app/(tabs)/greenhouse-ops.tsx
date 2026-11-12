import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Alert } from '@/src/components/Card';
import { Segmented } from '@/src/components/Segmented';
import { Pill } from '@/src/components/Pill';
import { FAB } from '@/src/components/FAB';
import { Spinner } from '@/src/components/Spinner';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { mapAxiosError } from '@/src/services/api';
import { AUDIT_TYPES, auditsApi, type AuditSummary, type AuditType } from '@/src/services/audits';

function scoreTone(pct: number): 'success' | 'warn' | 'danger' {
  if (pct >= 80) return 'success';
  if (pct >= 50) return 'warn';
  return 'danger';
}

export default function GreenhouseOpsScreen() {
  const router = useRouter();
  const [auditType, setAuditType] = useState<AuditType>('5S');
  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (type: AuditType) => {
    setLoading(true);
    setError(null);
    try {
      setAudits(await auditsApi.list(type));
    } catch (err) {
      setError(mapAxiosError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useRefreshOnFocus(() => {
    load(auditType);
  });

  const onType = (next: AuditType) => {
    setAuditType(next);
    setAudits([]);
    load(next);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load(auditType);
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Card>
          <Segmented value={auditType} options={AUDIT_TYPES} onChange={onType} />
        </Card>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {loading && audits.length === 0 ? (
          <Card>
            <Spinner label="Loading audits…" />
          </Card>
        ) : audits.length === 0 ? (
          <Card>
            <Alert tone="info">No audits yet. Start one with the + button.</Alert>
          </Card>
        ) : (
          audits.map((a) => (
            <Pressable
              key={a.name}
              onPress={() => router.push({ pathname: '/audit/[name]', params: { name: a.name, type: auditType } })}
              style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
            >
              <View style={s.rowHeader}>
                <Text style={s.rowTitle} numberOfLines={1}>{a.greenhouse}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
              <Text style={s.rowSub} numberOfLines={1}>
                {[a.auditDate, a.farm, a.zone, a.auditorName].filter(Boolean).join(' · ')}
              </Text>
              <View style={s.rowPills}>
                <Pill label="Score" value={`${a.totalScore}/${a.maxScore}`} />
                <Pill value={`${a.percentage}%`} tone={scoreTone(a.percentage)} />
                <Pill value={a.docstatus === 1 ? 'Submitted' : 'Draft'} tone={a.docstatus === 1 ? 'success' : 'neutral'} />
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      <FAB
        icon="add"
        onPress={() => router.push({ pathname: '/audit/[name]', params: { name: 'new', type: auditType } })}
      />
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 96 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text, flex: 1 },
  rowSub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  rowPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
});
