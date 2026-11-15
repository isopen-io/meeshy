/**
 * LES FAMILLES DE SUCCÈS — le catalogue que la grammaire (#5758) développe.
 *
 * Une famille = un couple (sujet, geste, échelle). C'est l'unité qui coûte :
 * UN gabarit de libellé, UN producteur à l'écriture, UN miroir iOS — et elle
 * rend cinq à six succès. C'est ce rapport qui rend « des milliers » tenable.
 *
 * ## Comment `baseDifficulty` est choisi
 *
 * Il rend COMPARABLES deux échelles qui ne le sont pas. « Rejoindre 1 000
 * conversations » et « rejoindre une conversation de 1 000 membres » portent le
 * même nombre et n'ont rien à voir : la première demande mille gestes, la
 * seconde un seul, au bon endroit. Le tri par palier brut les rangerait
 * ensemble ; `baseDifficulty + log10(palier)` les sépare.
 *
 * Les valeurs suivent trois principes :
 *  - un geste RÉPÉTÉ coûte plus qu'un geste UNIQUE (`count` > `size`) ;
 *  - CRÉER coûte plus que rejoindre, qui coûte plus que quitter ;
 *  - une COMMUNAUTÉ est plus rare qu'une conversation, donc plus chère.
 */

import type { AchievementFamily } from './achievement-catalog.js';

/**
 * Section `cercles` (#5759) — conversations et communautés.
 *
 * Les conversations GÉNÉRALES sont exclues du producteur (directive porteur :
 * « hors conversations générales ») : y appartenir n'est pas un geste, tout le
 * monde y est. Un succès qui tombe sans qu'on ait rien fait ne récompense rien.
 */
export const CERCLES_FAMILIES: readonly AchievementFamily[] = [
  { section: 'cercles', subject: 'conversation', verb: 'join', scale: 'size', baseDifficulty: 1 },
  { section: 'cercles', subject: 'conversation', verb: 'join', scale: 'count', baseDifficulty: 2 },
  { section: 'cercles', subject: 'conversation', verb: 'leave', scale: 'count', baseDifficulty: 1.8 },
  { section: 'cercles', subject: 'conversation', verb: 'create', scale: 'count', baseDifficulty: 2.5 },
  { section: 'cercles', subject: 'community', verb: 'join', scale: 'size', baseDifficulty: 1.5 },
  { section: 'cercles', subject: 'community', verb: 'join', scale: 'count', baseDifficulty: 2.5 },
  // `community.leave.count` est ABSENTE, et ce n'est pas un oubli : quitter une
  // communauté SUPPRIME la ligne `CommunityMember` (`deleteMany`,
  // `routes/communities/membership.ts`), là où quitter une conversation pose un
  // `leftAt`. Il n'existe donc AUCUNE trace à compter. La déclarer produirait un
  // succès que rien ne peut faire tomber — un badge mort, exactement ce que la
  // grille legacy de #5735 nous a déjà coûté. Rendre ce départ traçable est un
  // changement de sémantique à part entière (#5760).
  { section: 'cercles', subject: 'community', verb: 'create', scale: 'size', baseDifficulty: 2 },
  { section: 'cercles', subject: 'community', verb: 'create', scale: 'count', baseDifficulty: 3 },
];

/**
 * Section `parole` (#5759) — ce qu'on produit et envoie.
 *
 * Le type d'un envoi se lit sur `Message.messageType` pour le texte, et sur le
 * `mimeType` de la pièce jointe pour le reste : c'est la seule discrimination
 * que la base porte réellement, et l'inventer autrement produirait des
 * compteurs qui ne comptent rien.
 */
export const PAROLE_FAMILIES: readonly AchievementFamily[] = [
  { section: 'parole', subject: 'message', verb: 'send', scale: 'count', baseDifficulty: 0 },
  { section: 'parole', subject: 'voice', verb: 'send', scale: 'count', baseDifficulty: 0.8 },
  { section: 'parole', subject: 'image', verb: 'send', scale: 'count', baseDifficulty: 0.8 },
  { section: 'parole', subject: 'video', verb: 'send', scale: 'count', baseDifficulty: 1.3 },
];

/** Section `retouche` — le soin apporté à ce qu'on a déjà dit. */
export const RETOUCHE_FAMILIES: readonly AchievementFamily[] = [
  { section: 'retouche', subject: 'message', verb: 'edit', scale: 'count', baseDifficulty: 1 },
  { section: 'retouche', subject: 'message', verb: 'delete', scale: 'count', baseDifficulty: 1 },
  { section: 'retouche', subject: 'message', verb: 'react', scale: 'count', baseDifficulty: 0.5 },
];

/**
 * Section `appels`.
 *
 * LANCER coûte plus que REJOINDRE — il faut une intention et des interlocuteurs
 * disponibles, là où rejoindre ne demande que de répondre.
 */
export const APPELS_FAMILIES: readonly AchievementFamily[] = [
  { section: 'appels', subject: 'call', verb: 'join', scale: 'count', baseDifficulty: 1.5 },
  { section: 'appels', subject: 'call', verb: 'start', scale: 'count', baseDifficulty: 2 },
  { section: 'appels', subject: 'call', verb: 'start', scale: 'size', baseDifficulty: 2.5 },
];

/**
 * Section `ambassade`.
 *
 * `referral` ne compte que les relations ACHEVÉES (`status: 'completed'`) : une
 * invitation envoyée n'est pas une ambassade, sinon le badge récompenserait le
 * spam plutôt que la venue de quelqu'un.
 */
export const AMBASSADE_FAMILIES: readonly AchievementFamily[] = [
  { section: 'ambassade', subject: 'referral', verb: 'complete', scale: 'count', baseDifficulty: 2.5 },
  { section: 'ambassade', subject: 'link', verb: 'click', scale: 'count', baseDifficulty: 1.5 },
];

/**
 * Section `constance` — la plus longue série JAMAIS tenue.
 *
 * Adossée à `User.longestStreakDays`, le RECORD, jamais la série courante : une
 * série rompue ne doit pas retirer un succès (règle porteur, « un succès atteint
 * reste à vie »).
 *
 * L'échelle est `count` — des JOURS, pas une ampleur d'audience. Les paliers
 * absurdes (10 000 jours = 27 ans) sont retenus par l'atteignabilité mesurée,
 * pas par une table de seuils dédiée : c'est le mécanisme qui existe déjà.
 */
export const CONSTANCE_FAMILIES: readonly AchievementFamily[] = [
  { section: 'constance', subject: 'streak', verb: 'hold', scale: 'count', baseDifficulty: 2 },
];

/** Section `monnaie` — les Meeshes FRAPPÉES à vie, jamais le solde (#5744). */
export const MONNAIE_FAMILIES: readonly AchievementFamily[] = [
  { section: 'monnaie', subject: 'meesh', verb: 'mint', scale: 'count', baseDifficulty: 3.5 },
];

/**
 * Toutes les familles déclarées, dans l'ordre des sections.
 *
 * La section `decouverte` est ABSENTE, et ce n'est pas un oubli : elle demande
 * la forme COLLECTION (#5751) — « quels éléments d'un ensemble fini ont été
 * touchés » — dont AUCUN stockage n'existe encore. La déclarer produirait des
 * succès que rien ne peut faire tomber, exactement l'erreur de
 * `community.leave.count` (#5760). Elle rejoindra le catalogue avec son modèle.
 */
export const ACHIEVEMENT_FAMILIES: readonly AchievementFamily[] = [
  ...CERCLES_FAMILIES,
  ...PAROLE_FAMILIES,
  ...RETOUCHE_FAMILIES,
  ...APPELS_FAMILIES,
  ...AMBASSADE_FAMILIES,
  ...CONSTANCE_FAMILIES,
  ...MONNAIE_FAMILIES,
];

/** L'identité d'une famille dans les tables de libellés — sans sa section, qui n'en change pas le sens. */
export const familyId = (family: AchievementFamily): string =>
  `${family.subject}.${family.verb}.${family.scale}`;
