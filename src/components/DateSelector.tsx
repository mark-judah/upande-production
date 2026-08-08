import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDayLabel, shiftISO, todayISO } from '@/src/date';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/** Day stepper for picking a date. Steps one day at a time with a "Today"
 *  quick-reset. Capped at `maxDate` (default today; pass null to allow future).
 *  Value/onChange use YYYY-MM-DD. */
export function DateSelector({
  value,
  onChange,
  label = 'Date',
  maxDate = todayISO(),
}: {
  value: string;
  onChange: (iso: string) => void;
  label?: string;
  maxDate?: string | null;
}) {
  const atMax = maxDate != null && value >= maxDate;
  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>
      <View style={s.row}>
        <Pressable style={s.btn} onPress={() => onChange(shiftISO(value, -1))} hitSlop={6}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={s.center}>
          <Text style={s.dateText}>{formatDayLabel(value)}</Text>
          <Text style={s.dateSub}>{value}</Text>
        </View>
        <Pressable
          style={[s.btn, atMax && s.btnDisabled]}
          disabled={atMax}
          onPress={() => onChange(shiftISO(value, 1))}
          hitSlop={6}
        >
          <Ionicons name="chevron-forward" size={20} color={atMax ? colors.textMuted : colors.text} />
        </Pressable>
        {value !== todayISO() ? (
          <Pressable style={s.todayBtn} onPress={() => onChange(todayISO())} hitSlop={6}>
            <Text style={s.todayText}>Today</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  btn: { width: 40, height: 40, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.4 },
  center: { flex: 1, alignItems: 'center' },
  dateText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  dateSub: { fontFamily: fontFamily.regular, fontSize: 10, color: colors.textMuted, marginTop: 1 },
  todayBtn: { paddingHorizontal: spacing.md, height: 40, borderRadius: borderRadius.sm, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  todayText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: colors.textOnPrimary },
});
