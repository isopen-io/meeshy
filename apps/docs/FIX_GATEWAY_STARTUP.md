# Fix: Erreur de Démarrage du Gateway

**Date**: 2025-10-16  
**Statut**: ✅ Résolu

## 🐛 Problème

Après l'ajout des headers CORS/CORP pour les attachments, le gateway ne démarrait plus avec l'erreur :

```
onRequest hook should be a function, instead got [object Undefined]
```

**Cause**: La route d'upload d'attachments utilisait `(fastify as any).authOptional` qui n'était pas défini.

## ✅ Solution

### 1. Import du Middleware

Ajout de l'import dans `gateway/src/routes/attachments.ts` :

```typescript
import { createUnifiedAuthMiddleware } from '../middleware/auth';
```

### 2. Création du Middleware Local

Création d'une instance du middleware au début de la fonction :

```typescript
export async function attachmentRoutes(fastify: FastifyInstance) {
  const attachmentService = new AttachmentService((fastify as any).prisma);
  
  // Middleware d'authentification optionnel (supporte JWT + Session anonyme)
  const authOptional = createUnifiedAuthMiddleware((fastify as any).prisma, {
    requireAuth: false,
    allowAnonymous: true
  });
  
  // ... reste du code
}
```

### 3. Utilisation du Middleware

Remplacement de `(fastify as any).authOptional` par `authOptional` :

```typescript
fastify.post(
  '/attachments/upload',
  {
    onRequest: [authOptional],  // ✅ Utilise le middleware local
  },
  async (request: FastifyRequest, reply: FastifyReply) => {
    // ...
  }
);
```

## 📝 Fichiers Modifiés

- `gateway/src/routes/attachments.ts` - Ajout du middleware authOptional

## 🧪 Vérification

### Services Démarrés

```bash
✅ Gateway:  http://localhost:3000
✅ Frontend: http://localhost:3100
```

### Test de Connexion

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'
```

**Résultat attendu**: Réponse JSON du serveur (même si identifiants incorrects)

## 📚 Contexte

Ce fix complète les corrections précédentes pour l'upload d'attachments :

1. ✅ Authentification unifiée JWT + Session anonyme
2. ✅ Headers CORS/CORP pour les images et thumbnails
3. ✅ Middleware authOptional correctement configuré

## 🔧 Commandes de Gestion

### Démarrer les services

```bash
# Gateway
cd gateway && npm run dev

# Frontend
cd frontend && npm run dev
```

### Arrêter les services

```bash
# Tuer tous les processus Node.js du gateway
pkill -f "tsx.*gateway"

# Tuer tous les processus Node.js du frontend
pkill -f "next.*frontend"
```

### Vérifier les ports

```bash
# Voir ce qui écoute sur les ports
lsof -i :3000  # Gateway
lsof -i :3100  # Frontend
```

## 📋 Logs

Les logs sont disponibles dans :
- `logs/gateway.log`
- `logs/frontend.log`

```bash
# Suivre les logs en temps réel
tail -f logs/gateway.log
tail -f logs/frontend.log
```

---

**Résultat Final**: Gateway et Frontend opérationnels, upload d'attachments fonctionnel avec authentification unifiée et CORS/CORP configurés.

