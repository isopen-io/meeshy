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

## Review
(à compléter)
