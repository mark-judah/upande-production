import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { Card } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { useToast } from '@/src/components/Toast';
import { useAuthStore } from '@/src/stores/authStore';
import * as Biometric from '@/src/services/biometric';
import { ApkUpdateSection } from '@/src/services/updates/ApkUpdateSection';
import { APP_VERSION, RUNTIME_VERSION } from '@/src/services/version';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';

export default function SettingsScreen() {  
  const router = useRouter();
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const instanceUrl = useAuthStore((s) => s.instanceUrl);
  const biometricEnabled = useAuthStore((s) => s.biometricEnabled);
  const setBiometricEnabled = useAuthStore((s) => s.setBiometricEnabled);
  const logout = useAuthStore((s) => s.logout);
  const forgetDevice = useAuthStore((s) => s.forgetDevice);
  const { showSuccess, showError } = useToast();
  const [moduleReady, setModuleReady] = useState(false);
  const [hardwareReady, setHardwareReady] = useState(false);

  useEffect(() => {
    setModuleReady(Biometric.isModuleAvailable());
    Biometric.isAvailable().then(setHardwareReady);
  }, []);

  const appVersion = APP_VERSION;
  const runtimeVersion = RUNTIME_VERSION;

  const onToggleBiometric = async () => {
    if (!biometricEnabled) {
      if (!moduleReady) {
        Alert.alert(
          'Update needed',
          'Install the latest build of Upande Production to enable biometric unlock.',
        );
        return;
      }
      if (!hardwareReady) {
        Alert.alert(
          'Biometric unavailable',
          'Enroll a fingerprint or face in your device settings, then try again.',
        );
        return;
      }
      const res = await Biometric.authenticate({
        promptMessage: 'Confirm biometric unlock',
        cancelLabel: 'Cancel',
        disableDeviceFallback: true,
      });
      if (!res.success) return;
    }
    try {
      await setBiometricEnabled(!biometricEnabled);
      showSuccess(biometricEnabled ? 'Biometric unlock disabled.' : 'Biometric unlock enabled.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not update setting.');
    }
  };

  const onSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in with biometrics or your password.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  const onForgetDevice = () => {
    Alert.alert(
      'Forget this device?',
      'This clears your session and disables biometric unlock. You will need your password to sign back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: async () => {
            await forgetDevice();
            router.replace('/login');
          },
        },
      ],
    );
  };

  return (
    <Screen
      title="Settings"
      leftIcon="arrow-back"
      onPressLeft={() => router.back()}
    >
      <Card>
        <View style={s.avatarRow}>
          <View style={s.avatar}>
            <Text style={s.avatarInitials}>
              {(fullName || email || '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.userName}>{fullName || email || 'Signed in'}</Text>
            {email ? <Text style={s.userEmail}>{email}</Text> : null}
            {instanceUrl ? <Text style={s.userMeta}>{instanceUrl}</Text> : null}
          </View>
        </View>
      </Card>

      <Card title="Security">
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowLabel}>Biometric unlock</Text>
            <Text style={s.rowHint}>
              {!moduleReady
                ? 'Install latest build to enable'
                : !hardwareReady
                  ? 'Enroll fingerprint/face in device settings'
                  : 'Skip the password with fingerprint or face'}
            </Text>
          </View>
          <Toggle value={biometricEnabled} onChange={onToggleBiometric} />
        </View>
      </Card>

      <Card title="App">
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowLabel}>Version</Text>
            <Text style={s.rowHint}>
              {appVersion}{runtimeVersion && runtimeVersion !== appVersion ? `  ·  runtime ${runtimeVersion}` : ''}
            </Text>
          </View>
        </View>
        <View style={{ height: spacing.md }} />
        <ApkUpdateSection />
      </Card>

      <Card title="Session">
        <Button label="Sign out" variant="outline" onPress={onSignOut} />
        <View style={{ height: spacing.sm }} />
        <Button
          label="Forget this device"
          variant="outline"
          color={colors.danger}
          onPress={onForgetDevice}
          iconLeft="trash-outline"
        />
      </Card>
    </Screen>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <TouchableOpacity
      onPress={onChange}
      activeOpacity={0.8}
      style={[s.toggle, value && s.toggleOn]}
    >
      <View style={[s.toggleDot, value && s.toggleDotOn]} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.textOnPrimary },
  userName: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  userEmail: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  userMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  rowHint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  toggle: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E5E5E5',
    padding: 3,
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: colors.text },
  toggleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  toggleDotOn: { transform: [{ translateX: 20 }] },
});
