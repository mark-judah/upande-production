import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useUIStore } from '@/src/stores/uiStore';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Hide the built-in × close button (e.g. when a FAB is acting as the
   *  close affordance via the FAB→× morph). */
  hideCloseButton?: boolean;
  children: React.ReactNode;
}

/**
 * In-screen overlay sheet (NOT React Native's Modal). Renders absolutely
 * within its parent, sliding up from the bottom. Because it stays inside the
 * RN view hierarchy, sibling elements with a higher `zIndex` (e.g. the FAB
 * morphing into a close button) can render on top of it.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  hideCloseButton,
  children,
}: SheetProps) {
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get('window').height;
  const setSheetTopY = useUIStore((s) => s.setSheetTopY);

  // Slide + fade animation. Kept on the native driver for smoothness.
  const slide = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = React.useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      slide.setValue(screenH);
      fade.setValue(0);
      Animated.parallel([
        Animated.timing(slide, {
          toValue: 0,
          duration: 320,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: true,
        }),
        Animated.timing(fade, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      // Clear the reported top immediately so the FAB starts collapsing now,
      // before the sheet slide-out completes.
      setSheetTopY(null);
      Animated.parallel([
        Animated.timing(slide, {
          toValue: screenH,
          duration: 240,
          easing: Easing.bezier(0.4, 0, 0.6, 1),
          useNativeDriver: true,
        }),
        Animated.timing(fade, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => setMounted(false));
    }
  }, [visible, slide, fade, screenH, mounted, setSheetTopY]);

  useEffect(() => {
    // When the sheet unmounts (parent removes it without toggling visible),
    // make sure we don't leave a stale topY behind.
    return () => setSheetTopY(null);
  }, [setSheetTopY]);

  if (!mounted) return null;

  return (
    <View style={s.root} pointerEvents="box-none">
      <Animated.View
        style={[s.backdrop, { opacity: fade }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <View style={s.panelWrap} pointerEvents="box-none">
        <Animated.View
          onLayout={(e) => {
            const layoutY = e.nativeEvent.layout.y;
            if (Number.isFinite(layoutY)) setSheetTopY(layoutY);
          }}
          style={[
            s.sheet,
            { paddingBottom: insets.bottom + spacing.md, transform: [{ translateY: slide }] },
          ]}
        >
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{title}</Text>
              {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
            </View>
            {hideCloseButton ? null : (
              <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          {children}
        </Animated.View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 50, elevation: 8 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  panelWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    maxHeight: '90%',
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
  subtitle: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
