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

/** Toutes les familles déclarées, toutes sections confondues. */
export const ACHIEVEMENT_FAMILIES: readonly AchievementFamily[] = [...CERCLES_FAMILIES];

/** L'identité d'une famille dans les tables de libellés — sans sa section, qui n'en change pas le sens. */
export const familyId = (family: AchievementFamily): string =>
  `${family.subject}.${family.verb}.${family.scale}`;
