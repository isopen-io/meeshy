# Fix: Upload d'attachments pour les utilisateurs anonymes

## Problème

Les utilisateurs anonymes dans `/chat` ne pouvaient pas envoyer d'attachments (images, fichiers). L'API retournait l'erreur :
```
Error: Registered user required
```

## Cause

L'endpoint `/api/attachments/upload` utilisait le middleware `fastify.authenticate` qui **refuse** les utilisateurs anonymes. Seuls les utilisateurs enregistrés et authentifiés pouvaient uploader des fichiers.

**Code problématique dans `gateway/src/routes/attachments.ts` (ligne 20):**
```typescript
fastify.post(
  '/attachments/upload',
  {
    onRequest: [fastify.authenticate],  // ❌ Refuse les anonymes
  },
  async (request, reply) => {
    // ...
  }
);
```

## Solution

### 1. Utiliser authOptional au lieu de authenticate

**Fichier:** `gateway/src/routes/attachments.ts` (lignes 17-55)

```typescript
fastify.post(
  '/attachments/upload',
  {
    onRequest: [(fastify as any).authOptional],  // ✅ Accepte authentifiés ET anonymes
  },
  async (request, reply) => {
    // Récupérer le contexte d'authentification (authentifié OU anonyme)
    const authContext = (request as any).authContext;
    if (!authContext || (!authContext.isAuthenticated && !authContext.isAnonymous)) {
      return reply.status(401).send({
        success: false,
        error: 'Authentication required',
      });
    }

    const userId = authContext.userId;
    const isAnonymous = authContext.isAnonymous;
    
    // ... suite du code
  }
);
```

### 2. Vérifier les permissions du shareLink

**Fichier:** `gateway/src/routes/attachments.ts` (lignes 90-125)

Après avoir reçu les fichiers, vérifier les permissions selon le type de fichier :

```typescript
// Vérifier les permissions pour les utilisateurs anonymes
if (isAnonymous && authContext.anonymousParticipant) {
  const shareLink = await fastify.prisma.conversationShareLink.findUnique({
    where: { id: authContext.anonymousParticipant.shareLinkId },
    select: {
      allowAnonymousFiles: true,
      allowAnonymousImages: true,
    },
  });
  
  if (!shareLink) {
    return reply.status(403).send({
      success: false,
      error: 'Share link not found',
    });
  }
  
  // Vérifier chaque fichier
  for (const file of files) {
    const isImage = file.mimeType.startsWith('image/');
    
    if (isImage && !shareLink.allowAnonymousImages) {
      return reply.status(403).send({
        success: false,
        error: 'Images are not allowed for anonymous users on this conversation',
      });
    }
    
    if (!isImage && !shareLink.allowAnonymousFiles) {
      return reply.status(403).send({
        success: false,
        error: 'File uploads are not allowed for anonymous users on this conversation',
      });
    }
  }
}
```

## Permissions du ShareLink

Le modèle `ConversationShareLink` dans Prisma contient deux champs pour contrôler les uploads anonymes :

```prisma
model ConversationShareLink {
  // ... autres champs ...
  allowAnonymousFiles    Boolean  @default(false)  // Documents, PDF, etc.
  allowAnonymousImages   Boolean  @default(true)   // Images
  // ... autres champs ...
}
```

### Valeurs par défaut

Lors de la création d'un nouveau lien de partage :
- `allowAnonymousImages` = **true** (images autorisées par défaut)
- `allowAnonymousFiles` = **false** (fichiers non-images interdits par défaut)

### Récupération des permissions

L'endpoint `GET /api/links/:identifier` retourne déjà les permissions (lignes 926-929) :

```typescript
link: {
  id: shareLink.id,
  linkId: shareLink.linkId,
  name: shareLink.name,
  description: shareLink.description,
  allowViewHistory: shareLink.allowViewHistory,
  allowAnonymousMessages: shareLink.allowAnonymousMessages,
  allowAnonymousFiles: shareLink.allowAnonymousFiles,      // ✅
  allowAnonymousImages: shareLink.allowAnonymousImages,    // ✅
  // ... autres champs ...
}
```

## Frontend : Désactiver l'UI selon les permissions

Le frontend peut vérifier les permissions et désactiver les boutons d'upload si nécessaire.

**À implémenter dans `frontend/components/common/message-composer.tsx`:**

```typescript
// Récupérer les permissions du lien
const { allowAnonymousFiles, allowAnonymousImages } = conversationData.link;

// Désactiver le bouton d'upload si les permissions ne le permettent pas
const canUploadFiles = user.isAnonymous 
  ? allowAnonymousFiles 
  : true;  // Utilisateurs authentifiés peuvent toujours uploader

const canUploadImages = user.isAnonymous 
  ? allowAnonymousImages 
  : true;  // Utilisateurs authentifiés peuvent toujours uploader

// Dans le render
<Button
  disabled={!canUploadFiles && !canUploadImages}
  title={
    !canUploadFiles && !canUploadImages
      ? "Uploads not allowed on this conversation"
      : "Attach files or images"
  }
>
  <Paperclip />
</Button>
```

## Résultat

✅ **Upload autorisé** : Les utilisateurs anonymes peuvent maintenant uploader des fichiers si les permissions du lien le permettent  
✅ **Vérification par type** : Les images et fichiers sont vérifiés séparément selon `allowAnonymousImages` et `allowAnonymousFiles`  
✅ **Sécurité** : Le backend vérifie les permissions avant d'accepter l'upload  
✅ **UX améliorée** : Le frontend peut désactiver les boutons si les permissions ne sont pas accordées  

## Flux de l'upload

```
1. Utilisateur anonyme sélectionne un fichier
   ↓
2. Frontend appelle POST /api/attachments/upload avec X-Session-Token
   ↓
3. Backend vérifie authOptional (accepte anonymes)
   ↓
4. Backend récupère le shareLink via authContext.anonymousParticipant.shareLinkId
   ↓
5. Backend vérifie les permissions :
   - Si image : allowAnonymousImages doit être true
   - Si autre fichier : allowAnonymousFiles doit être true
   ↓
6. Si permissions OK : upload réussi, sinon erreur 403
   ↓
7. Frontend reçoit les attachments uploadés
   ↓
8. Message envoyé avec les attachments
```

## Tests à effectuer

### Test 1 : Upload image (autorisé par défaut)
1. Se connecter en mode anonyme dans `/chat`
2. Sélectionner une image
3. Vérifier que l'upload réussit
4. Envoyer le message avec l'image
5. Vérifier que l'image s'affiche

### Test 2 : Upload fichier PDF (interdit par défaut)
1. Se connecter en mode anonyme dans `/chat`
2. Sélectionner un fichier PDF
3. Vérifier que l'upload est refusé avec message d'erreur
4. Le bouton devrait être désactivé si le frontend implémente la vérification

### Test 3 : Modifier les permissions du lien
1. En tant qu'admin, modifier le lien via API
2. Activer `allowAnonymousFiles`
3. Tester l'upload de PDF → devrait réussir

### Test 4 : Utilisateur authentifié
1. Se connecter avec un compte
2. Tester l'upload d'images et fichiers
3. Vérifier que tout fonctionne (les permissions anonymes ne s'appliquent pas)

## Configuration recommandée

### Pour un lien public avec restrictions
```json
{
  "allowAnonymousMessages": true,
  "allowAnonymousImages": true,
  "allowAnonymousFiles": false
}
```
- ✅ Messages autorisés
- ✅ Images autorisées
- ❌ Fichiers interdits

### Pour un lien de support avec documents
```json
{
  "allowAnonymousMessages": true,
  "allowAnonymousImages": true,
  "allowAnonymousFiles": true
}
```
- ✅ Messages autorisés
- ✅ Images autorisées
- ✅ Fichiers autorisés (pour envoyer logs, captures, etc.)

### Pour un lien lecture seule
```json
{
  "allowAnonymousMessages": false,
  "allowAnonymousImages": false,
  "allowAnonymousFiles": false,
  "allowViewHistory": true
}
```
- ❌ Aucun upload autorisé
- ✅ Lecture de l'historique autorisée

## Notes importantes

1. **Sécurité** : Les permissions sont vérifiées côté backend, l'UI frontend est juste pour l'UX
2. **Performance** : La vérification des permissions n'ajoute qu'une requête Prisma légère
3. **Types MIME** : Les images sont détectées via `mimeType.startsWith('image/')`
4. **Utilisateurs authentifiés** : Les permissions anonymes ne s'appliquent PAS aux utilisateurs authentifiés

## Date

2025-10-16

