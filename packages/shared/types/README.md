# 📦 Meeshy Shared Types

Types partagés **fortement typés** pour toute l'architecture Meeshy.

## 🎯 Architecture

```
shared/
├── types/              # Sources TypeScript (fortement typées)
│   ├── affiliate.ts    # Types d'affiliation
│   ├── anonymous.ts    # Types participants anonymes
│   ├── api-responses.ts # Réponses API standardisées
│   ├── attachment.ts   # Types d'attachements
│   ├── conversation.ts # Types conversations & messages
│   ├── index.ts        # Point d'entrée principal
│   ├── message-types.ts # Types messages Gateway/UI
│   ├── messaging.ts    # Types requêtes/réponses messaging
│   ├── migration-utils.ts # Utilitaires de migration
│   ├── socketio-events.ts # Événements Socket.IO
│   ├── tracking-link.ts # Liens de tracking
│   └── user.ts         # Types utilisateur
├── dist/              # Fichiers compilés (.js + .d.ts)
└── schema.prisma      # Schéma de base de données

```

## ✨ Caractéristiques

### Typage Strict
- ✅ **Zéro `any`** : Tous les types sont explicites
- ✅ **`readonly`** sur toutes les propriétés immuables
- ✅ **Types union nommés** au lieu de strings
- ✅ **Branded types** pour les identifiants sensibles
- ✅ **Type guards** pour les vérifications runtime

### Alignement Prisma
- ✅ **100% aligné** avec `schema.prisma`
- ✅ Types synchronisés avec les modèles de base de données
- ✅ Enums et unions correspondent aux contraintes DB

### Organisation
- ✅ **Séparation source/build** : code dans `types/`, build dans `dist/`
- ✅ **Exports organisés** via `index.ts`
- ✅ **Documentation JSDoc** complète

## 🚀 Utilisation

### Build

```bash
# Dans /shared
npm run build         # Compiler les types
npm run build:watch   # Compiler en mode watch
npm run clean         # Nettoyer les fichiers compilés
npm run typecheck     # Vérifier les types sans build
npm run validate      # Valider tous les types
```

### Import dans les services

```typescript
// Import depuis le point d'entrée principal
import type { 
  Conversation,
  Message,
  SocketIOUser,
  ApiResponse,
  MessageRequest
} from '@meeshy/shared-types';

// Ou import spécifique
import type { AnonymousParticipant } from '@meeshy/shared-types/anonymous';
import type { TrackingLink } from '@meeshy/shared-types/tracking-link';
```

## 📚 Types Principaux

### Conversations
- `Conversation` : Conversation complète
- `ConversationType` : `'direct' | 'group' | 'public' | 'global' | 'broadcast'`
- `ConversationStatus` : `'active' | 'archived' | 'deleted'`
- `ConversationRole` : `'admin' | 'moderator' | 'member'`

### Messages
- `Message` : Message de base (Gateway)
- `MessageWithTranslations` : Message avec traductions UI
- `UIMessage` : Message enrichi pour l'interface
- `MessageType` : `'text' | 'image' | 'file' | 'audio' | 'video' | 'location' | 'system'`

### Utilisateurs
- `SocketIOUser` : Utilisateur authentifié
- `AnonymousParticipant` : Participant anonyme
- `UserRole` : `'USER' | 'ADMIN' | 'MODO' | 'BIGBOSS' | 'AUDIT' | 'ANALYST'`
- `UserPermissions` : Permissions détaillées

### API
- `ApiResponse<T>` : Réponse API standardisée
- `MessageRequest` : Requête d'envoi de message
- `MessageResponse` : Réponse d'envoi de message

### Affiliation
- `AffiliateToken` : Token d'affiliation
- `AffiliateRelation` : Relation entre utilisateurs
- `FriendRequest` : Demande d'ami

### Attachements
- `Attachment` : Fichier attaché
- `AttachmentType` : `'image' | 'document' | 'audio' | 'video' | 'text'`
- Type guards : `isImageMimeType()`, `isAcceptedMimeType()`, etc.

### Tracking
- `TrackingLink` : Lien de tracking
- `TrackingLinkClick` : Clic enregistré
- `TrackingLinkStats` : Statistiques de clics

## 🔐 Type Safety

### Branded Types
```typescript
type AnonymousParticipantId = string & { readonly __brand: 'AnonymousParticipantId' };
type AnonymousSessionToken = string & { readonly __brand: 'AnonymousSessionToken' };
```

### Type Guards
```typescript
if (isAuthenticatedUser(sender)) {
  // sender est typé comme SocketIOUser
  console.log(sender.email);
}

if (isImageMimeType(mimeType)) {
  // mimeType est typé comme ImageMimeType
  console.log('C\'est une image');
}
```

### Readonly
```typescript
// Toutes les propriétés sont readonly par défaut
interface Message {
  readonly id: string;
  readonly content: string;
  readonly translations: readonly MessageTranslation[];
}
```

## 📖 Documentation

Tous les types sont documentés avec JSDoc et incluent :
- Description de l'usage
- Références au schema Prisma (quand applicable)
- Exemples de valeurs possibles
- Liens vers les types associés

## 🔄 Migration

Utilitaires de migration disponibles dans `migration-utils.ts` :
- `normalizeMessage()` : Normalise un message brut
- `normalizeConversation()` : Normalise une conversation brute
- `isValidObjectId()` : Vérifie un ObjectId MongoDB
- Type guards pour la conversion sûre de données

## ⚡ Performance

- Imports tree-shakeable
- Types compilés en `.d.ts` pour IDE rapide
- Source maps pour debugging
- Validation à la compilation (zero runtime cost)

## 🔧 Maintenance

### Vérifier l'alignement avec Prisma

```bash
# Après modification du schema.prisma
npm run validate
```

### Ajouter un nouveau type

1. Créer/modifier le fichier dans `types/`
2. Exporter depuis `types/index.ts`
3. Ajouter la documentation JSDoc
4. Lancer `npm run validate`
5. Faire `npm run build`

### Bonnes Pratiques

- ✅ Toujours utiliser `readonly` pour les propriétés
- ✅ Créer des types union nommés plutôt qu'inline
- ✅ Ajouter des type guards pour les vérifications runtime
- ✅ Documenter avec JSDoc
- ✅ Référencer le schema Prisma quand applicable
- ✅ Éviter `any`, utiliser `unknown` avec type guards

