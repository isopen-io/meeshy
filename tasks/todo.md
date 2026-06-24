# Social Web — Rattrapage gap temps réel (vs iOS)

## Analyse (root cause)
Le gateway diffuse les events de commentaires/réactions vers `ROOMS.post(postId)`
(post detail, reel viewer, story viewer). iOS rejoint cette room via `post:join`.
**Le web n'émet JAMAIS `post:join`/`post:leave`** → il ne reçoit aucun de ces events
pour un post qu'il consulte (sauf l'auteur + ses amis via la feed room).

Conséquences sur web :
- `comment:added` / `comment:deleted` : invisibles en temps réel pour un viewer non-ami (post PUBLIC/reel/story)
- `post:reaction-added/removed` (emojis détaillés) : émis UNIQUEMENT vers ROOMS.post → jamais reçus en live
- `comment:reaction-added/removed` : émis UNIQUEMENT vers ROOMS.post → jamais reçus en live
- `story:reacted` / `status:reacted` : viewers de la room post ratent l'event

## Itérations
- [x] It.1 — Hook `usePostRoom(postId)` (post:join/leave) + wiring post detail, reel detail, story, reels-feed inline comments (8 tests)
- [x] It.2 — Bug `handleCommentReactionSync` (clé cache commentId→postId, +postId au payload shared+gateway) + helper `patchCommentInPostCaches` (match préfixe → live sur top-level ET replies pour like/reaction/translation) + routing `comment:added` reply→replies cache (+replyCount) + `comment:deleted` purge tous caches
- [x] It.3 — Statuses/moods réels : `use-statuses.ts` (feed query keyée posts.statuses() + create mutation STATUS) + `status-transforms.ts` (postToStatusItem) + PostsFeedScreen câblé (mock retiré). Temps réel via usePostSocketCacheSync (invalide la même clé). 12 tests.
- [x] It.4 — UI liste des viewers de story : `use-story-viewers.ts` (query getViewers, gate auteur) + `StoryViewersSheet.tsx` + StoryViewer (compteur de vues cliquable pour l'auteur, pause timeline, panneau slide-up). 4 tests.

## Méthode
TDD RED-GREEN-REFACTOR, 1 commit/push par itération sur `claude/festive-faraday-m9u3s4`.

## Audit expert — cohérence événements sociaux & droits de diffusion
- [x] **C1 CRITIQUE (corrigé)** : `comment:added/deleted/translation-updated/media-updated` fuyaient vers TOUS les amis de l'auteur sans filtrage → contenu de commentaire sur post ONLY/EXCEPT/PRIVATE/COMMUNITY exposé. Fix : `broadcast*` filtrent via `getVisibilityFilteredRecipients` (défaut PUBLIC rétro-compat) ; appelants passent `post.visibility`/`visibilityUserIds`.
- [x] **C1-bis (post-level, corrigé)** : `post:created/updated/liked/unliked/reposted/translation-updated` filtrent désormais par visibilité (created/updated/reposted lisent depuis l'objet post ; liked/unliked/translation reçoivent visibility des appelants). Post room (join-gated) conservée.
- [x] **H1 (corrigé)** : `postId` ajouté à `SocketCommentReactionSyncEvent` iOS (type de l'ACK live `request-sync`, pas le broadcast mort) + fixture/test SDK MAJ.
- [x] **H2 (corrigé, vérifiable)** : listeners morts `*:reaction-sync` supprimés web (+ test 25→28) ET iOS (`socket.on` retirés). Différé : suppression des subjects publics `commentReactionSync`/`postReactionSync` + constantes shared `*_REACTION_SYNC` (référencés par `StoryViewModel`/mocks/test SDK → refacto iOS à compiler sur macOS).
- [x] **H3 (corrigé)** : `broadcastCommentLiked` atteint aussi `ROOMS.post` (payload absolu, idempotent).
- [x] **M1 (corrigé)** : web câble `story:updated/deleted/unreacted`, `status:unreacted`, `comment:media-updated`.
- [x] **M2 (corrigé)** : `post:liked/unliked` unifiés en un seul emit dédoublonné (`emitToFeedsAndPostRoom`).
- [x] **Re-audit mineur (corrigé)** : `status:unreacted` était émis par le gateway + consommé web mais **droppé en silence par iOS** (asymétrie vs `statusReacted`/`storyUnreacted`). Ajout struct `SocketStatusUnreactedData` + subject + listener + 2 mocks + test décodage.
- [x] **Intégration `main`** : merge `origin/main` (4 commits iOS UI/story) dans la branche — propre, aucun conflit (fichiers disjoints).
- ⚠️ iOS/SDK : pas de toolchain Swift dans l'env → `./apps/ios/meeshy.sh test` / `xcodebuild` à lancer sur macOS pour valider H1 + H2 iOS + `status:unreacted`.
- Détail complet : voir le rapport d'audit dans la conversation.
