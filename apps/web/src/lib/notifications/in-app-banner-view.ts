import type { InterfaceLanguage } from '@/lib/interface-language';

import type { NotificationRecord } from './record';
import { notificationRowPresentation, type ContentKind, type MilestoneGlyph } from './row-presentation';

/**
 * **CE QUE LA BANNIÈRE IN-APP DIT** (#8727, jumelle de
 * `NotificationBannerPresentation` iOS, #8723) — son aperçu paraît UNE fois :
 * le texte est celui de la ligne de la cloche (`notificationRowPresentation`),
 * dont la règle anti-répétition retire tout libellé déjà dit.
 * « 🎵 Audio • 🎵 Audio · 0:32 » venait d'un client qui préfixait son libellé
 * devant l'aperçu déjà composé par la passerelle : ici, aucun libellé client
 * ne s'ajoute — la case du contenu porte une ICÔNE, jamais un mot.
 */

export type BannerPresentation = {
  readonly headline: string;
  readonly body: string | null;
  /** Le contenu visé (sa case porte son icône quand il n'a pas de vignette) — `null` hors contenu social. */
  readonly content: ContentKind | null;
  readonly milestone: MilestoneGlyph | null;
};

export function bannerPresentation(notification: NotificationRecord, options: { readonly language: InterfaceLanguage; readonly now: Date }): BannerPresentation {
  const row = notificationRowPresentation(notification, options);
  const footer = row.footer;
  const content = footer?.kind === 'content' ? footer.content : null;
  const body = row.body ?? row.quote ?? (footer?.kind === 'content' || footer?.kind === 'plain' ? footer.text : null);
  return { headline: row.title, body, content, milestone: row.leading.kind === 'milestone' ? row.leading.glyph : null };
}

/** Vers le HAUT ferme (au-delà de 30 px, seuil d'iOS `NotificationBannerSwipe`) ; en deçà, rien. */
export const bannerSwipeOutcome = (translationY: number): 'dismiss' | 'none' => (translationY < -30 ? 'dismiss' : 'none');

/** La durée de vie d'une bannière — celle d'iOS. */
export const BANNER_LIFETIME_MS = 7000;
