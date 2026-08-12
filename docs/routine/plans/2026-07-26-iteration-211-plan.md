# Plan d'implémentation — Iteration 211

## Objectifs
Faire converger `apps/web/utils/language-utils.ts` sur la SSOT partagée des langues
(`packages/shared/utils/languages.ts`), supprimant la dernière carte locale
`LANGUAGE_NAMES`/`LANGUAGE_FLAGS` divergente (anglais 🇺🇸 au lieu du 🇬🇧 canonique,
60+ langues supportées absentes).

## Modules affectés
- `apps/web/utils/language-utils.ts` (réécrit en adaptateur SSOT)
- `apps/web/__tests__/utils/language-utils.test.ts` (régression base RED durcie)

Aucun consommateur runtime touché (`use-conversation-stats.ts`,
`ActiveUsersSection.tsx` importent des signatures inchangées).

## Phases d'implémentation
1. **RED** — durcir le test `getLanguageFlag('en')` : `=== '🇬🇧'`, parité SSOT
   (`sharedGetLanguageFlag`) + v2 (`getFlag`). Prouvé rouge contre l'ancien source
   (`Received "🇺🇸"`). ✅
2. **GREEN** — supprimer les deux cartes locales ; déléguer à `getLanguageInfo` /
   `getSupportedLanguageCodes` / `isSupportedLanguage` de la SSOT, en préservant les
   fallbacks (français par défaut, globe inconnu) et le nom natif (`nativeName ?? name`). ✅
3. **VALIDATION** — 47/47 tests verts ; voisines vertes ; `tsc --noEmit` 0 erreur. ✅

## Dépendances
- `packages/shared/dist` construit (`bun run build`) — jest mappe
  `@meeshy/shared/(.*)` → dist.

## Risques estimés
- **Faible.** Web-only, 0 schéma/API/i18n. Parité prouvée sur tous les codes testés ;
  seul changement de comportement intentionnel : `en` 🇺🇸→🇬🇧.

## Stratégie de rollback
Revert du commit unique : `language-utils.ts` + son test. Aucun état persistant,
aucune migration.

## Critères de validation
- [x] Régression RED prouvée (🇺🇸 vs 🇬🇧)
- [x] 47/47 `language-utils.test.ts`
- [x] `v2/flags.test.ts` + `ActiveUsersSection.test.tsx` verts sans modification
- [x] `tsc --noEmit` : 0 erreur projet
- [x] 2 consommateurs héritent du drapeau canonique sans édition

## Statut de complétion
**Terminé.** Prêt pour commit / push / PR.

## Suivi de progression
- [x] Analyse rédigée (`analyses/2026-07-26-iteration-211-analyse.md`)
- [x] Plan rédigé (ce fichier)
- [x] Implémentation + tests
- [x] Validation locale
- [ ] Commit + push + PR

## Améliorations futures
- Byte-formatting logs/télémétrie → SSOT `formatFileSize` (noté #2309).
- `getUserDisplayName`/`getUserDisplayNameOrNull` dedup (après merge #2311/#2313).
- Documenter le choix « nom natif » de `getLanguageDisplayName` vs `getLanguageName`
  (anglais) de la SSOT si un besoin web de nom anglais émerge.
