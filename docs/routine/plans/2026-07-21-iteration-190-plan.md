# Plan d'implémentation — Iteration 190

## Objectifs
Rendre le sentinelle vacuité/`'unknown'` de `getLanguageInfo` (SSOT partagée)
cohérent avec la normalisation déjà appliquée au lookup, pour que les formes
casées/espacées de `'unknown'` retombent sur le défaut français au lieu du
fallback globe `🌐`.

## Modules affectés
- `packages/shared/utils/languages.ts` — `getLanguageInfo` (1 fonction, 3 lignes).
- `packages/shared/__tests__/languages.test.ts` — 2 tests ajoutés.

## Phases d'implémentation
1. **RED** — Ajouter 2 tests (`'Unknown'`/`'UNKNOWN'` → `'fr'` ; `'  unknown  '`
   → `'fr'`). Prouver l'échec sur le code actuel. ✅
2. **GREEN** — Extraire `normalizedCode` avant le sentinelle ; tester
   `normalizedCode === '' || normalizedCode === 'unknown'`. ✅
3. **REFACTOR** — Aucun besoin (la réorganisation EST le refactor ; supprime la
   double représentation). ✅

## Dépendances
Aucune. Fonction pure, pas de migration, pas de changement de signature/type.

## Risques estimés
Minimal — élargissement strict du défaut français (jamais de régression : aucune
entrée auparavant résolue ne change, cf. table d'analyse « Risk assessment »).

## Stratégie de rollback
`git revert` du commit unique — fonction pure isolée, aucun état persistant.

## Critères de validation
- `languages.test.ts` : 56/56 (dont les 2 nouveaux).
- `packages/shared` vitest : 47 fichiers, 1384/1384.
- `tsc --noEmit` : aucune erreur sur `utils/languages.ts`.

## Statut : COMPLETED

## Progress tracking
- [x] Sync main (`b1ab3c9`), branche `claude/brave-archimedes-ereq4q`.
- [x] RED (2 tests échouent).
- [x] GREEN (fix 3 lignes).
- [x] Suite complète verte (1384/1384) + tsc clean sur le fichier.
- [x] Analyse + plan écrits.
- [ ] Commit + push + merge dans main.

## Améliorations futures (191+)
- `MAX_LINK_NAME_LENGTH` (`link-name-generator.ts:24`) : dead constant +
  docstring 32≠60 → nettoyage doc/dead-code.
- Mémoïsation éventuelle du fallback `getLanguageInfo` si un profil le justifie.
- Parité cross-plateforme du sentinelle `'unknown'` (miroirs iOS/Android).
