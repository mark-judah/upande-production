import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

export interface MultiSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

/**
 * Small, focused multi-select — built for the home-tab filters because
 * `Dropdown` (src/components/Dropdown.tsx) is single-select only and owned
 * by another workstream. Tap-to-open modal checklist, pure JS (no native
 * picker dependency), matching the look of the existing `DateField` modal.
 */
export function MultiSelectField({
  label,
  options,
  value,
  onChange,
  placeholder = 'All',
  disabledMessage,
  emptyText = 'No options',
}: {
  label: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Shown instead of the field being interactive (e.g. "Pick a farm first"). */
  disabledMessage?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const disabled = !!disabledMessage;

  const summary = useMemo(() => {
    if (value.length === 0) return placeholder;
    if (value.length === 1) {
      const found = options.find((o) => o.value === value[0]);
      return found?.label ?? value[0];
    }
    return `${value.length} selected`;
  }, [value, options, placeholder]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.sublabel ?? '').toLowerCase().includes(q),
    );
  }, [options, search]);

  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  const openPicker = () => {
    if (disabled) return;
    setSearch('');
    setOpen(true);
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={s.label}>{label}</Text>
      <Pressable style={[s.field, disabled && s.fieldDisabled]} onPress={openPicker}>
        <Text style={[s.value, (value.length === 0 || disabled) && s.placeholder]} numberOfLines={1}>
          {disabled ? disabledMessage : summary}
        </Text>
        {value.length > 0 && !disabled ? (
          <Pressable hitSlop={8} onPress={() => onChange([])} style={s.clearChip}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setOpen(false)}>
          <Pressable style={s.card} onPress={() => {}}>
            <View style={s.header}>
              <Text style={s.headerTitle}>{label}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8} style={s.closeBtn}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            {options.length > 8 ? (
              <View style={s.searchWrap}>
                <Ionicons name="search-outline" size={16} color={colors.textMuted} />
                <TextInput
                  style={s.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search…"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            ) : null}

            <ScrollView style={s.list} keyboardShouldPersistTaps="handled">
              {filtered.length === 0 ? (
                <Text style={s.empty}>{emptyText}</Text>
              ) : (
                filtered.map((o) => {
                  const selected = value.includes(o.value);
                  return (
                    <Pressable key={o.value} style={s.row} onPress={() => toggle(o.value)}>
                      <View style={[s.checkbox, selected && s.checkboxChecked]}>
                        {selected ? <Ionicons name="checkmark" size={14} color={colors.textOnPrimary} /> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowLabel} numberOfLines={1}>{o.label}</Text>
                        {o.sublabel ? <Text style={s.rowSublabel} numberOfLines={1}>{o.sublabel}</Text> : null}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            <View style={s.footer}>
              <Pressable style={s.footerBtn} onPress={() => onChange([])} disabled={value.length === 0}>
                <Text style={[s.footerBtnText, value.length === 0 && s.footerBtnTextDisabled]}>Clear</Text>
              </Pressable>
              <Pressable style={[s.footerBtn, s.footerBtnPrimary]} onPress={() => setOpen(false)}>
                <Text style={s.footerBtnPrimaryText}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 46,
  },
  fieldDisabled: { opacity: 0.6 },
  value: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text, flex: 1 },
  placeholder: { color: colors.textMuted },
  clearChip: { paddingHorizontal: 2 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  headerTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md, height: 40, marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text, padding: 0 },

  list: { maxHeight: 360 },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted, paddingVertical: spacing.lg, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2 },
  checkbox: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  rowLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text },
  rowSublabel: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },

  footer: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  footerBtn: { flex: 1, height: 42, borderRadius: borderRadius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  footerBtnText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  footerBtnTextDisabled: { color: colors.textMuted },
  footerBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  footerBtnPrimaryText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.textOnPrimary },
});
