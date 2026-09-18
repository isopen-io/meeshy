/**
 * **LÉGENDER CHAQUE IMAGE, UNE PAR MESSAGE** (#6956) — la loi PURE du plan de
 * légendage, séparée de son écran pour qu'elle se mesure sans navigateur.
 *
 * ## La légende EST le contenu du message
 *
 * Décision porteur du 2026-09-18, contre l'autre branche
 * (`MessageAttachment.caption`). C'est la LECTURE qui a tranché :
 * `bubble.tsx:305` remet déjà `mediaCarrierOf({ message, caption: rendered })`
 * au visionneur plein écran, où `rendered` est le texte du message SERVI par le
 * Prisme. Le cadre de lecture affiche donc DÉJÀ une légende traduite sous
 * l'image — écriture, traduction, Prisme et affichage existent tous. Ce lot
 * n'écrit que la composition.
 *
 * ## Une sélection légendée part en N ENVOIS
 *
 * `packages/shared/types/attachment.ts:450-463` porte la norme du 2026-08-16,
 * « un envoi = un message », jusqu'à 199 pièces. Elle n'est PAS abrogée : chaque
 * envoi reste un message. Ce module découpe une sélection légendée en N
 * intentions d'envoi ; le chemin groupé sans légende reste intact et reste le
 * défaut.
 *
 * ## Pourquoi ce fichier ne sait rien de React
 *
 * L'ordre des envois, la langue portée par CHAQUE légende et le sort d'un
 * échec au milieu de la séquence sont des règles, pas du rendu. Les mesurer à
 * travers un composant, c'est mesurer l'ordonnancement.
 */

import type { ComposeProtection } from './compose-protection';
import type { PendingAttachment } from './attachments';

/** Ce que l'auteur a SAISI pour une pièce — son texte et la langue qu'il a
 * choisie pour CE texte. Une pièce sans entrée ici n'a pas été légendée. */
export type LegendeSaisie = {
  readonly localId: string;
  readonly texte: string;
  readonly langue: string;
};

/** Une intention d'envoi — la forme exacte que `Composer.onSend` reçoit déjà
 * (`composer.tsx:118-126`). Ce module n'invente aucun contrat : il en produit N
 * là où la composition ordinaire en produit un. */
export type IntentionEnvoi = {
  readonly text: string;
  readonly attachments: readonly PendingAttachment[];
  readonly language: string;
  readonly protection: ComposeProtection;
};

/**
 * Découpe une sélection légendée en une intention d'envoi PAR PIÈCE.
 *
 * L'ordre est celui de la SÉLECTION, jamais celui des saisies : l'auteur peut
 * légender la troisième image d'abord, le fil doit rester dans l'ordre qu'il
 * voit dans le carrousel.
 *
 * **La langue suit sa légende, pas sa voisine.** Une pièce non légendée repart
 * sur la langue du composeur — choisir une langue pour un texte qui n'existe
 * pas n'aurait rien à étiqueter, et étiqueter un message vide d'une langue
 * qu'aucun mot ne porte ferait mentir `originalLanguage`.
 *
 * Une saisie qui ne désigne aucune pièce est IGNORÉE : elle ne fabrique pas de
 * message. Une pièce saisie deux fois garde la DERNIÈRE frappe — `new Map`
 * conserve la dernière valeur d'une clé répétée, ce qui est exactement la
 * sémantique d'un champ qu'on corrige.
 */
export function envoisLegendes(params: {
  readonly pending: readonly PendingAttachment[];
  readonly legendes: readonly LegendeSaisie[];
  readonly langueParDefaut: string;
  readonly protection: ComposeProtection;
}): readonly IntentionEnvoi[] {
  const { pending, legendes, langueParDefaut, protection } = params;
  const parPiece = new Map(legendes.map((saisie) => [saisie.localId, saisie]));

  return pending.map((piece) => {
    const texte = parPiece.get(piece.localId)?.texte.trim() ?? '';
    const langue = parPiece.get(piece.localId)?.langue ?? langueParDefaut;
    return {
      text: texte,
      attachments: [piece],
      language: texte === '' ? langueParDefaut : langue,
      protection,
    };
  });
}
