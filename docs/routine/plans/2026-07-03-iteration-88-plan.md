# Iteration 88 — Plan d'implémentation (2026-07-03)

## Objectives
Appliquer uniformément la garde `isUrlOnly` aux 3 points d'entrée de traduction de
`PostTranslationService` (`translatePost` l'a déjà ; ajouter à `translateOnDemand` et
`translateComment`), afin qu'un contenu URL-only ne soit jamais envoyé à NLLB (qui corromprait les
liens) — quel que soit le chemin.

## Affected modules
- `services/gateway/src/services/posts/PostTranslationService.ts` — `translateOnDemand` +
  `translateComment` (production).
- `services/gateway/src/services/posts/__tests__/PostTranslationService.test.ts` — 2 tests neufs.

## Implementation phases
1. **RED** — 2 tests :
   - `translateOnDemand` sur un post `content: 'https://example.com/x'` → `zmqClient
     .translateToMultipleLanguages` **non appelé**.
   - `translateComment` sur `content: 'https://example.com/x'` → ZMQ **non appelé**.
   Vérifié : les deux échouent sans les gardes prod (RED prouvé).
2. **GREEN** — garde `isUrlOnly` dans les deux méthodes (helper déjà importé l.14).
3. **REFACTOR** — aucun (change minimal, garde self-documenting via commentaire liant à
   `translatePost`).

## Dependencies
Aucune. `isUrlOnly` déjà importé (`utils/url-content.ts`). `translateOnDemand` teste le
`post.content` déjà chargé ; `translateComment` teste le `content` déjà en paramètre.

## Estimated risks
TRÈS FAIBLE. Gardes en amont d'un envoi ZMQ fire-and-forget ; comportement inchangé pour tout
contenu non-URL-only.

## Rollback strategy
Revert du commit (2 fichiers). Aucune migration, aucun état persistant.

## Validation criteria
- [x] `PostTranslationService.test.ts` : 41/41 verts (2 tests neufs inclus).
- [x] RED prouvé (2 tests échouent sans les gardes prod : ZMQ appelé sur contenu URL-only).
- [x] `tsc --noEmit` gateway : 0 erreur (après `bun run build` de `@meeshy/shared`).
- [x] Suites `posts|[Tt]ranslation` : 70 suites, 1865/1865 verts (1 skipped), 0 régression.

## Completion status
✅ **COMPLÉTÉ** — implémenté, testé (RED→GREEN), tsc propre, prêt à merger.

## Progress tracking
- [x] Analyse rédigée (`…-iteration-88-analyse.md`).
- [x] Plan rédigé (ce fichier).
- [x] RED → GREEN → validation.
- [x] Commit + push.

## Future improvements
- **F51** : supprimer/fusionner `FirebaseNotificationService` (dead code FCM parallèle).
