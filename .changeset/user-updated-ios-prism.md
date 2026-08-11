---
"@meeshy/shared": patch
"@meeshy/gateway": patch
---

user:updated — les composants du nom voyagent en groupe, et iOS applique enfin l'événement

La gateway diffusait `user:updated` à tous les contacts depuis des mois ; le web
l'appliquait, iOS n'avait aucun listener. Un interlocuteur qui changeait d'avatar
ou de nom restait figé sur la ligne de liste, l'en-tête et le sélecteur de
transfert jusqu'au prochain refetch complet.

Le payload envoie désormais les quatre composants du nom ensemble
(`displayName`, `firstName`, `lastName`, `username`) dès que l'un change : un
delta partiel est irrecomposable chez un client qui ne stocke que le nom déjà
composé. `null` y signifie EFFACÉ, seule façon de faire retomber le nom sur le
composant suivant.
