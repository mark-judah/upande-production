import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useAuthStore } from '@/src/stores/authStore';
import { useDashboardStore } from '@/src/stores/dashboardStore';
import { useNetworkStore } from '@/src/stores/networkStore';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { AgricultureDashboard } from '@/src/components/AgricultureDashboard';

export default function HomeScreen() {
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const firstName = (fullName || email || 'there').split(' ')[0];

  const loadDashboard = useDashboardStore((s) => s.load);
  const initNetwork = useNetworkStore((s) => s.init);

  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    initNetwork();
    await loadDashboard();
  }, [loadDashboard, initNetwork]);

  useRefreshOnFocus(loadAll);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={s.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
    >
      <Text style={s.greeting}>Welcome back, {firstName}</Text>
      <AgricultureDashboard />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  greeting: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text, marginBottom: spacing.md },
});
