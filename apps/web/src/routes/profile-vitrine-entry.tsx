import { memo } from 'react';

import { SECTION_CARD_STYLE, SECTION_INK, SECTION_INK_2 } from '@/components/grouped-section';
import { GlyphSvg } from '@/components/glyph';
import { PROFILE_GLYPHS } from '@/components/glyphs-profile';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/** L'entrée « Voir comme… » du profil (#18878) — légère : la feuille et ses requêtes sont dans un autre chunk. */
const ENTRY_STYLE = { ...SECTION_CARD_STYLE, minHeight: 56, outlineColor: 'var(--color-ios-brand)' } as const;

export const VitrineEntry = memo(function VitrineEntry({ language, onOpen }: { readonly language: InterfaceLanguage; readonly onOpen: () => void }) {
  return (
    <button
      type="button"
      data-profile-vitrine-entry=""
      onClick={onOpen}
      aria-description={translate(language, 'userProfile.vitrine.entry.hint')}
      className="flex w-full items-center gap-3 rounded-card px-3.5 py-2.5 text-start transition-transform active:scale-[0.98] focus-visible:outline-2"
      style={ENTRY_STYLE}
    >
      <span className="min-w-0 flex-1 text-body font-medium" style={{ color: SECTION_INK }}>
        {translate(language, 'userProfile.vitrine.entry.title')}
      </span>
      <span aria-hidden="true" style={{ color: SECTION_INK_2 }}>
        <GlyphSvg glyph={PROFILE_GLYPHS.caretRight} size={12} className="rtl:-scale-x-100" />
      </span>
    </button>
  );
});
