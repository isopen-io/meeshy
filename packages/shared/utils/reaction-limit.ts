/**
 * Plafond de réactions DIFFÉRENTES qu'une personne peut poser sur un même
 * objet réagissable (message, pièce jointe, commentaire, publication — et
 * tout autre objet qui rejoint ce mécanisme, cf. la carte des modèles dans
 * `docs/superpowers/plans/2026-08-20-cinq-reactions-par-personne.md`).
 *
 * Décision produit, citée par le propriétaire (2026-08-20) : « D'un point de
 * vue BD on peut poser un nombre illimité de réactions par utilisateur sur
 * chaque objet, mais le code doit limiter à 5 sur chaque objet permettant de
 * réagir ! » — la base de données n'impose donc AUCUNE contrainte (aucun
 * `@@unique` ne la porte, aucun index ne la fera respecter) ; c'est ce
 * plafond, vérifié au moment de la création par chaque service, qui en tient
 * lieu. Déclaré UNE SEULE FOIS ici : aucun service ne doit porter sa propre
 * copie du nombre, ni sa propre version du raisonnement.
 */
export const MAX_REACTIONS_PER_OBJECT = 5;

/**
 * Message renvoyé à la personne quand le plafond est atteint — LE MÊME
 * partout où la règle s'applique (messages, pièces jointes, commentaires,
 * publications...). Dit ce qui se passe (le maximum est atteint sur CET
 * objet), pas un refus opaque. Un seul texte, une seule fois : les services
 * qui appliquent la règle le réutilisent tel quel, ils ne le reformulent pas.
 */
export const REACTION_LIMIT_REACHED_MESSAGE =
  `Vous avez atteint votre maximum de ${MAX_REACTIONS_PER_OBJECT} réactions sur ce contenu.`;

/**
 * Décide si une personne peut encore poser une réaction DIFFÉRENTE sur un
 * objet donné. Fonction **pure** : elle reçoit le décompte de réactions déjà
 * posées par cette personne sur cet objet (`existingReactionCount`) — c'est
 * à l'appelant de le compter, chacun selon son propre accès BD — et ne va
 * jamais le chercher elle-même. C'est ce qui la rend testable et réutilisable
 * par des services qui interrogent la base différemment.
 *
 * Un décompte déjà AU-DESSUS du plafond (état incohérent : cette contrainte
 * n'a jamais existé en base, une personne peut donc déjà avoir posé plus de
 * cinq réactions) refuse tout aussi proprement qu'un décompte égal au
 * plafond — jamais d'exception, jamais de résultat surprenant.
 *
 * Ne distingue PAS un `upsert` qui ne ferait que mettre à jour une réaction
 * déjà posée (reposer le même émoji) d'une création réelle — cette
 * distinction est la responsabilité de l'appelant, qui ne doit invoquer
 * cette fonction que lorsqu'il s'apprête à créer une réaction réellement
 * nouvelle sur l'objet.
 */
export function isReactionAllowed(existingReactionCount: number): boolean {
  return existingReactionCount < MAX_REACTIONS_PER_OBJECT;
}
