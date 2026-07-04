# Iteration 89 — Plan d'implémentation (2026-07-03)

## Objectives
Câbler côté web les deux événements realtime de cycle de vie des stories que le gateway diffuse déjà
au feed room mais que le web ignore (W4) :
- `story:translation-updated` — appliquer la traduction NLLB d'un `textObject` en direct dans le
  cache feed (parité Prisme iOS ↔ web).
- `story:deleted` — retirer la story supprimée du cache feed en direct.

## Affected modules
- `apps/web/hooks/social/use-social-socket.ts` — option `onStoryDeleted` + listener
  `STORY_DELETED` (production). `onStoryTranslationUpdated` est déjà exposé/enregistré.
- `apps/web/hooks/social/use-stories-realtime.ts` — 2 handlers `useCallback` + helper pur
  `mergeStoryTextObjectTranslations` (production).
- `apps/web/__tests__/hooks/social/use-stories-realtime.test.tsx` — tests neufs.

## Implementation phases
1. **RED** — tests dans `use-stories-realtime.test.tsx` :
   - `onStoryTranslationUpdated` merge `translations` dans `storyEffects.textObjects[index]` de la
     story `postId` (préserve les autres langues déjà présentes, ne touche pas les autres stories).
   - no-op si `postId` inconnu / `storyEffects` absent / index hors borne.
   - `onStoryDeleted` retire la story `storyId` du feed ; no-op si absente / cache vide.
   Vérifier : échecs sans les handlers prod (RED prouvé).
2. **GREEN** — handlers + helper immuables (retour de la même référence si rien à muter) ;
   option + listener `STORY_DELETED` dans `use-social-socket`.
3. **REFACTOR** — helper pur exporté pour testabilité directe ; narrowing défensif de `unknown`.

## Dependencies
Aucune. Types déjà présents : `StoryTranslationUpdatedEventData`
(`@meeshy/shared/types/socketio-events`), `StoryDeletedEventData` (`@meeshy/shared/types/post`),
`SERVER_EVENTS.STORY_DELETED`. Chaîne viewer live déjà en place (`useStoriesFeedQuery` →
`postToStoryData` → `resolvePrismeText`).

## Estimated risks
TRÈS FAIBLE. Mutations de cache immuables gardées par change-detection ; aucune requête réseau ;
signature publique de `useStoriesRealtime` inchangée.

## Rollback strategy
Revert du commit (3 fichiers). Aucune migration, aucun état persistant, aucun changement de schéma.

## Validation criteria
- [x] `use-stories-realtime.test.tsx` : 17/17 verts (9 tests neufs inclus : 4 translation, 3 delete
      + les 2 no-op couverts).
- [x] RED prouvé : sans les handlers prod (stash), 4 tests échouent (merge translation + 3 delete
      « No listener for story:deleted »).
- [x] `use-social-socket.test.tsx` : 9/9 verts (non-régression).
- [x] Suites `hooks/social` + `lib/story` : 192/192 verts (10 suites, 0 régression).
- [x] `tsc --noEmit` web : baseline identique 1198→1198 (0 nouvelle erreur ; 0 erreur dans mes
      2 fichiers). Les 1198 sont pré-existantes (client Prisma non généré dans le sandbox).
- [~] ESLint : outillage cassé dans le sandbox (résolution flat-config ESLint 10 circulaire,
      indépendant du diff) ; code aligné 1:1 sur le style des handlers voisins.

## Completion status
✅ **COMPLÉTÉ** — implémenté, testé (RED→GREEN), tsc sans régression, prêt à merger.

## Progress tracking
- [x] Analyse rédigée (`…-iteration-89-analyse.md`).
- [x] Plan rédigé (ce fichier).
- [x] RED → GREEN → validation.
- [ ] Commit + push.

## Future improvements
- **W5 (P3)** : préchargement du média du slide suivant dans `StoryViewer.tsx`.
- **W3 (P2)** : composer web — visibilités COMMUNITY/EXCEPT/ONLY.

---

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

---

# Iteration 89 — Plan d'implémentation (2026-07-03)

## Objectifs
Fermer la fuite de contenu supprimé dans les previews « dernier message » : appliquer la garde
soft-delete `where: { deletedAt: null }` (SSOT = `routes/conversations/core.ts`) aux deux siblings
qui la manquaient — `GET /conversations/search` et `GET /users/me/dashboard-stats`.

## Modules affectés
- `services/gateway/src/routes/conversations/search.ts` (preview recherche)
- `services/gateway/src/routes/users/preferences.ts` (preview dashboard `getDashboardStats`)
- `services/gateway/src/__tests__/unit/routes/conversations/search.test.ts` (test)
- `services/gateway/src/__tests__/unit/routes/users/preferences-dashboard.test.ts` (test)

## Phases
1. **Audit d'exhaustivité** — énumérer TOUS les sites servant une preview « dernier message »
   (`grep messages: { take: 1, orderBy: createdAt desc }` sur routes/services/socketio). Résultat :
   3 sites, 1 correct (core.ts), 2 à corriger. ✅
2. **Fix search.ts** — insérer `where: { deletedAt: null }` en tête du bloc `messages`. ✅
3. **Fix preferences.ts** — idem sur le bloc `messages` de `recentConversations`. ✅
4. **Tests** — 1 test de forme de where-clause par sibling (assert sur le mock `findMany`). ✅
5. **Validation** — jest sur les 2 suites + suites voisines, aucune régression.
6. **Commit + push + PR.**

## Dépendances
Aucune. Changement local aux deux routes, indépendant des PR iOS ouvertes (#1413/#1412/#1410).

## Risques estimés
Très faible. Le filtre RESTREINT (exclut les supprimés) — comportement déjà en prod sur la liste
principale. Aucun chemin ne dépend d'un message supprimé en preview.

## Stratégie de rollback
Retirer les deux lignes `where: { deletedAt: null }` ajoutées ; revert du commit. Aucune migration,
aucun state.

## Critères de validation
- Garde présente dans les 2 siblings, forme identique à core.ts.
- 2 tests neufs verts (assertion de forme de where-clause).
- Suites `search.test.ts` + `preferences-dashboard.test.ts` vertes, aucune régression.

## Statut de complétion
- [x] Audit exhaustif des siblings preview
- [x] Fix search.ts
- [x] Fix preferences.ts
- [x] Tests neufs (2)
- [ ] Validation jest (en cours — bun install)
- [ ] Commit + push

## Progress tracking / Future improvements
- Candidats reportés (itérations dédiées) : `getReels` curseur non-monotone (pagination reels),
  `PostService.buildVisibilityFilter` sans contacts DM (story tray → 404 ouverture),
  `recordEngagementBatch` double-incrément d'agrégats.

---

# Iteration 89 — Plan d'implémentation (2026-07-03)

## Objectives
Propager la locale appareil (`deviceLocale`, 4e priorité du Prisme Linguistique — extension
2026-05-26) aux **deux derniers** call sites de `resolveUserLanguage` côté gateway qui l'ignoraient
encore, afin que la résolution de langue soit **identique sur tous les chemins** (REST, socket,
notifications).

## Affected modules
- `services/gateway/src/routes/conversations/messages.ts` — `select` de `userPrefs` (+`deviceLocale`)
  et appel `resolveUserLanguage` du hot-path `GET /conversations/:id/messages` (`meta.userLanguage`).
- `services/gateway/src/middleware/auth.ts` — appel `resolveUserLanguage` (`UnifiedAuthContext.userLanguage`).
- `services/gateway/src/__tests__/unit/middleware/auth.test.ts` — 3 tests neufs.
- `services/gateway/src/__tests__/unit/routes/messages-list-language.test.ts` — fichier neuf (3 tests).

## Implementation phases
1. **RED** — tests neufs :
   - `auth.test.ts` : user prefs in-app toutes `null` + `deviceLocale: 'en-US'` →
     `ctx.userLanguage === 'en'` (échoue : retourne 'fr').
   - `messages-list-language.test.ts` : inject `GET /conversations/:id/messages`, `userPrefs` prefs
     in-app `null` + `deviceLocale: 'en-US'` → `meta.userLanguage === 'en'` (échoue : 'fr').
   - Gardes (passent avant/après) : `deviceLocale` ne supplante pas `systemLanguage` ; fallback 'fr'.
   Vérifié : les 2 cas `deviceLocale` échouent sans le fix prod (RED prouvé), gardes vertes.
2. **GREEN** — 3 lignes prod :
   - `messages.ts` : `deviceLocale: true` dans le select + `resolveUserLanguage(userPrefs, { deviceLocale: userPrefs.deviceLocale ?? undefined })`.
   - `auth.ts` : `resolveUserLanguage(user, { deviceLocale: user.deviceLocale ?? undefined })`.
3. **REFACTOR** — aucun (change minimal, aligné sur le pattern existant `NotificationService`).

## Dependencies
Aucune. `resolveUserLanguage` accepte déjà `{ deviceLocale }` (shared). `User.deviceLocale` existe au
schema (l.120) et est indexé. `auth.ts` charge déjà `deviceLocale` (select l.249) — zéro requête
nouvelle. `messages.ts` embarque `deviceLocale` dans la requête `user.findFirst` déjà émise.

## Estimated risks
TRÈS FAIBLE. La 4e priorité ne se déclenche que si `systemLanguage`/`regionalLanguage`/
`customDestinationLanguage` sont toutes vides ; comportement inchangé sinon.

## Rollback strategy
Revert du commit (4 fichiers). Aucune migration, aucun état persistant.

## Validation criteria
- [x] `auth.test.ts` + `messages-list-language.test.ts` : verts (6 tests neufs, RED→GREEN prouvé).
- [x] RED prouvé : sans le fix, les 2 tests `deviceLocale` retournent 'fr' au lieu de 'en'.
- [x] `tsc --noEmit` gateway : 0 erreur.
- [x] Suites `auth|messages|deviceLocale|NotificationService.i18n` : 36 suites / 1043 tests verts, 0 régression.

## Completion status
✅ **COMPLÉTÉ** — implémenté, testé (RED→GREEN), tsc propre, prêt à merger.

## Progress tracking
- [x] Analyse rédigée (`…-iteration-89-analyse.md`).
- [x] Plan rédigé (ce fichier).
- [x] RED → GREEN → validation.
- [ ] Commit + push.

## Future improvements
- **F51** : supprimer/fusionner `FirebaseNotificationService` (dead code FCM parallèle).
- **F49/F50** : résidus lost-update in-process sur caches stats (auto-guéris par TTL).

---

# Iteration 89 — Plan d'implémentation (2026-07-03)

## Objectifs
Corriger deux défauts de correction backend/shared, haute confiance, indépendants des PR ouvertes
(#1388/#1389/#1390, surfaces iOS/web disjointes), tous deux instances du motif **sibling-drift** :
1. **89-A** — `getReels` : curseur de pagination pris sur l'ordre de score → réels sautés/re-servis
   en scroll infini. Aligner sur l'invariant lossless documenté du sibling `getFeed`.
2. **89-B** — `languageCodeSchema` (attachment-validators) rejette les codes ISO 639-3 supportés →
   transcriptions/traductions `bas`/`ksf`/`nnh`/`dua`/`ewo` rejetées au trust boundary. Élargir le
   regex, homogène avec le fix 86-B de `CommonSchemas.language`.

## Modules affectés
- `services/gateway/src/services/PostFeedService.ts` (`getReels`) — 89-A
- `services/gateway/src/__tests__/unit/services/PostFeedService.test.ts` — tests 89-A
- `packages/shared/utils/attachment-validators.ts` (`languageCodeSchema`) — 89-B
- `packages/shared/__tests__/attachment-validators.test.ts` — test 89-B

## Phases d'implémentation
1. **89-A fix** : `getReels` — `candidatePoolSize = limit + 1` ; `hasMore/page/oldest/nextCursor`
   calculés sur la fenêtre chronologique avant scoring ; scoring d'affinité sur la `page` seulement
   (réordonne l'affichage). ✅
2. **89-A tests** : 3 régressions neuves (curseur = chrono-oldest ≠ score-last ; `take === limit+1` ;
   `hasMore:false`+cursor null sur page unique) + recadrage du test préexistant `limit×4` (encodait
   le bug) sur `take === 6`. ✅
3. **89-B fix** : regex `[a-zA-Z]{2}` → `[a-zA-Z]{2,3}` + JSDoc documentant les 5 codes 639-3. ✅
4. **89-B test** : cas `639-3 ×5` ajouté à la suite `languageCodeSchema` existante. ✅
5. **Homogénéité** : grep confirmant aucun autre sibling `[a-zA-Z]{2}` résiduel (86-B + 89-B couvrent
   les 2 schémas de langue). ✅

## Dépendances
Aucune. Fixes localisés, pas de migration de schéma Prisma, pas de changement de signature publique.

## Risques estimés
FAIBLE (voir Risk assessment 89-A/89-B). Le fix 89-A adopte un invariant déjà validé en prod sur
`getFeed` ; 89-B ne fait qu'élargir l'acceptation (aucun input valide existant cassé).

## Stratégie de rollback
`git revert` du commit unique. Aucun état persistant modifié.

## Critères de validation
- [x] `vitest attachment-validators.test.ts` → 36/36
- [x] `jest PostFeedService.test.ts` → 35/35
- [x] `jest PostFeedService|posts-engagement-feed|reelAffinity` → 88/88, 0 régression
- [x] `bun run build` (shared) → 0 erreur

## Statut de complétion
**COMPLET** — les deux cibles livrées + testées + validées.

## Suivi de progression
- 89-A : ✅ livré (fix + 3 tests neufs + 1 recadré)
- 89-B : ✅ livré (fix + 1 test neuf)

## Améliorations futures
- Le retrieval Reels reste chronologique (fondation) : quand un moteur de reco/embeddings remplacera
  `reelAffinityScore`, il devra préserver le contrat de curseur opaque (createdAt+id) — la pagination
  lossless est désormais garantie par la fenêtre `limit+1` comme `getFeed`.
- Audit périodique recommandé : tout nouveau schéma de code langue doit accepter les 639-3
  (`bas/ksf/nnh/dua/ewo`) — 2 schémas corrigés (86-B `CommonSchemas.language`, 89-B
  `languageCodeSchema`) ; vérifier qu'aucun 3e ne réintroduit `[a-zA-Z]{2}`.
