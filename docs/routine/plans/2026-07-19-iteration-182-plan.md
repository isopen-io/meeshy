# Plan d'implémentation — Itération 182

## Objectifs
Consolider les deux copies dérivées de `generateConversationIdentifier` (gateway
`link-helpers.ts` + `MessageTranslationService`) sur la source unique de vérité
`@meeshy/shared/utils/conversation-helpers`, restaurant la translittération
accents/allemand (`é→e`, `ü→ue`, `ö→oe`, `ß→ss`) et le timestamp UTC sur le flux
de création par lien de partage, et supprimant la dette de réimplémentation.

## Modules affectés
- `services/gateway/src/routes/links/utils/link-helpers.ts` (délégation)
- `services/gateway/src/services/message-translation/MessageTranslationService.ts`
  (suppression du privé + appel via import partagé)
- `services/gateway/src/__tests__/unit/routes/links/link-helpers.test.ts` (RED)
- `services/gateway/src/__tests__/unit/services/MessageTranslationService.branches.test.ts`
  (retrait tests orphelins + mock enrichi)
- `services/gateway/src/__tests__/unit/services/MessageTranslationService.audio.test.ts`
  (mock enrichi pour le chemin de sauvegarde public)

## Phases
1. **RED** — +3 tests de translittération/UTC dans `link-helpers.test.ts`
   (module partagé réel, non mocké). ✅
2. **GREEN** — `link-helpers.generateConversationIdentifier` délègue à la SSOT. ✅
3. **GREEN** — `MessageTranslationService` : suppression du privé
   `_generateConversationIdentifier`, appel via `generateConversationIdentifier`
   importé de la SSOT. ✅
4. **Tests** — retrait des 3 tests orphelins du privé supprimé ; les mocks de
   `conversation-helpers` (branches + audio) exposent
   `generateConversationIdentifier`. ✅
5. **Validation** — jest (7+5 suites) + tsc (baseline inchangé). ✅

## Dépendances
`generateConversationIdentifier` (`@meeshy/shared/utils/conversation-helpers`) —
déjà en production, déjà consommé via `identifier-generator.ts`.

## Risques estimés
Très faibles — helper idempotent pour l'ASCII (parité stricte des tests existants) ;
signature inchangée ; seul changement observable = amélioration (accents + UTC).

## Stratégie de rollback
Revert du commit unique de l'itération.

## Critères de validation
- Suites gateway concernées : **478 tests verts** (3 nouveaux).
- `tsc --noEmit` gateway : 334 → 334 (aucune nouvelle erreur).

## Statut
**COMPLETE** — implémenté et validé.

## Suivi de progression
- [x] RED (3 tests link-helpers)
- [x] GREEN link-helpers délégation
- [x] GREEN MessageTranslationService délégation
- [x] Toilettage tests (mocks + retrait orphelins)
- [x] Validation jest + tsc
- [x] Analyse + plan
- [ ] Commit + push

## Améliorations futures
- Voir backlog de l'analyse 182 (`validatePagination` limit=0, `looksLikePhoneNumber`).
