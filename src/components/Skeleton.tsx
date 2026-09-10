/**
 * Skeleton shimmer system — ported from mona-shelve's dashboard skeleton.
 *
 * One shared Animated.Value drives a diagonal light strip that sweeps
 * left-to-right across EVERY skeleton box simultaneously, like a single
 * light source passing over the whole screen. Runs on the native thread
 * (useNativeDriver: true), zero JS-thread cost.
 *
 * Exports:
 *   SkeletonBox       — single configurable shimmer shape
 *   AgricultureDashboardSkeleton — mirrors the harvest dashboard's bento
 *                        layout with the real card colours, so the
 *                        skeleton → content crossfade is seamless.
 */

import React, { useEffect } from 'react';
import { Animated, Dimensions, StyleSheet, View, type ViewStyle } from 'react-native';
import { borderRadius, spacing } from '@/src/theme';

const { width: SW } = Dimensions.get('window');

const STRIP_W = Math.round(SW * 0.45);
const SWEEP_MS = 1600;

const sweep = new Animated.Value(0);
let sweepRunning = false;

function startSweep() {
  if (sweepRunning) return;
  sweepRunning = true;
  Animated.loop(
    Animated.timing(sweep, { toValue: 1, duration: SWEEP_MS, useNativeDriver: true }),
  ).start();
}

const sharedTranslateX = sweep.interpolate({
  inputRange: [0, 1],
  outputRange: [-(STRIP_W + SW), SW + STRIP_W],
});

export interface SkeletonBoxProps {
  width?: number | string;
  height?: number;
  radius?: number;
  baseColor?: string;
  shimmerColor?: string;
  style?: ViewStyle;
}

export function SkeletonBox({
  width = '100%',
  height = 16,
  radius = borderRadius.md,
  baseColor = '#E2E2E2',
  shimmerColor = 'rgba(255,255,255,0.82)',
  style,
}: SkeletonBoxProps) {
  useEffect(startSweep, []);

  return (
    <View
      style={[
        { width: width as any, height, borderRadius: radius, backgroundColor: baseColor, overflow: 'hidden' },
        style,
      ]}
    >
      <Animated.View
        style={{
          position: 'absolute',
          top: -(height * 3),
          bottom: -(height * 3),
          width: STRIP_W,
          backgroundColor: shimmerColor,
          transform: [{ skewX: '-18deg' }, { translateX: sharedTranslateX }],
        }}
      />
    </View>
  );
}

// Dark-card palette — matches AgricultureDashboard's own literal tones so the
// skeleton crossfades into real content without a colour jump.
const D = {
  hero: '#052E16',
  received: '#171717',
  good: '#1C1917',
  reject: '#1C1917',
  card: '#E8E8E8',
  shimmer: 'rgba(255,255,255,0.10)',
  shimmerLight: 'rgba(255,255,255,0.72)',
};

function DarkBox(props: Omit<SkeletonBoxProps, 'shimmerColor'> & { color: string }) {
  const { color, ...rest } = props;
  return <SkeletonBox {...rest} baseColor={color} shimmerColor={D.shimmer} />;
}

export function AgricultureDashboardSkeleton() {
  return (
    <View style={st.wrap}>
      <DarkBox width="100%" height={152} radius={20} color={D.hero} style={st.gap} />

      <View style={st.row}>
        <DarkBox width="48.5%" height={100} radius={16} color={D.received} />
        <DarkBox width="48.5%" height={100} radius={16} color={D.good} />
      </View>

      <DarkBox width="100%" height={90} radius={16} color={D.reject} style={st.gap} />

      <SkeletonBox width="100%" height={110} radius={16} baseColor={D.card} shimmerColor={D.shimmerLight} style={st.gap} />
      <SkeletonBox width="100%" height={72} radius={12} baseColor={D.card} shimmerColor={D.shimmerLight} style={st.gapSmall} />
      <SkeletonBox width="100%" height={72} radius={12} baseColor={D.card} shimmerColor={D.shimmerLight} />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { paddingBottom: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  gap: { marginBottom: spacing.sm },
  gapSmall: { marginBottom: spacing.xs },
});
