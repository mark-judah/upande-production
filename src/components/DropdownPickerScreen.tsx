import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from './Screen';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import type { DropdownOption } from './Dropdown';

export interface DropdownPickerRequest {
  label?: string;
  value: string;
  options: DropdownOption[];
  searchable: boolean;
  emptyText: string;
  onSelect: (value: string) => void;
}

// One-shot callback bridge from this full-page picker back to the Dropdown
// that opened it — same pattern CameraScannerScreen uses to hand a scanned
// code back to the originating field (see setCameraResultCallback there).
// Dropdown sets this right before navigating to /dropdown-picker; this
// screen consumes it once on mount.
let pendingRequest: DropdownPickerRequest | null = null;

export function openDropdownPicker(request: DropdownPickerRequest) {
  pendingRequest = request;
}

function consumePendingRequest(): DropdownPickerRequest | null {
  const request = pendingRequest;
  pendingRequest = null;
  return request;
}

/** Search box + option list, shared by the Dropdown popup and the
 *  full-page picker route. */
export function DropdownPickerList({
  value,
  options,
  searchable,
  emptyText,
  onSelect,
}: {
  value: string;
  options: DropdownOption[];
  searchable: boolean;
  emptyText: string;
  onSelect: (value: string) => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  return (
    <>
      {searchable ? (
        <View style={s.searchWrap}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={s.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search…"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(it) => it.value}
        keyboardShouldPersistTaps="handled"
        style={s.list}
        contentContainerStyle={s.listContent}
        ItemSeparatorComponent={() => <View style={s.separator} />}
        initialNumToRender={20}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyText}>{emptyText || 'No matches'}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isSelected = item.value === value;
          return (
            <TouchableOpacity style={s.option} onPress={() => onSelect(item.value)} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={[s.optionLabel, isSelected && { fontFamily: fontFamily.semiBold }]}>
                  {item.label}
                </Text>
                {item.sublabel ? <Text style={s.optionSub}>{item.sublabel}</Text> : null}
              </View>
              {isSelected ? <Ionicons name="checkmark" size={18} color={colors.text} /> : null}
            </TouchableOpacity>
          );
        }}
      />
    </>
  );
}

export function DropdownPickerScreen() {
  const [request] = useState(consumePendingRequest);

  useEffect(() => {
    // Defensive: opened with nothing pending (stale deep link, fast-refresh
    // remount, etc.) — there's nothing to show, so bail back out.
    if (!request) router.back();
  }, [request]);

  const handleSelect = (val: string) => {
    request?.onSelect(val);
    router.back();
  };

  return (
    <Screen
      title={request?.label || 'Select'}
      leftIcon="arrow-back"
      onPressLeft={() => router.back()}
      scroll={false}
    >
      <View style={s.container}>
        <DropdownPickerList
          value={request?.value ?? ''}
          options={request?.options ?? []}
          searchable={request?.searchable ?? false}
          emptyText={request?.emptyText ?? 'No matches'}
          onSelect={handleSelect}
        />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  search: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text, padding: 0 },
  // Shrinks to fit the popup's maxHeight and scrolls; short lists stay short.
  list: { flexGrow: 0, flexShrink: 1 },
  listContent: { paddingBottom: spacing.md },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  optionLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text },
  optionSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted },
});
