# Réels — favori persistant + thread d'affinité (ligne 63) + voir réponses commentaires

> Demande 2026-06-18 : (1) favori non persistant dans le viewer réel, (2) charger les réponses sans répondre, (3) « appliquer la suite du dev :63 » = brancher le viewer sur getReels/seedReelId.

## A — Suite ligne 63 : brancher le viewer sur getReels/seedReelId
- [ ] SDK `PostServiceProviding` : déclarer `getReels(seedReelId:cursor:limit:)`
- [ ] SDK `PostService` : impl → `GET /posts/feed/reels?seed=&cursor=&limit=`
- [ ] Mettre à jour les mocks `PostServiceProviding` (tests SDK + app)
- [ ] `ReelsViewModel` : utiliser `getReels(seedReelId:)` ; seed = réel d'entrée ; pagination cursor ; cold-start fresh = getReels() sans seed
- [ ] Tests ReelsViewModel (getReels avec seed, pagination, dedup)

## B — Favori persistant + sync temps réel
- [ ] Gateway `enrichReelsForViewer` : ajouter `isBookmarkedByMe` (Promise.all + lookup postBookmark)
- [ ] Gateway `socialEvents` : `broadcastPostBookmarked` → `ROOMS.user(userId)`
- [ ] Gateway routes bookmark/unbookmark : émettre l'event
- [ ] `FeedViewModel` : exploiter payload `post:bookmarked` (posts[i].isBookmarkedByMe)
- [ ] `ReelsViewModel` : s'abonner à `postBookmarked` (bookmarkedIds + reels[i].isBookmarkedByMe), ignorer echo propre
- [ ] Tests gateway + iOS

## C — Voir les réponses sans répondre
- [ ] `CommentRowView` : cluster `↰ N Répondre · Voir` ; params `showSeeReplies`, `onSeeReplies` + Equatable
- [ ] `ThreadedCommentSection` : retirer threadToggleButton interne ; showSeeReplies = !isExpanded && remainingRepliesCount>0 ; onSeeReplies = expand (pas de repli) ; garder auto-preview 2
- [ ] Vérifier PostDetailView (consommateur) inchangé
- [ ] Localisation clé « Voir »

## Vérif finale
- [ ] gateway tests verts ; `./apps/ios/meeshy.sh build` + `test` verts
