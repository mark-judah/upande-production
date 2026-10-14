import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Card } from '@/src/components/Card';
import { Pill } from '@/src/components/Pill';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { getDeviceId } from '@/src/services/device-id';
import {
  filterDevices, peopleSubtitle, pillTone, relativeTime, useDevicesStore, type DeviceRange,
} from '@/src/stores/devicesStore';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

const RANGES: { key: DeviceRange; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
];

/** "Devices running the app": who is on which version, and when each phone was last seen. */
export default function DevicesScreen() {
  const router = useRouter();
  const { data, loading, error, load } = useDevicesStore();
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<DeviceRange>('all');
  const [myId, setMyId] = useState('');

  useRefreshOnFocus(load);
  useEffect(() => {
    getDeviceId().then(setMyId);
  }, []);

  const summary = data?.summary;
  const maxCount = Math.max(1, ...(data?.versions ?? []).map((v) => v.count));
  const shown = data ? filterDevices(data.devices, search, range) : [];

  return (
    <Screen
      title="Devices"
      leftIcon="arrow-back"
      onPressLeft={() => router.back()}
      loading={loading && !data}
      error={!data ? error : null}
      onRetry={load}
      refreshing={loading && !!data}
      onRefresh={load}
    >
      {data && summary ? (
        <>
          <View style={s.tiles}>
            {[
              [summary.devices, 'Devices'],
              [summary.users, 'Users'],
              [summary.active_7d, 'Active 7d'],
              [summary.active_30d, 'Active 30d'],
            ].map(([n, label]) => (
              <View key={label as string} style={s.tile}>
                <Text style={s.tileValue}>{n}</Text>
                <Text style={s.tileLabel}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={s.caption}>{summary.devices} devices ever registered</Text>

          <Card title="Versions in use">
            {data.versions.length === 0 ? <Text style={s.empty}>No devices have reported yet.</Text> : null}
            {data.versions.map((v) => (
              <View key={v.version} style={s.versionRow}>
                <Text style={[s.versionLabel, v.latest && s.versionLatest]}>
                  {v.version}
                  {v.latest ? ' · latest' : ''}
                </Text>
                <View style={s.track}>
                  <View
                    style={[
                      s.fill,
                      { width: `${Math.max(4, (v.count / maxCount) * 100)}%` },
                      v.latest ? s.fillLatest : s.fillOther,
                    ]}
                  />
                </View>
                <Text style={s.versionCount}>{v.count}</Text>
              </View>
            ))}
          </Card>

          <Card title="People">
            {data.people.length === 0 ? <Text style={s.empty}>Nobody has signed in yet.</Text> : null}
            {data.people.map((p, i) => (
              <View key={p.user} style={[s.personRow, i > 0 && s.rowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.personName}>{p.name}</Text>
                  <Text style={s.sub}>{peopleSubtitle(p)}</Text>
                </View>
                <View style={s.right}>
                  {p.version ? <Pill value={p.version} tone={pillTone(p.is_latest)} /> : null}
                  <Text style={s.seen}>{relativeTime(p.seen_seconds_ago)}</Text>
                </View>
              </View>
            ))}
          </Card>

          <Card title="All devices">
            <View style={s.search}>
              <Ionicons name="search-outline" size={22} color={colors.textMuted} />
              <TextInput
                style={s.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Model, user or IP"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={s.chips}>
              {RANGES.map((r) => (
                <TouchableOpacity
                  key={r.key}
                  style={[s.chip, range === r.key && s.chipOn]}
                  onPress={() => setRange(r.key)}
                >
                  <Text style={[s.chipText, range === r.key && s.chipTextOn]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {shown.length === 0 ? <Text style={s.empty}>No devices match.</Text> : null}
            {shown.map((d, i) => (
              <View key={d.device_id} style={[s.deviceRow, i > 0 && s.rowBorder]}>
                <Ionicons name="phone-portrait-outline" size={30} color={colors.text} />
                <View style={{ flex: 1 }}>
                  <Text style={s.deviceName}>
                    {d.model || d.device_name || 'Unknown device'}
                    {myId && d.device_id === myId ? '  (this device)' : ''}
                  </Text>
                  <Text style={s.sub}>
                    {[d.user_name, d.farm, relativeTime(d.seen_seconds_ago)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {d.version ? <Pill value={d.version} tone={pillTone(d.is_latest)} /> : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.lg, backgroundColor: colors.surface,
    borderRadius: borderRadius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  tileValue: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text },
  tileLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 4 },
  caption: {
    fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center',
    marginVertical: spacing.md,
  },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, paddingVertical: spacing.sm },
  versionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  versionLabel: { width: 130, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.textSecondary },
  versionLatest: { fontFamily: fontFamily.bold, color: colors.text },
  track: { flex: 1, height: 10, backgroundColor: colors.surfaceAlt, borderRadius: 5, overflow: 'hidden', marginHorizontal: spacing.sm },
  fill: { height: '100%', borderRadius: 5 },
  fillLatest: { backgroundColor: colors.primary },
  fillOther: { backgroundColor: '#A3A3A3' },
  versionCount: { width: 32, textAlign: 'right', fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.text },
  personRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  personName: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  seen: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, paddingVertical: spacing.md, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text },
  chips: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.md },
  chip: {
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: 999,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.textSecondary },
  chipTextOn: { color: colors.textOnPrimary },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  deviceName: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text },
});
