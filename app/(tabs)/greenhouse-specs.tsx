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
import { Button } from '@/src/components/Button';
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
  const selected = useGreenhouseSpecsStore((s) => s.selected);
  const toggleSelected = useGreenhouseSpecsStore((s) => s.toggleSelected);
  const setSelected = useGreenhouseSpecsStore((s) => s.setSelected);
  const clearSelected = useGreenhouseSpecsStore((s) => s.clearSelected);
  const load = useGreenhouseSpecsStore((s) => s.load);
  const [refreshing, setRefreshing] = useState(false);

  useRefreshOnFocus(load);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Farm filter options derived from the FULL, unfiltered greenhouse list —
  // never from the farm-scoped subset below. Deriving these from a list that
  // was itself already narrowed to `farmFilter` was the root cause of farm
  // selection "not working": after picking a farm, every other farm would
  // disappear from this dropdown until the filter was cleared back to "All
  // farms".
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

  // Greenhouses scoped to the selected farm — computed client-side so
  // picking a farm can never feed back into (and shrink) farmOptions above.
  const filtered = useMemo(
    () => greenhouses.filter((g) => !farmFilter || g.farm === farmFilter),
    [greenhouses, farmFilter],
  );

  // Drop any selection that falls outside the current farm scope, the same
  // way the forecasting screen prunes a stale greenhouse filter when the
  // farm changes.
  useEffect(() => {
    if (selected.length === 0) return;
    const visible = new Set(filtered.map((g) => g.name));
    const next = selected.filter((name) => visible.has(name));
    if (next.length !== selected.length) setSelected(next);
  }, [filtered, selected, setSelected]);

  const openSelected = () => {
    if (selected.length === 0) return;
    router.push(
      `/greenhouse-spec/${encodeURIComponent(selected.join(','))}` as never,
    );
    clearSelected();
  };

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
            {filtered.length} greenhouse{filtered.length === 1 ? '' : 's'}
            {selected.length > 0 ? ` · ${selected.length} selected` : ''}
          </Text>
        </Card>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {loading && greenhouses.length === 0 ? (
          <Card>
            <Spinner label="Loading greenhouses…" />
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <Alert tone="info">No greenhouses found.</Alert>
          </Card>
        ) : (
          filtered.map((g) => {
            const isSelected = selected.includes(g.name);
            return (
              <TouchableOpacity
                key={g.name}
                activeOpacity={0.7}
                onPress={() =>
                  router.push(`/greenhouse-spec/${encodeURIComponent(g.name)}` as never)
                }
              >
                <View style={[s.row, isSelected && s.rowSelected]}>
                  <TouchableOpacity
                    onPress={() => toggleSelected(g.name)}
                    hitSlop={8}
                    style={s.checkbox}
                  >
                    <Ionicons
                      name={isSelected ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={isSelected ? colors.primary : colors.textMuted}
                    />
                  </TouchableOpacity>
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
            );
          })
        )}
      </ScrollView>

      {selected.length > 0 ? (
        <View style={s.selectionBar}>
          <Text style={s.selectionText}>
            {selected.length} greenhouse{selected.length === 1 ? '' : 's'} selected
          </Text>
          <View style={s.selectionActions}>
            <Button label="Clear" variant="ghost" onPress={clearSelected} style={s.selectionBtn} />
            <Button label="View" variant="primary" onPress={openSelected} style={s.selectionBtn} />
          </View>
        </View>
      ) : null}
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
  rowSelected: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  checkbox: { padding: spacing.xs },
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
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  selectionText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
    flexShrink: 1,
  },
  selectionActions: { flexDirection: 'row', gap: spacing.sm },
  selectionBtn: { paddingHorizontal: spacing.lg, minHeight: 40, paddingVertical: spacing.sm },
});
