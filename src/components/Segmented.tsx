import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (next: T) => void;
}

/** Animated pill indicator slides under the active segment with a spring
 *  motion (slight elastic settle, no overshoot loops). Pure JS-side animation
 *  on translateX so it stays at 60fps even on cheap devices. */
export function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  const [containerWidth, setContainerWidth] = useState(0);

  const activeIndex = useMemo(
    () => Math.max(0, options.findIndex((o) => o.value === value)),
    [value, options],
  );

  const padding = 4;
  const innerWidth = Math.max(0, containerWidth - padding * 2);
  const segmentWidth = options.length > 0 ? innerWidth / options.length : 0;

  const anim = useRef(new Animated.Value(activeIndex)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: activeIndex,
      useNativeDriver: true,
      // Tuned for "slow build → quick slide → soft settle":
      // - low friction keeps the slide alive past midpoint
      // - moderate tension prevents an over-snappy snap
      friction: 8,
      tension: 60,
    }).start();
  }, [activeIndex, anim]);

  const onLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  return (
    <View style={s.container} onLayout={onLayout}>
      {/* Sliding pill indicator — only rendered once container width is known */}
      {segmentWidth > 0 ? (
        <Animated.View
          style={[
            s.indicator,
            {
              width: segmentWidth,
              transform: [
                {
                  translateX: anim.interpolate({
                    inputRange: options.map((_, i) => i),
                    outputRange: options.map((_, i) => i * segmentWidth),
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}

      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.7}
            style={s.btn}
          >
            <Text style={[s.label, active && s.labelActive]} numberOfLines={1}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.full,
    padding: 4,
    marginBottom: spacing.md,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    // Sit on top of the animated indicator
    zIndex: 1,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  labelActive: {
    fontFamily: fontFamily.semiBold,
    color: colors.text,
  },
});
