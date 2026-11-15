## Leçon 19 — Un chemin socket qui hardcode une valeur que son sibling REST calcule (2026-07-04, itération 91)
`NotificationService.createPostLikeNotification` reçoit un `postType` load-bearing (il pilote le TYPE de
notification `story_reaction`/`status_reaction`/`post_like`, le contenu, le sous-titre, `metadata.postType`
REEL vs POST) + un contexte éphémère `postCreatedAt`/`postExpiresAt`/`postPreview`. Le call site REST
(`routes/posts/interactions.ts`) forwardait le vrai `post.type` + le contexte ; le sibling socket
(`PostReactionHandler._createPostReactionNotification`) `select`ait `authorId` seul et **hardcodait**
`postType: 'POST'`. Résultat : toute réaction émise par WebSocket sur une STORY/STATUS/REEL produisait une
notification typée POST, sans contexte d'expiration — divergence directe avec le chemin REST pour la même
action utilisateur. **Règle : quand deux chemins (REST + socket) appellent le MÊME service producteur de
notification/événement, ils doivent forwarder le MÊME jeu d'arguments — un argument hardcodé sur un chemin
alors que son sibling le calcule dynamiquement est une dérive silencieuse. Grep le service producteur
(`createPostLikeNotification(`), énumère TOUS ses call sites, et diff leurs arguments — pas juste le
premier.** Le `select` du `findUnique` doit être élargi en lockstep avec les champs forwardés (ici
`type`/`content`/`createdAt`/`expiresAt`), sinon le champ forwardé est `undefined` silencieusement.
