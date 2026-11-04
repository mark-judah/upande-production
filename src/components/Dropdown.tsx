import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { DropdownPickerList } from './DropdownPickerScreen';

export interface DropdownOption {
  label: string;
  value: string;
  sublabel?: string;
}

interface DropdownProps {
  label?: string;
  placeholder?: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  searchable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  emptyText?: string;
}

export function Dropdown({
  label,
  placeholder = 'Select…',
  value,
  options,
  onChange,
  searchable = true,
  disabled = false,
  invalid = false,
  emptyText = 'No matches',
}: DropdownProps) {
  const selected = options.find((o) => o.value === value);

  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    if (disabled) return;
    setOpen(true);
  };

  const handleSelect = (next: string) => {
    setOpen(false);
    onChange(next);
  };

  return (
    <View>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TouchableOpacity
        style={[s.field, invalid && s.fieldError, disabled && { opacity: 0.6 }]}
        onPress={handleOpen}
        activeOpacity={0.7}
      >
        <Text style={[s.value, !selected && s.placeholder]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {/* A centered popup rather than a pushed page: it also works from inside
          the bottom sheets (themselves Modals), which a route push sits behind. */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={s.popup}>
            <View style={s.popupHeader}>
              <Text style={s.popupTitle} numberOfLines={1}>{label || placeholder}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8} style={s.closeBtn}>
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
            {open ? (
              <DropdownPickerList
                value={value}
                options={options}
                searchable={searchable}
                emptyText={emptyText}
                onSelect={handleSelect}
              />
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 46,
  },
  fieldError: { borderColor: colors.error, borderWidth: 1.5 },
  value: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text, flex: 1 },
  placeholder: { color: colors.textMuted },

  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  popup: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  popupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  popupTitle: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
