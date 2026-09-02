import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  TouchableOpacity,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '@/src/theme';
import { useUIStore } from '@/src/stores/uiStore';

interface FABProps {
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Hide without unmounting (e.g. when on a tab without an add action). */
  visible?: boolean;
  /**
   * When true, the FAB morphs into a close button: translates up to the
   * top-right CORNER of the currently-open sheet (reported via uiStore),
   * rotates its plus icon 45° (so it reads as ×), shrinks slightly, and
   * fades a white surface layer over the dark primary so it reads against
   * the sheet's surface.
   */
  expanded?: boolean;
  /** Override colour (defaults to primary). */
  color?: string;
  /** Extra style to nudge position per-screen if needed. */
  style?: ViewStyle;
}

const FAB_SIZE = 56;

export function FAB({
  icon = 'add',
  onPress,
  visible = true,
  expanded = false,
  color,
  style,
}: FABProps) {
  const insets = useSafeAreaInsets();
  const sheetTopY = useUIStore((s) => s.sheetTopY);

  // Single animated progress drives everything via interpolation. Stays on
  // the native driver — colour change is done by fading a white layer over
  // the dark base (opacity is native-supported).
  const progress = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: expanded ? 1 : 0,
      duration: 380,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [expanded, progress]);

  if (!visible) return null;

  // Hug the bottom — only respects the OS safe-area (home indicator /
  // gesture bar). The FAB will overlap the tab bar.
  const bottom = insets.bottom - 20;

  // Target position when expanded = top-right corner of the open sheet.
  // If no sheet has reported a top yet, fall back to ~12% from the screen
  // top so the morph still looks reasonable while layout settles.
  const screenH = Dimensions.get('window').height;
  const fallbackTop = Math.max(insets.top + 16, screenH * 0.12);
  const cornerTop = (sheetTopY ?? fallbackTop) + 12;
  const restingTop = screenH - bottom - FAB_SIZE;
  const translateYDelta = cornerTop - restingTop;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, translateYDelta],
  });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });
  const scale = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.92, 0.8],
  });
  // White surface overlay fades in to replace the dark primary background.
  const surfaceOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  // Icon glyph colour snaps at midpoint — Ionicons doesn't accept Animated
  // values. The rotation distracts the eye from the snap.
  const iconColor = expanded ? colors.text : colors.textOnPrimary;

  return (
    <Animated.View
      style={[
        s.fab,
        {
          backgroundColor: color ?? colors.primary,
          bottom,
          transform: [{ translateY }, { rotate }, { scale }],
        },
        style,
      ]}
    >
      {/* White layer that fades IN to cover the dark base when expanded.
          Borders + radius live on this layer so the hairline only shows
          while the FAB is in its "close" state. */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          s.surfaceLayer,
          { opacity: surfaceOpacity },
        ]}
      />
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={s.touch}>
        <Ionicons name={icon} size={26} color={iconColor} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
    zIndex: 1000,
    elevation: 12,
  },
  surfaceLayer: {
    backgroundColor: colors.surface,
    borderRadius: FAB_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  touch: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: FAB_SIZE / 2,
  },
});
