# 🎯 Système de Réactions - Design Document

## 📋 Vue d'Ensemble

Implémentation d'un système de réactions emoji pour les messages, unifiant et étendant la fonctionnalité étoile existante.

### Objectifs
✅ Permettre aux utilisateurs de réagir avec n'importe quel emoji libre  
✅ Stocker les réactions de manière persistante dans MongoDB  
✅ Diffuser les réactions en temps réel via WebSocket  
✅ Offrir une API REST de fallback  
✅ Garantir le typage fort via `@shared`  
✅ **Unifier** avec la fonctionnalité étoile existante (ne pas casser)

---

## 🏗️ Architecture

### Stack Technique
- **Backend**: Node.js, TypeScript, Fastify (Gateway)
- **Frontend**: Next.js 15, React, TypeScript, Socket.IO client
- **Database**: MongoDB via Prisma
- **Real-time**: Socket.IO (WebSocket)
- **Shared Types**: Module `@shared` pour types et constantes

---

## 📊 Modèle de Données MongoDB

### Collection: `Reaction`

```prisma
/// Réaction emoji sur un message
model Reaction {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  messageId  String   @db.ObjectId
  userId     String?  @db.ObjectId  // null pour anonyme
  anonymousUserId String?  @db.ObjectId  // ID anonyme si applicable
  emoji      String                 // Emoji libre (ex: 🎉, ❤️, 🔥)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  
  message    Message  @relation("MessageReactions", fields: [messageId], references: [id], onDelete: Cascade)
  user       User?    @relation("UserReactions", fields: [userId], references: [id], onDelete: Cascade)
  anonymousUser AnonymousParticipant? @relation("AnonymousReactions", fields: [anonymousUserId], references: [id], onDelete: Cascade)
  
  @@unique([messageId, userId, emoji], name: "user_reaction_unique")
  @@unique([messageId, anonymousUserId, emoji], name: "anonymous_reaction_unique")
  @@index([messageId])
  @@index([userId])
  @@index([anonymousUserId])
}
```

**Contraintes**:
- Un utilisateur ne peut ajouter le même emoji qu'une seule fois par message
- Support utilisateurs authentifiés ET anonymes
- Cascade delete si message/utilisateur supprimé

---

## 📦 Module Partagé (@shared)

### Types (`shared/types/reaction.ts`)

```typescript
/**
 * Payload pour ajouter/retirer une réaction
 */
export interface ReactionPayload {
  readonly messageId: string;
  readonly emoji: string;
}

/**
 * Données d'une réaction complète
 */
export interface ReactionData {
  readonly id: string;
  readonly messageId: string;
  readonly userId?: string;
  readonly anonymousUserId?: string;
  readonly emoji: string;
  readonly createdAt: Date;
}

/**
 * Agrégation des réactions par emoji pour un message
 */
export interface ReactionAggregation {
  readonly emoji: string;
  readonly count: number;
  readonly userIds: readonly string[];  // IDs des utilisateurs ayant réagi
  readonly hasCurrentUser: boolean;     // L'utilisateur actuel a-t-il réagi?
}

/**
 * État synchronisé des réactions d'un message
 */
export interface ReactionSync {
  readonly messageId: string;
  readonly reactions: readonly ReactionAggregation[];  // Groupées par emoji
  readonly totalCount: number;
  readonly userReactions: readonly string[];  // Emojis utilisés par l'utilisateur actuel
}

/**
 * Événement de mise à jour de réaction (WebSocket)
 */
export interface ReactionUpdateEvent {
  readonly messageId: string;
  readonly userId?: string;
  readonly anonymousUserId?: string;
  readonly emoji: string;
  readonly action: 'add' | 'remove';
  readonly aggregation: ReactionAggregation;  // État après l'action
  readonly timestamp: Date;
}
```

### Constantes d'Événements (`shared/types/socketio-events.ts`)

```typescript
// Ajouter aux constantes existantes
export const SERVER_EVENTS = {
  // ... événements existants
  REACTION_ADDED: 'reaction:added',
  REACTION_REMOVED: 'reaction:removed',
  REACTION_SYNC: 'reaction:sync',
} as const;

export const CLIENT_EVENTS = {
  // ... événements existants
  REACTION_ADD: 'reaction:add',
  REACTION_REMOVE: 'reaction:remove',
  REACTION_REQUEST_SYNC: 'reaction:request_sync',
} as const;
```

### Événements Socket.IO (mise à jour interfaces)

```typescript
// Événements serveur → client
export interface ServerToClientEvents {
  // ... événements existants
  [SERVER_EVENTS.REACTION_ADDED]: (data: ReactionUpdateEvent) => void;
  [SERVER_EVENTS.REACTION_REMOVED]: (data: ReactionUpdateEvent) => void;
  [SERVER_EVENTS.REACTION_SYNC]: (data: ReactionSync) => void;
}

// Événements client → serveur
export interface ClientToServerEvents {
  // ... événements existants
  [CLIENT_EVENTS.REACTION_ADD]: (
    data: ReactionPayload, 
    callback?: (response: SocketIOResponse<ReactionUpdateEvent>) => void
  ) => void;
  [CLIENT_EVENTS.REACTION_REMOVE]: (
    data: ReactionPayload,
    callback?: (response: SocketIOResponse<ReactionUpdateEvent>) => void
  ) => void;
  [CLIENT_EVENTS.REACTION_REQUEST_SYNC]: (
    messageId: string,
    callback?: (response: SocketIOResponse<ReactionSync>) => void
  ) => void;
}
```

---

## ⚙️ API REST (Gateway)

### Routes

| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| `POST` | `/api/reactions` | Ajouter une réaction | Requis |
| `DELETE` | `/api/reactions/:messageId/:emoji` | Supprimer une réaction | Requis |
| `GET` | `/api/reactions/:messageId` | Récupérer toutes les réactions d'un message | Requis |
| `GET` | `/api/reactions/user/:userId` | Récupérer les réactions d'un utilisateur | Requis |

### Exemples de Requêtes

#### Ajouter une réaction
```typescript
POST /api/reactions
Authorization: Bearer <token>
Content-Type: application/json

{
  "messageId": "65f4a...",
  "emoji": "🎉"
}

// Réponse
{
  "success": true,
  "data": {
    "id": "65f5b...",
    "messageId": "65f4a...",
    "userId": "65f3c...",
    "emoji": "🎉",
    "createdAt": "2025-10-20T10:30:00Z"
  }
}
```

#### Supprimer une réaction
```typescript
DELETE /api/reactions/65f4a.../🎉
Authorization: Bearer <token>

// Réponse
{
  "success": true,
  "message": "Reaction removed successfully"
}
```

#### Récupérer les réactions d'un message
```typescript
GET /api/reactions/65f4a...
Authorization: Bearer <token>

// Réponse
{
  "success": true,
  "data": {
    "messageId": "65f4a...",
    "reactions": [
      {
        "emoji": "🎉",
        "count": 5,
        "userIds": ["65f3c...", "65f3d...", ...],
        "hasCurrentUser": true
      },
      {
        "emoji": "❤️",
        "count": 3,
        "userIds": ["65f3e...", ...],
        "hasCurrentUser": false
      }
    ],
    "totalCount": 8,
    "userReactions": ["🎉"]
  }
}
```

---

## 🔌 Flux WebSocket

### 1. Ajout de Réaction

```
┌─────────┐                ┌─────────┐                ┌──────────┐
│ Client  │                │ Gateway │                │ Database │
└────┬────┘                └────┬────┘                └────┬─────┘
     │                          │                          │
     │ reaction:add             │                          │
     │ {messageId, emoji}       │                          │
     ├─────────────────────────>│                          │
     │                          │                          │
     │                          │ Vérifier permissions     │
     │                          │ Vérifier si existe       │
     │                          ├─────────────────────────>│
     │                          │                          │
     │                          │ Créer Reaction           │
     │                          │<─────────────────────────┤
     │                          │                          │
     │ ACK (response)           │                          │
     │<─────────────────────────┤                          │
     │                          │                          │
     │                          │ Broadcast reaction:added │
     │                          │ à tous les participants  │
     │ reaction:added           │                          │
     │<─────────────────────────┤                          │
     │                          │                          │
```

### 2. Suppression de Réaction

```
┌─────────┐                ┌─────────┐                ┌──────────┐
│ Client  │                │ Gateway │                │ Database │
└────┬────┘                └────┬────┘                └────┬─────┘
     │                          │                          │
     │ reaction:remove          │                          │
     │ {messageId, emoji}       │                          │
     ├─────────────────────────>│                          │
     │                          │                          │
     │                          │ Vérifier permissions     │
     │                          │ Supprimer Reaction       │
     │                          ├─────────────────────────>│
     │                          │<─────────────────────────┤
     │                          │                          │
     │ ACK (response)           │                          │
     │<─────────────────────────┤                          │
     │                          │                          │
     │                          │ Broadcast reaction:removed│
     │ reaction:removed         │                          │
     │<─────────────────────────┤                          │
```

### 3. Synchronisation à la Connexion

```
┌─────────┐                ┌─────────┐                ┌──────────┐
│ Client  │                │ Gateway │                │ Database │
└────┬────┘                └────┬────┘                └────┬─────┘
     │                          │                          │
     │ conversation:join        │                          │
     ├─────────────────────────>│                          │
     │                          │                          │
     │                          │ Charger messages récents │
     │                          ├─────────────────────────>│
     │                          │                          │
     │                          │ Pour chaque message:     │
     │                          │ Charger réactions        │
     │                          │<─────────────────────────┤
     │                          │                          │
     │ message:new (avec reactions)                       │
     │<─────────────────────────┤                          │
```

---

## 🎨 Interface Frontend

### Composant: `MessageReactions`

Nouveau composant pour afficher et gérer les réactions :

```tsx
interface MessageReactionsProps {
  messageId: string;
  reactions: ReactionAggregation[];
  currentUserId: string;
  onAddReaction: (emoji: string) => void;
  onRemoveReaction: (emoji: string) => void;
}

export function MessageReactions({ 
  messageId, 
  reactions, 
  currentUserId,
  onAddReaction,
  onRemoveReaction
}: MessageReactionsProps) {
  // Affichage groupé des réactions avec compteurs
  // Picker d'emoji pour ajouter nouvelle réaction
  // Toggle pour ajouter/retirer réaction existante
}
```

### Intégration dans `BubbleMessage`

```tsx
// Dans BubbleMessage, remplacer l'état local isFavorited
// par l'utilisation du système de réactions

// Migration: ⭐ (star) devient une réaction comme les autres
const starReaction = reactions.find(r => r.emoji === '⭐');
const isFavorited = starReaction?.hasCurrentUser ?? false;

// Actions
const handleToggleStar = () => {
  if (isFavorited) {
    onRemoveReaction('⭐');
  } else {
    onAddReaction('⭐');
  }
};
```

---

## 🔄 Migration de la Fonctionnalité Étoile

### Stratégie d'Unification

1. **Ne pas casser l'existant**: Le bouton étoile reste visible et fonctionnel
2. **Utiliser le système de réactions**: L'étoile devient une réaction spéciale emoji `⭐`
3. **Rétro-compatibilité**: Les anciennes étoiles (si persistées) sont migrées

### Code de Migration

```typescript
// Aucune migration de données nécessaire car l'étoile n'était pas persistante
// Simplement utiliser le nouveau système de réactions pour l'emoji ⭐
```

---

## 📱 Exemples d'Utilisation Frontend

### Hook: `useMessageReactions`

```typescript
export function useMessageReactions(messageId: string) {
  const [reactions, setReactions] = useState<ReactionAggregation[]>([]);
  
  const addReaction = async (emoji: string) => {
    socketService.emit(CLIENT_EVENTS.REACTION_ADD, {
      messageId,
      emoji
    }, (response) => {
      if (response.success) {
        toast.success(`Réaction ${emoji} ajoutée`);
      }
    });
  };
  
  const removeReaction = async (emoji: string) => {
    socketService.emit(CLIENT_EVENTS.REACTION_REMOVE, {
      messageId,
      emoji
    }, (response) => {
      if (response.success) {
        toast.success(`Réaction ${emoji} retirée`);
      }
    });
  };
  
  useEffect(() => {
    const unsubAdd = socketService.on(SERVER_EVENTS.REACTION_ADDED, (event) => {
      if (event.messageId === messageId) {
        updateReactions(event);
      }
    });
    
    const unsubRemove = socketService.on(SERVER_EVENTS.REACTION_REMOVED, (event) => {
      if (event.messageId === messageId) {
        updateReactions(event);
      }
    });
    
    return () => {
      unsubAdd();
      unsubRemove();
    };
  }, [messageId]);
  
  return { reactions, addReaction, removeReaction };
}
```

---

## ✅ Checklist d'Implémentation

### Phase 1: Schema & Types
- [ ] Ajouter modèle `Reaction` dans `shared/schema.prisma`
- [ ] Créer `shared/types/reaction.ts`
- [ ] Mettre à jour `shared/types/socketio-events.ts`
- [ ] Générer Prisma client
- [ ] Mettre à jour relations dans `Message`, `User`, `AnonymousParticipant`

### Phase 2: Backend (Gateway)
- [ ] Créer service `ReactionService` (logique métier)
- [ ] Créer routes REST `/api/reactions`
- [ ] Ajouter handlers Socket.IO pour réactions
- [ ] Implémenter broadcast temps-réel
- [ ] Ajouter validation et permissions
- [ ] Tests unitaires

### Phase 3: Frontend
- [ ] Créer hook `useMessageReactions`
- [ ] Créer composant `MessageReactions`
- [ ] Créer composant `EmojiPicker` (ou utiliser lib)
- [ ] Intégrer dans `BubbleMessage`
- [ ] Migrer bouton étoile vers système réactions
- [ ] Ajouter traductions i18n
- [ ] Tests composants

### Phase 4: Real-time
- [ ] Synchronisation à la connexion
- [ ] Gestion reconnexion
- [ ] Optimistic updates
- [ ] Déduplication événements
- [ ] Gestion erreurs réseau

### Phase 5: UX/UI
- [ ] Animations d'ajout/retrait
- [ ] Indicateurs visuels
- [ ] Gestion mobile
- [ ] Accessibility (ARIA)
- [ ] Dark mode

---

## 🎯 Priorités de Performance

1. **Agrégation côté serveur**: Grouper par emoji pour réduire payload
2. **Pagination**: Limiter nombre de réactions affichées
3. **Debouncing**: Éviter spam de réactions
4. **Cache**: Redis pour agrégations fréquentes
5. **Indexes MongoDB**: Sur `messageId`, `userId`, `emoji`

---

## 🔒 Sécurité

1. **Validation**: Vérifier format emoji (regex unicode)
2. **Rate limiting**: Max 10 réactions/minute/utilisateur
3. **Permissions**: Vérifier accès au message
4. **XSS**: Échapper emojis malformés
5. **CSRF**: Tokens pour API REST

---

## 🌍 Internationalisation

Traductions nécessaires (exemple français) :

```json
{
  "reactions": {
    "add": "Ajouter une réaction",
    "remove": "Retirer la réaction",
    "picker": "Choisir un emoji",
    "count": "{count} réaction(s)",
    "youReacted": "Vous avez réagi",
    "peopleReacted": "{count} personne(s) ont réagi",
    "loading": "Chargement des réactions..."
  }
}
```

---

## 📊 Métriques de Succès

- Latence ajout/retrait < 100ms
- Broadcast temps réel < 200ms
- Taux d'utilisation > 30% des messages
- Zéro régression sur fonctionnalité étoile
- Support 100k messages/sec (objectif global Meeshy)

---

**Status**: 📝 Design Document  
**Version**: 1.0.0  
**Auteur**: GitHub Copilot  
**Date**: 2025-10-20
