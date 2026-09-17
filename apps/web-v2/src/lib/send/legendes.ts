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
