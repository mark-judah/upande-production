import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { Screen } from '@/src/components/Screen';
import { Button } from '@/src/components/Button';
import { useUpdateRequiredStore } from '@/src/stores/updateRequiredStore';
import { useApkUpdate } from '@/src/services/updates/UpdateProvider';
import { formatBytes } from '@/src/services/updates/releases';
import { openInBrowser } from '@/src/services/updates/install-apk';
import { shouldRefreshApk, shouldUnlock } from '@/src/services/updates/gate-state';
import { getReleaseInfo } from '@/src/services/release-info';
import { APP_VERSION } from '@/src/services/version';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';

/**
 * Shown when the server's minimum-version gate (HTTP 426) rejects this build.
 * No back, no drawer: the only way out is to update. It tries a JS update first
 * (same runtime), then falls back to the APK download.
 */
export default function UpdateRequiredScreen() {
  const { minVersion, latestVersion, clear } = useUpdateRequiredStore();
  const { check, refresh, install, downloading, progress, downloaded, installError } = useApkUpdate();
  const [otaReady, setOtaReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [apkUrl, setApkUrl] = useState<string | null>(null);
  const lastApkCheck = useRef(0);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const recheck = useCallback(async () => {
    setWorking(true);
    setMessage(null);
    try {
      const info = await getReleaseInfo();
      if (shouldUnlock(info, APP_VERSION)) {
        clear();
        return;
      }
      setApkUrl(info?.apkUrl ?? null);
      if (!__DEV__ && Updates.isEnabled) {
        try {
          const found = await Updates.checkForUpdateAsync();
          if (found.isAvailable) {
            const fetched = await Updates.fetchUpdateAsync();
            if (fetched.isNew) setOtaReady(true);
          }
        } catch {
          // No JS update for this runtime: fall through to the APK.
        }
      }
      // GitHub allows 60 unauthenticated requests/hour per IP and a farm shares one: ask
      // at most every few minutes, however often the phone is foregrounded.
      if (shouldRefreshApk(lastApkCheck.current, Date.now())) {
        lastApkCheck.current = Date.now();
        await refresh();
      }
    } finally {
      setWorking(false);
    }
  }, [clear, refresh]);

  useEffect(() => {
    recheck();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') recheck();
    });
    return () => sub.remove();
  }, [recheck]);

  const apk = check?.apk ?? null;
  const apkReady = !!apk && downloaded === apk.version;

  const onPress = async () => {
    if (otaReady) {
      await Updates.reloadAsync();
      return;
    }
    if (apk && check?.available) {
      await install();
      return;
    }
    await recheck();
    if (apkUrl) {
      // GitHub could not be asked (rate limit / offline): the server knows the APK link.
      await openInBrowser(apkUrl).catch(() => setMessage('Could not open the download link.'));
      return;
    }
    setMessage('No update is available yet. Check your connection and try again.');
  };

  let label = 'Check for update';
  if (otaReady) label = 'Apply update';
  else if (downloading) {
    label = progress?.fraction != null ? `Downloading ${Math.round(progress.fraction * 100)}%` : 'Downloading…';
  } else if (apkReady && apk) label = `Install v${apk.version}`;
  else if (apk && check?.available) {
    const size = formatBytes(apk.sizeBytes);
    label = `Download v${apk.version}${size ? ` (${size})` : ''}`;
  } else if (apkUrl) label = 'Download the update';

  return (
    <Screen>
      <View style={s.wrap}>
        <Text style={s.title}>Update required</Text>
        <Text style={s.body}>
          This version of Upande Production (v{APP_VERSION}) is no longer supported
          {minVersion ? `; v${minVersion} or newer is needed` : ''}. Update to keep recording data.
        </Text>
        {latestVersion ? <Text style={s.hint}>Latest version: v{latestVersion}</Text> : null}
        {message ? <Text style={s.hint}>{message}</Text> : null}
        {installError ? <Text style={s.error}>{installError.message}</Text> : null}
        <View style={{ height: spacing.lg }} />
        <Button label={label} onPress={onPress} loading={working || downloading} iconLeft="cloud-download-outline" />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text, marginBottom: spacing.md },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.textSecondary },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },
  error: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.danger, marginTop: spacing.sm },
});
