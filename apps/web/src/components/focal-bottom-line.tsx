import { FLAG_LIMIT_PLAIN } from '@/lib/reading-mode/metrics';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { Flags, PrismPastille, ReactionChip } from './message-blocks';

/**
 * LA LIGNE BASSE DE LA RANGÉE PLATE — extraite de `focal-row.tsx` (#8536),
 * qui dépassait le budget de taille.
 *
 * Drapeaux PUIS réactions, même ligne : c'est l'arbitrage porteur du
 * 2026-08-18 que `FocalRow.flagAndReactionsRow` porte côté iOS.
 * Conditionnelle (défaut 7, `mounts` = `mountsBottomLine`) : elle ne monte
 * plus sur un message sans rien à dire.
 *
 * S'EFFACE en focus par `visibility: hidden`, PAS par démontage (correction
 * de revue #5648, défaut bloquant 3) : la DÉMONTER réduit la rangée élue de
 * la hauteur de cette ligne (26 px), et fait remonter `.focus-strip`/
 * `.focus-stamp` (ancrés au bas du bloc de contenu, sur cette ligne réservée
 * depuis #8506) SUR la dernière ligne du texte que l'élection vient de mettre
 * en avant. `FocalRow.swift:317-322` fait l'INVERSE mot pour mot —
 * `.opacity(input.isFocused ? 0 : 1)` — « la bande SUR la ligne basse
 * remplace visuellement cette ligne, QUI GARDE SA PLACE ». `visibility:
 * hidden` (et non `opacity: 0`) parce que CETTE ligne porte des `<button>` DE
 * PRISME : `opacity: 0` les aurait laissés dans l'ordre de tabulation et
 * l'arbre d'accessibilité — l'anti-motif WCAG que `FocusStrip` (le composant
 * qui les REMPLACE visuellement) documente avoir évité.
 *
 * DÉFAUT 1 (#5648, correction de revue) — une rangée ÉLUE SANS ligne basse
 * (continuation, ou message sans traduction ni réaction) réserve la MÊME
 * hauteur qu'une ligne basse réelle, avec les MÊMES classes que sa cible
 * tactile (`pt-1` + `size-[22px]`) : sans elle, `.focus-strip`/`.focus-stamp`
 * débordaient de 9 px SUR la dernière ligne de texte qu'ils élisent (témoins
 * `RIVER_CONTINUATION_WITNESS_ID` / `RIVER_NO_TRANSLATION_WITNESS_ID`). Elle
 * ne se monte QUE sur la rangée ÉLUE (divergence ASSUMÉE avec iOS, qui porte
 * le même débord, `FocalRow.swift:202-211`) : sur une rangée ORDINAIRE, elle
 * ferait réapparaître la « ligne blanche inutile » que la directive porteur
 * du 2026-09-04 est venue supprimer.
 *
 * `data-loupe-follow` (#8536) — les deux formes SUIVENT le contenu grossi de
 * l'élue : quand la loupe le fait grandir, elles descendent avec la bande
 * qu'elles réservent (`thread-scene.css`).
 */
export function FocalBottomLine({
  mounts,
  elected,
  originalLanguage,
  naturalServedLanguage,
  activeLanguage,
  footerLanguages,
  reactions,
  myReactions,
  onPickLanguage,
  onReact,
}: {
  readonly mounts: boolean;
  readonly elected: boolean;
  readonly originalLanguage: string;
  /** La résolution NATURELLE, sans `displayLanguage` — garde de montage de la pastille (revue #5814). */
  readonly naturalServedLanguage: string;
  readonly activeLanguage: string;
  readonly footerLanguages: readonly string[];
  readonly reactions: readonly (readonly [string, number])[];
  readonly myReactions?: readonly string[];
  readonly onPickLanguage?: (code: string) => void;
  readonly onReact?: (emoji: string) => void;
}) {
  if (!mounts) {
    return elected ? (
      <div data-loupe-follow className="flex items-center gap-1 pt-1" aria-hidden>
        <span data-focus-reserve className="size-[22px]" />
      </div>
    ) : null;
  }
  const flagged = onPickLanguage !== undefined && footerLanguages.length > 0;
  return (
    <div
      data-row-bottom-line
      data-loupe-follow
      className="flex items-center gap-1 pt-1"
      style={{ color: 'var(--color-meta)', visibility: elected ? 'hidden' : 'visible' }}
    >
      {/* SANS CAPACITÉ DE LANGUE, AUCUN CONTRÔLE DE LANGUE (#6862) — voir la
          jumelle de `bubble.tsx`. LES DRAPEAUX DISENT DÉJÀ LA TRADUCTION
          (#7599, miroir iOS #7603) — la pastille 🌐 ne se pose que s'il n'y a
          aucun drapeau. Une bande VIDE décalait les réactions de 4 px (#7929). */}
      {flagged ? null : (
        <PrismPastille
          language={currentInterfaceLanguage()}
          subject="message"
          servedLanguage={naturalServedLanguage}
          originalLanguage={originalLanguage}
          active={activeLanguage}
          {...(onPickLanguage === undefined ? {} : { onToggle: () => onPickLanguage(originalLanguage) })}
        />
      )}
      {flagged && onPickLanguage !== undefined ? (
        <Flags languages={footerLanguages} active={activeLanguage} onPick={onPickLanguage} limit={FLAG_LIMIT_PLAIN} />
      ) : null}
      {reactions.map(([glyph, count]) => {
        const mine = myReactions?.includes(glyph) ?? false;
        return (
          <ReactionChip
            key={glyph}
            glyph={glyph}
            count={count}
            mine={mine}
            {...(mine && onReact !== undefined ? { onToggle: () => onReact(glyph) } : {})}
          />
        );
      })}
    </div>
  );
}
