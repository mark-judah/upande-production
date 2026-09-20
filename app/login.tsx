import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, shadow, spacing } from '@/src/theme';
import { useAuthStore } from '@/src/stores/authStore';
import { storage, StorageKeys } from '@/src/services/storage';
import * as Biometric from '@/src/services/biometric';
import { useToast } from '@/src/components/Toast';

export default function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const status = useAuthStore((s) => s.status);
  const setHasSession = useAuthStore.setState;
  const { showError } = useToast();

  const [instanceUrl, setInstanceUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showInstanceConfig, setShowInstanceConfig] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Biometric availability: stored sid + biometric_enabled flag + native module
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    (async () => {
      const [savedUrl, savedEmail, savedPassword, bioFlag] = await Promise.all([
        storage.get(StorageKeys.instanceUrlBackup),
        storage.get(StorageKeys.emailBackup),
        storage.get(StorageKeys.passwordBackup),
        storage.get(StorageKeys.biometricEnabled),
      ]);
      if (savedUrl) setInstanceUrl(savedUrl);
      if (savedEmail) setEmail(savedEmail);
      setBioAvailable(
        !!savedPassword && bioFlag === '1' && Biometric.isModuleAvailable(),
      );
    })();
  }, []);

  const onSignIn = async () => {
    setErrorMsg(null);
    if (!instanceUrl.trim() || !email.trim() || !password.trim()) {
      setErrorMsg('Fill all fields.');
      return;
    }
    const ok = await login(email.trim(), password, instanceUrl.trim());
    if (!ok) {
      const err = useAuthStore.getState().error || 'Sign-in failed.';
      setErrorMsg(err);
      showError(err);
    }
  };

  const onBiometric = async () => {
    setErrorMsg(null);
    setBioBusy(true);
    try {
      // Prompts biometric, then re-authenticates with the stored password.
      const res = await useAuthStore.getState().biometricLogin();
      if (res.ok || res.reason === 'cancelled') return;
      if (res.reason === 'no_credentials') {
        setErrorMsg('No saved credentials — sign in with your password once.');
      } else {
        setErrorMsg("Couldn't verify biometric. Use your password.");
      }
    } finally {
      setBioBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <KeyboardAwareScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        enableOnAndroid
        extraScrollHeight={40}
      >
          <View style={s.hero}>
            <View style={s.logoCircle}>
              <Image
                source={require('@/assets/images/upande_logo.png')}
                style={{ width: 56, height: 56, resizeMode: 'contain' }}
              />
            </View>
            <Text style={s.appName}>Upande Production</Text>
            <Text style={s.tagline}>Sign in to continue</Text>
          </View>

          <View style={s.card}>
            <Text style={s.label}>Email</Text>
            <View style={s.input}>
              <Ionicons name="mail-outline" size={18} color={colors.textMuted} style={s.icon} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                style={s.inputText}
              />
            </View>

            <Text style={[s.label, { marginTop: spacing.md }]}>Password</Text>
            <View style={s.input}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={s.icon} />
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                returnKeyType="go"
                onSubmitEditing={onSignIn}
                style={s.inputText}
              />
              <TouchableOpacity onPress={() => setShowPassword((p) => !p)} hitSlop={8} style={{ paddingRight: spacing.md }}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            {errorMsg ? (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={s.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={onSignIn}
              disabled={status === 'loading'}
              activeOpacity={0.8}
              style={[s.primaryBtn, status === 'loading' && { opacity: 0.6 }]}
            >
              {status === 'loading' ? (
                <ActivityIndicator color={colors.textOnPrimary} />
              ) : (
                <Text style={s.primaryBtnText}>Sign in</Text>
              )}
            </TouchableOpacity>

            {bioAvailable ? (
              <TouchableOpacity
                onPress={onBiometric}
                disabled={bioBusy}
                activeOpacity={0.8}
                style={s.bioFab}
              >
                {bioBusy ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Ionicons name="finger-print" size={28} color={colors.text} />
                )}
              </TouchableOpacity>
            ) : null}
          </View>

          <Pressable onPress={() => setShowInstanceConfig((p) => !p)} style={s.instanceToggle}>
            <Text style={s.instanceText}>
              Instance: <Text style={{ fontFamily: fontFamily.semiBold, color: colors.text }}>{instanceUrl || 'Configure'}</Text>
            </Text>
            <Ionicons
              name={showInstanceConfig ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.textMuted}
            />
          </Pressable>

          {showInstanceConfig ? (
            <View style={[s.card, { marginTop: spacing.sm }]}>
              <Text style={s.label}>Instance URL</Text>
              <View style={s.input}>
                <Ionicons name="server-outline" size={18} color={colors.textMuted} style={s.icon} />
                <TextInput
                  value={instanceUrl}
                  onChangeText={setInstanceUrl}
                  placeholder="kaitet-group.upande.com"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={s.inputText}
                />
              </View>
            </View>
          ) : null}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  // No justifyContent: 'center' here -- centering a flexGrow container fights
  // KeyboardAwareScrollView's scroll-to-focused-input math and was leaving the
  // password field / Sign in button hidden behind the keyboard. Padding keeps
  // the form comfortably placed instead.
  scroll: { padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxl, flexGrow: 1 },
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  appName: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text },
  tagline: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: { marginLeft: spacing.md },
  inputText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.text,
    padding: spacing.md,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    marginTop: spacing.md,
  },
  errorText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.error },
  primaryBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryBtnText: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.textOnPrimary },
  bioFab: {
    alignSelf: 'center',
    marginTop: spacing.xl,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },
  instanceToggle: {
    marginTop: spacing.lg,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  instanceText: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
});
