import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **« JOURNAL », LE BOUTON QUI OUVRE ET REFERME LE JOURNAL** (#17346, #17932, #17964) — au
 * pied des sous-titres il l'ouvre ; tant que le journal est ouvert, DANS la pilule comme en
 * colonne sur grand écran, il est ACTIF : un disque blanc plein à encre sombre (loi 1, la
 * tenue `active` de `call-glass-button.tsx`), et le retoucher le referme. Le MÊME bouton au
 * pied de la bande et au pied du journal, jamais une jumelle : une pièce à lui, que le
 * chunk des sous-titres et celui du journal partagent sans rien importer de l'écran d'appel.
 * `marker` est le repère de la surface qui le porte.
 */
const ON = { background: 'var(--color-on-media)', color: 'var(--ios-indigo-950)' };

const OFF = { color: 'var(--color-on-media)' };

type Props = {
  readonly language: InterfaceLanguage;
  readonly on: boolean;
  readonly onPress: () => void;
  readonly marker: `data-${string}`;
};

export function CallJournalToggle({ language, on, onPress, marker }: Props) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPress}
      className={`${on ? '' : 'glass-call-disc '}min-h-11 shrink-0 rounded-full px-4 font-semibold transition-transform active:scale-95 motion-reduce:transition-none`}
      style={on ? ON : OFF}
      {...{ [marker]: '' }}
    >
      {translateCallControls(language, 'callControls.journal')}
    </button>
  );
}
