import { useEffect, useRef } from 'react';

import { getLanguageInfo } from '@meeshy/shared/utils/languages';

import { isActiveLanguage } from '@/lib/stories/language-choice';
import { spokenLanguageName } from '@/lib/view/language-name';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LA BARRE RAPIDE DES LANGUES** (#7114, § 5.4 de la spécification) — miroir
 * de `StoryLanguageQuickBar.swift:28-199` : un chip par langue PRÊTE, le
 * drapeau seul (22 px), « Original » en tête (§ 1.6, écart de disposition
 * assumé — D-126). Ancrée par la prop `anchored` de `StoryActionRail`, à
 * GAUCHE du bouton « Traductions ».
 *
 * Nom HORS du motif `story-` (§ 5.4) : un chunk à la demande de ce composant
 * ne doit jamais être compté dans le budget `story_reader`
 * (`budgets.json:112`, motif `^assets/story-(?!compose-|tray-|scene-)`) — une
 * story est une PUBLICATION (D-89).
 *
 * Cette pilule (`QUICK_STRIP_CHROME`) est EXPORTÉE pour devenir la pilule
 * PARTAGÉE avec la barre de réactions quand #7117 la livrera (iOS :
 * `quickReactionStripChrome`, un seul point de vérité) — #7117 l'importera
 * au lieu de la redéclarer.
 *
 * **PAS DE `backdrop-filter` ICI** — la spécification en demandait un
 * (flou 12 px), mais `scripts/lib/glass-site.mjs` (#6124) l'interdit hors du
 * site unique `styles/glass.css`/`GlassSurface`, dont la matière est
 * THÉMÉE (`--color-ios-surface`) : elle ne convient pas à ce chrome de
 * lecteur qui force `colorScheme: dark` sur une photo arbitraire, exactement
 * la raison pour laquelle `RAIL_DISC` (`story-action-rail.tsx`) et
 * `CHROME_SCRIM_*` (`routes/story.tsx`) sont déjà des `rgba()` fixes SANS
 * flou. Cette pilule suit la MÊME convention : un fond opaque à 55 % suffit
 * au contraste (aucune matière ne dépend du flou pour rester lisible), sans
 * réécrire le verre hors de son site.
 */
export const QUICK_STRIP_CHROME = 'rgba(0,0,0,0.55)';

const ORIGINAL_ID = 'original';
/** > 5 langues ⇒ mode DÉFILANT (`inlineCap` d'iOS, `QuickBar.swift:44-58`). */
const INLINE_CAP = 5;

export type PublicationLanguageBarProps = {
  /** Les langues PRÊTES — jamais « Original », qui est composé ici. */
  readonly languages: readonly string[];
  /** `null` ⇒ aucune n'est active (jamais le cas au montage : `auto` sert
   * toujours une tête de chaîne ou reste sans badge). */
  readonly active: string | 'original' | null;
  readonly language: InterfaceLanguage;
  readonly onSelect: (code: string | 'original') => void;
  readonly onClose: () => void;
  /** ABSENTE ⇒ pas de « + » (loi 4, tranche 1 sans feuille complète). */
  readonly onOpenMore?: () => void;
};

export function PublicationLanguageBar({ languages, active, language, onSelect, onClose, onOpenMore }: PublicationLanguageBarProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Le focus va sur le chip ACTIF (ou le premier) — au MONTAGE seulement.
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const target =
      (active !== null ? root.querySelector<HTMLButtonElement>(`[data-story-language="${active}"]`) : null) ??
      root.querySelector<HTMLButtonElement>('[data-story-language]');
    target?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrolls = languages.length > INLINE_CAP;

  return (
    <div
      ref={rootRef}
      data-story-language-bar
      {...(scrolls ? { 'data-story-language-bar-scroll': '' } : {})}
      role="group"
      aria-label={translate(language, 'story.language.bar')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      className="pointer-events-auto flex items-center gap-2 rounded-pill px-2 py-1.5"
      style={{
        background: QUICK_STRIP_CHROME,
        border: '1px solid rgba(255,255,255,0.12)',
        ...(scrolls ? { maxWidth: 180, overflowX: 'auto' } : {}),
      }}
    >
      <button
        type="button"
        data-story-language={ORIGINAL_ID}
        onClick={() => onSelect('original')}
        aria-pressed={active === 'original'}
        className="shrink-0 rounded-chip px-2 text-check font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: '#fff', minHeight: 44, minWidth: 44, outlineColor: '#fff' }}
      >
        {translate(language, 'story.language.original')}
      </button>
      {languages.map((code) => {
        const info = getLanguageInfo(code);
        const isActive = isActiveLanguage(code, active);
        return (
          <button
            key={code}
            type="button"
            data-story-language={code}
            onClick={() => onSelect(code)}
            aria-pressed={isActive}
            aria-label={spokenLanguageName(code)}
            className="grid shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minWidth: 44, minHeight: 44, opacity: isActive ? 1 : 0.55, outlineColor: '#fff' }}
          >
            <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>
              {info.flag}
            </span>
            {isActive ? (
              <span aria-hidden="true" className="block rounded-full" style={{ width: 14, height: 2, background: 'var(--ios-indigo-400)', marginTop: 2 }} />
            ) : null}
          </button>
        );
      })}
      {onOpenMore === undefined ? null : (
        <button
          type="button"
          data-story-language-more
          onClick={onOpenMore}
          aria-label={translate(language, 'story.language.more')}
          className="grid shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.15)', color: '#fff', outlineColor: '#fff' }}
        >
          +
        </button>
      )}
    </div>
  );
}
