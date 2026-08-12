# Iteration 107 — Plan d'implémentation (2026-07-05)

## Objectives
Corriger **F76** : `isUrlOnly` (`services/gateway/src/utils/url-content.ts`) classe à tort « URL-only »
un contenu où du texte non-latin (CJK/Thaï) est collé à une URL sans espace, sautant silencieusement
la traduction de ce texte. Borner le token URL au jeu de caractères RFC 3986 pour que le texte adjacent
survive au strip.

## Affected modules
- `services/gateway/src/utils/url-content.ts` — SSOT `isUrlOnly` (regex `URL_TOKEN_REGEX`).
- `services/gateway/src/__tests__/unit/utils/url-content.test.ts` — tests de non-régression + Unicode.
- Consommateurs (héritent automatiquement, non modifiés) :
  `services/gateway/src/services/message-translation/MessageTranslationService.ts:210`,
  `services/gateway/src/services/posts/PostTranslationService.ts:71,119,162`.

## Implementation phases
1. **RED** — repro Node de l'impl d'origine prouvant `isUrlOnly('https://example.com你好世界') === true`. ✅
2. **GREEN** — remplacer `/https?:\/\/\S+/g` par
   `/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g` + commentaire du *pourquoi*. ✅
3. **Tests** — 3 blocs neufs (CJK avant/après, Thaï, non-régression bare/comma-joined) ; 6 existants
   inchangés. ✅
4. **Validation** — `bun run test:unit -- url-content.test.ts` : 9/9. ✅

## Dependencies
Aucune. Fonction pure, aucun changement de contrat/signature/import.

## Estimated risks
Très faible. Sortie identique sur tous les cas existants (prouvé). Seul changement : texte non-URL
collé à une URL n'est plus avalé. Effet de bord bénin : « URL + emoji collé » → `false` (traduction
lancée, inoffensif — pipeline mixte masque les URLs).

## Rollback strategy
Révocation triviale : restaurer `/https?:\/\/\S+/g`. Un seul fichier de prod touché, aucune migration,
aucun état persistant.

## Validation criteria
- [x] RED prouvé (Node).
- [x] GREEN Node sur 13 cas.
- [x] `url-content.test.ts` 9/9 (bun/jest).
- [x] Aucun changement de signature/contrat ; consommateurs héritent du fix.

## Completion status
**COMPLET.** Fix + tests + docs. Prêt à commit/push.

## Progress tracking
- [x] Analyse (`2026-07-05-iteration-107-analyse.md`).
- [x] Plan (ce fichier).
- [x] Fix `url-content.ts`.
- [x] Tests `url-content.test.ts`.
- [x] `bun run test:unit` vert.
- [ ] Commit + push branche `claude/brave-archimedes-fru31a`.

## Future improvements
- **F77** (MEDIUM) : `CircuitBreaker.failureWindowMs` inutilisé — nécessite décision sémantique
  (« échecs consécutifs » vs « fenêtre glissante ») avant implémentation.
- **F78** (LOW-MEDIUM) : `buildAttachmentUrl` ne corrige que l'hôte exact `meeshy.me` (pas `www.`) et
  drop query/hash — impact conditionnel à l'existence d'URLs `www.`/porteuses de query en prod.
