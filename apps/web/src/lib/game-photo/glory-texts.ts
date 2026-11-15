import type { GloryTexts } from './glory/frame-spec';
import { momentPlate, type PhotoMoment } from './moments';

/**
 * LES TEXTES VIVANTS D'UN CADRE DE GLOIRE (L14, #10167, § 5.4 du prompt des
 * Cadres de gloire) — ce que le moment remplit dans les emplacements du contrat
 * (`LIVE_TEXT_SLOTS`) : la ligne du dessus et le titre du moment, la date de la
 * prise, la plaque quand le cadre en réserve une. Le message n'est jamais
 * pré-rempli : il appartient à l'auteur (#10165) et le peintre le pose depuis
 * la recette.
 *
 * Le titre dit le VRAI moment : un palier sans cadre dessiné reçoit le cadre du
 * palier dessiné en dessous (D4, #10180), mais c'est bien « Ta lumière en
 * Comète » qui s'écrit sur le cadre d'Aurore.
 */
export const gloryTextsOf = (moment: PhotoMoment, dateLabel: string): GloryTexts => ({
  kicker: moment.kicker,
  title: moment.title,
  date: dateLabel,
  message: null,
  'plate.1': momentPlate(moment.emblem),
});
