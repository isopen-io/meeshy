# Conversation Deletion: Delete For Me + Delete For All

**Date**: 2026-04-15
**Status**: Approved

## Problem

Pas de moyen pour un utilisateur de supprimer une conversation de sa liste de maniere permanente sans la supprimer pour tout le monde. Le delete actuel (isActive=false) est une suppression globale. Il manque un delete personnel et une fermeture propre pour tous.

## Two Distinct Actions

### 1. Delete For Me

Supprime la conversation de la liste de l'utilisateur definitivement. Aucune notification, aucun unread, invisible meme si de nouveaux messages arrivent.

- **Route** : `DELETE /conversations/:id/delete-for-me`
- **Acces** : tout participant actif
- **Comportement** :
  - `participant.deletedForMe = now()`
  - `participant.isActive = false`
  - PAS de `leftAt` (l'utilisateur ne "quitte" pas — distinct de leave)
  - PAS de broadcast `participant-left` aux autres membres
  - Le gateway filtre `deletedForMe != null` dans list/search/sync
  - Le push notification service ignore les participants avec `deletedForMe`
  - SyncEngine et NotificationCoordinator ignorent ces conversations

- **Si le CREATOR supprime pour soi** :
  - Transfert de propriete : le premier MODERATOR actif (ou a defaut le plus ancien membre actif) est promu CREATOR
  - Broadcast socket `conversation:role-updated` au room
  - Si aucun autre membre actif : conversation marquee `isActive = false`

### 2. Delete For All (fermeture definitive)

Ferme la conversation pour tous. Plus personne ne peut ecrire. Les messages restent lisibles.

- **Route** : `DELETE /conversations/:id` (existant, enrichi)
- **Acces** : CREATOR ou ADMIN uniquement (deja le cas)
- **Comportement** :
  - `conversation.isActive = false`
  - `conversation.closedAt = now()`
  - `conversation.closedBy = userId`
  - Broadcast socket `conversation:closed` a tous les membres
  - Clients affichent un bandeau "Conversation fermee" et desactivent le composer
  - Les messages existants restent lisibles

## Schema Prisma

```prisma
model ConversationParticipant {
  // ... existing fields ...
  deletedForMe  DateTime?    // null = visible, non-null = supprime pour cet utilisateur
}

model Conversation {
  // ... existing fields ...
  closedAt       DateTime?   // null = active, non-null = fermee pour tous
  closedBy       String?     // userId qui a ferme
}
```

## Socket Events

| Event | Direction | Payload | Trigger |
|-------|-----------|---------|---------|
| `conversation:closed` | server → clients | `{ conversationId, closedBy, closedAt }` | Delete for all |
| `conversation:role-updated` | server → room | `{ conversationId, userId, newRole }` | Creator delete-for-me transfers ownership |

## Gateway Changes

### New Route: DELETE /conversations/:id/delete-for-me

```
1. Verify caller is active participant
2. If caller is CREATOR:
   a. Find first active MODERATOR, or oldest active MEMBER
   b. Promote to CREATOR
   c. Broadcast conversation:role-updated
   d. If no other active member: set conversation.isActive = false
3. Set participant.deletedForMe = now()
4. Set participant.isActive = false
5. Remove user sockets from room
6. Return success
```

### Enriched Route: DELETE /conversations/:id

```
1. Verify caller is CREATOR or ADMIN (existing)
2. Set conversation.isActive = false (existing)
3. Set conversation.closedAt = now() (NEW)
4. Set conversation.closedBy = callerId (NEW)
5. Broadcast conversation:closed to room (NEW)
6. Return success
```

### Filter in GET /conversations

Add to existing list query: `participant.deletedForMe == null` filter.

## iOS Changes

### SDK (MeeshySDK)

- `ConversationService.deleteForMe()` : already declared in protocol, calls `DELETE /conversations/:id/delete-for-me`
- `MeeshyConversation` : add `closedAt: Date?`, `closedBy: String?`
- Socket handler : subscribe to `conversation:closed`

### App

- `ConversationListViewModel` : filter out conversations where participant has `deletedForMe`
- `ConversationSettingsView` :
  - "Supprimer pour moi" visible pour TOUS les participants
  - "Supprimer pour tous" visible pour CREATOR/ADMIN uniquement
  - Confirmation alert pour les deux actions
- `ConversationView` : si `closedAt != null`, desactiver le composer et afficher un bandeau "Conversation fermee"
- `ConversationSyncEngine` : ignorer les conversations `deletedForMe` dans le cache
- `NotificationCoordinator` : ne pas compter les unreads pour les conversations `deletedForMe`

## Files Impacted

| Layer | File | Change |
|-------|------|--------|
| Schema | `packages/shared/prisma/schema.prisma` | +deletedForMe, +closedAt, +closedBy |
| Types | `packages/shared/types/socketio-events.ts` | +CONVERSATION_CLOSED event |
| Gateway | `services/gateway/src/routes/conversations/core.ts` | Enrich DELETE, add closedAt/closedBy |
| Gateway | `services/gateway/src/routes/conversations/delete-for-me.ts` | New route |
| Gateway | `services/gateway/src/routes/conversations/index.ts` | Register new route |
| SDK | `packages/MeeshySDK/.../ConversationModels.swift` | +closedAt, +closedBy |
| SDK | `packages/MeeshySDK/.../ConversationService.swift` | deleteForMe already declared |
| SDK | `packages/MeeshySDK/.../MessageSocketManager.swift` | +conversation:closed handler |
| App | `ConversationSettingsView.swift` | UI pour les 2 actions |
| App | `ConversationView.swift` | Bandeau "fermee" + composer disable |
| App | `ConversationListViewModel.swift` | Filter deletedForMe |
| App | `ConversationSyncEngine.swift` | Ignore deletedForMe in sync |

## Hors scope

- Restauration d'une conversation supprimee pour soi
- Hard delete (purge des messages de la DB)
- UI d'archivage (distinct de suppression)
- Leave (quitter) — deja implemente, reste distinct
