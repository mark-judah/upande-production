import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Device from 'expo-device';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getDeviceId } from '@/src/services/device-id';
import { deviceModelLabel, shortInstallId } from '@/src/stores/devicesStore';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/**
 * Settings → "This device": what this phone reports about itself, collapsible.
 * `showDevicesLink` adds the entry to the fleet list (Support Team only).
 */
export function ThisDeviceCard({ showDevicesLink }: { showDevicesLink: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [installId, setInstallId] = useState('—');
  React.useEffect(() => {
    getDeviceId().then((id) => setInstallId(shortInstallId(id)));
  }, []);

  const rows: [string, string][] = [
    ['Model', deviceModelLabel(Device.brand, Device.modelName)],
    ['Name', Device.deviceName || '—'],
    ['OS', [Device.osName, Device.osVersion].filter(Boolean).join(' ') || '—'],
    ['Install ID', installId],
  ];

  return (
    <View style={s.card}>
      <TouchableOpacity style={s.header} onPress={() => setOpen((v) => !v)} accessibilityRole="button">
        <Text style={s.title}>This device</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </TouchableOpacity>
      {open ? (
        <View>
          {rows.map(([k, v]) => (
            <View key={k} style={s.kv}>
              <Text style={s.kvLabel}>{k}</Text>
              <Text style={s.kvValue}>{v}</Text>
            </View>
          ))}
          {showDevicesLink ? (
            <TouchableOpacity style={s.link} onPress={() => router.push('/devices' as never)}>
              <Ionicons name="phone-portrait-outline" size={22} color={colors.text} />
              <Text style={s.linkText}>Devices running the app</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: {
    fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs, marginTop: spacing.xs },
  kvLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.textSecondary },
  kvValue: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.text, flexShrink: 1, textAlign: 'right' },
  link: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md,
    paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  linkText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.text },
});
