import React, { useState } from 'react';
import { Alert, Linking, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Card } from '@/src/components/Card';
import { Pill } from '@/src/components/Pill';
import { Sheet } from '@/src/components/Sheet';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { useToast } from '@/src/components/Toast';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import {
  buildCopyText, filterByVersion, groupByFarm, reasonLabel, useSupportInstallsStore, whatsappUrl,
  type BehindCard,
} from '@/src/stores/supportInstallsStore';
import { applyMinVersion, previewMinVersion } from '@/src/services/support-installs';
import { colors, fontFamily, fontSize, spacing, borderRadius } from '@/src/theme';

const VERSION_RE = /^\d+\.\d+\.\d+$/;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

function seenLabel(days: number | null): string {
  if (days == null) return 'never seen';
  if (days === 0) return 'seen today';
  return `seen ${days}d ago`;
}

function ContactButtons({ phone }: { phone: string | null }) {
  const wa = whatsappUrl(phone);
  if (!phone) return null;
  return (
    <View style={s.contactRow}>
      <TouchableOpacity style={s.contactBtn} onPress={() => Linking.openURL(`tel:${phone}`)} accessibilityLabel="Call">
        <Ionicons name="call-outline" size={16} color={colors.text} />
        <Text style={s.contactText}>Call</Text>
      </TouchableOpacity>
      {wa ? (
        <TouchableOpacity style={s.contactBtn} onPress={() => Linking.openURL(wa)} accessibilityLabel="WhatsApp">
          <Ionicons name="chatbubble-outline" size={16} color={colors.text} />
          <Text style={s.contactText}>WhatsApp</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function SupportInstallsScreen() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const { data, loading, error, versionFilter, load, setVersionFilter } = useSupportInstallsStore();
  const [detail, setDetail] = useState<BehindCard | null>(null);
  const [floorOpen, setFloorOpen] = useState(false);
  const [floorInput, setFloorInput] = useState('');
  const [floorBusy, setFloorBusy] = useState(false);

  useRefreshOnFocus(load);

  const summary = data?.summary;
  const behind = data ? filterByVersion(data.behind, versionFilter) : [];
  const groups = groupByFarm(behind);
  const maxCount = Math.max(1, ...(data?.distribution ?? []).map((d) => d.count));

  const onShare = async () => {
    const text = buildCopyText(behind, summary?.latest ?? null);
    if (!text) {
      showError('Nobody to share.');
      return;
    }
    try {
      await Share.share({ message: text });
    } catch {
      showError('Could not share the list.');
    }
  };

  const openFloor = () => {
    setFloorInput(summary?.latest ?? '');
    setFloorOpen(true);
  };

  const onPreviewFloor = async () => {
    const version = floorInput.trim().replace(/^v/i, '');
    if (!VERSION_RE.test(version)) {
      showError('Enter a version like 1.2.3.');
      return;
    }
    setFloorBusy(true);
    try {
      const { devices, users } = await previewMinVersion(version);
      setFloorBusy(false);
      Alert.alert(
        `Require v${version}?`,
        `${devices} device${devices === 1 ? '' : 's'} (${users} user${users === 1 ? '' : 's'}) on an older version ` +
          `will be locked to the update screen${summary?.enforced ? '' : ' once the gate is switched on (it is off now)'}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Set minimum',
            style: 'destructive',
            onPress: async () => {
              try {
                await applyMinVersion(version);
                setFloorOpen(false);
                showSuccess(`Minimum version is now v${version}.`);
                load();
              } catch (e) {
                showError(e instanceof Error ? e.message : 'Could not save.');
              }
            },
          },
        ],
      );
    } catch (e) {
      setFloorBusy(false);
      showError(e instanceof Error ? e.message : 'Could not preview.');
    }
  };

  return (
    <Screen
      title="Install Stats"
      leftIcon="arrow-back"
      onPressLeft={() => router.back()}
      loading={loading && !data}
      error={!data ? error : null}
      onRetry={load}
      refreshing={loading && !!data}
      onRefresh={load}
    >
      {summary ? (
        <>
          <View style={s.tiles}>
            <View style={s.tile}>
              <Text style={s.tileLabel}>Latest</Text>
              <Text style={s.tileValue}>{summary.latest ? `v${summary.latest}` : '—'}</Text>
              <Text style={s.tileSub}>{formatDate(summary.published_at)}</Text>
            </View>
            <View style={s.tile}>
              <Text style={s.tileLabel}>Minimum</Text>
              <Text style={s.tileValue}>{summary.min_supported ? `v${summary.min_supported}` : 'Not set'}</Text>
              <Text style={s.tileSub}>{summary.enforced ? 'gate ON' : 'gate off'}</Text>
            </View>
            <View style={s.tile}>
              <Text style={s.tileLabel}>On latest</Text>
              <Text style={s.tileValue}>{summary.pct_on_latest}%</Text>
              <Text style={s.tileSub}>{summary.on_latest} of {summary.total_devices}</Text>
            </View>
            <View style={s.tile}>
              <Text style={s.tileLabel}>Behind</Text>
              <Text style={[s.tileValue, summary.behind > 0 && { color: colors.danger }]}>{summary.behind}</Text>
              <Text style={s.tileSub}>{summary.blocked_24h > 0 ? `${summary.blocked_24h} blocked 24h` : 'devices'}</Text>
            </View>
          </View>

          <Card title="Versions in the field">
            {data!.distribution.length === 0 ? (
              <Text style={s.empty}>No devices have reported yet.</Text>
            ) : (
              data!.distribution.map((d) => {
                const selected = versionFilter === d.version;
                return (
                  <TouchableOpacity
                    key={d.version}
                    style={[s.distRow, selected && s.distRowSelected]}
                    onPress={() => setVersionFilter(d.version)}
                  >
                    <Text style={s.distVersion}>{d.version === 'unknown' ? 'unknown' : `v${d.version}`}</Text>
                    <View style={s.distTrack}>
                      <View style={[s.distFill, { width: `${(d.count / maxCount) * 100}%` }]} />
                    </View>
                    <Text style={s.distCount}>{d.count}</Text>
                  </TouchableOpacity>
                );
              })
            )}
            {versionFilter ? <Text style={s.hint}>Showing v{versionFilter} only — tap it again to clear.</Text> : null}
          </Card>

          <View style={s.actions}>
            <View style={{ flex: 1 }}>
              <Button label="Share list" variant="outline" iconLeft="share-outline" onPress={onShare} />
            </View>
            <View style={{ width: spacing.sm }} />
            <View style={{ flex: 1 }}>
              <Button label="Set minimum" variant="outline" iconLeft="lock-closed-outline" onPress={openFloor} />
            </View>
          </View>

          {groups.length === 0 ? (
            <Card>
              <Text style={s.empty}>
                {summary.total_devices === 0 ? 'No devices have reported yet.' : 'Everyone is up to date.'}
              </Text>
            </Card>
          ) : (
            groups.map((g) => (
              <Card key={g.farm} title={`${g.farm} · ${g.cards.length}`}>
                {g.cards.map((c) => (
                  <TouchableOpacity key={c.device_id} style={s.person} onPress={() => setDetail(c)}>
                    <View style={s.personTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.personName}>{c.user_full_name || c.user || c.device}</Text>
                        <Text style={s.personSub}>
                          {[c.designation, c.device].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Text style={s.personVersion}>
                        {c.app_version ? `v${c.app_version}` : '?'} → v{summary.latest ?? '?'}
                      </Text>
                    </View>
                    <View style={s.pillRow}>
                      {c.reason ? <Pill value={reasonLabel(c.reason, c.days_since_seen)} tone={c.reason === 'missed_ota' ? 'warn' : 'danger'} /> : null}
                      {c.blocked_recent ? <Pill value={`Blocked ${c.blocked_count}×`} tone="danger" /> : null}
                      <Text style={s.personSub}>
                        {c.days_behind != null ? `${c.days_behind}d behind · ` : ''}{seenLabel(c.days_since_seen)}
                      </Text>
                    </View>
                    <ContactButtons phone={c.phone} />
                  </TouchableOpacity>
                ))}
              </Card>
            ))
          )}

          {data!.never_reported.length > 0 ? (
            <Card title={`Never reported · ${data!.never_reported.length}`}>
              <Text style={s.hint}>Recently active users whose phone has never reported in. They may still be on an old build.</Text>
              {data!.never_reported.map((n) => (
                <View key={n.user} style={s.person}>
                  <Text style={s.personName}>{n.name || n.user}</Text>
                  <Text style={s.personSub}>{[n.farm, n.designation].filter(Boolean).join(' · ')}</Text>
                  <ContactButtons phone={n.phone} />
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      <Sheet visible={!!detail} onClose={() => setDetail(null)} title={detail?.user_full_name || detail?.device || 'Device'} subtitle={detail?.farm}>
        {detail ? (
          <View>
            {[
              ['Device', detail.device],
              ['Model', detail.model],
              ['User', detail.user],
              ['Version', detail.app_version ? `v${detail.app_version}` : null],
              ['APK', detail.native_version ? `v${detail.native_version}` : null],
              ['Runtime', detail.runtime],
              ['Free storage', detail.storage_free != null && detail.storage_free >= 0 ? `${Math.round(detail.storage_free / 1048576)} MB` : null],
              ['Last seen', detail.last_seen],
              ['Times blocked', detail.blocked_count ? String(detail.blocked_count) : null],
            ].filter(([, v]) => v).map(([k, v]) => (
              <View key={k as string} style={s.detailRow}>
                <Text style={s.detailKey}>{k}</Text>
                <Text style={s.detailVal}>{v}</Text>
              </View>
            ))}
            <ContactButtons phone={detail.phone} />
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={floorOpen} onClose={() => setFloorOpen(false)} title="Minimum version" subtitle="Older builds get locked to the update screen">
        <LabeledInput
          label="Version"
          value={floorInput}
          onChangeText={setFloorInput}
          placeholder="1.2.3"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
        />
        <View style={{ height: spacing.md }} />
        <Button label="Preview impact" onPress={onPreviewFloor} loading={floorBusy} iconLeft="eye-outline" />
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  tile: {
    width: '48%', backgroundColor: colors.surface, borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.md,
  },
  tileLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textMuted, textTransform: 'uppercase' },
  tileValue: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text, marginTop: 2 },
  tileSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  distRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, borderRadius: borderRadius.sm },
  distRowSelected: { backgroundColor: colors.surfaceAlt },
  distVersion: { width: 72, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  distTrack: { flex: 1, height: 8, backgroundColor: colors.surfaceAlt, borderRadius: 4, overflow: 'hidden', marginHorizontal: spacing.sm },
  distFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  distCount: { width: 32, textAlign: 'right', fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  actions: { flexDirection: 'row', marginBottom: spacing.md },
  person: { paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  personTop: { flexDirection: 'row', alignItems: 'flex-start' },
  personName: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.text },
  personSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  personVersion: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.textSecondary },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  contactRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  contactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface,
  },
  contactText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  detailKey: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  detailVal: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text, flexShrink: 1, textAlign: 'right' },
});
