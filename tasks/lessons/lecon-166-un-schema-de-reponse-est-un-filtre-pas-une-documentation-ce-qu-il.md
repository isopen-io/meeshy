## Leçon 166 — Un schéma de réponse est un FILTRE, pas une documentation : ce qu'il oublie n'existe plus sur le fil

Fastify sérialise la réponse **à travers** le schéma déclaré : toute propriété absente de
`properties` est retirée de la charge, sans avertissement, sans log, sans erreur de type. Un schéma
de réponse ne décrit donc pas ce que la route rend — il **décide** ce qu'elle rend.

`conversationPreferencesSchema` énumérait les onze champs de préférence et oubliait `version`. Le
résultat n'était pas une documentation incomplète : c'était la suppression, sur les trois surfaces
REST à la fois, du compteur monotone sur lequel tous les clients arbitrent (`incoming.version <=
local -> drop`). Tout le reste de la chaîne était pourtant correct et se lisait comme si le contrat
tenait : la passerelle incrémente bien `version` à chaque écriture, la diffusion socket le porte, le
type partagé le documente comme « payload complet incluant `version` », le modèle Swift le déclare
« populated by the gateway ». Le seul maillon qui ne le disait nulle part était celui qui l'effaçait.

**Le signal qui aurait dû alerter plus tôt** : iOS refait un `GET` juste après son `PUT` dans le
**seul** but de récupérer ce champ, avec un commentaire expliquant l'adaptateur. Du code écrit
exprès pour aller chercher une valeur est la preuve que quelqu'un a cru qu'elle arrivait. Quand ce
code existe et que la valeur est toujours `nil`, ce n'est pas le lecteur qu'il faut suspecter.

**Règle** : quand une donnée est censée traverser une frontière HTTP, la vérifier sur le **fil**
(un test d'injection qui lit `res.json()`), pas dans le handler. Un test qui assert le retour du
handler passe au vert sur une charge que le client ne recevra jamais. Corollaire pour la revue :
tout ajout de colonne destinée aux clients se relit dans DEUX fichiers — le writer et le schéma de
réponse.

**Deuxième moitié — une union dont on ne traite que N-1 branches est une panne, pas une couverture
partielle.** `user:preferences-updated` porte trois scopes ; le web en traitait deux, la troisième
sortant de la fonction sans rien faire, sous un commentaire annonçant une « phase ultérieure ». Le
commentaire est ce qui a fait tenir l'oubli : il transformait un trou en jalon. Mais la ligne
`UserConversationPreferences` est **par utilisateur, pas par appareil** — la diffusion était le seul
chemin par lequel un épinglage fait sur le téléphone pouvait atteindre un onglet ouvert, et rien
d'autre n'allait le combler. **Quand un client déclare consommer un événement, la question n'est
jamais « combien de branches sont traitées » mais « que se passe-t-il pour l'utilisateur sur celles
qui ne le sont pas ».** Ici : la liste gardait son état et son tri jusqu'à un rechargement de page.
