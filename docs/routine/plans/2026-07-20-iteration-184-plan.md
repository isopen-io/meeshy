# Plan d'implémentation — Iteration 184

## Objectifs
1. Rendre la génération d'identifiant de conversation invariante par forme de
   normalisation Unicode de l'entrée, afin qu'un même titre visible produise
   toujours le même slug canonique (contrat de translittération allemande honnête).
2. Unifier `detectMentionAtCursor` avec la frontière e-mail `NAME_BOUNDARY_LEFT`
   partagée par tout le sous-système de mentions (cohérence composer ↔ rendu).

## Modules affectés
- `packages/shared/utils/conversation-helpers.ts` — `generateConversationIdentifier`
  (SSOT ; le gateway `identifier-generator.ts` délègue, aucune modif requise).
- `packages/shared/__tests__/conversation-helpers.test.ts` — test de caractérisation.
- `packages/shared/types/mention.ts` — `detectMentionAtCursor` (frontière e-mail).
- `packages/shared/__tests__/mention-extract.test.ts` — bloc de 9 cas (couverture
  auparavant nulle pour `detectMentionAtCursor`).

## Phases
1. **RED** — Ajouter un test asservissant l'invariance NFC/NFD sur `Größe über`
   (échoue sur le code d'origine : `mshy_grosse-uber-…` ≠ `mshy_groesse-ueber-…`). ✅
2. **GREEN** — Insérer `.normalize('NFC')` en tête de la chaîne de sanitisation,
   avant les remplacements allemands précomposés. ✅
3. **REFACTOR** — Aucun (fix minimal, une ligne). ✅
4. **Validation** — suite `conversation-helpers` (81) + suite `packages/shared`
   complète (46 fichiers / 1369) + `tsc --noEmit`. ✅

## Dépendances
Aucune. Fix isolé à une fonction pure.

## Risques estimés
Très faibles. `.normalize('NFC')` idempotent sur entrée NFC → zéro régression sur
le chemin nominal (100 % des tests existants inchangés).

## Stratégie de rollback
Revert du commit unique (1 ligne de prod + 1 test). Aucun état persistant, aucune
migration, aucun changement de contrat d'API.

## Critères de validation
- [x] RED reproduit (NFD → `mshy_grosse-uber-…`).
- [x] GREEN (NFD → `mshy_groesse-ueber-…`, identique à NFC).
- [x] `packages/shared` : 46 fichiers / 1369 tests verts.
- [x] `tsc --noEmit` exit 0.

## Défaut #2 — `detectMentionAtCursor` frontière e-mail
1. **RED** — Bloc de 9 tests `detectMentionAtCursor` (couverture nulle auparavant) ;
   2 cas e-mail (`bob@alice`, `jane.doe@meeshy`) échouent sur le code d'origine. ✅
2. **GREEN** — Test `NAME_BOUNDARY_LEFT@$` (flag `u`) sur le préfixe finissant au
   `@` ; retour `null` si le `@` est précédé d'un caractère de nom. Réutilise la
   constante SSOT déjà importée. ✅
3. **Validation** — suite `mention-extract` (34) + suite complète (1378) + tsc. ✅

## Statut de complétion
**Terminé.** 2 fixes + tests + docs livrés sur `claude/brave-archimedes-1h9uso`.

## Suivi de progression
- [x] Analyse rédigée (`analyses/2026-07-20-iteration-184-analyse.md`).
- [x] Plan rédigé (ce fichier).
- [x] Implémentation + test.
- [x] Validation locale (vitest + tsc).
- [x] Commit + push branche de travail.

## Améliorations futures (pistes non prises ce cycle)
- Auditer les autres sanitizers de la codebase (liens, usernames, slugs de posts)
  pour la même sensibilité NFC/NFD à expansion de graphème si de la translittération
  précomposée y est appliquée.
- Envisager une helper partagée `sanitizeSlug(input)` factorisant NFC + strip
  diacritiques + collapse de tirets si ≥2 sites divergent (aujourd'hui un seul site
  canonique — pas de duplication à consolider).
