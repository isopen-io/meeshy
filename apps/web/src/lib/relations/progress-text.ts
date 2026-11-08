import type { RelationLevel } from '@meeshy/shared/types/relation';

import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { MissingPiece, ProgressSummary } from '@/lib/relations/circles';
import { relationLevelLabel } from '@/lib/relations/level-labels';

/**
 * **CE QU'UNE LIGNE DE CERCLE DIT** (#13938, #13940) — la phrase de progression,
 * iso `CircleProgressSummary.text` : partagée par « Mes cercles » et la fiche
 * d'une personne, jamais réécrite. Le catalogue « Mes cercles » doit être chargé.
 */

export const levelTitle = (language: InterfaceLanguage, level: RelationLevel): string => relationLevelLabel(language, level);

const pieceNoun = (language: InterfaceLanguage, piece: MissingPiece): string => translateCircles(language, `circles.missing.${piece}`);

/** « un message audio et une réaction » : la conjonction de la langue, jamais une virgule recopiée. */
const listOf = (language: InterfaceLanguage, nouns: readonly string[]): string =>
  new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(nouns);

/**
 * La phrase de la ligne, ou `null` quand il n'y a rien à dire. « Semaines
 * d'affilée : 3 sur 4 » plutôt que « 3 semaines sur 4 » : la forme neutre ne
 * dépend d'aucune règle de pluriel (l'arabe en compte six).
 */
export function progressText(language: InterfaceLanguage, summary: ProgressSummary): string | null {
  switch (summary.kind) {
    case 'none':
      return null;
    case 'weeks':
      return translateCircles(language, 'circles.progress.weeks', { done: String(summary.done), needed: String(summary.needed) });
    case 'eligible':
      return translateCircles(language, 'circles.progress.eligible', { level: levelTitle(language, summary.target) });
    case 'missing':
      return translateCircles(language, 'circles.progress.missing', { pieces: listOf(language, summary.pieces.map((piece) => pieceNoun(language, piece))) });
  }
}

