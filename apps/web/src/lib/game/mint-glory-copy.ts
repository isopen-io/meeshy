import { GLORY_POINTS, gloryAfterGain, type GloryAfterGain } from '@meeshy/shared/utils/game/glory';

import { formatGameNumber, translateGame } from '@/lib/i18n-game-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { rankLabel } from '@/lib/view/game-copy';

/**
 * LA GLOIRE DE LA FRAPPE (#19855, tranche de #17394) : la Gloire du joueur AVANT le geste, celle que l'aperçu promet
 * (`mint.gloryGained`) et le Mythe servi. La scène finit sur la gloire gagnée ET le pas vers le rang suivant ; sans
 * elle (ancien serveur), « +1 000 de gloire » seul, comme avant.
 *
 * Hors du module de la cérémonie, chargé à part : l'hôte qui ANNONCE la frappe (#20141) lit les mêmes mots sans
 * tirer la scène dans la première peinture.
 */
export type MintCeremonyGlory = { readonly before: number; readonly gained: number; readonly mythic: boolean };

/** La gloire que la scène écrit : celle que l'aperçu promet, sinon la gloire de base d'une frappe. */
export const mintGloryGained = (glory: MintCeremonyGlory | null): number =>
  glory === null || glory.gained <= 0 ? GLORY_POINTS.mint : glory.gained;

/** Le pas vers le rang suivant ; `null` pour le Mythe, en Légende I, ou sans gloire lue. */
export const mintGloryStep = (glory: MintCeremonyGlory | null): GloryAfterGain | null =>
  glory === null ? null : gloryAfterGain({ before: glory.before, gained: mintGloryGained(glory), mythic: glory.mythic });

export const mintGloryGainedText = (gained: number, language: InterfaceLanguage): string =>
  translateGame(language, 'game.frappe.glory', { glory: formatGameNumber(language, gained) });

export const mintGloryStepText = (step: GloryAfterGain, language: InterfaceLanguage): string =>
  step.kind === 'risen'
    ? translateGame(language, 'game.frappe.risen', { rank: rankLabel(step.rank, step.division5, language) })
    : translateGame(language, 'game.frappe.glory_toward', { glory: formatGameNumber(language, step.gloryMissing), rank: rankLabel(step.rank, step.division5, language) });

/**
 * Ce que le lecteur d'écran entend d'une frappe CONFIRMÉE, après la phrase de la pièce (#20141) : la gloire gagnée,
 * puis le pas vers le rang suivant — ce que la scène montre, phrase par phrase. Même forme qu'iOS
 * (`MintCeremonyCopy.confirmed`) et Android (`mintCeremonySpoken`).
 */
export function mintGlorySpoken(glory: MintCeremonyGlory | null, language: InterfaceLanguage): string {
  const step = mintGloryStep(glory);
  const lines = [mintGloryGainedText(mintGloryGained(glory), language), ...(step === null ? [] : [mintGloryStepText(step, language)])];
  return lines.map((line) => `${line}.`).join(' ');
}
