import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Alert } from '@/src/components/Card';
import { Dropdown, type DropdownOption } from '@/src/components/Dropdown';
import { Pill } from '@/src/components/Pill';
import { Spinner } from '@/src/components/Spinner';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { useGreenhouseSpecsStore } from '@/src/stores/greenhouseSpecsStore';

export default function GreenhouseSpecsScreen() {
  const router = useRouter();
  const greenhouses = useGreenhouseSpecsStore((s) => s.greenhouses);
  const loading = useGreenhouseSpecsStore((s) => s.loading);
  const error = useGreenhouseSpecsStore((s) => s.error);
  const farmFilter = useGreenhouseSpecsStore((s) => s.farmFilter);
  const setFarmFilter = useGreenhouseSpecsStore((s) => s.setFarmFilter);
  const load = useGreenhouseSpecsStore((s) => s.load);
  const [refreshing, setRefreshing] = useState(false);

  useRefreshOnFocus(load);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Farm filter options derived from the loaded greenhouses (farms that exist).
  const farmOptions: DropdownOption[] = useMemo(() => {
    const seen = new Set<string>();
    greenhouses.forEach((g) => {
      if (g.farm) seen.add(g.farm);
    });
    const opts = Array.from(seen)
      .sort()
      .map((f) => ({ label: f, value: f }));
    return [{ label: 'All farms', value: '' }, ...opts];
  }, [greenhouses]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Card>
          <Dropdown
            label="Farm"
            value={farmFilter}
            options={farmOptions}
            onChange={setFarmFilter}
            placeholder="All farms"
          />
          <Text style={s.count}>
            {greenhouses.length} greenhouse{greenhouses.length === 1 ? '' : 's'}
          </Text>
        </Card>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {loading && greenhouses.length === 0 ? (
          <Card>
            <Spinner label="Loading greenhouses…" />
          </Card>
        ) : greenhouses.length === 0 ? (
          <Card>
            <Alert tone="info">No greenhouses found.</Alert>
          </Card>
        ) : (
          greenhouses.map((g) => (
            <TouchableOpacity
              key={g.name}
              activeOpacity={0.7}
              onPress={() =>
                router.push(`/greenhouse-spec/${encodeURIComponent(g.name)}` as never)
              }
            >
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{g.label}</Text>
                  <Text style={s.sub}>{g.farm || '—'}</Text>
                  {g.hasCycle ? (
                    <View style={s.pills}>
                      <Pill label="Beds" value={String(g.totalBeds)} />
                      <Pill label="Varieties" value={String(g.varietyCount)} />
                      <Pill label="Area m²" value={Math.round(g.totalArea).toLocaleString()} />
                    </View>
                  ) : (
                    <Text style={s.noCycle}>Nothing planted</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  count: {
    marginTop: spacing.sm,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  sub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  noCycle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
});
