# Plan d'implémentation — Itération 260 : SSOT correcte de `isIpInRange`

## Objectives

Remplacer le helper `isIpInRange` inline, non testé et sur-permissif de
`routes/anonymous.ts` par un module utilitaire unique, correct et gelé par
témoins — sans changer le comportement des routes au-delà de la correction du
prédicat lui-même.

## Affected modules

- `services/gateway/src/utils/ip-range.ts` (NOUVEAU) — `parseIpv4`, `isIpInRange`.
- `services/gateway/src/utils/__tests__/ip-range.test.ts` (NOUVEAU) — 13 témoins.
- `services/gateway/src/routes/anonymous.ts` — import du helper, suppression de
  la copie inline (17 lignes).

## Implementation phases

1. **RED** — écrire `ip-range.test.ts` affirmant le comportement CORRECT (bloc
   voisin refusé, `/25` honoré, plage `a-b` correcte). Prouver que les 5
   assertions de sécurité tombent contre l'ancienne logique. ✅
2. **GREEN** — implémenter `ip-range.ts` en arithmétique uint32 ; 13/13 verts. ✅
3. **REFACTOR/WIRE** — rebrancher `anonymous.ts`, supprimer l'inline. ✅
4. **VALIDATE** — `tsc --noEmit` 0 erreur ; suites `anonymous*` 55/55 vertes. ✅

## Dependencies

Aucune. Module feuille sans import applicatif (arithmétique pure).

## Estimated risks

Faible. Le prédicat change de verdict UNIQUEMENT là où l'ancien était faux. Aucun
schéma, aucune requête, aucun contrat de fil touché.

## Rollback strategy

Révert du commit : le helper inline revient, aucun état persistant modifié.

## Validation criteria

Voir l'analyse § Validation criteria — tous cochés.

## Completion status

**COMPLET.** Module créé, testé (13/13), rebranché, validé (tsc 0, anonymous
55/55).

## Progress tracking

- [x] Phase 1 RED
- [x] Phase 2 GREEN
- [x] Phase 3 WIRE
- [x] Phase 4 VALIDATE

## Future improvements

- Normalisation explicite du premier hop `x-forwarded-for` (cf. analyse).
- Support IPv6 des allow-lists (décision produit).
