import type { PostVisibility } from '../types/post.js';

/**
 * Loi d'audience de la republication : **même audience, ou plus restreinte,
 * JAMAIS plus large** (règle produit, 2026-08-19).
 *
 * ## Pourquoi ce n'est PAS un rang numérique
 *
 * La tentation est d'ordonner les six audiences sur une échelle de portée
 * (`PUBLIC` > `EXCEPT` > `COMMUNITY` > `FRIENDS` > `ONLY` > `PRIVATE`) et de
 * n'autoriser que la descente. Cet ordre est FAUX : les six audiences ne sont
 * pas comparables deux à deux.
 *
 * - `COMMUNITY` et `FRIENDS` sont incomparables — un contact peut ne pas être
 *   membre de la communauté, et un membre peut ne pas être un contact. Passer
 *   de l'un à l'autre EXPOSE le contenu à des gens qui ne le voyaient pas.
 * - `ONLY` et `FRIENDS` de même : une liste `ONLY` peut nommer des personnes
 *   qui ne sont pas des contacts.
 * - `EXCEPT` est « tout le monde sauf une liste » : proche de `PUBLIC`, mais
 *   sa portée exacte dépend de la liste.
 *
 * Un rang produirait donc des autorisations qui ÉLARGISSENT réellement la
 * portée tout en ayant l'air de la réduire — exactement ce que la règle
 * interdit.
 *
 * ## La loi retenue, prouvablement jamais plus large
 *
 * Seules trois relations sont sûres sans connaître les listes ni les
 * appartenances :
 *
 * 1. **L'identité** — republier à l'identique n'élargit rien.
 * 2. **`PRIVATE`** — l'auteur seul, sous-ensemble de toute audience.
 * 3. **Depuis `PUBLIC`** — « tout le monde » contient toute autre audience,
 *    donc n'importe quelle cible est un rétrécissement.
 *
 * D'où :
 *
 *     original === 'PUBLIC'  ⇒  toutes les audiences
 *     sinon                  ⇒  { original, 'PRIVATE' }
 *
 * C'est volontairement conservateur : une story `FRIENDS` se republie en
 * `FRIENDS` ou `PRIVATE`, et rien d'autre — ce que la demande produit décrit
 * mot pour mot. Élargir cette table exigerait de comparer des appartenances
 * réelles (qui est dans quelle communauté, quelle liste), donc de quitter le
 * domaine des fonctions pures.
 *
 * ## Où cette loi doit être APPLIQUÉE
 *
 * Côté **serveur**, dans `PostService.repostPost` — c'est la frontière de
 * sécurité. Avant ce lot, le service refusait tout original non-`PUBLIC`
 * (« Cannot repost private content ») et son commentaire en DÉDUISAIT
 * l'invariant : « un repost n'étant permis que sur un original PUBLIC, toute
 * valeur ne fait que RESTREINDRE la portée ». Ouvrir la republication aux
 * stories non publiques fait tomber ce raisonnement : la restriction doit
 * désormais être vérifiée explicitement, sans quoi un client pourrait
 * republier une story `PRIVATE` en `PUBLIC`.
 *
 * Le miroir iOS (`StoryRepostAudience`) ne sert qu'à PLAFONNER le sélecteur
 * d'audience du composeur : c'est une affordance, jamais la garantie.
 */

const ALL_VISIBILITIES: readonly PostVisibility[] = [
  'PUBLIC',
  'COMMUNITY',
  'FRIENDS',
  'EXCEPT',
  'ONLY',
  'PRIVATE',
];

/** Audiences qu'un republieur peut choisir, l'original étant donné. */
export function allowedRepostVisibilities(original: PostVisibility): PostVisibility[] {
  if (original === 'PUBLIC') return [...ALL_VISIBILITIES];
  if (original === 'PRIVATE') return ['PRIVATE'];
  return [original, 'PRIVATE'];
}

/** Vue booléenne de la même loi — un seul comportement, deux lectures. */
export function isRepostVisibilityAllowed(
  original: PostVisibility,
  requested: PostVisibility,
): boolean {
  return allowedRepostVisibilities(original).includes(requested);
}

/**
 * `EXCEPT` / `ONLY` ne se lisent pas seules : leur portée EST la liste
 * d'utilisateurs qui les accompagne. Accepter la liste du republieur
 * rouvrirait l'élargissement par la porte de service — « même audience » avec
 * une liste `ONLY` plus longue est plus LARGE. Pour ces deux audiences, la
 * liste se lit sur l'original, jamais sur la requête.
 */
export function repostVisibilityInheritsAudienceList(visibility: PostVisibility): boolean {
  return visibility === 'EXCEPT' || visibility === 'ONLY';
}
