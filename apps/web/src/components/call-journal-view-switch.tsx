import { translateCallControls as t } from '@/lib/i18n-call-controls-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **TRADUIT / ORIGINAL** (loi 7 de `docs/product/appels-vue-finale.md`, vue
 * W1) — la bascule de l'en-tête du journal s'applique à TOUT l'appel : la
 * phrase servie par le Prisme, ou ce qui a été dit. Deux segments dans une
 * capsule, le choix pressé en blanc comme les pastilles de l'appel.
 */

export type JournalView = 'translated' | 'original';

const VIEWS: readonly { readonly view: JournalView; readonly key: 'callControls.journal.translated' | 'callControls.journal.original' }[] = [
  { view: 'translated', key: 'callControls.journal.translated' },
  { view: 'original', key: 'callControls.journal.original' },
];

type Props = { readonly language: InterfaceLanguage; readonly view: JournalView; readonly onChange: (view: JournalView) => void };

export function CallJournalViewSwitch({ language, view, onChange }: Props) {
  return (
    <div role="group" aria-label={t(language, 'callControls.journal.view')} className="flex shrink-0 rounded-full p-0.5" style={{ background: 'var(--color-media-fill)', boxShadow: 'inset 0 0 0 1px var(--color-media-hairline)' }} data-call-journal-view={view}>
      {VIEWS.map((option) => {
        const pressed = option.view === view;
        return (
          <button
            key={option.view}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(option.view)}
            className="min-h-11 rounded-full px-3 text-mini font-semibold transition-colors motion-reduce:transition-none"
            style={pressed ? { background: 'var(--color-on-media)', color: 'var(--ios-indigo-950)' } : { color: 'var(--color-on-media)' }}
          >
            {t(language, option.key)}
          </button>
        );
      })}
    </div>
  );
}
