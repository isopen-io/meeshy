---
"@meeshy/gateway": patch
---

Deux compteurs de lecture qui mentaient : la synchro multi-appareils d'iOS, et le badge d'un invité de lien partagé

Deux défauts indépendants, même symptôme pour l'utilisateur — un compteur de non-lus
qui ne bouge pas quand il devrait, ou qui retombe à zéro quand il ne devrait pas.

## 1. `mark-read` diffusait un `read-status:updated` amputé

`POST /conversations/:id/mark-read` construisait son payload sans `lastReadAt` ni
`unreadCount`. Or `ReadStatusUpdatedEventData` les déclare comme une **paire** sur
`type: 'read'`, et le contrat dit explicitement qu'un consommateur « les applique
ensemble ou pas du tout ». iOS le fait à la lettre :

```swift
guard event.type == "read",
      let lastReadAt = event.lastReadAt,
      let unreadCount = event.unreadCount else { return }
```

Un payload amputé n'est donc pas appliqué partiellement — il est **silencieusement
jeté**. Et c'est précisément cette route que poste `ConversationService.markRead`, le
transport de lecture primaire d'iOS : **la synchronisation de lecture multi-appareils
d'iOS ne partait jamais**. Lire une conversation sur son iPhone ne descendait pas le
badge sur son iPad. La route jumelle (`message-read-status.ts`) envoyait le couple
correctement depuis toujours — le défaut était la divergence entre deux routes qui
doivent dire la même chose.

Le couple est désormais résolu **une fois et utilisé deux fois** : il accompagne la
diffusion, et il alimente la remise à zéro du badge, qui faisait jusqu'ici son propre
`getUnreadCount`. Une requête de moins par marquage de lecture. Il ne voyage que sur un
`read` — seule action qui avance un curseur de lecture ; un `received` (distribution) ne
déplace jamais `lastReadAt`. Le payload est en outre typé `ReadStatusUpdatedEventData`
au lieu d'être structurellement libre.

## 2. Un invité de lien partagé voyait toujours `unreadCount: 0`

`GET /conversations/:id` recalculait le compteur avec un
`where: { conversationId, userId, isActive: true }` **écrit à la main**. Pour un invité
de lien partagé, `authContext.userId` porte un `Participant.id` (branche anonyme
d'`UnifiedAuthService`) : la clause comparait un id de participant à la colonne `userId`,
ne matchait rien, et le compteur retombait à `0` — un `0` qui **écrasait ensuite le badge
que le socket venait de pousser juste**. Le badge d'un invité ne pouvait donc que
disparaître à chaque ouverture de la conversation.

`resolveCallerParticipant` existe exactement pour ce site : sa précédence
(`participantId` avant `userId`) est celle de `canAccessConversation`, donc l'accès et le
comptage ne peuvent plus diverger sur l'identité de l'appelant. Le helper exclut de plus
les participants bannis, ce que la clause manuelle ne faisait pas.

## Vérification

- **RED prouvé pour chacun** en réintroduisant le défaut : le couple retiré du payload →
  2 rouges ; la clause manuelle restaurée → 1 rouge. Restaurés, re-vérifiés verts.
- Le double de base de données du test d'invité ne répond **que sur la colonne
  interrogée** — une clause `{ userId: <participant id> }` n'y matche rien, comme en base.
  Et le module d'access-control n'y est plus stubbé que sur `canAccessConversation` : la
  vraie règle de précédence est exercée, pas un mock qui la répète.
- Suite gateway complète verte, `tsc --noEmit` gateway : 0 diagnostic.
