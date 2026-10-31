/**
 * LE LOGO DE CERCLE PEINT SUR L'INTRO D'UNE STORY EXPORTÉE (#13997).
 *
 * Entrée : le niveau EFFECTIF du lien exportateur ↔ auteur, tel que le serveur
 * le SERT (`GET /relations/:userId`, #13998) — jamais un niveau accordé d'un
 * seul côté (RG-01). Sortie : l'emoji du cercle, ou `null` = rien n'est peint.
 *
 * À partir de Proche seulement (décision porteur du 2026-10-31 : « au-delà
 * d'ami proche », lu « Proche et au-dessus ») ; Ami et en dessous ne montrent
 * rien. Toute valeur absente, inconnue ou réservée (ATOM, hors MVP) ⇒ `null` :
 * le logo se ferme sur le doute.
 *
 * Le seuil est porté par la TABLE (seuls Proche et Sang y ont une icône) et
 * non par une comparaison de niveaux : comparer deux niveaux est le domaine
 * exclusif de la loi (`relation-access.ts`) et de `friendship.ts`.
 *
 * Icônes : spec cercles § 1.1. Miroirs Swift et Kotlin : ils rejouent
 * `fixtures/relation-export-badge.vectors.json`.
 */

import type { RelationLevel } from '../types/relation.js';

export const RELATION_EXPORT_BADGE_MIN_LEVEL: RelationLevel = 'CLOSE';

const RELATION_EXPORT_BADGES: ReadonlyMap<string, string> = new Map([
  ['CLOSE', '🔥'],
  ['BLOOD', '🩸'],
] satisfies readonly (readonly [RelationLevel, string])[]);

export const relationExportBadge = (served: unknown): string | null =>
  typeof served === 'string' ? (RELATION_EXPORT_BADGES.get(served) ?? null) : null;
