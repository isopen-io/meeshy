---
"@meeshy/web": patch
---

Le delta de reconnexion ne rallume plus le badge de la conversation qu'on est en train de lire

Complément du catch-up delta de la liste de conversations (coupure socket) : la fusion
prenait la vérité serveur pour TOUS les champs, compteur de non-lus compris. Le gateway
calcule ce compteur pour tous les destinataires, lecteur inclus — un delta qui atterrit
pendant qu'on lit rapporte donc la valeur d'avant l'aller-retour `mark-as-read` et
rallume la pastille de la conversation qu'on a sous les yeux. Le handler socket
`conversation:unread-updated` portait déjà exactement cette garde ; le delta est le
second chemin d'écriture du même compteur et la porte désormais aussi.

Une conversation que le delta signale inactive voit également son cache de MESSAGES
purgé, à côté de son `detail` — miroir de `cache.messages.invalidate(for:)` sur iOS.
Sans cela, revenir sur son URL affichait un fil que `staleTime: Infinity` ne relit
jamais.

La garde s'arrête volontairement à la conversation ouverte. L'étendre à la conversation
fermée dont l'accusé de lecture traîne demanderait de faire voyager la frontière de
lecture (`lastReadAt`, que iOS porte et que le modèle web n'a pas) : la transposer via
`unreadCount` + `lastMessageAt` éteindrait le « marquer comme non lu » cross-device,
puisque cette action ne déplace aucun `lastMessageAt`.
