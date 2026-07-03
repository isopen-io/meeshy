# Iteration 89 — Plan d'implémentation (2026-07-03)

## Objectives
La gateway doit lire le texte des overlays de story via le champ canonique `text` (fallback legacy
`content`), en miroir du décodeur iOS et du transform web, afin que les overlays iOS soient traduits
(Prisme), indexés en recherche et trackés.

## Affected modules
- `services/gateway/src/services/PostService.ts` — helper `storyTextObjectText` + 3 sites de lecture
  (searchContent l.206, trackingContent l.232, `triggerStoryTextObjectTranslation` l.392) +
  interface `StoryTextObjectRaw`.
- `services/gateway/src/__tests__/unit/services/PostService.storyTextObjectField.test.ts` — 8 tests neufs.

## Implementation phases
1. **RED** — 8 tests :
   - Helper pur ×4 (`text` ; legacy `content` ; `text` prioritaire ; ni l'un ni l'autre → undefined).
   - `createPost` : story overlay `text`-only sans content → `post.update({content})` = texte overlay.
   - `triggerStoryTextObjectTranslation` : overlay `text`-only → ZMQ `translateTextObject` émis ;
     overlay legacy `content`-only → émis ; overlay vide → non émis.
   Vérifié : les 2 tests `text`-only échouent sans le fix (sites revenus à `.content`) — RED prouvé.
2. **GREEN** — helper `storyTextObjectText` + reroutage des 3 sites + interface `text?`/`content?`.
3. **REFACTOR** — aucun (change minimal ; helper self-documenting + commentaire liant au transform web).

## Dependencies
Aucune. Helper pur ; les 3 sites lisaient déjà l'objet overlay en main.

## Estimated risks
TRÈS FAIBLE. Ajoute une source prioritaire (`text`) ; rétro-compatible sur `content`. Aucun tradeoff.

## Rollback strategy
Revert du commit (2 fichiers). Aucune migration, aucun état persistant.

## Validation criteria
- [x] `PostService.storyTextObjectField.test.ts` : 8/8 verts.
- [x] RED prouvé (2 tests `text`-only rouges sans le fix ; legacy + helper pur restent verts).
- [x] Suites `story|Post|post` : 54 suites / 1218 tests verts, 0 régression.
- [x] `tsc --noEmit` gateway : 0 nouvelle erreur (baseline `@meeshy/shared/prisma/client` inchangé).

## Completion status
✅ **COMPLÉTÉ** — implémenté, testé (RED→GREEN), tsc propre, prêt à merger.

## Progress tracking
- [x] Analyse rédigée (`…-iteration-89-analyse.md`).
- [x] Plan rédigé (ce fichier).
- [x] RED → GREEN → validation.
- [ ] Commit + push + PR.

## Future improvements
- **F52** : caption `triggerStoryTextTranslation` — filtrer la langue source (self-translation `fr→fr`).
- **F53** : `getReels` pagination par score → skips/dupes (miroir `getFeed`, décision produit sur le pool).
- **F54** : `languageCodeSchema` (attachment-validators) rejette ISO 639-3 (widen `{2}`→`{2,3}`).
- **F51** : supprimer/fusionner `FirebaseNotificationService` (dead code FCM).
