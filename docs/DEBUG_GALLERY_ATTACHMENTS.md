# Debug: Galerie d'images pour utilisateurs anonymes

## Problème actuel

L'ouverture de la galerie d'images dans `/chat` pour les utilisateurs anonymes échoue avec :
```
Error: Failed to fetch attachments
```

## Modifications effectuées pour déboguer

### 1. Ajout de logs dans le frontend

**Fichier:** `frontend/services/attachmentService.ts` (lignes 126-160)

```typescript
console.log('[AttachmentService] getConversationAttachments - Début', {
  conversationId,
  options,
  authHeaders: Object.keys(authHeaders),
  url: buildApiUrl(`/conversations/${conversationId}/attachments?${params}`)
});

const response = await fetch(/* ... */);

console.log('[AttachmentService] getConversationAttachments - Réponse:', {
  status: response.status,
  statusText: response.statusText,
  ok: response.ok
});

if (!response.ok) {
  const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
  console.error('[AttachmentService] ❌ Erreur récupération attachments:', {
    status: response.status,
    error: errorData
  });
  throw new Error(errorData.error || errorData.message || 'Failed to fetch attachments');
}
```

### 2. Ajout de logs dans le backend

**Fichier:** `gateway/src/routes/attachments.ts` (lignes 454-547)

```typescript
console.log('[AttachmentRoutes] GET /conversations/:conversationId/attachments - Début');

console.log('[AttachmentRoutes] AuthContext:', {
  hasAuthContext: !!authContext,
  isAuthenticated: authContext?.isAuthenticated,
  isAnonymous: authContext?.isAnonymous,
  userId: authContext?.userId,
  hasAnonymousParticipant: !!authContext?.anonymousParticipant
});

console.log('[AttachmentRoutes] Paramètres:', {
  conversationId,
  type: query.type,
  limit: query.limit,
  offset: query.offset
});

console.log('[AttachmentRoutes] ✅ Accès autorisé, récupération attachments...');

console.log('[AttachmentRoutes] ✅ Attachments récupérés:', {
  count: attachments.length,
  attachments: attachments.map(a => ({ id: a.id, fileName: a.fileName }))
});
```

## Comment déboguer

### 1. Ouvrir les logs backend

Ouvrir le terminal où le gateway tourne et observer les logs lors de l'ouverture de la galerie.

**Logs attendus si le middleware fonctionne :**
```
[AttachmentRoutes] GET /conversations/:conversationId/attachments - Début
[AttachmentRoutes] AuthContext: { hasAuthContext: true, isAnonymous: true, ... }
[AttachmentRoutes] Paramètres: { conversationId: '...', type: 'image', ... }
[AttachmentRoutes] ✅ Accès autorisé, récupération attachments...
[AttachmentRoutes] ✅ Attachments récupérés: { count: 2, attachments: [...] }
```

**Logs si le middleware échoue :**
```
[AttachmentRoutes] GET /conversations/:conversationId/attachments - Début
[AttachmentRoutes] AuthContext: { hasAuthContext: false, ... }
[AttachmentRoutes] ❌ Authentification requise
```

### 2. Ouvrir la console du navigateur

Dans la console du navigateur (`F12`), observer les logs lors de l'ouverture de la galerie.

**Logs attendus si l'appel réussit :**
```
[AttachmentService] getConversationAttachments - Début: { conversationId: '...', authHeaders: ['X-Session-Token'], url: '...' }
[AttachmentService] getConversationAttachments - Réponse: { status: 200, ok: true }
[AttachmentService] ✅ Attachments récupérés: { count: 2 }
```

**Logs si l'appel échoue :**
```
[AttachmentService] getConversationAttachments - Début: { conversationId: '...', authHeaders: [], url: '...' }
[AttachmentService] getConversationAttachments - Réponse: { status: 401, ok: false }
[AttachmentService] ❌ Erreur récupération attachments: { status: 401, error: { error: '...' } }
```

### 3. Vérifier le Network tab

Dans DevTools → Network :
1. Filtrer par "attachments"
2. Cliquer sur la requête GET
3. Vérifier :
   - **Request Headers** : Y a-t-il `X-Session-Token` ou `Authorization` ?
   - **Response** : Quel est le status code ? (200, 401, 403, 500)
   - **Response Body** : Quel est le message d'erreur exact ?

## Problèmes potentiels à vérifier

### Problème 1 : Middleware authOptional ne fonctionne pas

**Symptôme :** authContext est undefined ou vide

**Solution potentielle :** Vérifier que `createUnifiedAuthMiddleware` est correctement importé et configuré.

### Problème 2 : Token non envoyé

**Symptôme :** authHeaders est vide `{}`

**Solution :** Vérifier que :
- `localStorage.getItem('anonymous_session_token')` retourne bien un token
- `getAuthToken()` retourne bien le token
- `createAuthHeaders()` génère bien les bons headers

**Test manuel dans la console du navigateur :**
```javascript
// Dans la console
console.log('Session Token:', localStorage.getItem('anonymous_session_token'));
```

### Problème 3 : CORS

**Symptôme :** Erreur CORS dans la console

**Solution :** Vérifier la configuration CORS du backend (devrait déjà être OK)

### Problème 4 : Conversational mal formé

**Symptôme :** Backend retourne 404 ou erreur Prisma

**Solution :** Vérifier que le `conversationId` est bien un ObjectId MongoDB valide

## Vérifications à faire

### Dans le frontend (Console du navigateur)

```javascript
// 1. Vérifier le token
console.log('Token:', localStorage.getItem('anonymous_session_token'));

// 2. Vérifier getAuthToken()
import { getAuthToken } from '@/utils/token-utils';
console.log('Auth Token Info:', getAuthToken());

// 3. Vérifier conversationId
console.log('Conversation ID:', /* le conversationId utilisé */);
```

### Dans le backend (Logs gateway)

Observer les logs au moment de l'ouverture de la galerie. Si vous ne voyez AUCUN log `[AttachmentRoutes] GET /conversations/:conversationId/attachments`, alors :
- La requête n'arrive pas au backend
- Problème de routing ou de CORS
- L'URL est peut-être incorrecte

## Solutions selon les cas

### Cas 1 : authContext vide

**Modifier :** `gateway/src/routes/attachments.ts`

Utiliser le middleware global au lieu du middleware local :
```typescript
// Au lieu de créer un authOptional local
// Utiliser celui créé dans linksRoutes ou conversationRoutes
```

### Cas 2 : Permissions refusées

Vérifier les permissions du shareLink :
```sql
-- Dans MongoDB ou Prisma Studio
db.ConversationShareLink.findOne({ linkId: "mshy_68f1580736cc7df1f2376a59.2510162239_zf14qeux" })
-- Vérifier: allowViewHistory, allowAnonymousImages
```

### Cas 3 : Token invalide ou expiré

Rafraîchir la session anonyme :
1. Quitter `/chat`
2. Retourner au lien de partage
3. Se reconnecter
4. Tester à nouveau

## Prochaines étapes

1. **Redémarrer le backend** pour appliquer les modifications :
   ```bash
   docker-compose restart gateway
   # OU
   cd gateway && npm run dev
   ```

2. **Ouvrir la galerie dans `/chat`**

3. **Observer les logs** :
   - Console du navigateur (`F12`)
   - Terminal du gateway
   - Network tab (DevTools)

4. **Partager les logs** si le problème persiste :
   - Logs frontend complets
   - Logs backend complets
   - Status code de la requête

## Date

2025-10-16

