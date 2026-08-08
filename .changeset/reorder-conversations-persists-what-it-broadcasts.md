---
"@meeshy/gateway": patch
---

`POST /user-preferences/reorder` répondait `200` et diffusait le nouvel ordre à
tous les appareils de l'utilisateur **sans rien écrire** dès que la conversation
n'avait pas encore de ligne de préférences : `updateMany` ne matche aucun
document, et n'en signale rien.

Les deux clients appliquent l'ordre de façon optimiste et prennent ce `200` pour
le commit (iOS `ConversationStore.reorderConversations`, web
`UserPreferencesService.reorderInCategory`). Tous les appareils affichaient donc
un ordre que le serveur ne détenait pas, jusqu'à ce qu'un refetch sans rapport le
fasse revenir en arrière.

La route était aussi le dernier écrivain de `UserConversationPreferences` hors
de `conversationPreferencesSync`. Le nouveau `reorderConversationPreferences` y
rentre : il `upsert` (donc crée la ligne manquante), restreint le lot aux
conversations dont l'utilisateur est participant actif — un `upsert` non
restreint laisserait n'importe quel appelant authentifié créer des lignes contre
des ids arbitraires, ce que `updateMany` absorbait pour la mauvaise raison — et
ne diffuse **que ce qui a été écrit**.

`version` n'est délibérément pas incrémenté : `USER_PREFERENCES_REORDERED` ne
porte pas de version et iOS `applyRemoteReorder` l'applique sans garde ;
l'incrémenter avancerait un compteur qu'aucune diffusion ne transporte.
