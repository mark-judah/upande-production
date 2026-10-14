import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, DMSans_400Regular, DMSans_500Medium } from '@expo-google-fonts/dm-sans';
import { Poppins_600SemiBold, Poppins_700Bold } from '@expo-google-fonts/poppins';
import * as SplashScreen from 'expo-splash-screen';
import { ToastProvider } from '@/src/components/Toast';
import { DrawerMenu } from '@/src/components/DrawerMenu';
import { OfflineBanner } from '@/src/components/OfflineBanner';
import { useAuthStore } from '@/src/stores/authStore';
import { useNetworkStore } from '@/src/stores/networkStore';
import { startTelemetry } from '@/src/services/telemetry/service';
import { UpdateProvider } from '@/src/services/updates/UpdateProvider';
import { useUpdateRequiredStore } from '@/src/stores/updateRequiredStore';

// Hold the native splash until fonts + auth hydrated.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const hydrated = useAuthStore((s) => s.hydrated);
  const hasSession = useAuthStore((s) => s.hasSession);
  const biometricLocked = useAuthStore((s) => s.biometricLocked);
  const hydrate = useAuthStore((s) => s.hydrate);
  const initNetwork = useNetworkStore((s) => s.init);
  const updateRequired = useUpdateRequiredStore((s) => s.required);

  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    hydrate();
    // Start the network polling + AppState listener once at boot.
    initNetwork();
  }, [hydrate, initNetwork]);

  useEffect(() => {
    if (fontsLoaded && hydrated) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, hydrated]);

  // Device telemetry (hourly, offline-queued) — only once authenticated and
  // unlocked, so the payload carries the logged-in user.
  useEffect(() => {
    if (hydrated && hasSession && !biometricLocked) startTelemetry();
  }, [hydrated, hasSession, biometricLocked]);

  // Auth gate — route between login / biometric-lock / tabs based on state.
  useEffect(() => {
    if (!hydrated) return;
    const first = segments[0] as string | undefined;
    const inAuthFlow = first === 'login' || first === 'biometric-lock';

    if (!hasSession) {
      if (first !== 'login') router.replace('/login');
      return;
    }
    if (biometricLocked) {
      if (first !== 'biometric-lock') router.replace('/biometric-lock');
      return;
    }
    // The server's minimum-version gate rejected this build: lock to the update screen.
    if (updateRequired) {
      if (first !== 'update-required') router.replace('/update-required');
      return;
    }
    if (first === 'update-required') {
      router.replace('/');
      return;
    }
    // Authenticated + unlocked — kick the user out of the auth screens.
    if (inAuthFlow) router.replace('/');
  }, [hydrated, hasSession, biometricLocked, updateRequired, segments, router]);

  if (!fontsLoaded || !hydrated) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <ToastProvider>
        <UpdateProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            // Forward nav slides in from the right; the back gesture slides
            // the screen out to the left. Matches platform conventions.
            animation: 'slide_from_right',
            gestureEnabled: true,
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" />
          <Stack.Screen name="biometric-lock" options={{ animation: 'fade' }} />
          <Stack.Screen name="devices" />
          <Stack.Screen name="update-required" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen
            name="camera-scanner"
            options={{ presentation: 'fullScreenModal' }}
          />
        </Stack>
        {/* Drawer is rendered at the root so its Modal sits ABOVE the Tabs
            navigator (including the bottom tab bar). Lives in zustand state. */}
        <DrawerMenu />
        {/* Sticky offline indicator across all screens. */}
        <OfflineBanner />
        </UpdateProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
