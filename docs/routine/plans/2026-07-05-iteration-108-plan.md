# Iteration 108 — Plan d'implémentation (2026-07-05)

## Objectifs
Corriger **F79** : `detectBestInterfaceLanguage` (`apps/web/utils/language-detection.ts`) n'auto-détecte
jamais l'espagnol alors que `es` est une langue d'interface expédiée (bundle `locales/es` complet, entrée
first-class dans `INTERFACE_LANGUAGES`). Un navigateur hispanophone reçoit une UI anglaise — violation du
Prisme Linguistique sur la surface chrome.

## Modules affectés
- `apps/web/utils/language-detection.ts` — `detectBestInterfaceLanguage` (liste blanche).
- `apps/web/__tests__/utils/language-detection.test.ts` — 3 tests de régression.
- Callers (hérités, inchangés) : `apps/web/hooks/use-language.ts:85,120`.

## Phases d'implémentation
1. **RED** — ajouter 3 tests : `['es-ES','en-US'] → 'es'`, `['es-419'] → 'es'`, `['it-IT','de-DE'] → 'en'`.
   Vérifier que les 2 cas `es` échouent (`Received: "en"`). ✅
2. **GREEN** — `interfaceLanguages = ['en', 'es', 'fr', 'pt']` + commentaire (critère « bundle complet »,
   raison exclusion de/it). ✅
3. **REFACTOR** — commentaire aligné sur la doc `frontend.ts:63-74` ; aucune autre modification. ✅

## Dépendances
Aucune (correctif local, pure liste blanche).

## Risques estimés
Très faible. Comportement identique en/fr/pt et de/it ; corrigé pour es. Fonction testable via mock
`navigator.languages`.

## Stratégie de rollback
Restaurer `['en', 'fr', 'pt']` — réversible en une ligne.

## Critères de validation
- `language-detection.test.ts` 35/35, `use-language.test.tsx` 24/24. ✅
- RED prouvé avant correctif. ✅

## Statut de complétion
**COMPLÉTÉ** — fix + tests verts, RED→GREEN respecté.

## Suivi de progression
- [x] RED (3 tests, 2 rouges)
- [x] GREEN (fix 1 ligne + commentaire)
- [x] Suite `language-detection` 35/35
- [x] Suite `use-language` 24/24 (callers)
- [x] Analyse + plan + leçon
- [ ] Commit + push + PR

## Améliorations futures
- **F80** `getDefaultPermissions` casse rôle (à confirmer sur flux live).
- **F81** `normalizeForDisplay` strip `mshy_` mort (faible valeur).
