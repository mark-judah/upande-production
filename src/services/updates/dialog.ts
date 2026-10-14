import { Alert } from 'react-native';

type DialogButton = { text: string; style?: 'cancel' | 'default' | 'destructive'; onPress?: () => void };

/** Same call shape the ported updater uses; backed by the native Alert. */
export function showDialog(title: string, message: string, buttons: DialogButton[], _icon?: unknown): void {
  Alert.alert(title, message, buttons.map((b) => ({ text: b.text, style: b.style, onPress: b.onPress })));
}
