import { lazy, Suspense, useState } from 'react';

import type { ConversationsDeps } from '@/lib/api/conversations';
import type { Conversation } from '@/lib/api/types';
import { rawAppearanceOf } from '@/lib/appearance/read';
import { useAppearanceCatalog, useAppearanceSupported } from '@/lib/appearance/use-picker';
import { appearanceText } from '@/lib/i18n-appearance-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { GlyphSvg } from './glyph';
import { SETTINGS_GLYPHS } from './glyphs-settings';

const ConversationAppearanceSheet = lazy(() => import('./conversation-appearance-sheet').then((m) => ({ default: m.ConversationAppearanceSheet })));

/**
 * **L'ENTRÉE « FOND ET COULEUR »** de la feuille de détails (#10631, § 9) —
 * une rangée qui ouvre le sélecteur, chargé À LA DEMANDE avec son catalogue.
 * Absente d'un serveur qui ne sait pas enregistrer une apparence (§ 11).
 */
export function ConversationAppearanceEntry({
  conversation,
  accent,
  deps,
  language,
}: {
  readonly conversation: Conversation;
  readonly accent: string;
  readonly deps: ConversationsDeps;
  readonly language: InterfaceLanguage;
}) {
  const [open, setOpen] = useState(false);
  const labelReady = useAppearanceCatalog(language);
  const supported = useAppearanceSupported({ deps, servedKey: rawAppearanceOf(conversation).present });
  if (!supported || !labelReady) return null;
  return (
    <>
      <div className="flex justify-center px-4 pb-4">
        <button
          type="button"
          data-conversation-appearance-entry
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-chip px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ minHeight: 44, color: 'var(--color-ios-ink)', border: '1.5px solid var(--color-ios-separator, currentColor)', outlineColor: 'var(--accent)' }}
        >
          <GlyphSvg glyph={SETTINGS_GLYPHS.paintBrush} size={18} />
          {appearanceText(language, 'appearance.title')}
        </button>
      </div>
      {open ? (
        <Suspense fallback={null}>
          <ConversationAppearanceSheet conversation={conversation} accent={accent} deps={deps} onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </>
  );
}
