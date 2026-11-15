# Fix: Galerie d'images vide pour les utilisateurs anonymes

## Problème

Dans `/chat`, lorsqu'on cliquait sur une image pour l'afficher en taille naturelle (galerie/lightbox), on voyait le message **"Aucune image"** au lieu de l'image.

**Comportement observé :**
- Utilisateur authentifié : ✅ Galerie fonctionne
- Utilisateur anonyme : ❌ "Aucune image" affiché

## Cause

L'endpoint backend `GET /conversations/:conversationId/attachments` utilisait le middleware `fastify.authenticate` qui **refuse** les utilisateurs anonymes.

**Code problématique dans `gateway/src/routes/attachments.ts` (ligne 440):**
```typescript
fastify.get(
  '/conversations/:conversationId/attachments',
  {
    onRequest: [fastify.authenticate],  // ❌ Refuse les anonymes
  },
  async (request, reply) => {
    // Vérification auth required
    if (!authContext || !authContext.isAuthenticated) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
    // ...
  }
);
```

## Flux du problème

```
1. Utilisateur anonyme clique sur une image
   ↓
2. Frontend ouvre AttachmentGallery
   ↓
3. AttachmentGallery appelle GET /conversations/:conversationId/attachments
   ├─ Header: X-Session-Token (sessionToken anonyme)
   ↓
4. Backend : fastify.authenticate refuse la requête
   ├─ Erreur 401: Authentication required
   ↓
5. Frontend : attachments = []
   ↓
6. UI : "Aucune image" affiché ❌
```

## Solution

### 1. Changer le middleware pour authOptional

**Fichier:** `gateway/src/routes/attachments.ts` (lignes 437-536)

```typescript
fastify.get(
  '/conversations/:conversationId/attachments',
  {
    onRequest: [authOptional],  // ✅ Accepte authentifiés ET anonymes
  },
  async (request, reply) => {
    const authContext = (request as any).authContext;
    if (!authContext || (!authContext.isAuthenticated && !authContext.isAnonymous)) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
    
    // ...
  }
);
```

### 2. Vérifier les permissions selon le type d'utilisateur

**Pour les utilisateurs authentifiés :**
```typescript
if (authContext.isAuthenticated) {
  // Vérifier qu'il est membre de la conversation
  const member = await prisma.conversationMember.findFirst({
    where: {
      conversationId,
      userId: authContext.userId,
      isActive: true,
    },
  });

  if (!member) {
    return reply.status(403).send({ error: 'Access denied' });
  }
}
```

**Pour les utilisateurs anonymes :**
```typescript
else if (authContext.isAnonymous && authContext.anonymousParticipant) {
  // Vérifier qu'il a accès via son shareLink
  const participant = await prisma.anonymousParticipant.findUnique({
    where: { id: authContext.anonymousParticipant.id },
    select: {
      conversationId: true,
      shareLink: {
        select: {
          allowViewHistory: true,
        },
      },
    },
  });

  if (!participant || participant.conversationId !== conversationId) {
    return reply.status(403).send({ error: 'Access denied' });
  }

  if (!participant.shareLink.allowViewHistory) {
    return reply.status(403).send({ error: 'History viewing not allowed' });
  }
}
```

### 3. Code frontend déjà correct

Le frontend gère déjà correctement les deux types de tokens via `getAuthToken()` et `createAuthHeaders()` :

**`frontend/utils/token-utils.ts`:**
```typescript
export function getAuthToken(): TokenInfo | null {
  // Priorité 1: auth_token
  const authToken = localStorage.getItem('auth_token');
  if (authToken) {
    return {
      value: authToken,
      type: 'auth',
      header: { name: 'Authorization', value: `Bearer ${authToken}` }
    };
  }

  // Priorité 2: anonymous_session_token
  const sessionToken = localStorage.getItem('anonymous_session_token');
  if (sessionToken) {
    return {
      value: sessionToken,
      type: 'anonymous',
      header: { name: 'X-Session-Token', value: sessionToken }
    };
  }

  return null;
}

export function createAuthHeaders(token?: string): HeadersInit {
  if (!token) {
    const tokenInfo = getAuthToken();
    if (!tokenInfo) return {};
    return { [tokenInfo.header.name]: tokenInfo.header.value };
  }

  const tokenType = getTokenType(token);
  
  if (tokenType === 'anonymous') {
    return { 'X-Session-Token': token };
  }

  return { 'Authorization': `Bearer ${token}` };
}
```

## Résultat

✅ **Galerie fonctionnelle** : Les utilisateurs anonymes peuvent maintenant voir les images en taille naturelle  
✅ **Permissions vérifiées** : Seuls les utilisateurs ayant accès à la conversation peuvent voir les attachments  
✅ **allowViewHistory respecté** : Le paramètre du shareLink est vérifié pour les anonymes  
✅ **Utilisateurs authentifiés** : Continuent de fonctionner normalement  

## Flux après le fix

```
1. Utilisateur anonyme clique sur une image
   ↓
2. Frontend ouvre AttachmentGallery
   ↓
3. AttachmentGallery appelle GET /conversations/:conversationId/attachments
   ├─ Header: X-Session-Token (sessionToken anonyme)
   ↓
4. Backend : authOptional accepte la requête
   ├─ Vérifie que l'utilisateur anonyme a accès via son shareLink
   ├─ Vérifie allowViewHistory
   ↓
5. Backend : Retourne les attachments de type "image"
   ├─ Filtre selon le type demandé (image)
   ├─ Limite selon limit/offset
   ↓
6. Frontend : attachments = [image1, image2, ...]
   ↓
7. UI : Image affichée en taille naturelle ✅
```

## Tests à effectuer

### Test 1 : Galerie utilisateur anonyme
1. Se connecter en mode anonyme dans `/chat`
2. Envoyer un message avec une image
3. Cliquer sur l'image pour ouvrir la galerie
4. Vérifier :
   - ✅ L'image s'affiche en grand
   - ✅ Navigation entre images fonctionne (si plusieurs)
   - ✅ Bouton "Télécharger" fonctionne
   - ✅ Bouton "Aller au message" fonctionne

### Test 2 : Galerie avec plusieurs images
1. Envoyer plusieurs messages avec images
2. Ouvrir la galerie depuis une image
3. Vérifier :
   - ✅ Navigation avec flèches fonctionne
   - ✅ Compteur "1/5" affiché correctement
   - ✅ Toutes les images se chargent

### Test 3 : Utilisateur authentifié (régression)
1. Se connecter avec un compte
2. Ouvrir la galerie
3. Vérifier que tout fonctionne toujours

### Test 4 : Permissions
1. Créer un lien avec `allowViewHistory: false`
2. Se connecter en mode anonyme via ce lien
3. Essayer d'ouvrir la galerie
4. Vérifier :
   - ❌ Erreur 403 : "History viewing not allowed"

## Composants concernés

### Frontend
- `frontend/components/attachments/AttachmentGallery.tsx` - Galerie d'images
- `frontend/services/attachmentService.ts` - Service d'appel API
- `frontend/utils/token-utils.ts` - Gestion des tokens

### Backend
- `gateway/src/routes/attachments.ts` - Endpoint GET /conversations/:conversationId/attachments
- `gateway/src/middleware/auth.ts` - Middleware authOptional

## Permissions du shareLink

Le endpoint vérifie `allowViewHistory` pour les utilisateurs anonymes. Ce paramètre contrôle si l'historique (et donc les attachments) peut être consulté.

**Valeurs possibles :**
- `allowViewHistory: true` (défaut) → ✅ Peut voir les attachments
- `allowViewHistory: false` → ❌ Ne peut pas voir l'historique ni les attachments

## Notes importantes

1. **Filtrage par type** : L'endpoint supporte le paramètre `type` pour filtrer (image, document, audio, video, text)
2. **Pagination** : Support des paramètres `limit` et `offset`
3. **Performance** : Les attachments sont chargés une seule fois à l'ouverture de la galerie
4. **Sécurité** : Les permissions sont vérifiées côté backend, pas seulement en frontend

## Fixes liés

Cette correction complète la gestion des attachments :

| Contexte | Fix | Document |
|----------|-----|----------|
| **Upload anonyme** | Permettre l'upload pour les anonymes | `FIX_ANONYMOUS_ATTACHMENTS_UPLOAD.md` |
| **Citations + attachments** | Citations avec attachments en temps réel | `FIX_REPLYTO_WITH_ATTACHMENTS.md` |
| **Galerie anonyme** | Afficher les images en galerie | `FIX_IMAGE_GALLERY_ANONYMOUS.md` (ce document) |

## Date

2025-10-16

