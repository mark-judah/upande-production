import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontFamily, fontSize } from '@/src/theme';

interface ScreenProps {
  title?: string;
  /** Optional accent passed through to header underline / spinner. */
  color?: string;
  /** Left-side icon (defaults to menu hamburger) */
  leftIcon?: React.ComponentProps<typeof Ionicons>['name'];
  onPressLeft?: () => void;
  /** Right-side icon button */
  rightIcon?: React.ComponentProps<typeof Ionicons>['name'];
  onPressRight?: () => void;

  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;

  refreshing?: boolean;
  onRefresh?: () => void;

  /** Hide the scroll wrapper for screens that manage their own layout. */
  scroll?: boolean;
  children: React.ReactNode;
}

export function Screen({
  title,
  color = colors.primary,
  leftIcon,
  onPressLeft,
  rightIcon,
  onPressRight,
  loading,
  error,
  onRetry,
  refreshing,
  onRefresh,
  scroll = true,
  children,
}: ScreenProps) {
  const header = title || leftIcon || rightIcon ? (
    <View style={[s.header, { borderBottomColor: colors.border }]}>
      {leftIcon ? (
        <TouchableOpacity onPress={onPressLeft} hitSlop={8} style={s.headerBtn}>
          <Ionicons name={leftIcon} size={22} color={colors.text} />
        </TouchableOpacity>
      ) : (
        <View style={s.headerBtn} />
      )}
      <Text style={s.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      {rightIcon ? (
        <TouchableOpacity onPress={onPressRight} hitSlop={8} style={s.headerBtn}>
          <Ionicons name={rightIcon} size={22} color={colors.text} />
        </TouchableOpacity>
      ) : (
        <View style={s.headerBtn} />
      )}
    </View>
  ) : null;

  let body: React.ReactNode;
  if (loading) {
    body = (
      <View style={s.center}>
        <ActivityIndicator size="large" color={color} />
      </View>
    );
  } else if (error) {
    body = (
      <View style={s.center}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.error} />
        <Text style={s.errorText}>{error}</Text>
        {onRetry ? (
          <TouchableOpacity onPress={onRetry} style={s.retryBtn}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  } else if (scroll) {
    body = (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined
        }
      >
        {children}
      </ScrollView>
    );
  } else {
    body = <View style={{ flex: 1 }}>{children}</View>;
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      {header}
      {body}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface,
  },
  headerBtn: { width: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  errorText: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.error, textAlign: 'center' },
  retryBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  retryText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.primary },
});
