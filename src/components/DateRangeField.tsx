import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
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

function rangeLabel(from: string, to: string): string {
  if (!from) return '';
  const a = fromISO(from);
  if (!to || to === from) return format(a, 'EEE d MMM yyyy');
  const b = fromISO(to);
  return a.getFullYear() === b.getFullYear()
    ? `${format(a, 'd MMM')} – ${format(b, 'd MMM yyyy')}`
    : `${format(a, 'd MMM yyyy')} – ${format(b, 'd MMM yyyy')}`;
}

/** Calendar date-range picker. Tap a start day, then an end day (one tap and
 *  Done = that single day); the month arrows move freely between months.
 *  Pure JS like DateField. Values are YYYY-MM-DD. */
export function DateRangeField({
  label,
  from,
  to,
  onChange,
}: {
  label: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => fromISO(from));
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  const weeks = useMemo(() => {
    const days = eachDayOfInterval({
      start: startOfWeek(startOfMonth(visibleMonth)),
      end: endOfWeek(endOfMonth(visibleMonth)),
    });
    const out: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [visibleMonth]);

  const openPicker = () => {
    setDraftFrom(from);
    setDraftTo(to);
    setVisibleMonth(fromISO(from));
    setOpen(true);
  };

  // First tap starts a new range; the second closes it (either direction).
  const pick = (d: Date) => {
    const iso = toISO(d);
    if (!draftFrom || draftTo) {
      setDraftFrom(iso);
      setDraftTo('');
    } else if (iso < draftFrom) {
      setDraftTo(draftFrom);
      setDraftFrom(iso);
    } else {
      setDraftTo(iso);
    }
  };

  const apply = (a: string, b: string) => {
    onChange(a, b || a);
    setOpen(false);
  };

  const today = new Date();
  const end = draftTo || draftFrom;

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={s.label}>{label}</Text>
      <Pressable style={s.wrap} onPress={openPicker}>
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
        <Text style={s.text}>{rangeLabel(from, to)}</Text>
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
                  const iso = toISO(d);
                  const inMonth = isSameMonth(d, visibleMonth);
                  const isEdge = iso === draftFrom || iso === end;
                  const inRange = !!draftFrom && iso > draftFrom && iso < end;
                  return (
                    <Pressable key={di} style={[s.dayCell, inRange && s.dayCellInRange]} onPress={() => pick(d)}>
                      <View style={[s.dayDot, isEdge && s.dayDotSelected]}>
                        <Text style={[s.dayText, !inMonth && s.dayTextMuted, isEdge && s.dayTextSelected]}>
                          {d.getDate()}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}

            <Text style={s.draft}>{rangeLabel(draftFrom, draftTo) || ' '}</Text>

            <View style={s.actions}>
              <Pressable style={s.chip} onPress={() => apply(toISO(today), toISO(today))}>
                <Text style={s.chipText}>Today</Text>
              </Pressable>
              <Pressable
                style={s.chip}
                onPress={() => {
                  const last = endOfMonth(visibleMonth);
                  apply(toISO(startOfMonth(visibleMonth)), toISO(last > today ? today : last));
                }}
              >
                <Text style={s.chipText}>{format(visibleMonth, 'MMMM')}</Text>
              </Pressable>
              <Pressable
                style={[s.doneBtn, !draftFrom && { opacity: 0.4 }]}
                disabled={!draftFrom}
                onPress={() => apply(draftFrom, draftTo)}
              >
                <Text style={s.doneText}>Done</Text>
              </Pressable>
            </View>
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
  dayCell: { width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' },
  dayCellInRange: { backgroundColor: colors.surfaceAlt },
  dayDot: { width: CELL - 4, height: CELL - 4, borderRadius: (CELL - 4) / 2, alignItems: 'center', justifyContent: 'center' },
  dayDotSelected: { backgroundColor: colors.primary },
  dayText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text },
  dayTextMuted: { color: colors.textMuted, opacity: 0.5 },
  dayTextSelected: { color: colors.textOnPrimary, fontFamily: fontFamily.semiBold },
  draft: { textAlign: 'center', fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  doneBtn: {
    flex: 1,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.textOnPrimary },
});
