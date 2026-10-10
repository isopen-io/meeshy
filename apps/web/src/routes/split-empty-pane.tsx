import type { InterfaceLanguage } from '@/lib/interface-language';

export function emptyPaneLabels(_: InterfaceLanguage): { readonly title: string; readonly hint: string } {
  return { title: '', hint: '' };
}
