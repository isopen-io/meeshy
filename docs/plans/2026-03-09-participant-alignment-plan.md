# Alignement Frontend-Backend Participant Model

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Aligner le frontend sur le modèle Participant unifié du backend, supprimer ThreadMember deprecated, et implémenter l'event Socket.IO `participant:role-updated`.

**Architecture:** Le backend retourne des participants avec `role` (global, UPPERCASE) et `conversationRole` (conversation, lowercase). Le frontend doit préserver ces deux champs à travers toute la chaîne : service → hook → composants. On remplace `ThreadMember` par `Participant` (déjà exporté depuis `@meeshy/shared/types`).

**Tech Stack:** TypeScript, React, Zustand, Socket.IO, Zod

---

## Contexte technique

### Réponse backend (GET /conversations/:id/participants)
```json
{
  "id": "participant-id",
  "participantId": "participant-id",
  "userId": "user-id",
  "type": "user",
  "username": "atabeth",
  "displayName": "Atabeth",
  "role": "USER",
  "conversationRole": "creator",
  "joinedAt": "2026-01-01T00:00:00Z",
  "isOnline": true,
  "isActive": true,
  "isAnonymous": false,
  "permissions": { ... }
}
```

### Type cible (packages/shared/types/participant.ts)
```typescript
export type Participant = {
  id: string;
  conversationId: string;
  type: 'user' | 'anonymous' | 'bot';
  userId?: string;
  displayName: string;
  avatar?: string;
  role: string;  // conversation role: 'creator' | 'admin' | 'moderator' | 'member'
  language: string;
  permissions: ParticipantPermissions;
  isActive: boolean;
  isOnline: boolean;
  joinedAt: Date;
  leftAt?: Date;
  bannedAt?: Date;
  nickname?: string;
  lastActiveAt?: Date;
  user?: any;
}
```

### Fichiers impactés (source)

| Fichier | Usages ThreadMember | Action |
|---------|-------------------|--------|
| `packages/shared/types/conversation.ts` | 1 (définition) | Garder deprecated |
| `apps/web/services/conversations/types.ts` | 1 | Ajouter `ConversationParticipantResponse` |
| `apps/web/services/conversations/participants.service.ts` | 0 | Retourner `ConversationParticipantResponse[]` |
| `apps/web/hooks/conversations/use-participants.ts` | 8 | Migrer vers `Participant` |
| `apps/web/components/conversations/ConversationView.tsx` | 2 | Migrer props |
| `apps/web/components/conversations/conversation-participants.tsx` | 7 | Migrer props |
| `apps/web/components/conversations/conversation-participants-drawer.tsx` | 5 | Migrer props |
| `apps/web/components/conversations/ConversationSettingsModal.tsx` | 2 | Migrer props |
| `apps/web/components/conversations/header/types.ts` | 2 | Migrer interface |
| `apps/web/components/conversations/header/ParticipantsDisplay.tsx` | 2 | Migrer props |
| `apps/web/components/conversations/header/use-participant-info.ts` | 2 | Migrer params |
| `apps/web/components/conversations/header/HeaderToolbar.tsx` | 2 | Migrer props |
| `apps/web/hooks/conversations/useConversationTyping.ts` | 3 | Migrer props |
| `apps/web/utils/user.ts` | 8 | Migrer fonctions |
| `apps/web/components/conversations/ConversationHeader.backup.tsx` | 2 | Supprimer si backup |
| `packages/shared/types/socketio-events.ts` | 0 | Ajouter event type |

---

## Task 1: Créer le type de réponse API participant

**Objectif:** Définir un type fidèle à ce que le backend retourne, incluant `conversationRole`.

**Files:**
- Modify: `apps/web/services/conversations/types.ts`

**Step 1: Ajouter le type ConversationParticipantResponse**

Dans `apps/web/services/conversations/types.ts`, ajouter après `AllParticipantsResponse` :

```typescript
/**
 * Réponse brute du backend GET /conversations/:id/participants
 * Inclut role (global) et conversationRole (conversation-level)
 */
export interface ConversationParticipantResponse {
  id: string;
  participantId: string;
  userId: string | null;
  type: 'user' | 'anonymous' | 'bot';
  username: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatar: string | null;
  email: string;
  role: string;
  conversationRole: string;
  joinedAt: string;
  isOnline: boolean;
  lastActiveAt: string;
  isActive: boolean;
  isAnonymous: boolean;
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage: string;
  autoTranslateEnabled: boolean;
  canSendMessages: boolean;
  canSendFiles: boolean;
  canSendImages: boolean;
  createdAt: string;
  updatedAt: string;
}
```

**Step 2: Mettre à jour AllParticipantsResponse**

Remplacer le type `AllParticipantsResponse` pour utiliser le nouveau type :

```typescript
export interface AllParticipantsResponse {
  authenticatedParticipants: ConversationParticipantResponse[];
  anonymousParticipants: ConversationParticipantResponse[];
}
```

**Step 3: Commit**
```
feat(web): add ConversationParticipantResponse type matching backend API
```

---

## Task 2: Mettre à jour participants.service.ts

**Objectif:** Le service doit retourner `ConversationParticipantResponse[]` au lieu de `User[]`, préservant `conversationRole`.

**Files:**
- Modify: `apps/web/services/conversations/participants.service.ts`

**Step 1: Remplacer les types de retour**

```typescript
import type {
  ParticipantsFilters,
  AllParticipantsResponse,
  ConversationParticipantResponse,
} from './types';

// Supprimer PaginatedParticipantsResponse locale
// Remplacer par:
interface PaginatedParticipantsResponse {
  success: boolean;
  data: ConversationParticipantResponse[];
  pagination?: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}
```

**Step 2: Mettre à jour getParticipants()**

Changer le type de retour de `Promise<User[]>` à `Promise<ConversationParticipantResponse[]>`. Le cache aussi.

**Step 3: Mettre à jour getAllParticipants()**

Simplifier la séparation auth/anon en utilisant `ConversationParticipantResponse` directement au lieu de recréer des objets partiels :

```typescript
async getAllParticipants(conversationId: string): Promise<AllParticipantsResponse> {
  // ... pagination identique ...

  const authenticatedParticipants: ConversationParticipantResponse[] = [];
  const anonymousParticipants: ConversationParticipantResponse[] = [];

  allParticipants.forEach((participant) => {
    if (participant.isAnonymous) {
      anonymousParticipants.push(participant);
    } else {
      authenticatedParticipants.push(participant);
    }
  });

  return { authenticatedParticipants, anonymousParticipants };
}
```

**Step 4: Mettre à jour searchParticipants()**

Changer le type de retour de `Promise<User[]>` à `Promise<ConversationParticipantResponse[]>`.

**Step 5: Commit**
```
refactor(web): participants.service returns ConversationParticipantResponse preserving conversationRole
```

---

## Task 3: Mettre à jour use-participants.ts

**Objectif:** Le hook mappe `ConversationParticipantResponse` vers `Participant` (le type unifié) au lieu de `ThreadMember`.

**Files:**
- Modify: `apps/web/hooks/conversations/use-participants.ts`

**Step 1: Remplacer ThreadMember par Participant**

```typescript
import type { Participant } from '@meeshy/shared/types';
import { MemberRole } from '@meeshy/shared/types';
import type { ConversationParticipantResponse } from '@/services/conversations/types';
```

**Step 2: Créer le mapper**

```typescript
function mapResponseToParticipant(
  response: ConversationParticipantResponse,
  conversationId: string
): Participant {
  return {
    id: response.participantId || response.id,
    conversationId,
    type: response.type || (response.isAnonymous ? 'anonymous' : 'user'),
    userId: response.userId || undefined,
    displayName: response.displayName || response.username,
    avatar: response.avatar || undefined,
    role: response.conversationRole || MemberRole.MEMBER,
    language: response.systemLanguage || 'fr',
    permissions: {
      canSendMessages: response.canSendMessages ?? true,
      canSendFiles: response.canSendFiles ?? true,
      canSendImages: response.canSendImages ?? true,
      canSendVideos: true,
      canSendAudios: true,
      canSendLocations: true,
      canSendLinks: true,
    },
    isActive: response.isActive,
    isOnline: response.isOnline,
    joinedAt: new Date(response.joinedAt),
    lastActiveAt: response.lastActiveAt ? new Date(response.lastActiveAt) : undefined,
    user: {
      id: response.userId || response.id,
      username: response.username,
      firstName: response.firstName,
      lastName: response.lastName,
      displayName: response.displayName,
      avatar: response.avatar,
      email: response.email,
      isOnline: response.isOnline,
      lastActiveAt: new Date(response.lastActiveAt),
      systemLanguage: response.systemLanguage,
      regionalLanguage: response.regionalLanguage,
      customDestinationLanguage: response.customDestinationLanguage,
      role: response.role,
      isActive: response.isActive,
      createdAt: new Date(response.createdAt),
      updatedAt: new Date(response.updatedAt),
      autoTranslateEnabled: response.autoTranslateEnabled,
      translateToSystemLanguage: true,
      translateToRegionalLanguage: false,
      useCustomDestination: false,
      keepOriginalMessages: true,
      translationQuality: 'medium',
    },
  };
}
```

**Step 3: Mettre à jour le state et le hook**

Remplacer tous les `ThreadMember` par `Participant` dans les types de state, ref, return.

**Step 4: Mettre à jour loadParticipants()**

Utiliser le mapper au lieu de la construction manuelle actuelle.

**Step 5: Commit**
```
refactor(web): use-participants maps API response to Participant type with conversationRole
```

---

## Task 4: Migrer les composants vers Participant

**Objectif:** Tous les composants qui utilisent `ThreadMember` passent à `Participant`. Migration replace_all sûre car les champs communs (`id`, `userId`, `user`, `role`, `joinedAt`, `isActive`, `isAnonymous`) existent dans les deux types.

**Files:** (tous dans `apps/web/components/conversations/`)
- Modify: `ConversationView.tsx`
- Modify: `conversation-participants.tsx`
- Modify: `conversation-participants-drawer.tsx`
- Modify: `ConversationSettingsModal.tsx`
- Modify: `header/types.ts`
- Modify: `header/ParticipantsDisplay.tsx`
- Modify: `header/use-participant-info.ts`
- Modify: `header/HeaderToolbar.tsx`

**Step 1: Pour chaque fichier, remplacer l'import**

```typescript
// Avant
import type { ThreadMember } from '@meeshy/shared/types';
// Après
import type { Participant } from '@meeshy/shared/types';
```

**Step 2: Remplacer les annotations de type**

Pour chaque fichier, `ThreadMember` → `Participant` dans les props, state, variables, paramètres.

**Points d'attention par fichier :**

- **`ConversationView.tsx`** : `participants: Participant[]` dans props. Le calcul de `effectiveRole` utilise déjà `(currentParticipant?.role as string)` — compatible car `Participant.role` est `string`.

- **`conversation-participants.tsx`** : `participants: Participant[]`. Les checks `(participant.role as string) === MemberRole.CREATOR` → simplifier en `participant.role === MemberRole.CREATOR` (plus besoin de cast, `Participant.role` est déjà `string`).

- **`conversation-participants-drawer.tsx`** : Idem, supprimer les `as string` casts inutiles.

- **`header/types.ts`** : `conversationParticipants: Participant[]` dans l'interface `ConversationHeaderConfig`.

**Step 3: Supprimer ConversationHeader.backup.tsx**

C'est un backup — s'il existe encore, le supprimer.

**Step 4: Commit**
```
refactor(web): migrate all conversation components from ThreadMember to Participant
```

---

## Task 5: Migrer les hooks et utilities

**Files:**
- Modify: `apps/web/hooks/conversations/useConversationTyping.ts`
- Modify: `apps/web/utils/user.ts`

**Step 1: useConversationTyping.ts**

`ThreadMember` → `Participant` dans l'interface props et le paramètre de `filterTypingUsers`.

**Step 2: utils/user.ts**

Les fonctions `getThreadMemberFirstName`, `formatThreadMemberForConversation`, `formatConversationTitle`, `formatConversationTitleFromMembers` acceptent `ThreadMember`. Migrer vers `Participant`.

- Renommer `getThreadMemberFirstName` → `getParticipantFirstName` (garder l'ancien en alias deprecated)
- `Participant` a `displayName` directement (pas besoin de `member.user.firstName`)
- Ajuster l'accès : `participant.displayName` ou `participant.user?.firstName`

**Step 3: Commit**
```
refactor(web): migrate hooks and utils from ThreadMember to Participant
```

---

## Task 6: Supprimer les `as any` casts restants

**Objectif:** Maintenant que `Participant.role` est `string` (pas `UserRole`), supprimer tous les casts forcés.

**Files:**
- Search: `as any` dans tous les fichiers modifiés aux Tasks 3-5

**Step 1: Identifier et supprimer**

Les casts `as any` étaient nécessaires parce que `ThreadMember.role: UserRole` ne pouvait pas contenir de `MemberRole` values. Avec `Participant.role: string`, ces casts sont inutiles.

Chercher spécifiquement :
- `(user as any).conversationRole` → `response.conversationRole` (déjà fixé au mapper Task 3)
- `MemberRole.MEMBER as any` → `MemberRole.MEMBER`
- `participant.role as string` → `participant.role`
- `userStore.setParticipants(users as any[])` → typer correctement

**Step 2: Commit**
```
fix(web): remove unsafe as-any casts now that Participant.role is string
```

---

## Task 7: Ajouter le type `ParticipantRoleUpdatedEvent` dans shared

**Objectif:** L'event `participant:role-updated` est émis par le gateway mais n'est pas typé dans `ServerToClientEvents`.

**Files:**
- Modify: `packages/shared/types/socketio-events.ts`

**Step 1: Ajouter l'interface du payload**

Après les interfaces existantes (avant `ServerToClientEvents`) :

```typescript
/**
 * Données envoyées quand le rôle d'un participant est mis à jour
 */
export interface ParticipantRoleUpdatedEventData {
  readonly conversationId: string;
  readonly userId: string;
  readonly newRole: string;
  readonly updatedBy: string;
  readonly participant: {
    readonly id: string;
    readonly role: string;
    readonly displayName: string;
    readonly userId: string | null;
  };
}
```

**Step 2: Ajouter dans ServerToClientEvents**

Dans l'interface `ServerToClientEvents`, ajouter après `ATTACHMENT_STATUS_UPDATED` :

```typescript
[SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED]: (data: ParticipantRoleUpdatedEventData) => void;
```

**Step 3: Build shared**
```bash
cd packages/shared && npm run build
```

**Step 4: Commit**
```
feat(shared): add typed ParticipantRoleUpdatedEventData to ServerToClientEvents
```

---

## Task 8: Écouter `participant:role-updated` côté frontend

**Objectif:** Quand un rôle de participant change, mettre à jour le state local sans recharger.

**Files:**
- Modify: `apps/web/hooks/conversations/use-participants.ts` (ajouter listener)

**Step 1: Ajouter l'écoute Socket.IO**

Dans `useParticipants`, ajouter un `useEffect` qui écoute l'event :

```typescript
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { SERVER_EVENTS } from '@meeshy/shared/types';

useEffect(() => {
  if (!conversationId) return;

  const handleRoleUpdated = (data: {
    conversationId: string;
    userId: string;
    newRole: string;
  }) => {
    if (data.conversationId !== conversationId) return;

    setParticipants(prev =>
      prev.map(p =>
        p.userId === data.userId
          ? { ...p, role: data.newRole }
          : p
      )
    );
  };

  const socket = meeshySocketIOService.getSocket();
  socket?.on(SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED, handleRoleUpdated);

  return () => {
    socket?.off(SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED, handleRoleUpdated);
  };
}, [conversationId]);
```

**Step 2: Commit**
```
feat(web): listen to participant:role-updated Socket.IO event for real-time role changes
```

---

## Task 9: Mettre à jour les tests

**Objectif:** Tous les tests qui créent des mocks `ThreadMember` doivent utiliser `Participant`.

**Files:**
- Modify: `apps/web/__tests__/utils/user.test.ts`
- Modify: `apps/web/__tests__/components/conversations/conversation-participants.test.tsx`
- Modify: `apps/web/__tests__/hooks/conversations/useConversationTyping.test.tsx`
- Modify: `apps/web/__tests__/components/conversations/ConversationHeader.test.tsx`
- Modify: `apps/web/__tests__/components/conversations/conversation-participants-drawer.test.tsx`
- Modify: `apps/web/__tests__/components/conversations/ConversationView.test.tsx`

**Step 1: Créer un factory helper**

Dans un fichier utilitaire de test (ou inline) :

```typescript
function createMockParticipant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'participant-1',
    conversationId: 'conv-1',
    type: 'user',
    userId: 'user-1',
    displayName: 'Test User',
    role: 'member',
    language: 'fr',
    permissions: {
      canSendMessages: true,
      canSendFiles: true,
      canSendImages: true,
      canSendVideos: true,
      canSendAudios: true,
      canSendLocations: true,
      canSendLinks: true,
    },
    isActive: true,
    isOnline: true,
    joinedAt: new Date('2026-01-01'),
    user: {
      id: 'user-1',
      username: 'testuser',
      displayName: 'Test User',
      firstName: 'Test',
      lastName: 'User',
      role: 'USER',
      isOnline: true,
    },
    ...overrides,
  };
}
```

**Step 2: Remplacer dans chaque test**

`ThreadMember` → `Participant`, `createMockThreadMember` → `createMockParticipant`.

**Step 3: Lancer les tests**
```bash
cd apps/web && npx jest --passWithNoTests --testPathPattern="(user\.test|conversation-participants|useConversationTyping|ConversationHeader|ConversationView)" 2>&1 | tail -20
```

**Step 4: Commit**
```
test(web): migrate all test mocks from ThreadMember to Participant
```

---

## Task 10: Nettoyage final et vérification

**Step 1: Vérifier qu'aucun import ThreadMember ne reste dans apps/web/**
```bash
grep -rn "ThreadMember" apps/web/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v "__tests__" | grep -v ".backup"
```

**Step 2: Vérification TypeScript**
```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
```

**Step 3: Lancer tous les tests**
```bash
cd apps/web && npx jest --passWithNoTests 2>&1 | tail -20
```

**Step 4: Commit final**
```
refactor(web): complete migration from ThreadMember to Participant - remove all legacy references
```

---

## Ordre d'exécution et dépendances

```
Task 1 (types)
  └→ Task 2 (service)
       └→ Task 3 (hook)
            └→ Task 4 (composants) + Task 5 (hooks/utils) [parallèle]
                 └→ Task 6 (cleanup as-any)
                      └→ Task 9 (tests)
                           └→ Task 10 (vérification)

Task 7 (shared event type) [indépendant, peut démarrer en parallèle]
  └→ Task 8 (frontend listener)
```

**Estimation:** 10 tasks, ~3-5 min chacune = ~30-50 min total.

## Ce qui NE CHANGE PAS

- `ThreadMember` dans `packages/shared/types/conversation.ts` reste (deprecated) pour rétrocompatibilité
- Le re-export dans `packages/shared/types/index.ts` reste (deprecated)
- Le backend ne change pas
- Les tests existants qui passaient continuent de passer
