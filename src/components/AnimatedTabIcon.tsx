import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme';

interface AnimatedTabIconProps {
  /** Icon shown when the tab is unfocused. */
  outline: keyof typeof Ionicons.glyphMap;
  /** Icon shown when the tab is focused (filled variant). */
  filled: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  size: number;
}

/** Tab icon that springs up to 1.18× on focus with an ease-out curve, and
 *  fades / scales back down when unfocused. The icon also swaps from its
 *  outline glyph to its filled glyph at the peak of the focus transition.
 *  Runs on the native driver so it's smooth even when the underlying screen
 *  is mid-render. */
export function AnimatedTabIcon({ outline, filled, focused, size }: AnimatedTabIconProps) {
  const scale = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(scale, {
      toValue: focused ? 1 : 0,
      duration: 360,
      // Ease-in-out cubic — slow start, accelerate through the middle, slow
      // settle. Makes the size change visible as a motion, not a teleport.
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [focused, scale]);

  // Slight overshoot at 65% of the curve before settling — the inOut curve
  // already gives the motion shape; the overshoot adds a tactile bounce.
  const transform = [
    {
      scale: scale.interpolate({
        inputRange: [0, 0.65, 1],
        outputRange: [1, 1.28, 1.2],
      }),
    },
    {
      translateY: scale.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -2],
      }),
    },
  ];
  const opacity = scale.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  return (
    <Animated.View style={{ transform, opacity }}>
      <Ionicons
        name={focused ? filled : outline}
        size={size}
        color={focused ? colors.text : colors.textMuted}
      />
    </Animated.View>
  );
}
