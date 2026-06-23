# Notifications — Détails & contexte par type

## Problème
Dans la vue notifications iOS, beaucoup de notifications apparaissent "sans contenu".
Cause racine : `APINotification.formattedBody` (iOS) ne retourne du contenu que pour
quelques types (message, mention, post_comment, login). Pour les types sociaux
(story comments, friend_new_*, repost, réactions post/commentaire, story thread reply)
il retourne `nil` → ligne vide. De plus, le champ `subtitle` (contexte d'entité riche,
ex. « Votre story : « … » ») envoyé par le gateway n'est JAMAIS rendu.
Le backend envoie déjà beaucoup de contexte ; l'UI le jette.

## Objectifs (demande utilisateur)
- Chaque notif liée à un contenu doit afficher des détails/contexte.
- Distinguer story / réel (REEL) / mood / post.
- Story expirée → afficher date de publication + état expiré (savoir pourquoi plus d'accès).
- Commentaire / partage / réaction → aperçu + détails de l'entité concernée.
- Texte → début du message ; audio/image/vidéo → détails média (déjà OK pour messages).
- Réponse à commentaire → commentaire parent + le commentaire/aperçu média.
- Parité iOS. Local-first (chaque notif met à jour le cache local).

## Plan

### Backend (TDD, tests jest exécutables) — FAIT ✅
- [x] shared/types/notification.ts : `REEL` + postCreatedAt/postExpiresAt + previews + media details.
- [x] NotificationService : REEL threadé (i18n→POST, REEL conservé en metadata) ;
      postCreatedAt/postExpiresAt en contexte ; mediaType ; previews persistés ;
      attachment media details (durée/taille/dimensions).
- [x] Callers (posts/core.ts, posts/comments.ts, posts/interactions.ts) : REEL + timestamps.
- [x] Tests gateway : REEL mapping + contexte timestamps (28 friendcontent + 60 storycomments) ;
      gateway tsc clean ; 288 suites notif/social/posts vertes.

### iOS (MeeshySDK)
- [ ] NotificationModels : étendre NotificationContext (conversationAvatar, attachment*,
      postCreatedAt, postExpiresAt) + NotificationMetadata (excerpt, postPreview,
      parentCommentPreview, mediaType, contentType, attachment details).
- [ ] Réécrire `formattedBody` pour couvrir TOUS les types de contenu.
- [ ] Ajouter `formattedContext` (ligne subtitle) + helper expiry/publication story.
- [ ] NotificationRowView : rendre ligne contexte + ligne média/expiry ; retirer code mort.
- [ ] Distinguer story/réel/mood/post dans les libellés.
- [ ] Tests SDK (decoding + formattedBody/formattedContext).

### Stories (demande de suivi) — FAIT ✅
- [x] Story expirée : l'auteur n'est plus auto-skippé sur SON ring → il peut
      revoir sa story et ses commentaires (StoryViewerView.skipExpiredStoriesIfNeeded).
- [x] Bannière « Story expirée — les commentaires restent visibles » dans
      StoryCommentsOverlayView.
- [x] L'auteur voit toujours le bouton commentaire sur SA story (`|| isOwnStory`).
- [x] Répondre à un commentaire ouvre l'universal composer bar (composerFocusTrigger).

## Review
- Backend (gateway + shared) : typecheck clean, 260 tests notif/social/posts verts.
  REEL distinct ; postCreatedAt/postExpiresAt persistés pour friend content,
  story comments, réactions (post_like/story/status) et reposts ; previews
  (comment/post/parent) + mediaType + attachment media details persistés en
  metadata/context (donc servis par REST → visibles dans la liste).
- iOS (MeeshySDK) : formattedBody couvre tous les types ; formattedContext calcule
  toujours la ligne entité + cycle de vie (« Story · il y a 2 j · expirée ») pour
  les types sociaux (le subtitle push n'est qu'un repli pour les autres types) ;
  réutilise RelativeTimeFormatter (SDK core, localisé) ; +9 tests SDK modèle.
- Story UI : 3 changements chirurgicaux (skip-guard auteur, bouton commentaire
  auteur, focus composer sur reply) + bannière expiry.
- LIMITE : pas de toolchain Swift dans cet environnement remote → build/tests iOS
  (`./apps/ios/meeshy.sh test`) NON exécutés ici. Changements ciblés, conformes
  aux patterns existants ; à valider par un build iOS local/CI.
- Revue de code (high effort, 3 agents finders + vérif) : 2 vrais bugs corrigés
  (subtitle masquait l'expiry ; réactions/reposts ne persistaient pas l'expiry),
  duplication RelativeTimeFormatter supprimée. Findings « régression vs fallback »
  réfutés (contextualMessage était déjà du code mort non rendu).
