# 📚 @meeshy/shared

> Librairie partagée fortement typée pour l'architecture Meeshy

## 📦 Contenu de la librairie

```
@meeshy/shared/
├── types/              # Types TypeScript fortement typés
│   ├── affiliate.ts
│   ├── anonymous.ts
│   ├── api-responses.ts
│   ├── attachment.ts
│   ├── conversation.ts
│   ├── index.ts
│   ├── message-types.ts
│   ├── messaging.ts
│   ├── migration-utils.ts
│   ├── socketio-events.ts
│   ├── tracking-link.ts
│   └── user.ts
├── dist/               # Fichiers compilés (.js + .d.ts + .map)
├── client/             # Client Prisma généré
└── schema.prisma       # Schéma de base de données MongoDB
```

## 🎯 Utilisation dans les services

### Frontend (Next.js)

```typescript
// Dans frontend/package.json, utiliser workspace
{
  "dependencies": {
    "@meeshy/shared": "workspace:*"
  }
}

// Import des types
import type { 
  Conversation, 
  Message, 
  SocketIOUser,
  ApiResponse 
} from '@meeshy/shared';

// Import du client Prisma (si besoin)
import { PrismaClient } from '@meeshy/shared/client';
```

### Gateway (Fastify)

```typescript
// Dans gateway/package.json
{
  "dependencies": {
    "@meeshy/shared": "workspace:*"
  }
}

// Import des types et événements
import type { 
  ServerToClientEvents,
  ClientToServerEvents,
  MessageRequest,
  MessageResponse
} from '@meeshy/shared';

// Import du client Prisma
import { PrismaClient } from '@meeshy/shared/client';
```

### Translator (FastAPI/Python)

```python
# Le schéma Prisma est disponible pour référence
# Les types TypeScript peuvent être utilisés pour générer des types Python si nécessaire
```

## 🔨 Scripts de build

```bash
# Validation des types (sans build)
npm run validate

# Build des types TypeScript
npm run build

# Build du client Prisma
npm run build:prisma

# Build complet (types + Prisma)
npm run build:all

# Nettoyage
npm run clean       # Nettoie dist/ et fichiers .js/.d.ts dans types/
npm run clean:all   # Nettoie tout (dist, client, node_modules)

# Mode développement
npm run build:watch # Recompile automatiquement à chaque changement
```

## 📖 Exports disponibles

### Export principal
```typescript
import * from '@meeshy/shared';
```

### Exports spécifiques
```typescript
// Types individuels
import type { Conversation } from '@meeshy/shared/types/conversation';
import type { TrackingLink } from '@meeshy/shared/types/tracking-link';

// Schéma Prisma
import schema from '@meeshy/shared/schema';

// Client Prisma
import { PrismaClient } from '@meeshy/shared/client';
```

## ✨ Caractéristiques de la librairie

### Typage Strict 100%
- ✅ **Zéro `any`** : Tous les types sont explicites
- ✅ **`readonly`** sur toutes les propriétés immuables
- ✅ **Types union nommés** plutôt que strings
- ✅ **Branded types** pour les identifiants sensibles
- ✅ **Type guards** pour les vérifications runtime
- ✅ **Exhaustive checks** dans les switch

### Configuration TypeScript stricte
- ✅ `strict: true`
- ✅ `noUnusedLocals: true`
- ✅ `noUnusedParameters: true`
- ✅ `noImplicitReturns: true`
- ✅ `noFallthroughCasesInSwitch: true`
- ✅ `noUncheckedIndexedAccess: true`
- ✅ `noImplicitOverride: true`

### Alignement avec Prisma
- ✅ **100% synchronisé** avec `schema.prisma`
- ✅ Types correspondent aux modèles MongoDB
- ✅ Enums et unions alignés avec les contraintes DB
- ✅ Références croisées documentées

### Organisation du build
- ✅ **Séparation source/build** : `types/` → `dist/`
- ✅ **Pas de pollution** : Les `.js` et `.d.ts` ne sont jamais dans `types/`
- ✅ **Source maps** pour debugging
- ✅ **Declaration maps** pour "Go to Definition"

## 🔐 Types Principaux

### 1. Conversations & Messages
- `Conversation` - Conversation complète
- `Message` - Message de base
- `MessageWithTranslations` - Message avec traductions UI
- `UIMessage` - Message enrichi pour l'interface
- `ConversationType` - `'direct' | 'group' | 'public' | 'global' | 'broadcast'`
- `MessageType` - `'text' | 'image' | 'file' | 'audio' | 'video' | 'location' | 'system'`

### 2. Utilisateurs
- `SocketIOUser` - Utilisateur authentifié complet
- `AnonymousParticipant` - Participant anonyme via lien
- `UserRole` - Rôle global système
- `ConversationRole` - Rôle local dans une conversation
- `UserPermissions` - Permissions détaillées

### 3. API & WebSocket
- `ApiResponse<T>` - Réponse API standardisée
- `ServerToClientEvents` - Événements Socket.IO serveur→client
- `ClientToServerEvents` - Événements Socket.IO client→serveur
- `MessageRequest` - Requête d'envoi de message
- `MessageResponse` - Réponse d'envoi de message

### 4. Affiliation & Tracking
- `AffiliateToken` - Token d'affiliation
- `AffiliateRelation` - Relation d'affiliation
- `TrackingLink` - Lien de tracking
- `TrackingLinkClick` - Clic enregistré

### 5. Attachements
- `Attachment` - Fichier attaché
- `AttachmentType` - Types de fichiers
- Type guards : `isImageMimeType()`, `isAcceptedMimeType()`

## 🔄 Workflow de développement

### Modifier un type

1. **Éditer** le fichier dans `types/`
2. **Valider** : `npm run validate`
3. **Builder** : `npm run build`
4. Les autres services verront automatiquement les changements

### Modifier le schéma Prisma

1. **Éditer** `schema.prisma`
2. **Formatter** : `npm run prisma:format`
3. **Générer le client** : `npm run build:prisma`
4. **Mettre à jour les types TS** correspondants dans `types/`
5. **Valider l'alignement** : `npm run validate`

### Ajouter un nouveau type

1. **Créer** le fichier dans `types/nouveau-type.ts`
2. **Exporter** depuis `types/index.ts`
3. **Documenter** avec JSDoc + référence Prisma
4. **Valider** : `npm run validate`
5. **Builder** : `npm run build`

## 📊 Intégration dans le monorepo

Cette librairie fait partie du workspace pnpm Meeshy :

```json
// Dans le root pnpm-workspace.yaml
packages:
  - "frontend"
  - "gateway"
  - "translator"
  - "shared"
```

Les services peuvent l'utiliser via `workspace:*` :

```json
{
  "dependencies": {
    "@meeshy/shared": "workspace:*"
  }
}
```

## 🎓 Bonnes Pratiques

### ✅ À FAIRE
- Utiliser `readonly` pour toutes les propriétés
- Créer des types union nommés
- Ajouter des JSDoc descriptifs
- Référencer le schema Prisma (`@see`)
- Ajouter des type guards pour les conversions
- Utiliser `unknown` avec validation plutôt que `any`
- Faire `npm run validate` avant de commit

### ❌ À ÉVITER
- Ne jamais utiliser `any`
- Ne jamais compiler dans `types/` (toujours dans `dist/`)
- Ne pas commit les fichiers `dist/` (générés à la demande)
- Ne pas dupliquer les types entre fichiers
- Ne pas créer de types sans documentation

## 🚀 CI/CD

### Build en production

```bash
# Install dependencies
npm install

# Build complet
npm run build:all

# Résultat
# → dist/ avec tous les types compilés
# → client/ avec le client Prisma généré
```

### Validation en CI

```bash
# Vérifier les types
npm run validate

# Si succès → Types alignés avec Prisma ✅
# Si erreur → Désalignement détecté ❌
```

## 📝 Changelog

### Version 1.0.0

- ✅ Typage strict 100% (zéro `any`)
- ✅ Alignment complet avec `schema.prisma`
- ✅ Configuration librairie avec exports multiples
- ✅ Build séparé source/dist
- ✅ Types `readonly` partout
- ✅ Type guards et branded types
- ✅ Documentation JSDoc complète
- ✅ Support ES2020 + DOM

## 🔗 Références

- **Schema Prisma** : `./schema.prisma`
- **Types documentation** : `./types/README.md`
- **Architecture Meeshy** : Voir `/README.md` à la racine

---

**Maintenu par** : Équipe Meeshy  
**Licence** : UNLICENSED (Usage interne uniquement)

