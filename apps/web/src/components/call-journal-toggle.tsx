import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **« JOURNAL », LE BOUTON QUI OUVRE ET REFERME LE JOURNAL** (#17346, #17932, #17964) — au
 * pied des sous-titres il l'ouvre ; tant que le journal est ouvert, DANS la pilule comme en
 * colonne sur grand écran, il est ACTIF : un disque blanc plein, pictogramme et texte à
 * encre sombre (loi 1, la tenue `active` de `call-glass-button.tsx`, `CallJournalButton`
 * d'iOS), et le retoucher le referme. Le MÊME bouton au
 * pied de la bande et au pied du journal, jamais une jumelle : une pièce à lui, que le
 * chunk des sous-titres et celui du journal partagent sans rien importer de l'écran d'appel.
 * `marker` est le repère de la surface qui le porte.
 */
const ON = { background: 'var(--color-on-media)', color: 'var(--ios-indigo-950)' };

/** Le Journal (#8579) : une page et ses lignes — ce qui a été dit, et sa traduction. Le MÊME pictogramme au rail « L'appel » et dans « Journal » actif (loi 1, P6, P9b ; `list.bullet.rectangle` d'iOS). */
export function JournalGlyph({ size }: { readonly size: number }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3.5h9l3 3v14H6z" />
      <path d="M9 9.5h6M9 13h6M9 16.5h3.5" />
    </svg>
  );
}

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
      className={`${on ? '' : 'glass-call-disc '}inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 font-semibold transition-transform active:scale-95 motion-reduce:transition-none`}
      style={on ? ON : OFF}
      {...{ [marker]: '' }}
    >
      {on ? <JournalGlyph size={16} /> : null}
      {translateCallControls(language, 'callControls.journal')}
    </button>
  );
}
