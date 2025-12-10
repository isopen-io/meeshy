# Fix: Support complet des attachments sur la page d'accueil (/)

**Date**: 16 octobre 2025  
**Branche**: `feature/selective-improvements`

## 🎯 Objectif

Aligner la page d'accueil (`/`) avec la page `/chat/[id]` pour supporter complètement :
- ✅ Récupération des images et attachments
- ✅ Envoi de messages avec attachments
- ✅ Réponses (replyTo) avec attachments
- ✅ Galerie d'images avec navigation

## 📝 Modifications Frontend

### 1. Page d'accueil (`frontend/app/page.tsx`)

**Avant:**
```tsx
<BubbleStreamPage user={user} />
```

**Après:**
```tsx
<BubbleStreamPage 
  user={user}
  // conversationId accepte soit un ID MongoDB soit un identifier comme "meeshy" pour la conversation globale
  conversationId="meeshy"
  isAnonymousMode={false}
/>
```

**Explication:**
- `conversationId="meeshy"` : Identifier de la conversation globale (pas un ObjectId MongoDB)
- Le backend accepte les deux formats (ID MongoDB ou identifier)
- `isAnonymousMode={false}` : Les utilisateurs de la page d'accueil sont authentifiés

### 2. Type `BubbleStreamPageProps` (`frontend/types/bubble-stream.ts`)

**Clarification ajoutée:**
```typescript
export interface BubbleStreamPageProps {
  user: User;
  conversationId?: string; // ID MongoDB ou identifier (ex: "meeshy" pour la conversation globale). Par défaut "meeshy"
  isAnonymousMode?: boolean;
  linkId?: string;
  initialParticipants?: User[];
}
```

## 🔧 Modifications Backend

### 3. Endpoint `/conversations/:id/messages` (`gateway/src/routes/conversations.ts`)

**Ajout des attachments dans l'include Prisma:**

```typescript
const messages = await prisma.message.findMany({
  where: whereClause,
  include: {
    sender: { /* ... */ },
    anonymousSender: { /* ... */ },
    
    // ✅ NOUVEAU: Inclure les attachments du message
    attachments: {
      select: {
        id: true,
        fileName: true,
        originalName: true,
        mimeType: true,
        fileSize: true,
        fileUrl: true,
        thumbnailUrl: true,
        width: true,
        height: true,
        createdAt: true
      }
    },
    
    status: { /* ... */ },
    translations: { /* ... */ },
    
    replyTo: {
      include: {
        sender: { /* ... */ },
        anonymousSender: { /* ... */ },
        
        // ✅ NOUVEAU: Inclure les attachments du message de réponse
        attachments: {
          select: {
            id: true,
            fileName: true,
            originalName: true,
            mimeType: true,
            fileSize: true,
            fileUrl: true,
            thumbnailUrl: true,
            width: true,
            height: true,
            createdAt: true
          }
        },
        
        status: { /* ... */ },
        translations: { /* ... */ }
      }
    }
  },
  orderBy: { createdAt: 'desc' },
  take: parseInt(limit),
  skip: before ? 0 : parseInt(offset)
});
```

**Champs importants:**
- `fileUrl` : URL complète du fichier (pas `url`)
- `originalName` : Nom original du fichier (pas `originalFileName`)
- Les deux sont inclus pour le message principal ET pour `replyTo`

## 🔄 Flux de données

### Architecture

```
Frontend (page.tsx)
    ↓
BubbleStreamPage (conversationId="meeshy")
    ↓
useConversationMessages hook
    ↓
API: GET /conversations/meeshy/messages
    ↓
Backend: Prisma query avec attachments
    ↓
Response: Messages avec attachments, replyTo, translations
    ↓
MessagesDisplay → BubbleMessage → MessageAttachments
    ↓
Affichage des images + Galerie interactive
```

### Format de réponse du backend

```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "msg_123",
        "content": "Regardez cette image !",
        "originalLanguage": "fr",
        "sender": { /* ... */ },
        "attachments": [
          {
            "id": "att_456",
            "fileName": "image_2025_10_16.jpg",
            "originalName": "photo.jpg",
            "mimeType": "image/jpeg",
            "fileSize": 245678,
            "fileUrl": "https://cdn.meeshy.me/attachments/2025/10/user123/image_2025_10_16.jpg",
            "thumbnailUrl": "https://cdn.meeshy.me/thumbnails/2025/10/user123/image_2025_10_16_thumb.jpg",
            "width": 1920,
            "height": 1080,
            "createdAt": "2025-10-16T10:30:00.000Z"
          }
        ],
        "translations": [ /* ... */ ],
        "replyTo": {
          "id": "msg_789",
          "content": "Message original",
          "sender": { /* ... */ },
          "attachments": [ /* ... */ ],
          "translations": [ /* ... */ ]
        }
      }
    ],
    "hasMore": true,
    "userLanguage": "fr"
  }
}
```

## ✅ Fonctionnalités validées

### Frontend
- ✅ Upload d'images via `MessageComposer`
- ✅ Affichage des images dans les messages
- ✅ Prévisualisation des images
- ✅ Galerie d'images avec navigation
- ✅ Support des réponses avec images
- ✅ Scroll vers le message depuis la galerie

### Backend
- ✅ Récupération des attachments avec les messages
- ✅ Inclusion des attachments dans `replyTo`
- ✅ Cohérence avec l'endpoint `/links/:identifier/messages`
- ✅ Respect du schéma Prisma (`fileUrl`, `originalName`)

## 🔍 Différences avec `/chat/[id]`

| Aspect | Page d'accueil `/` | Page `/chat/[id]` |
|--------|-------------------|-------------------|
| `conversationId` | `"meeshy"` (identifier) | ID MongoDB réel |
| `isAnonymousMode` | `false` | Peut être `true` |
| Endpoint API | `/conversations/meeshy/messages` | `/links/:linkId/messages` |
| Authentification | Token auth obligatoire | Session token pour anonymes |

## 📊 Schéma Prisma - MessageAttachment

```prisma
model MessageAttachment {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  messageId       String   @db.ObjectId
  fileName        String   // Nom généré unique
  originalName    String   // Nom original
  mimeType        String
  fileSize        Int
  filePath        String
  fileUrl         String   // ⚠️ Utiliser fileUrl (pas url)
  
  width           Int?
  height          Int?
  thumbnailPath   String?
  thumbnailUrl    String?
  duration        Int?
  
  uploadedBy      String   @db.ObjectId
  isAnonymous     Boolean  @default(false)
  createdAt       DateTime @default(now())
  
  message         Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
  
  @@index([messageId])
  @@index([uploadedBy])
}
```

## 🎉 Résultat

La page d'accueil `/` dispose maintenant de **toutes les capacités** de la page `/chat/[id]` :
- Récupération, envoi et affichage des images
- Réponses avec attachments
- Galerie interactive
- Traductions
- Scroll infini

## 🔗 Références

- Copilot Instructions: `.github/copilot-instructions.md`
- Page chat: `frontend/app/chat/[id]/page.tsx`
- BubbleStreamPage: `frontend/components/common/bubble-stream-page.tsx`
- Backend conversations: `gateway/src/routes/conversations.ts`
- Types attachments: `shared/types/attachment.ts`
