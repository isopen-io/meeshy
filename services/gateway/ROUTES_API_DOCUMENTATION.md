# 📋 Liste complète des routes API Gateway Meeshy

## 🔄 Répétitions au démarrage

### ❌ Problème identifié

**OUI, les répétitions sont anormales.**

Les services suivants sont instanciés plusieurs fois, causant des logs en double :

**EmailService (3 instances):**
- routes/magic-link.ts (ligne 23)
- routes/password-reset.ts (ligne 68)
- services/AuthService.ts (ligne 84)

**RedisWrapper (5 instances):**
- routes/magic-link.ts (ligne 22)
- routes/password-reset.ts (ligne 67)
- routes/auth/index.ts (ligne 25)
- services/MentionService.ts (ligne 54)
- services/TranslationCache.ts (ligne 20)

### 💡 Solution recommandée

Implémenter un pattern **Singleton** pour ces services :

```typescript
// Exemple pour EmailService
export class EmailService {
  private static instance: EmailService | null = null;
  
  private constructor() {
    console.log('[EmailService] Initialized with providers:', ...);
  }
  
  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }
}

// Usage
const emailService = EmailService.getInstance();
```

---

## 📋 Routes API - Configuration d'authentification

### 🌐 ROUTES PUBLIQUES (Pas d'auth requise)

#### Health & Docs
```
GET    /health                                    🌐 Public
GET    /docs                                      🌐 Public  
GET    /api/v1/swagger/*                          🌐 Public
```

#### Authentification
```
POST   /api/v1/auth/register                     🌐 Public
POST   /api/v1/auth/login                        🌐 Public
POST   /api/v1/auth/login/2fa                    🌐 Public
POST   /api/v1/auth/magic-link                   🌐 Public
GET    /api/v1/auth/magic-link/verify            🌐 Public
POST   /api/v1/auth/verify-email                 🌐 Public
POST   /api/v1/auth/verify-phone                 🌐 Public
POST   /api/v1/auth/send-phone-code              🌐 Public
GET    /api/v1/auth/check-availability           🌐 Public
POST   /api/v1/auth/resend-verification          🌐 Public
```

#### Récupération de mot de passe
```
POST   /api/v1/auth/password-reset/request       🌐 Public
POST   /api/v1/auth/password-reset/verify        🌐 Public
POST   /api/v1/auth/password-reset/reset         🌐 Public
```

---

### 🔒 ROUTES AUTHENTIFIÉES (Auth requise)

#### Auth - Sessions
```
POST   /api/v1/auth/refresh                      🔒 Auth Required
POST   /api/v1/auth/logout                       🔒 Auth Required
GET    /api/v1/auth/me                           🔒 Auth Required
GET    /api/v1/auth/sessions                     🔒 Auth Required
POST   /api/v1/auth/validate-session             🔒 Auth Required
```

#### Me - Préférences utilisateur
```
GET    /api/v1/me/preferences                    🔒 Auth Required
DELETE /api/v1/me/preferences                    🔒 Auth Required

GET    /api/v1/me/preferences/privacy            🔒 Auth Required
PUT    /api/v1/me/preferences/privacy            🔒 Auth Required
PATCH  /api/v1/me/preferences/privacy            🔒 Auth Required
DELETE /api/v1/me/preferences/privacy            🔒 Auth Required

GET    /api/v1/me/preferences/audio              🔒 Auth Required
PUT    /api/v1/me/preferences/audio              🔒 Auth Required
PATCH  /api/v1/me/preferences/audio              🔒 Auth Required
DELETE /api/v1/me/preferences/audio              🔒 Auth Required

GET    /api/v1/me/preferences/message            🔒 Auth Required
PUT    /api/v1/me/preferences/message            🔒 Auth Required
PATCH  /api/v1/me/preferences/message            🔒 Auth Required
DELETE /api/v1/me/preferences/message            🔒 Auth Required

GET    /api/v1/me/preferences/notification       🔒 Auth Required ✅ ROUTE CORRECTE
PUT    /api/v1/me/preferences/notification       🔒 Auth Required
PATCH  /api/v1/me/preferences/notification       🔒 Auth Required
DELETE /api/v1/me/preferences/notification       🔒 Auth Required

GET    /api/v1/me/preferences/video              🔒 Auth Required
PUT    /api/v1/me/preferences/video              🔒 Auth Required
PATCH  /api/v1/me/preferences/video              🔒 Auth Required
DELETE /api/v1/me/preferences/video              🔒 Auth Required

GET    /api/v1/me/preferences/document           🔒 Auth Required
PUT    /api/v1/me/preferences/document           🔒 Auth Required
PATCH  /api/v1/me/preferences/document           🔒 Auth Required
DELETE /api/v1/me/preferences/document           🔒 Auth Required

GET    /api/v1/me/preferences/application        🔒 Auth Required
PUT    /api/v1/me/preferences/application        🔒 Auth Required
PATCH  /api/v1/me/preferences/application        🔒 Auth Required
DELETE /api/v1/me/preferences/application        🔒 Auth Required
```

#### Notifications
```
GET    /api/v1/notifications                     🔒 Auth Required
PATCH  /api/v1/notifications/:id/read            🔒 Auth Required
PATCH  /api/v1/notifications/read-all            🔒 Auth Required
DELETE /api/v1/notifications/:id                 🔒 Auth Required
DELETE /api/v1/notifications/read                🔒 Auth Required
GET    /api/v1/notifications/stats               🔒 Auth Required
POST   /api/v1/notifications/test                🔒 Auth Required (dev only)
```

#### Conversations
```
GET    /api/v1/conversations                     🔒 Auth Required
POST   /api/v1/conversations                     🔒 Auth Required
GET    /api/v1/conversations/:id                 🔒 Auth Required
PATCH  /api/v1/conversations/:id                 🔒 Auth Required
DELETE /api/v1/conversations/:id                 🔒 Auth Required

GET    /api/v1/conversations/:id/messages        🔒 Auth Required
POST   /api/v1/conversations/:id/messages        🔒 Auth Required
PATCH  /api/v1/conversations/:id/messages/:msgId 🔒 Auth Required
DELETE /api/v1/conversations/:id/messages/:msgId 🔒 Auth Required

POST   /api/v1/conversations/:id/members         🔒 Auth Required
DELETE /api/v1/conversations/:id/members/:userId 🔒 Auth Required

GET    /api/v1/conversations/:id/encryption      🔒 Auth Required
POST   /api/v1/conversations/:id/encryption      🔒 Auth Required
```

#### Communautés
```
GET    /api/v1/communities                       🔒 Auth Required
POST   /api/v1/communities                       🔒 Auth Required
GET    /api/v1/communities/:id                   🔒 Auth Required
PATCH  /api/v1/communities/:id                   🔒 Auth Required
DELETE /api/v1/communities/:id                   🔒 Auth Required

POST   /api/v1/communities/:id/join              🔒 Auth Required
POST   /api/v1/communities/:id/leave             🔒 Auth Required
GET    /api/v1/communities/:id/members           🔒 Auth Required
```

#### Amis
```
GET    /api/v1/friends                           🔒 Auth Required
POST   /api/v1/friends/request                   🔒 Auth Required
POST   /api/v1/friends/accept/:requestId         🔒 Auth Required
POST   /api/v1/friends/reject/:requestId         🔒 Auth Required
DELETE /api/v1/friends/:friendId                 🔒 Auth Required
```

#### Utilisateurs
```
GET    /api/v1/users/me                          🔒 Auth Required
PATCH  /api/v1/users/me                          🔒 Auth Required
GET    /api/v1/users/me/stats                    🔒 Auth Required
GET    /api/v1/users/search                      🔒 Auth Required
GET    /api/v1/users/:id                         🔒 Auth Required
```

#### Appels
```
POST   /api/v1/calls/initiate                    🔒 Auth Required
POST   /api/v1/calls/:callId/answer              🔒 Auth Required
POST   /api/v1/calls/:callId/end                 🔒 Auth Required
GET    /api/v1/calls/:callId                     🔒 Auth Required
```

#### Liens de partage
```
GET    /api/v1/links                             🔒 Auth Required
POST   /api/v1/links                             🔒 Auth Required
GET    /api/v1/links/:id                         🔒 Auth Required
DELETE /api/v1/links/:id                         🔒 Auth Required
```

---

### 👤 ROUTES ANONYMES (allowAnonymous: true)

Ces routes permettent l'accès sans authentification préalable :

```
GET    /api/v1/anonymous/conversations/:id/invite/:token  👤 Anonymous Allowed
POST   /api/v1/anonymous/conversations/:id/join/:token    👤 Anonymous Allowed
```

---

## 📊 Statistiques

- **Routes publiques:** ~25
- **Routes authentifiées:** ~300+
- **Routes anonymous allowed:** ~2

---

## ⚠️ Notes importantes

1. **Routes legacy supprimées:**
   - ❌ `/api/v1/notifications/preferences` (obsolète)
   - ✅ Utiliser `/api/v1/me/preferences/notification` à la place

2. **Modèle UserPreferences unifié:**
   Toutes les préférences utilisateur utilisent maintenant un seul modèle avec des champs JSON pour chaque catégorie.

3. **Auth middleware:**
   La plupart des routes utilisent `fastify.authenticate` ou `createUnifiedAuthMiddleware`.

