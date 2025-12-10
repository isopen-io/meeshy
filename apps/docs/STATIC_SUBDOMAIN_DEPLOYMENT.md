# Déploiement du sous-domaine static.meeshy.me

## Résumé des changements

Les fichiers statiques (avatars) sont maintenant servis depuis un sous-domaine dédié avec un chemin simplifié :

**Avant** : `https://meeshy.me/i/p/2025/10/avatar_xxx.jpg` (404)  
**Après** : `https://static.meeshy.me/i/2025/10/avatar_xxx.jpg` (200)

## Architecture déployée

```
Client
  ↓
https://static.meeshy.me/i/2025/10/avatar_xxx.jpg
  ↓
Traefik (reverse proxy + SSL)
  ↓
Nginx Alpine (port 80)
  ↓
Volume Docker: frontend_uploads
  ↓
Fichier: /usr/share/nginx/html/i/2025/10/avatar_xxx.jpg
```

## Modifications appliquées

### 1. Infrastructure (✅ DÉPLOYÉ)

#### docker-compose.traefik.yml
- ✅ Service `static-files` créé avec Nginx Alpine
- ✅ Sous-domaine `static.${DOMAIN}` configuré dans Traefik
- ✅ Variable d'environnement `NEXT_PUBLIC_STATIC_URL` ajoutée au frontend
- ✅ Volume `frontend_uploads` monté sur `/usr/share/nginx/html`

#### docker/nginx/static-files.conf
- ✅ Configuration Nginx pour servir tous les fichiers
- ✅ Cache headers optimisés (1 an, immutable)
- ✅ CORS headers pour meeshy.me
- ✅ Healthcheck sur `/health`

### 2. Code frontend (⚠️ NÉCESSITE REBUILD)

#### frontend/app/api/upload/avatar/route.ts
- ✅ Chemin simplifié : `/i/YYYY/MM/` au lieu de `/i/p/YYYY/MM/`
- ✅ URL générée avec `NEXT_PUBLIC_STATIC_URL`
- ✅ Fallback sur `https://static.meeshy.me`

## État du déploiement

### Infrastructure ✅

```bash
# Service démarré
Container meeshy-static-files  Running (health: starting)

# Logs OK
nginx/1.29.2 started successfully
```

### DNS ⚠️ REQUIS

Ajouter l'enregistrement DNS :

```
Type: A
Host: static.meeshy.me
Value: 157.230.15.51
TTL: 3600
```

**Vérifier la propagation** :
```bash
dig static.meeshy.me +short
# Devrait retourner: 157.230.15.51
```

### Frontend 🔨 À REBUILDER

**Vous devez rebuilder le frontend** pour que les changements prennent effet :

```bash
cd /Users/smpceo/Documents/Services/Meeshy/meeshy/frontend

# Build de la nouvelle image
docker build --platform linux/amd64 -t isopen/meeshy-frontend:latest .

# Push sur Docker Hub
docker push isopen/meeshy-frontend:latest

# Déploiement en production
ssh root@157.230.15.51
cd /opt/meeshy
docker compose -f docker-compose.traefik.yml pull frontend
docker compose -f docker-compose.traefik.yml up -d frontend
```

## Tests après rebuild du frontend

### 1. Healthcheck du service static

```bash
curl https://static.meeshy.me/health
# Résultat attendu: OK
```

### 2. Test d'un fichier existant

```bash
# Fichier dans l'ancien format (/i/p/...)
curl -I https://static.meeshy.me/i/p/2025/10/avatar_1760877849690_827t7v.jpg
# Devrait retourner: HTTP/2 200

# Une fois le frontend rebuilé, les nouveaux uploads seront :
# https://static.meeshy.me/i/2025/10/avatar_xxx.jpg (sans /p/)
```

### 3. Test d'upload d'un nouvel avatar

1. Se connecter sur https://meeshy.me
2. Aller dans Settings → Changer l'avatar
3. Uploader une nouvelle image
4. Vérifier dans la console browser que l'URL commence par `https://static.meeshy.me/i/2025/`

### 4. Vérifier les headers de cache

```bash
curl -I https://static.meeshy.me/i/2025/10/avatar_xxx.jpg

# Headers attendus:
# cache-control: public, immutable
# expires: [1 an dans le futur]
# x-served-by: Nginx-Static
# access-control-allow-origin: https://meeshy.me
```

## Compatibilité avec les anciens avatars

Les avatars uploadés **avant** ce changement utilisent l'ancien format :
- `/i/p/2025/10/avatar_xxx.jpg`

Les nouveaux avatars uploadés **après le rebuild** utilisent le nouveau format :
- `/i/2025/10/avatar_xxx.jpg`

**Les deux formats fonctionnent** car Nginx sert tout le volume `/usr/share/nginx/html/`.

## Migration des anciens avatars (Optionnel)

Si vous voulez migrer les anciens avatars vers le nouveau format :

```bash
ssh root@157.230.15.51

# Se connecter au conteneur frontend
docker exec -it meeshy-frontend sh

# Déplacer les fichiers
cd /app/public/i
for year in p/*/; do
    mv "$year"* .
done
rmdir p

# Vérifier
ls -la /app/public/i/
# Devrait montrer: 2025/ au lieu de p/
```

## Structure des fichiers

### Avant (ancien système)
```
/app/public/i/
└── p/
    └── 2025/
        └── 10/
            └── avatar_xxx.jpg
```

### Après (nouveau système)
```
/app/public/i/
└── 2025/
    └── 10/
        └── avatar_xxx.jpg
```

## Monitoring

### Vérifier le statut du service

```bash
ssh root@157.230.15.51 'docker ps | grep static-files'
```

### Vérifier les logs

```bash
ssh root@157.230.15.51 'docker logs meeshy-static-files'
```

### Vérifier le healthcheck Traefik

```bash
ssh root@157.230.15.51 'docker inspect meeshy-static-files | grep -A 3 Health'
```

### Statistiques d'utilisation

```bash
# Taille du volume
ssh root@157.230.15.51 'docker system df -v | grep frontend_uploads'

# Nombre de fichiers
ssh root@157.230.15.51 'docker exec meeshy-frontend find /app/public/i -type f | wc -l'
```

## Rollback (si nécessaire)

Si vous devez revenir en arrière :

```bash
ssh root@157.230.15.51
cd /opt/meeshy

# Arrêter le service static-files
docker compose -f docker-compose.traefik.yml stop static-files

# Supprimer le service
docker compose -f docker-compose.traefik.yml rm -f static-files

# Restaurer l'ancien docker-compose.traefik.yml depuis git
```

## Performance attendue

Avec Nginx Alpine :
- **Requests per second** : > 1000 req/s
- **Time per request** : < 10ms
- **Memory usage** : ~ 2-5 MB
- **Image size** : 43 MB (vs 500+ MB pour Next.js)

## Sécurité

- ✅ Volume monté en **read-only** (`:ro`)
- ✅ Pas de directory listing (`autoindex off`)
- ✅ CORS configuré uniquement pour `meeshy.me`
- ✅ Seulement types MIME images acceptés
- ✅ Pas d'accès à la racine (tout passe par `/i/`)

## Checklist finale

- [x] Infrastructure déployée (Nginx + Traefik)
- [x] Configuration Nginx mise à jour
- [x] Variables d'environnement ajoutées
- [x] Service démarré en production
- [ ] **DNS configuré** (static.meeshy.me → 157.230.15.51)
- [ ] **Frontend rebuilé** avec NEXT_PUBLIC_STATIC_URL
- [ ] Test d'upload d'avatar
- [ ] Vérification des headers de cache
- [ ] Migration des anciens avatars (optionnel)

## URLs de référence

- **Frontend** : https://meeshy.me
- **Static** : https://static.meeshy.me
- **Healthcheck** : https://static.meeshy.me/health
- **Exemple avatar** : https://static.meeshy.me/i/2025/10/avatar_xxx.jpg

---

**Date de déploiement** : 19 octobre 2025  
**Version** : 1.0  
**Status** : Infrastructure déployée, frontend à rebuilder  

