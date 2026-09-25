## Leçon 61 — une garde d'optimisation posée AVANT l'appel est la moitié oubliable du contrat (2026-08-08, routine messaging)

Audit ciblé du cœur temps-réel TS (env Linux, pas de Xcode). Cinquième unité de la même
famille extraite des routes de lien de partage : la résolution des mentions vivait sous DEUX
niveaux de `private` dans `MessageProcessor`, et les deux routes de lien contournent
`MessagingService.handleMessage`. Un `@alice` envoyé par lien ne produisait ni ligne
`Mention`, ni `Message.validatedMentions`, ni notification de mention.

**Leçons :**
1. **Le court-circuit appartient à l'unité, pas à l'appelant.** `handleMentionsAndNotifications`
   testait `content.includes('@')` AVANT d'appeler la résolution. Recopié dans deux routes, ce
   test serait devenu la moitié oubliable de la leçon 60 : un troisième écrivain le laisse
   tomber et fait payer quatre requêtes à chaque message. Déplacé dans l'unité, il est
   inoubliable — et il devient testable comme un comportement (« aucune requête sans `@` »)
   plutôt que comme une ligne.
2. **Toutes les unités partagées ne sont pas fire-and-forget : c'est la DESTINATION de leur
   sortie qui tranche.** Les quatre sœurs de ce cycle (`broadcastLinkMessage`,
   `runMessagePostSaveEffects`, `emitUnreadCountsToRecipients`, `notifyMessageRecipients`) sont
   lancées sans `await` parce que rien de ce qu'elles produisent ne repart dans la réponse.
   Celle-ci en a deux qui repartent — les usernames dans le payload 201 et l'événement socket,
   les ids dans l'éventail. L'attendre est ce qui lui donne son sens ; copier le `void` des
   sœurs par symétrie aurait produit un payload systématiquement vide.
3. **Un champ nommé « validated » qui contient des rejetés est un bug qu'on lit dans son nom.**
   Le chemin de création persistait `Array.from(userMap.keys())` — tous les usernames résolus,
   pas ceux retenus par la validation. Le chemin d'édition, lui, filtrait par `validUserIds`.
   Quand deux écrivains d'un même champ divergent, le nom du champ dit lequel a raison ; et
   unifier vers la source unique est le seul moment où l'arbitrage coûte zéro.
4. **Chercher les DOUBLONS du helper qu'on extrait, pas seulement ses appelants.**
   `getConversationParticipants` (MessageProcessor) et `getConversationParticipantsForMention`
   (MeeshySocketIOManager) sont le même corps avec le même `select`, sous deux noms. Extraire
   l'un sans grep-er l'autre laisse la dérive intacte : le second reste ouvert, noté.
