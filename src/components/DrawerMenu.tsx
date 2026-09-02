import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useAuthStore } from '@/src/stores/authStore';
import { useUIStore } from '@/src/stores/uiStore';

interface NavItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}

/** Items shown in the drawer (covers everything — tabs that already appear in
 *  the bottom bar AND the drawer-only ones). Keeps the drawer as the full
 *  feature index, matching the coffee app behaviour. */
const NAV_ITEMS: NavItem[] = [
  { label: 'Home', icon: 'home-outline', route: '/' },
  { label: 'Crop Cycle', icon: 'leaf-outline', route: '/crop-cycle' },
  { label: 'Harvesting', icon: 'cut-outline', route: '/harvesting' },
  { label: 'Propagation', icon: 'sparkles-outline', route: '/propagation' },
  { label: 'Greenhouse Ops', icon: 'shield-checkmark-outline', route: '/greenhouse-ops' },
  { label: 'Greenhouse Specs', icon: 'home-outline', route: '/greenhouse-specs' },
  { label: 'Trials', icon: 'flask-outline', route: '/trials' },
  { label: 'Forecasting', icon: 'trending-up-outline', route: '/forecasting' },
  { label: 'Planning', icon: 'calendar-outline', route: '/planning' },
  { label: 'Field Rejects', icon: 'warning-outline', route: '/field-rejects' },
  { label: 'Reports', icon: 'bar-chart-outline', route: '/reports' },
];

export function DrawerMenu() {
  const router = useRouter();
  const visible = useUIStore((s) => s.drawerOpen);
  const onClose = useUIStore((s) => s.closeDrawer);
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const logout = useAuthStore((s) => s.logout);

  const drawerWidth = Math.min(Math.max(screenWidth * 0.8, 240), 320);
  const slide = useRef(new Animated.Value(-drawerWidth)).current;

  useEffect(() => {
    if (visible) {
      slide.setValue(-drawerWidth);
      Animated.timing(slide, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    } else {
      slide.setValue(-drawerWidth);
    }
  }, [visible, drawerWidth, slide]);

  const closeWithAnim = () => {
    Animated.timing(slide, { toValue: -drawerWidth, duration: 200, useNativeDriver: true }).start(
      () => onClose(),
    );
  };

  const navigate = (route: string) => {
    closeWithAnim();
    setTimeout(() => router.push(route as any), 220);
  };

  const onSettings = () => {
    closeWithAnim();
    setTimeout(() => router.push('/settings'), 220);
  };

  const onSignOut = async () => {
    closeWithAnim();
    setTimeout(async () => {
      await logout();
      router.replace('/login');
    }, 220);
  };

  const initials =
    (fullName || email || '?')
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || '?';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={closeWithAnim}
      statusBarTranslucent
      navigationBarTranslucent
      hardwareAccelerated
    >
      <View style={s.overlay}>
        <Pressable style={s.backdrop} onPress={closeWithAnim} />
        <Animated.View
          style={[
            s.drawer,
            {
              width: drawerWidth,
              transform: [{ translateX: slide }],
            },
          ]}
        >
          <ScrollView
            contentContainerStyle={[
              s.scroll,
              { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.md },
            ]}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            <View style={s.header}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{initials}</Text>
              </View>
              <Text style={s.name} numberOfLines={1}>
                {fullName || email || 'User'}
              </Text>
              {email ? (
                <Text style={s.email} numberOfLines={1}>
                  {email}
                </Text>
              ) : null}
            </View>

            <View style={s.nav}>
              {NAV_ITEMS.map((item) => (
                <TouchableOpacity
                  key={item.route}
                  style={s.navItem}
                  onPress={() => navigate(item.route)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={item.icon} size={20} color={colors.textSecondary} />
                  <Text style={s.navLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.footer}>
              <TouchableOpacity style={s.footerRow} onPress={onSettings} activeOpacity={0.7}>
                <View style={[s.badge, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="cog-outline" size={15} color="#6366F1" />
                </View>
                <Text style={s.footerText}>Settings</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.footerRow} onPress={onSignOut} activeOpacity={0.7}>
                <View style={[s.badge, { backgroundColor: '#FEF2F2' }]}>
                  <Ionicons name="log-out-outline" size={15} color={colors.error} />
                </View>
                <Text style={[s.footerText, { color: colors.error }]}>Sign Out</Text>
              </TouchableOpacity>

              <Text style={s.version}>Upande Production v1.0</Text>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.surface,
    elevation: 24,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg },
  header: {
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  avatarText: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.textOnPrimary },
  name: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  email: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },

  nav: { paddingTop: spacing.xs, paddingBottom: spacing.sm },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 11,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  navLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },

  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  badge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  footerText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text, flex: 1 },
  version: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingBottom: spacing.xs,
  },
});
