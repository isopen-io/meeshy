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
- [ ] It.4 — UI liste des viewers de story (API getViewers existe déjà)

## Méthode
TDD RED-GREEN-REFACTOR, 1 commit/push par itération sur `claude/festive-faraday-m9u3s4`.
