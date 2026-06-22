# Réels — favori persistant + thread d'affinité (ligne 63) + voir réponses commentaires

> Demande 2026-06-18 : (1) favori non persistant dans le viewer réel, (2) charger les réponses sans répondre, (3) « appliquer la suite du dev :63 » = brancher le viewer sur getReels/seedReelId.

## A — Suite ligne 63 : brancher le viewer sur getReels/seedReelId
- [x] SDK `PostServiceProviding` : déclarer `getReels(seedReelId:cursor:limit:)`
- [x] SDK `PostService` : impl → `GET /posts/feed/reels?seed=&cursor=&limit=`
- [x] Mocks `PostServiceProviding` (MockPostService app + ComposeAndPublishFlowTests SDK)
- [x] `ReelsViewModel` : `getReels(seedReelId:)` ; seed = réel d'entrée ; pagination cursor ; cold-start fresh = sans seed
- [x] Tests ReelsViewModel (getReels avec seed nil/entry, append) — 7/7 verts

## B — Favori persistant + sync temps réel
- [x] Gateway `enrichReelsForViewer` : `isBookmarkedByMe` (Promise.all + lookup postBookmark)
- [x] Gateway `SocialEventsHandler.broadcastPostBookmarked` → `emitToUser` (feed room, perso)
- [x] Gateway routes bookmark/unbookmark : émettre l'event
- [x] `FeedViewModel` : payload `post:bookmarked` → posts[i].isBookmarkedByMe
- [x] `ReelsViewModel` : abonnement `postBookmarked` (bookmarkedIds + reels[i].isBookmarkedByMe)
- [x] Tests gateway (enrichReelsForViewer + broadcastPostBookmarked) — verts

## C — Voir les réponses sans répondre
- [x] `CommentRowView` : cluster `↰ N Répondre · Voir` ; params showSeeReplies/onSeeReplies + Equatable
- [x] `ThreadedCommentSection` : threadToggleButton retiré ; showSeeReplies = !isExpanded && remaining>0 ; onSeeReplies = expand (pas de repli) ; auto-preview 2 conservé
- [x] PostDetailView : consommateur inchangé (onToggleThread déjà câblé → Voir fonctionne)
- [x] Localisation : `feed.comments.see_replies` (defaultValue, conforme aux clés sœurs comment ; a11y réutilise a11y.comment.show_replies)

## Vérif finale
- [x] gateway tests verts (79) + type-check OK
- [x] `./apps/ios/meeshy.sh build` OK (86s) ; ReelsViewModelTests 7/7 verts
- [ ] (suivi) device-test : favori survit fermeture/réouverture ; thread d'affinité enchaîne ; Voir réponses
