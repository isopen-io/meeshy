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
 * Icônes : spec cercles § 1.1. Miroirs Swift et Kotlin : ils rejouent
 * `fixtures/relation-export-badge.vectors.json`.
 */

import { compareRelationLevel, parseRelationLevel, type RelationLevel } from '../types/relation.js';

export const RELATION_EXPORT_BADGE_MIN_LEVEL: RelationLevel = 'CLOSE';

const RELATION_EXPORT_BADGES: Readonly<Partial<Record<RelationLevel, string>>> = {
  CLOSE: '🔥',
  BLOOD: '🩸',
};

export const relationExportBadge = (served: unknown): string | null => {
  const level = parseRelationLevel(served);
  if (compareRelationLevel(level, RELATION_EXPORT_BADGE_MIN_LEVEL) < 0) return null;
  return RELATION_EXPORT_BADGES[level] ?? null;
};
