import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Dropdown } from '@/src/components/Dropdown';
import { MultiSelectField } from '@/src/components/MultiSelectField';
import { borderRadius, colors, fontFamily, fontSize, shadow, spacing } from '@/src/theme';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { useCropCycleStore } from '@/src/stores/cropCycleStore';
import type { PickerOption } from '@/src/services/crop-cycle';

/**
 * Forecasting — every greenhouse, filtered by farm / greenhouse at the top.
 * Tapping a greenhouse opens its forecast (app/forecast/[greenhouse].tsx),
 * where the revised figures are entered week by week.
 */
export default function ForecastingScreen() {
  const router = useRouter();
  const greenhouses = useCropCycleStore((s) => s.greenhouses);
  const farms = useCropCycleStore((s) => s.farms);
  const loadPickers = useCropCycleStore((s) => s.loadPickers);

  const [search, setSearch] = useState('');
  const [farmFilter, setFarmFilter] = useState('');
  const [greenhouseFilter, setGreenhouseFilter] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const resetToDefault = () => {
    setSearch('');
    setFarmFilter('');
    setGreenhouseFilter([]);
  };

  // Picking a farm drops any selected greenhouse that isn't on it.
  useEffect(() => {
    if (!farmFilter || greenhouseFilter.length === 0) return;
    const keep = greenhouseFilter.filter((name) => greenhouses.find((g) => g.name === name)?.farm === farmFilter);
    if (keep.length !== greenhouseFilter.length) setGreenhouseFilter(keep);
  }, [farmFilter, greenhouseFilter, greenhouses]);

  useRefreshOnFocus(loadPickers);

  const filteredGreenhouses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return greenhouses.filter((g) => {
      if (farmFilter && g.farm !== farmFilter) return false;
      if (greenhouseFilter.length && !greenhouseFilter.includes(g.name)) return false;
      if (q && !g.label.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [greenhouses, farmFilter, greenhouseFilter, search]);

  // Greenhouse options narrow to the selected farm, same as choosing a farm
  // clears an incompatible greenhouse already picked.
  const greenhouseFilterOptions = useMemo(
    () => greenhouses.filter((g) => !farmFilter || g.farm === farmFilter),
    [greenhouses, farmFilter],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={s.topBar}>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search greenhouse…"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity style={s.iconBtn} onPress={() => setMenuOpen(true)} hitSlop={6}>
          <Ionicons name="ellipsis-vertical" size={19} color={colors.text} />
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bottomOffset={20}
      >
        <FiltersCard
          farms={farms}
          farmFilter={farmFilter}
          setFarmFilter={setFarmFilter}
          greenhouseOptions={greenhouseFilterOptions}
          greenhouseFilter={greenhouseFilter}
          setGreenhouseFilter={setGreenhouseFilter}
        />

        {greenhouses.length === 0 ? (
          <Text style={s.emptyText}>No greenhouses available</Text>
        ) : filteredGreenhouses.length === 0 ? (
          <Text style={s.emptyText}>No greenhouse matches</Text>
        ) : (
          filteredGreenhouses.map((gh) => (
            <TouchableOpacity
              key={gh.name}
              style={s.ghCard}
              activeOpacity={0.7}
              onPress={() => router.push(`/forecast/${encodeURIComponent(gh.name)}` as never)}
            >
              <View style={s.ghHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.ghName}>{gh.label}</Text>
                  {gh.farm ? <Text style={s.ghMeta}>{gh.farm}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </KeyboardAwareScrollView>

      <MenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onRefresh={() => {
          resetToDefault();
          loadPickers();
          setMenuOpen(false);
        }}
      />
    </View>
  );
}

function FiltersCard({
  farms,
  farmFilter,
  setFarmFilter,
  greenhouseOptions,
  greenhouseFilter,
  setGreenhouseFilter,
}: {
  farms: PickerOption[];
  farmFilter: string;
  setFarmFilter: (v: string) => void;
  greenhouseOptions: PickerOption[];
  greenhouseFilter: string[];
  setGreenhouseFilter: (v: string[]) => void;
}) {
  return (
    <View style={s.filtersCard}>
      <View style={s.filterRow}>
        <View style={{ flex: 1 }}>
          <Dropdown
            label="Farm"
            value={farmFilter}
            onChange={setFarmFilter}
            options={[{ value: '', label: 'All farms' }, ...farms.map((f) => ({ value: f.name, label: f.label }))]}
            placeholder="All farms"
          />
        </View>
        <View style={{ flex: 1 }}>
          <MultiSelectField
            label="Greenhouses"
            value={greenhouseFilter}
            onChange={setGreenhouseFilter}
            options={greenhouseOptions.map((g) => ({ value: g.name, label: g.label }))}
            placeholder="All greenhouses"
          />
        </View>
      </View>
    </View>
  );
}

function MenuSheet({
  visible,
  onClose,
  onRefresh,
}: {
  visible: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.modalSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <TouchableOpacity style={s.menuItem} onPress={onRefresh}>
            <Ionicons name="refresh-outline" size={18} color={colors.text} />
            <Text style={s.menuItemText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  filtersCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  filterRow: { flexDirection: 'row', gap: spacing.sm },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceAlt, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md, height: 38,
  },
  searchInput: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },

  ghCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    marginBottom: spacing.md, overflow: 'hidden', ...shadow.sm,
  },
  ghHeader: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  ghName: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  ghMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  emptyText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted, paddingVertical: spacing.lg, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  menuItemText: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.text },
});
