/**
 * COQUILLE DE RÉ-EXPORT — l'implémentation vit dans `@meeshy/shared`.
 *
 * `unsetOrNull` et `differsOrUnset` ont déménagé dans
 * `packages/shared/utils/prisma-unset.ts` (#20111) parce que la LOI qu'ils
 * composent — `PARTICIPATION_VIVANTE` — doit être lisible par **tous** les
 * paquets qui lisent `Participant`, et `services/agent` en est un : il
 * sélectionnait les membres DORMANTS d'une conversation pour les animer, sur
 * `isActive` NU, en ne pouvant rien importer de la passerelle.
 *
 * Les **53 fichiers** de la passerelle qui importaient `utils/prisma-unset`
 * continuent de le faire : la coquille est la forme que ce dépôt prescrit déjà
 * après une scission de module (§ « Un fichier `X.ts` à côté d'un répertoire
 * `X/` »), et elle évite de réécrire 53 imports pour un déménagement qui ne
 * change aucun comportement.
 *
 * **53, et non 98.** Le lot a d'abord écrit 98 — le compte des fichiers qui
 * MENTIONNENT `unsetOrNull` ou `differsOrUnset`, commentaires et balayages de
 * texte compris — là où la seule question était « combien importent ce
 * chemin ? ». Un compte est une AFFIRMATION (cycle 93) : les deux `grep` se
 * ressemblent, et un seul répond à la question posée.
 *
 * **Ne pas y ré-implémenter quoi que ce soit.** Une seconde définition de ces
 * deux prédicats serait exactement la jumelle divergente que leur doc-comment
 * existe pour empêcher.
 */
export type { UnsetOrNull, DiffersOrUnset } from '@meeshy/shared/utils/prisma-unset';
export { unsetOrNull, differsOrUnset } from '@meeshy/shared/utils/prisma-unset';
