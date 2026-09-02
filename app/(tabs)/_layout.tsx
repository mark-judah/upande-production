import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { AnimatedTabIcon } from '@/src/components/AnimatedTabIcon';
import { useUIStore } from '@/src/stores/uiStore';

type TabIconPair = { outline: keyof typeof Ionicons.glyphMap; filled: keyof typeof Ionicons.glyphMap };

const ICONS: Record<string, TabIconPair> = {
  index: { outline: 'home-outline', filled: 'home' },
  'crop-cycle': { outline: 'leaf-outline', filled: 'leaf' },
  harvesting: { outline: 'cut-outline', filled: 'cut' },
  propagation: { outline: 'sparkles-outline', filled: 'sparkles' },
  'greenhouse-ops': { outline: 'shield-checkmark-outline', filled: 'shield-checkmark' },
};

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const openDrawer = useUIStore((s) => s.openDrawer);

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.surface,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontFamily: fontFamily.semiBold,
          fontSize: fontSize.lg,
        },
        headerTitleAlign: 'center',
        headerLeft: () => (
          <TouchableOpacity
            onPress={openDrawer}
            style={{ marginLeft: spacing.lg }}
            activeOpacity={0.7}
            hitSlop={8}
          >
            <Ionicons name="menu-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        ),
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 64 + insets.bottom,
          paddingTop: 10,
          paddingBottom: insets.bottom,
        },
        // Center the icon within the taller bar (RN's default top-aligns it).
        tabBarItemStyle: {
          paddingTop: 4,
        },
        tabBarIcon: ({ focused, size }) => {
          const pair = ICONS[route.name];
          if (!pair) {
            return <Ionicons name="help-outline" size={size} color={colors.textMuted} />;
          }
          return (
            <AnimatedTabIcon outline={pair.outline} filled={pair.filled} focused={focused} size={size} />
          );
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Upande Production' }} />
      <Tabs.Screen name="crop-cycle" options={{ title: 'Crop Cycle' }} />
      <Tabs.Screen name="harvesting" options={{ title: 'Harvesting' }} />
      <Tabs.Screen name="propagation" options={{ title: 'Propagation' }} />
      <Tabs.Screen name="greenhouse-ops" options={{ title: 'Greenhouse Ops' }} />

      {/* Drawer-only — hide from bottom bar but keep route in stack */}
      <Tabs.Screen name="trials" options={{ title: 'Trials', href: null }} />
      <Tabs.Screen name="forecasting" options={{ title: 'Forecasting', href: null }} />
      <Tabs.Screen name="planning" options={{ title: 'Planning', href: null }} />
      <Tabs.Screen name="field-rejects" options={{ title: 'Field Rejects', href: null }} />
      <Tabs.Screen name="greenhouse-specs" options={{ title: 'Greenhouse Specs', href: null }} />
    </Tabs>
  );
}
