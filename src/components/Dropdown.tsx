import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { openDropdownPicker } from './DropdownPickerScreen';

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

  const handleOpen = () => {
    if (disabled) return;
    // Hand the current options/value off to the full-page picker and
    // navigate there instead of popping a modal over this screen. The
    // picker calls onChange (via onSelect) and navigates back on its own.
    openDropdownPicker({
      label,
      value,
      options,
      searchable,
      emptyText,
      onSelect: onChange,
    });
    router.push('/dropdown-picker');
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
});
