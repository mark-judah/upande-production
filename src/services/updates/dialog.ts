// The ported updater calls showDialog(title, message, buttons, icon); it now
// renders the app's own Dialog instead of the native Alert.
export { showDialog } from '@/src/components/DialogHost';
