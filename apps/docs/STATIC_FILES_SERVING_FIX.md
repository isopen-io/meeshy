# Correction du service des fichiers statiques (avatars) en production

## Problème

Les avatars uploadés en production sont bien stockés dans le conteneur frontend (`/app/public/i/p/2025/10/`), mais **ne sont pas accessibles via l'URL publique** (404 Not Found).

```bash
# Les fichiers existent
docker exec meeshy-frontend ls -la /app/public/i/p/2025/10/
# → avatar_1760877849690_827t7v.jpg ✅

# Mais retournent 404
curl https://meeshy.me/i/p/2025/10/avatar_1760877849690_827t7v.jpg
# → HTTP/2 404 ❌
```

## Cause racine

**Next.js ne sert PAS automatiquement les fichiers uploadés après le build en production.**

### Explication technique

1. **Au moment du build Docker** :
   ```dockerfile
   # Dockerfile ligne 100
   COPY --from=builder /app/public ./public
   ```
   → Copie uniquement les fichiers `public` présents au moment du build

2. **Après le déploiement** :
   - Les utilisateurs uploadent des avatars via `/api/upload/avatar`
   - Ces fichiers sont sauvegardés dans `/app/public/i/p/YYYY/MM/`
   - **Mais Next.js ne les sert pas** car ils n'étaient pas présents lors du build

3. **Comportement de Next.js** :
   - En développement : Next.js sert dynamiquement tous les fichiers de `public/`
   - En production : Next.js optimise et ne sert que les fichiers connus au moment du build
   - Les fichiers uploadés après ne sont pas dans le manifeste de Next.js

## Solutions

### Solution 1 : Route API dynamique (IMPLÉMENTÉE) ✅

Créer une route API catch-all pour servir les fichiers uploadés dynamiquement.

**Fichier créé** : `frontend/app/i/[...path]/route.ts`

Cette route API :
- Intercepte toutes les requêtes vers `/i/*`
- Lit le fichier depuis `/app/public/i/[...path]`
- Retourne le fichier avec les headers appropriés (Content-Type, Cache-Control)
- Gère la sécurité (pas de `..` dans le chemin)

#### Avantages
- ✅ Solution simple et rapide
- ✅ Pas besoin de modification de l'infrastructure
- ✅ Fonctionne immédiatement après rebuild du frontend
- ✅ Gestion du cache (1 an)
- ✅ Sécurité intégrée

#### Inconvénients
- ⚠️ Utilise Node.js pour servir des fichiers statiques (moins performant qu'un serveur web dédié)
- ⚠️ Chaque requête d'image passe par le runtime Next.js

### Solution 2 : Nginx reverse proxy (Alternative)

Configurer Nginx ou Traefik pour servir directement les fichiers du volume Docker.

**Non implémentée** car Traefik est déjà utilisé et complexifierait la configuration.

### Solution 3 : Migrer vers le gateway (Recommandée long terme)

Gérer tous les uploads (avatars + attachments) via le gateway Fastify.

**Avantages futurs** :
- Centralisation de la gestion des fichiers
- API unifiée
- Meilleure performance (Fastify + fichiers statiques)
- Un seul volume à gérer

## Déploiement de la solution

### 1. Rebuild du frontend

```bash
cd frontend

# Build de la nouvelle image avec la route API
docker build --platform linux/amd64 -t isopen/meeshy-frontend:latest .

# Push sur Docker Hub
docker push isopen/meeshy-frontend:latest
```

### 2. Déploiement en production

```bash
ssh root@157.230.15.51
cd /opt/meeshy

# Pull de la nouvelle image
docker compose -f docker-compose.traefik.yml pull frontend

# Redémarrage du service
docker compose -f docker-compose.traefik.yml up -d frontend

# Attendre le démarrage
sleep 10
```

### 3. Vérification

```bash
# Test depuis le serveur
curl -I https://meeshy.me/i/p/2025/10/avatar_1760877849690_827t7v.jpg

# Devrait retourner :
# HTTP/2 200 
# Content-Type: image/jpeg
# Cache-Control: public, max-age=31536000, immutable
```

### 4. Test complet

1. Se connecter sur https://meeshy.me
2. Aller dans Settings → Changer l'avatar
3. Vérifier que l'image s'affiche immédiatement
4. Rafraîchir la page → l'image doit toujours s'afficher
5. Vérifier dans la console browser qu'il n'y a plus de 404

## Architecture de la route API

```
Requête: GET https://meeshy.me/i/p/2025/10/avatar_xxx.jpg
           ↓
Traefik (reverse proxy)
           ↓
Next.js Frontend (port 3100)
           ↓
Route API: /app/i/[...path]/route.ts
           ↓
Paramètres extraits: ['p', '2025', '10', 'avatar_xxx.jpg']
           ↓
Chemin reconstruit: /app/public/i/p/2025/10/avatar_xxx.jpg
           ↓
fs.readFile() → Buffer
           ↓
NextResponse avec Content-Type: image/jpeg
           ↓
HTTP 200 + Image
```

## Sécurité

La route API inclut plusieurs protections :

1. **Path traversal** : Rejette les chemins contenant `..`
2. **Vérification fichier** : Utilise `fs.stat()` pour vérifier que c'est bien un fichier
3. **Content-Type** : Mappe correctement les extensions aux types MIME
4. **Error handling** : Gestion des erreurs avec logs

## Performance

### Cache

Les fichiers sont servis avec :
```
Cache-Control: public, max-age=31536000, immutable
```

Cela signifie :
- Le browser cache le fichier pendant 1 an
- CDN (si présent) peut aussi cacher
- Les requêtes suivantes ne touchent même pas le serveur

### Optimisation future

Pour améliorer les performances à long terme :

1. **Utiliser un CDN** : Cloudflare, AWS CloudFront
2. **Serveur dédié pour les statiques** : Nginx avec volume Docker
3. **Migration vers gateway** : Gérer les avatars comme les attachments

## Tests

### Test local avant déploiement

```bash
cd frontend

# Build local
docker build -t meeshy-frontend-test .

# Lancer en local
docker run -p 3100:80 -v $(pwd)/public/i:/app/public/i meeshy-frontend-test

# Tester
curl -I http://localhost:3100/i/p/2025/10/test.jpg
```

### Test de charge

```bash
# Tester la performance de la route API
ab -n 1000 -c 10 https://meeshy.me/i/p/2025/10/avatar_xxx.jpg

# Comparer avec un fichier statique classique
ab -n 1000 -c 10 https://meeshy.me/_next/static/...
```

## Monitoring

### Logs

Les erreurs sont loggées dans les logs Next.js :

```bash
docker logs meeshy-frontend 2>&1 | grep "Error serving static file"
```

### Métriques à surveiller

1. **Temps de réponse** : Les images doivent se charger en < 200ms
2. **Taux d'erreur** : 0% de 500, < 1% de 404 (fichiers supprimés)
3. **Utilisation CPU** : Surveiller si Node.js est surchargé par les requêtes d'images

## Rollback

En cas de problème, revenir à la version précédente :

```bash
ssh root@157.230.15.51
cd /opt/meeshy

# Revenir à l'image précédente
docker compose -f docker-compose.traefik.yml down frontend
docker pull isopen/meeshy-frontend:previous-tag
docker compose -f docker-compose.traefik.yml up -d frontend
```

## Checklist de déploiement

- [ ] Code de la route API créé : `frontend/app/i/[...path]/route.ts`
- [ ] Build de l'image Docker frontend réussie
- [ ] Push sur Docker Hub réussie
- [ ] Pull en production réussie
- [ ] Redémarrage du service frontend
- [ ] Test : Les avatars s'affichent (200 OK)
- [ ] Test : Pas de 404 dans la console browser
- [ ] Test : Cache-Control présent dans les headers
- [ ] Test : Upload d'un nouvel avatar fonctionne
- [ ] Monitoring : Vérifier les logs pour les erreurs

## Evolution future

### Option 1 : Standalone Next.js

Activer le mode standalone de Next.js :

```typescript
// next.config.ts
const nextConfig = {
  output: 'standalone',
  // ...
}
```

Puis adapter le Dockerfile pour gérer correctement le dossier `public` en standalone.

### Option 2 : Gateway centralisé

Migrer la gestion des avatars vers le gateway :

1. Déplacer `/api/upload/avatar` vers `gateway/src/routes/users.ts`
2. Sauvegarder dans `/app/uploads/avatars/` (volume gateway)
3. Servir via `gateway/src/routes/static.ts` ou similaire
4. Supprimer la route API frontend

**Avantages** :
- Un seul service pour gérer les fichiers
- Meilleure performance (Fastify + fastify-static)
- API cohérente
- Simplification de l'architecture

---

**Date de création** : 19 octobre 2025  
**Auteur** : Meeshy Dev Team  
**Version** : 1.0  

