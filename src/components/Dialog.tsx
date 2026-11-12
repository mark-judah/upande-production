import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

export type DialogTone = 'danger' | 'success' | 'warn' | 'info';

const TONE: Record<DialogTone, { fg: string; bg: string }> = {
  danger: { fg: colors.danger, bg: '#FEF2F2' },
  success: { fg: colors.success, bg: '#F0FDF4' },
  warn: { fg: colors.warning, bg: '#FFFBEB' },
  info: { fg: colors.text, bg: colors.surfaceAlt },
};

type DialogProps = {
  visible: boolean;
  /** Back button and backdrop tap. Omit to make the dialog undismissable. */
  onClose?: () => void;
  title: string;
  subtitle?: ReactNode;
  /** Round badge above the title. */
  icon?: { name: keyof typeof Ionicons.glyphMap; tone?: DialogTone };
  children?: ReactNode;
  /** Footer row, usually <Button>s with flex. */
  actions?: ReactNode;
  /** Ignore backdrop / back while something is in flight. */
  busy?: boolean;
};

/** The app's centred dialog, same as Upande Packhouse's: dimmed backdrop,
 *  white rounded card, optional icon badge, title, body and an action row. */
export function Dialog({ visible, onClose, title, subtitle, icon, children, actions, busy }: DialogProps) {
  const dismiss = busy ? undefined : onClose;
  const tone = TONE[icon?.tone ?? 'info'];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss ?? (() => {})} statusBarTranslucent>
      <View style={s.wrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        <View style={s.card}>
          {icon ? (
            <View style={[s.icon, { backgroundColor: tone.bg }]}>
              <Ionicons name={icon.name} size={26} color={tone.fg} />
            </View>
          ) : null}
          <Text style={s.title}>{title}</Text>
          {subtitle ? (
            typeof subtitle === 'string' ? <Text style={s.subtitle}>{subtitle}</Text> : subtitle
          ) : null}
          {children ? (
            <ScrollView style={s.body} keyboardShouldPersistTaps="handled" bounces={false}>
              {children}
            </ScrollView>
          ) : null}
          {actions ? <View style={s.actions}>{actions}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.text,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: spacing.xs,
    alignSelf: 'stretch',
  },
  body: { alignSelf: 'stretch', marginTop: spacing.md, flexGrow: 0 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignSelf: 'stretch', marginTop: spacing.lg },
});
