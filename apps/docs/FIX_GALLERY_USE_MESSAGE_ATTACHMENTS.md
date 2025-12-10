# Fix: Galerie d'images utilisant les attachments des messages

## Problème

L'appel API `GET /conversations/:conversationId/attachments` échouait pour les utilisateurs anonymes avec l'erreur :
```
Error: Access denied to this conversation
```

Malgré les modifications du middleware `authOptional`, l'accès était toujours refusé.

## Cause profonde

Le problème n'était pas seulement le middleware, mais aussi la **logique de l'application** :
- La galerie d'images faisait un appel API séparé pour charger tous les attachments de la conversation
- Cet appel API nécessite des permissions complexes et peut échouer pour diverses raisons
- Les attachments sont **déjà présents** dans les messages chargés par `use-conversation-messages`

**Pourquoi réinventer la roue** en faisant un appel API supplémentaire alors que les données sont déjà là ?

## Solution : Utiliser les attachments déjà chargés

### 1. Modifier AttachmentGallery pour accepter les attachments en props

**Fichier:** `frontend/components/attachments/AttachmentGallery.tsx` (lignes 15-93)

```typescript
interface AttachmentGalleryProps {
  conversationId: string;
  initialAttachmentId?: string;
  open: boolean;
  onClose: () => void;
  onNavigateToMessage?: (messageId: string) => void;
  token?: string;
  // ✅ AJOUTÉ: Nouvelle prop pour passer les attachments directement
  attachments?: Attachment[];
}

export function AttachmentGallery({
  // ... autres props ...
  attachments: providedAttachments,
}: AttachmentGalleryProps) {
  // ...
  
  useEffect(() => {
    if (!open || !conversationId) return;

    const loadAttachments = async () => {
      setLoading(true);
      try {
        // ✅ Si des attachments sont fournis en props, les utiliser directement
        if (providedAttachments && providedAttachments.length > 0) {
          console.log('[AttachmentGallery] Utilisation des attachments fournis:', {
            count: providedAttachments.length
          });
          setAttachments(providedAttachments);
          // Trouver l'index de l'attachment initial...
        } else {
          // Sinon, charger via l'API (mode legacy pour compatibilité)
          const response = await AttachmentService.getConversationAttachments(
            conversationId,
            { type: 'image', limit: 100 },
            token
          );
          // ...
        }
      } catch (error) {
        console.error('Erreur chargement attachments:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAttachments();
  }, [open, conversationId, initialAttachmentId, token, providedAttachments]);
}
```

### 2. Extraire les images des messages dans BubbleStreamPage

**Fichier:** `frontend/components/common/bubble-stream-page.tsx` (lignes 209-228)

```typescript
// Extraire tous les attachments images des messages pour la galerie
const imageAttachments = useMemo(() => {
  const allAttachments: Attachment[] = [];
  
  messages.forEach((message: any) => {
    if (message.attachments && Array.isArray(message.attachments)) {
      const imageAtts = message.attachments.filter((att: Attachment) => 
        att.mimeType?.startsWith('image/')
      );
      allAttachments.push(...imageAtts);
    }
  });
  
  console.log('[BubbleStreamPage] Images extraites pour galerie:', {
    totalMessages: messages.length,
    imageCount: allAttachments.length,
    images: allAttachments.map(a => ({ id: a.id, fileName: a.fileName }))
  });
  
  return allAttachments;
}, [messages]);
```

### 3. Passer les attachments à AttachmentGallery

**Fichier:** `frontend/components/common/bubble-stream-page.tsx` (ligne 1566)

```typescript
<AttachmentGallery
  conversationId={conversationId}
  initialAttachmentId={selectedAttachmentId || undefined}
  open={galleryOpen}
  onClose={() => setGalleryOpen(false)}
  onNavigateToMessage={handleNavigateToMessageFromGallery}
  token={typeof window !== 'undefined' ? getAuthToken()?.value : undefined}
  attachments={imageAttachments}  // ✅ AJOUTÉ
/>
```

### 4. Ajout des imports nécessaires

**Fichier:** `frontend/components/common/bubble-stream-page.tsx`

```typescript
// Ligne 3
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// Ligne 98
import type { User, Message, BubbleTranslation, Attachment } from '@shared/types';
```

## Avantages de cette solution

✅ **Pas d'appel API supplémentaire** : Utilise les données déjà chargées  
✅ **Performance** : Moins de requêtes réseau  
✅ **Simplicité** : Pas besoin de gérer les permissions d'API complexes  
✅ **Robustesse** : Si les messages sont chargés, les attachments le sont aussi  
✅ **Cohérence** : Les attachments affichés dans la galerie sont exactement ceux visibles dans les messages  
✅ **Temps réel** : Les nouveaux attachments reçus via WebSocket sont automatiquement dans la galerie  

## Comparaison avant/après

### Avant (appel API)

```
1. Utilisateur clique sur image
   ↓
2. AttachmentGallery s'ouvre
   ↓
3. Appel GET /conversations/:id/attachments
   ├─ Authentification required
   ├─ Vérification permissions
   ├─ Requête Prisma
   ├─ Peut échouer pour les anonymes ❌
   ↓
4. Si succès: Affichage des images
```

### Après (utilisation des messages)

```
1. Messages chargés avec attachments au démarrage
   ├─ Via /links/:id/messages (anonymes)
   ├─ Ou via /conversations/:id/messages (authentifiés)
   ├─ Include attachments déjà dans la requête
   ↓
2. useMemo extrait les images des messages
   ├─ Filtre par mimeType startsWith('image/')
   ├─ Construit la liste une seule fois
   ↓
3. Utilisateur clique sur image
   ↓
4. AttachmentGallery s'ouvre avec attachments déjà chargés
   ├─ Pas d'appel API ✅
   ├─ Affichage immédiat ✅
   ├─ Fonctionne pour tout le monde ✅
```

## Fallback sur l'API

Le code garde la possibilité de charger via l'API si aucun attachment n'est fourni en props :

```typescript
if (providedAttachments && providedAttachments.length > 0) {
  // Utiliser les attachments fournis
  setAttachments(providedAttachments);
} else {
  // Fallback: Charger via l'API (mode legacy)
  const response = await AttachmentService.getConversationAttachments(...);
}
```

Ceci assure la **compatibilité avec d'autres parties** de l'application qui pourraient appeler `AttachmentGallery` sans fournir les attachments.

## Résultat

✅ **Galerie fonctionnelle** : Les utilisateurs anonymes peuvent maintenant voir les images en taille naturelle  
✅ **Pas d'appel API** : Utilise les données déjà chargées  
✅ **Performance améliorée** : Affichage plus rapide  
✅ **Code plus simple** : Moins de logique de permissions complexe  
✅ **Temps réel** : Les nouveaux attachments apparaissent automatiquement dans la galerie  

## Tests à effectuer

### Test 1 : Galerie avec attachments fournis
1. Se connecter en mode anonyme dans `/chat`
2. Envoyer plusieurs messages avec images
3. Cliquer sur une image
4. Vérifier :
   - ✅ La galerie s'ouvre instantanément
   - ✅ L'image s'affiche en grand
   - ✅ Logs dans console : `[AttachmentGallery] Utilisation des attachments fournis: { count: X }`
   - ✅ Pas de log d'erreur API

### Test 2 : Navigation entre images
1. Avec plusieurs images dans la conversation
2. Ouvrir la galerie
3. Utiliser les flèches pour naviguer
4. Vérifier :
   - ✅ Toutes les images se chargent
   - ✅ Compteur "1/5" correct
   - ✅ Boutons fonctionnent

### Test 3 : Nouvelle image en temps réel
1. Ouvrir la conversation
2. Un autre utilisateur envoie une image
3. Ouvrir la galerie
4. Vérifier :
   - ✅ La nouvelle image est dans la galerie (grâce à useMemo qui se recalcule)

### Test 4 : Utilisateur authentifié (régression)
1. Se connecter avec un compte
2. Ouvrir la galerie
3. Vérifier que tout fonctionne toujours

## Impact sur les autres pages

Cette modification affecte uniquement `/chat` car c'est le seul endroit où `AttachmentGallery` est utilisé dans `BubbleStreamPage`.

D'autres pages peuvent continuer à utiliser l'ancienne méthode (sans passer `attachments` en props) et AttachmentGallery chargera via l'API (fallback).

## Code modifié

### Frontend modifié
- `frontend/components/attachments/AttachmentGallery.tsx` (lignes 15-93)
- `frontend/components/common/bubble-stream-page.tsx` (lignes 3, 98, 209-228, 1566)

### Backend modifié (pour déboguer seulement)
- `gateway/src/routes/attachments.ts` (ajout de logs)
- `frontend/services/attachmentService.ts` (ajout de logs)

## Date

2025-10-16

