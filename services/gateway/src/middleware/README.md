# Middleware d'Authentification Unifié - Phase 3.1.1

## 🎯 Objectif

Ce middleware centralise toute l'authentification pour les requêtes REST et WebSocket dans Meeshy. Il fournit une détection robuste entre :
- **JWT Token** = Utilisateurs enregistrés 
- **X-Session-Token** = Utilisateurs anonymes

## 📋 Types d'Authentification

### 1. Utilisateurs Enregistrés (JWT)
```typescript
// Header: Authorization: Bearer <jwt_token>
// Type: 'jwt'
// Contexte: RegisteredUser avec accès complet
```

### 2. Utilisateurs Anonymes (Session)
```typescript
// Header: X-Session-Token: <session_token>
// Type: 'session' 
// Contexte: AnonymousUser avec permissions limitées
```

### 3. Non Authentifié
```typescript
// Aucun header
// Type: 'anonymous'
// Contexte: Accès minimal
```

## 🔧 Utilisation

### Configuration de Base
```typescript
import { createUnifiedAuthMiddleware } from './middleware/auth';
import { PrismaClient } from '../shared/prisma/client';

const prisma = new PrismaClient();

// Middleware permissif (permet anonyme)
const authOptional = createUnifiedAuthMiddleware(prisma, {
  requireAuth: false,
  allowAnonymous: true
});

// Middleware strict (utilisateurs enregistrés uniquement)
const authRequired = createUnifiedAuthMiddleware(prisma, {
  requireAuth: true,
  allowAnonymous: false
});
```

### Dans les Routes Fastify
```typescript
// Route avec authentification optionnelle
fastify.get('/messages', {
  preHandler: authOptional
}, async (request: UnifiedAuthRequest, reply) => {
  const { authContext } = request;
  
  console.log(`User: ${authContext.displayName} (${authContext.type})`);
  
  if (authContext.type === 'jwt') {
    // Utilisateur enregistré - accès complet
    const user = authContext.registeredUser!;
    console.log(`Registered user: ${user.email}`);
  } else if (authContext.type === 'session') {
    // Utilisateur anonyme - accès limité
    const anon = authContext.anonymousUser!;
    console.log(`Anonymous user: ${anon.username}`);
  }
});

// Route avec authentification requise
fastify.post('/admin/users', {
  preHandler: authRequired
}, async (request: UnifiedAuthRequest, reply) => {
  // Seuls les utilisateurs enregistrés arrivent ici
  const { registeredUser } = request.authContext;
  console.log(`Admin action by: ${registeredUser!.email}`);
});
```

## 📊 Contexte d'Authentification Unifié

```typescript
interface UnifiedAuthContext {
  // Type d'authentification
  type: 'jwt' | 'session' | 'anonymous';
  isAuthenticated: boolean;
  isAnonymous: boolean;
  
  // Données utilisateur
  registeredUser?: RegisteredUser;    // Si JWT
  anonymousUser?: AnonymousUser;      // Si Session
  
  // Métadonnées unifiées
  userLanguage: string;  // Langue principale
  displayName: string;   // Nom d'affichage
  userId: string;        // ID unifié
  
  // Permissions
  canSendMessages: boolean;
  hasFullAccess: boolean;
}
```

## 🚀 Helpers Utilitaires

```typescript
import { 
  isRegisteredUser, 
  isAnonymousUser, 
  getUserId, 
  getUserPermissions 
} from './middleware/auth';

// Vérifier le type d'utilisateur
if (isRegisteredUser(authContext)) {
  // Utilisateur enregistré
  const user = authContext.registeredUser!;
} else if (isAnonymousUser(authContext)) {
  // Utilisateur anonyme
  const anon = authContext.anonymousUser!;
}

// Obtenir l'ID unifié
const userId = getUserId(authContext);

// Obtenir les permissions
const permissions = getUserPermissions(authContext);
if (permissions.canSendMessages) {
  // Autorisé à envoyer des messages
}
```

## 🧪 Tests

```bash
# Lancer le serveur gateway
cd gateway && ./gateway.sh

# Tester le middleware unifié
./scripts/test-unified-auth.sh
```

## 🔄 Remplacement de l'Ancien Système

### Avant (ancien authenticate)
```typescript
// ❌ Ancien système fragmenté
import { authenticate } from './middleware/auth';
fastify.register(authenticate);
```

### Après (middleware unifié)
```typescript
// ✅ Nouveau système unifié
import { createUnifiedAuthMiddleware } from './middleware/auth';
const authMiddleware = createUnifiedAuthMiddleware(prisma);
fastify.addHook('preHandler', authMiddleware);
```

## 📝 Notes Importantes

1. **Compatibilité**: Les anciennes fonctions `authenticate()`, `requireRole()` etc. sont conservées mais dépréciées
2. **Performance**: Le middleware unifie les appels Prisma et optimise les requêtes
3. **Type Safety**: TypeScript complet avec types générés Prisma
4. **Évolutivité**: Architecture extensible pour futures fonctionnalités d'auth

## 🐛 Debugging

```typescript
// Logs automatiques dans la console
[UnifiedAuth] JWT - Jean Dupont (user_123)
[UnifiedAuth] SESSION - Visiteur123 (session_456)
[UnifiedAuth] ANONYMOUS - Visiteur (anonymous)
```

## 🔗 Intégration WebSocket

Le même contexte d'authentification est utilisé pour WebSocket via `MeeshySocketIOManager` :
- Extraction automatique des tokens JWT/Session
- Contexte unifié disponible dans tous les handlers Socket.IO
