import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Card, Alert } from '@/src/components/Card';
import { colors, spacing } from '@/src/theme';

export default function TrialsScreen() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={s.scroll}>
      <Card><Alert tone="info">Coming soon.</Alert></Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({ scroll: { padding: spacing.lg, paddingBottom: spacing.xxl } });
