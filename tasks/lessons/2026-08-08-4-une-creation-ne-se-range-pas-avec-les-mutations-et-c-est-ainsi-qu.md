## 2026-08-08 (4) — Une CRÉATION ne se range pas avec les mutations, et c'est ainsi qu'elle échappe à l'énumération

Le cycle 14 avait conclu en ordonnant d'énumérer les autres familles d'événements traversant
les mêmes audiences. L'énumération a été faite — réactions, épinglages, accusés, tous
vérifiés — et elle a quand même manqué `link:message:new` : un **message entier**, sur le
seul transport d'envoi dont dispose un participant anonyme, jamais enfilé pour les pairs
hors ligne.

**Leçons :**
1. **Une énumération par « familles d'événements » rate ce qui n'a pas la même FORME.**
   `link:message:new` n'est pas une mutation, c'est une création — donc rangée mentalement
   avec `message:new`, qui est couvert sur ses deux transports, donc réputé traité. La bonne
   clé d'énumération n'est pas « quels événements ressemblent à celui que je viens de
   corriger » mais « qui ÉCRIT dans cette conversation », toutes formes confondues. En
   pratique : grep les `.to(ROOMS.conversation(...)).emit(` et non les noms d'événements.
2. **Un commentaire qui énumère ce qu'un contournement refait à la main est un inventaire,
   pas une prose.** Le fichier disait « ce chemin CONTOURNE `MessagingService.handleMessage` »
   et listait validation + stockage. La file hors ligne n'était ni dans cette liste ni dans
   celle des omissions assumées. Règle : tout `// ce chemin contourne X` oblige à énumérer
   ce que X fait et à classer CHAQUE élément en « refait » ou « délibérément omis, parce
   que ». Le silence sur un élément fait passer un oubli pour un choix.
3. **Une méthode privée qui implémente une obligation PRODUIT est un défaut par
   construction — et ici il y en avait cinq d'un coup.** Rappel du cycle 14 #3, mais la
   mesure neuve est le comptage : `MessageHandler` (deux fois), le manager,
   `reactionOfflineQueue`, `AttachmentReactionHandler`. Cinq copies dont quatre privées, donc
   quatre écrivains qui ne POUVAIENT pas honorer la garantie. Corriger le sixième trou sans
   fusionner les cinq aurait garanti un septième. La différenciation utile tient en deux
   paramètres (identité d'exclusion, `dedupKey`) — quand les copies ne diffèrent que par des
   valeurs, elles ne diffèrent pas.
4. **La duplication d'un fan-out se justifie parfois par une VRAIE raison de perf : garder
   la raison, pas la copie.** Le bloc inline de `broadcastNewMessage` réutilisait une liste
   de participants déjà chargée ; l'extraire naïvement aurait ajouté une requête DB par
   message sur le chemin le plus chaud du service. Un paramètre `participants` préserve la
   perf ET l'unicité. Quand une copie existe « pour la performance », vérifier si la
   performance tient à un ARGUMENT que l'API peut accepter avant de conclure à une divergence
   irréductible.
5. **Le rejeu doit porter le nom d'événement du live, pas celui de sa famille.** Tentation
   naturelle : rejouer un message de lien en `message:new` puisque c'est un message. Les deux
   événements ont des charges utiles de formes différentes (`{ message }` contre l'objet nu) ;
   le client aurait reçu une enveloppe là où il attend un message. Règle : un `eventType` de
   file existe pour nommer le COUPLE (événement, forme de payload), pas la sémantique.
6. **Justifier le nombre d'audiences quand il diffère du sibling.** Ici deux et non trois :
   `AuthHandler` rejoint toutes les rooms à la connexion et le handler web bump l'aperçu
   depuis ce même événement, donc un `conversation:updated` séparé coûterait une lecture DB
   par message pour une mise à jour déjà appliquée. Écrit dans le docstring pour qu'un
   lecteur ne prenne pas l'absence pour l'oubli auquel elle ressemble — troisième cycle
   consécutif où cette phrase est ce qui empêche la « correction » suivante d'être une
   régression.
