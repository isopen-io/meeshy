# Solution : Erreurs 403 après reset de la base de données

## ✅ Status : RÉSOLU

**Date** : 2026-01-20
**Commit** : Corrections appliquées dans les fichiers suivants :
- `apps/web/services/api.service.ts` (redirection automatique)
- `services/gateway/src/routes/conversations/core.ts` (messages d'erreur améliorés)
- `services/gateway/src/routes/conversations/participants.ts` (messages d'erreur)
- Tous les messages d'erreur convertis en anglais ✅

## Problème Original
Après avoir réinitialisé la base de données, le frontend affichait des erreurs 403 (Forbidden) lors de l'accès aux conversations :
```
GET https://192.168.1.39:3000/api/v1/conversations/696e917... 403 (Forbidden)
Error: Unauthorized access to this conversation
```

## Cause Root
1. Le navigateur conservait des URLs de conversations qui n'existaient plus
2. Les enregistrements `ConversationMember` avaient été supprimés lors du reset
3. Le backend refusait l'accès car l'utilisateur n'était plus membre de la conversation

## Solutions

### Solution 1 : Nettoyer le cache navigateur (Recommandé)

1. **Ouvrir les DevTools** dans Chrome/Edge : `F12` ou `Cmd+Option+I`
2. **Application/Storage** → Cliquer sur "Clear site data"
3. **Ou** faire un hard refresh : `Cmd+Shift+R` (Mac) ou `Ctrl+Shift+R` (Windows)
4. **Naviguer vers la page d'accueil** : `https://192.168.1.39:3000/`
5. **Créer une nouvelle conversation** ou accéder à une conversation existante

### Solution 2 : Ajouter une gestion d'erreur dans le frontend

Ajouter un gestionnaire d'erreur qui redirige vers l'accueil en cas de 403 :

```typescript
// apps/web/services/api.service.ts (ligne ~260)

if (!response.ok) {
  // Si 403 sur une conversation, rediriger vers l'accueil
  if (response.status === 403 && endpoint.includes('/conversations/')) {
    console.warn('[API_SERVICE] 403 on conversation, redirecting to home');
    window.location.href = '/';
    return;
  }

  throw new ApiServiceError(
    data.message || data.error || `Erreur serveur (${response.status})`,
    response.status,
    data.code
  );
}
```

### Solution 3 : Améliorer le message d'erreur backend

Rendre le message plus explicite côté backend :

```typescript
// services/gateway/src/routes/conversations/core.ts (ligne ~471)

if (!canAccess) {
  return reply.status(403).send({
    success: false,
    error: 'Cette conversation n\'existe plus ou vous n\'y avez plus accès',
    code: 'CONVERSATION_ACCESS_DENIED',
    suggestion: 'Veuillez retourner à la page d\'accueil'
  });
}
```

### Solution 4 : Ajouter un script de réinitialisation post-DB

Créer un script qui réinitialise les conversations de test après un reset DB :

```bash
# scripts/reset-test-conversations.sh
#!/bin/bash

echo "🔄 Réinitialisation des conversations de test..."

# Supprimer le cache Next.js
rm -rf apps/web/.next/cache

# Créer une conversation de test
curl -X POST https://192.168.1.39:3000/api/v1/conversations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Conversation de test",
    "type": "group",
    "participantIds": []
  }'

echo "✅ Conversations de test créées"
```

## Prévention

Pour éviter ce problème à l'avenir :

1. **Toujours rediriger vers `/` après un reset DB**
2. **Nettoyer le localStorage** : `localStorage.clear()`
3. **Ajouter un système de versioning de la DB** pour détecter les resets
4. **Implémenter une gestion gracieuse des 403** avec redirection automatique

## Vérification

Après avoir appliqué une solution, vérifier que :
- ✅ Aucune erreur 403 dans la console
- ✅ Les nouvelles conversations sont accessibles
- ✅ Le socket WebSocket se connecte correctement
