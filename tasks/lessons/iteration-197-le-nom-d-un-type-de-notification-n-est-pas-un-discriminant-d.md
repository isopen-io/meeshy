## Iteration 197 — Le NOM d'un type de notification n'est pas un discriminant d'entité
Bug utilisateur : une notification de commentaire sur un **réel** ouvrait une **story sans rapport**.

- Cause : la gateway appelle `createStoryCommentNotificationsBatch` pour **tout** post commenté
  (pas seulement les stories). Ce batch émet `story_thread_reply` / `friend_story_comment` /
  `story_new_comment` pour un réel comme pour une story ; le nom est historique, le vrai
  discriminant est `metadata.postType`. iOS routait ces types en dur vers le viewer de story
  (`storyNotificationTarget`) sans jamais lire `postType` → viewer ouvert sur un id de réel.
- Leçon générale : **ne jamais dériver l'ENTITÉ d'un nom de type d'événement.** Le type dit ce
  qui s'est passé (un commentaire, une réaction, une publication) ; seule la metadata dit SUR
  QUOI. Deux axes, deux sources — les confondre produit des redirections silencieusement fausses
  qu'aucun test de type ne rattrape.
- Corollaire vérifié à chaque fois : quand un champ est le discriminant, il doit voyager sur
  TOUS les canaux (REST/liste in-app, socket, `data` du push) et sous UN nom. `friend_new_*`
  n'émettait que `contentType`, jamais `postType` → discriminant absent du push, réel d'ami
  ouvert en détail de post plat. Fix : miroir gateway + repli client sur les deux noms.
- Anti-pattern trouvé au passage : chaque surface (iPhone, iPad) avait sa propre heuristique
  (`isStoryNotification`, `isReelNotification`, `isStoryPost`). Trois copies = trois vérités.
  Tout est passé par `NotificationContentRouter` (pur, testé), miroir du `resolveContentRoute`
  du web qui, lui, était déjà correct — le web était la référence, iOS la divergence.
- Second cul-de-sac trouvé en tirant le fil : `user_mentioned` ne portait qu'un `postId` pour
  les mentions dans un post/commentaire, mais iOS ne routait ce type que par `conversationId`
  → tap sans effet. Chercher systématiquement les branches qui `return` sur un champ absent.
- Vérification : HEAD était cassé côté iOS (helper `MicrophonePermission.swift` référencé par
  `0a66a536d` mais jamais committé) ET une autre session mutait le même worktree. Vérifier
  dans un worktree jetable sur HEAD + stub local plutôt que conclure depuis un build pollué.
