import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fromISO(iso: string): Date {
  const d = iso ? new Date(`${iso}T00:00:00`) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Tap-to-open calendar date picker. Pure JS (View/Pressable grid, no native
 *  module) so it works over OTA without an app-store/APK rebuild.
 *  Value/onChange use YYYY-MM-DD. */
export function DateField({
  label,
  value,
  onChange,
  placeholder = 'Select date…',
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? fromISO(value) : null;
  const [visibleMonth, setVisibleMonth] = useState(() => fromISO(value));

  const weeks = useMemo(() => {
    const monthStart = startOfMonth(visibleMonth);
    const monthEnd = endOfMonth(visibleMonth);
    const gridStart = startOfWeek(monthStart);
    const gridEnd = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const out: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [visibleMonth]);

  const openPicker = () => {
    setVisibleMonth(value ? fromISO(value) : new Date());
    setOpen(true);
  };

  const pick = (d: Date) => {
    onChange(toISO(d));
    setOpen(false);
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={s.label}>{label}</Text>
      <Pressable style={s.wrap} onPress={openPicker}>
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
        <Text style={[s.text, !value && s.placeholder]}>{value || placeholder}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setOpen(false)}>
          <Pressable style={s.card} onPress={() => {}}>
            <View style={s.monthRow}>
              <Pressable style={s.navBtn} onPress={() => setVisibleMonth((m) => subMonths(m, 1))} hitSlop={8}>
                <Ionicons name="chevron-back" size={20} color={colors.text} />
              </Pressable>
              <Text style={s.monthLabel}>{format(visibleMonth, 'MMMM yyyy')}</Text>
              <Pressable style={s.navBtn} onPress={() => setVisibleMonth((m) => addMonths(m, 1))} hitSlop={8}>
                <Ionicons name="chevron-forward" size={20} color={colors.text} />
              </Pressable>
            </View>

            <View style={s.weekRow}>
              {WEEKDAY_LABELS.map((w, i) => (
                <Text key={i} style={s.weekdayCell}>{w}</Text>
              ))}
            </View>

            {weeks.map((week, wi) => (
              <View key={wi} style={s.weekRow}>
                {week.map((d, di) => {
                  const inMonth = isSameMonth(d, visibleMonth);
                  const isSelected = selected ? isSameDay(d, selected) : false;
                  return (
                    <Pressable
                      key={di}
                      style={[s.dayCell, isSelected && s.dayCellSelected]}
                      onPress={() => pick(d)}
                    >
                      <Text
                        style={[
                          s.dayText,
                          !inMonth && s.dayTextMuted,
                          isSelected && s.dayTextSelected,
                        ]}
                      >
                        {d.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}

            <Pressable style={s.todayBtn} onPress={() => pick(new Date())}>
              <Text style={s.todayText}>Today</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const CELL = 40;

const s = StyleSheet.create({
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  text: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text },
  placeholder: { color: colors.textMuted },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: {
    width: CELL * 7 + spacing.lg * 2,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  navBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  weekRow: { flexDirection: 'row' },
  weekdayCell: {
    width: CELL, height: 28, textAlign: 'center', textAlignVertical: 'center',
    fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textMuted,
  },
  dayCell: { width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center', borderRadius: CELL / 2 },
  dayCellSelected: { backgroundColor: colors.primary },
  dayText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text },
  dayTextMuted: { color: colors.textMuted, opacity: 0.5 },
  dayTextSelected: { color: colors.textOnPrimary, fontFamily: fontFamily.semiBold },
  todayBtn: { alignSelf: 'center', marginTop: spacing.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  todayText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.primary },
});
