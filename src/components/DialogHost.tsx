import React, { useState } from 'react';
import { create } from 'zustand';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme';
import { Button } from './Button';
import { Dialog, type DialogTone } from './Dialog';

/** One button, as for React Native's Alert.alert. */
export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void | Promise<void>;
}

interface Pending {
  title: string;
  message?: string;
  buttons: DialogButton[];
  icon?: { name: keyof typeof Ionicons.glyphMap; tone?: DialogTone };
}

const useDialogStore = create<{ current: Pending | null; set: (p: Pending | null) => void }>((set) => ({
  current: null,
  set: (current) => set({ current }),
}));

/** Drop-in for Alert.alert that shows the app's own Dialog, so every confirm
 *  looks the same. Needs <DialogHost /> mounted once at the root. With no
 *  buttons it shows a single OK; a destructive button gets a red icon. */
export function showDialog(title: string, message?: string, buttons?: DialogButton[], icon?: Pending['icon']): void {
  const list = buttons?.length ? buttons : [{ text: 'OK' }];
  const destructive = list.some((b) => b.style === 'destructive');
  useDialogStore.getState().set({
    title,
    message,
    buttons: list,
    icon: icon ?? (destructive ? { name: 'alert-circle-outline', tone: 'danger' } : undefined),
  });
}

/** Renders whatever showDialog asked for. Mount once, inside the providers. */
export function DialogHost() {
  const current = useDialogStore((st) => st.current);
  const close = useDialogStore((st) => st.set);
  const [busy, setBusy] = useState<number | null>(null);
  if (!current) return null;

  const cancel = current.buttons.find((b) => b.style === 'cancel');
  const press = async (b: DialogButton, i: number) => {
    if (busy != null) return;
    if (!b.onPress) return close(null);
    setBusy(i);
    try {
      await b.onPress();
    } finally {
      setBusy(null);
      // The handler may have opened the next dialog; only close this one.
      if (useDialogStore.getState().current === current) close(null);
    }
  };

  return (
    <Dialog
      visible
      onClose={() => (cancel ? press(cancel, current.buttons.indexOf(cancel)) : close(null))}
      busy={busy != null}
      icon={current.icon}
      title={current.title}
      subtitle={current.message}
      actions={
        <>
          {current.buttons.map((b, i) => (
            <Button
              key={`${b.text}-${i}`}
              label={b.text}
              variant={b.style === 'cancel' ? 'outline' : 'primary'}
              color={b.style === 'destructive' ? colors.danger : undefined}
              loading={busy === i}
              disabled={busy != null && busy !== i}
              onPress={() => press(b, i)}
              style={{ flexGrow: 1, flexBasis: 0, minWidth: 110 }}
            />
          ))}
        </>
      }
    />
  );
}
