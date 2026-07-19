# Plan d'implémentation — Itération 181

## Objectifs
Brancher les deux derniers émetteurs/comparateurs de codes langue de la route
anonyme (`services/gateway/src/routes/anonymous.ts`) sur la SSOT
`normalizeLanguageCode` :
1. la statistique `stats.spokenLanguages` / `languageCount` (dédup par langue
   réelle, tags canoniques) ;
2. le gate d'accès `allowedLanguages` du join (tolérant aux sous-tags région /
   casse mixte côté config).

## Modules affectés
- `services/gateway/src/routes/anonymous.ts`
  - stat `spokenLanguages` (helper local `addLang`)
  - gate `allowedLanguages` (normalisation de chaque entrée avant comparaison)
- `services/gateway/src/__tests__/unit/routes/anonymous.test.ts` (RED)

## Phases
1. **GREEN — stat** : `addLang(value) = languageSet.add(normalizeLanguageCode(value)
   ?? value.toLowerCase())` appliqué aux 4 sources. ✅
2. **GREEN — gate** : `allowedLanguages.some(l => (normalizeLanguageCode(l) ??
   l.toLowerCase()) === body.language)`. ✅
3. **RED** : +4 tests (collapse variantes région, garde repli code inconnu, gate
   région-taguée non rejetée). ✅
4. **Validation** : jest (`anonymous.test.ts`) + confirmation RED (stash source →
   2 échecs) + tsc (0 erreur sur le fichier). ✅

## Dépendances
`normalizeLanguageCode` (`@meeshy/shared/utils/language-normalize`) — déjà en
production, déjà importé dans `anonymous.ts` (ligne 7). Requiert `prisma generate`
pour un tsc gateway propre (baseline).

## Risques estimés
Très faibles — helper idempotent déjà déployé ailleurs dans le même fichier ; repli
`?? toLowerCase()` préserve les codes inconnus ; type de retour des routes inchangé.

## Stratégie de rollback
Revert du commit unique de l'itération.

## Critères de validation
- `anonymous.test.ts` 23/23 ; RED confirmé (2 échecs sans le correctif).
- 0 erreur `tsc` sur `routes/anonymous.ts` (baseline 13 erreurs auth/* inchangée).

## Statut
**COMPLETE** — implémenté et validé.

## Suivi de progression
- [x] GREEN stat (helper `addLang`)
- [x] GREEN gate `allowedLanguages`
- [x] RED (4 tests)
- [x] Validation jest + RED + tsc
- [x] Analyse + plan
- [ ] Commit + push + merge main

## Améliorations futures
- Voir backlog de l'analyse 181 (`MeeshySocketIOManager.ts:752`, F69).
