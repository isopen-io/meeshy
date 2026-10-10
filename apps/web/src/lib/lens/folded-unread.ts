import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import type { LensSectionId } from './sections';

/**
 * UNE SECTION REPLIÉE DIT CE QU'ELLE CACHE (#8694, directive porteur
 * 2026-09-29) — miroir de `ConversationListView.foldedSectionUnread` et de
 * `sectionAccessibilityValue` (iOS, `ConversationListView+SectionRules.swift`).
 *
 * Repliée, une section retire ses rangées, et avec elles leurs pastilles : ce
 * qui restait à lire disparaissait de la liste. Le compte monte donc sur
 * l'en-tête, à côté du chevron. Dépliée, il vaut zéro — les rangées le portent
 * déjà, le dire deux fois serait compter deux fois.
 *
 * La SOURCE est le compteur déjà servi par conversation (et son remplacement
 * optimiste, `effectiveUnreadOf`) : rien n'est recalculé côté serveur, et le
 * compte bouge au même instant que les pastilles des rangées — un message
 * reçu, une lecture, un « Non lu ».
 *
 * AUCUN PLAFOND ICI : « 99+ » est le fait de la pastille (`unreadBadgeText`),
 * jamais de la donnée, et le lecteur d'écran annonce le nombre exact.
 */
export function foldedSectionUnread(params: {
  readonly unreadCounts: readonly number[];
  readonly folded: boolean;
}): number {
  if (!params.folded) return 0;
  return params.unreadCounts.reduce((sum, count) => (Number.isFinite(count) && count > 0 ? sum + Math.trunc(count) : sum), 0);
}

/**
 * Même partition que `isSectionCollapsible` iOS : une section CALCULÉE par la
 * loi de la Lentille (préfixe `lentille.`) n'a pas de pliage qui ait un sens —
 * repliée, elle se rouvrirait au prochain chargement. Seule `pinned` se replie.
 */
export function isLensSectionFoldable(id: LensSectionId): boolean {
  return !id.startsWith('lentille.');
}

/**
 * Le nom que le lecteur d'écran lit sur l'en-tête repliable :
 * « Épingles, repliée, 12 messages non lus ». Le compte n'est dit que replié
 * et non nul, pour la même raison que la pastille.
 */
export function lensSectionAccessibleName(params: {
  readonly language: InterfaceLanguage;
  readonly label: string;
  readonly folded: boolean;
  readonly unread: number;
}): string {
  const { language, label, folded, unread } = params;
  if (!folded) return translate(language, 'lensSection.a11y.expanded', { section: label });
  if (unread <= 0) return translate(language, 'lensSection.a11y.folded', { section: label });
  const key = unread === 1 ? 'lensSection.a11y.folded.unread.one' : 'lensSection.a11y.folded.unread.other';
  return translate(language, key, { section: label, count: String(unread) });
}
