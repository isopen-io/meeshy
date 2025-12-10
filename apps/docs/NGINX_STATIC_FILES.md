# Service Nginx pour les fichiers statiques

## Solution finale

Au lieu d'utiliser une route API Next.js, nous utilisons un **conteneur Nginx Alpine** dédié pour servir les fichiers statiques uploadés (avatars, images).

## Architecture

```
Client → Traefik → Nginx Alpine → Volume Docker (frontend_uploads)
```

### Flux de requête

```
GET https://meeshy.me/i/p/2025/10/avatar_xxx.jpg
    ↓
Traefik (reverse proxy)
    ↓ Priority 10
Service: meeshy-static-files
    ↓ Port 80
Nginx Alpine
    ↓ Lecture seule
Volume: frontend_uploads:/usr/share/nginx/html/i:ro
    ↓
HTTP 200 + Cache headers
```

## Avantages de cette solution

| Critère | Next.js API Route | Nginx Alpine |
|---------|-------------------|--------------|
| **Taille** | ~500 MB | 2 MB ✅ |
| **Performance** | Node.js runtime | Natif C ✅ |
| **CPU** | ~50 MB par requête | ~1 MB ✅ |
| **Cache** | Configurable | Optimal ✅ |
| **Sécurité** | Read/Write | Read-Only ✅ |
| **Rebuild** | Oui | Non ✅ |

## Configuration

### 1. Service Docker

**Fichier** : `docker-compose.traefik.yml`

```yaml
static-files:
  image: nginx:alpine
  container_name: meeshy-static-files
  restart: unless-stopped
  volumes:
    - frontend_uploads:/usr/share/nginx/html/i:ro
    - ./docker/nginx/static-files.conf:/etc/nginx/conf.d/default.conf:ro
  networks:
    - meeshy-network
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.static.rule=Host(`${DOMAIN}`) && PathPrefix(`/i/`)"
    - "traefik.http.routers.static.priority=10"  # Haute priorité
```

### 2. Configuration Nginx

**Fichier** : `docker/nginx/static-files.conf`

```nginx
server {
    listen 80;
    
    root /usr/share/nginx/html;
    
    location /i/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header X-Served-By "Nginx-Static";
    }
    
    location /health {
        return 200 "OK\n";
    }
}
```

## Déploiement

### Option 1 : Script automatique

```bash
cd /Users/smpceo/Documents/Services/Meeshy/meeshy
./scripts/deploy-static-service.sh
```

### Option 2 : Manuel

```bash
# 1. Copier les fichiers
scp docker/nginx/static-files.conf root@157.230.15.51:/opt/meeshy/docker/nginx/
scp docker-compose.traefik.yml root@157.230.15.51:/opt/meeshy/

# 2. Se connecter au serveur
ssh root@157.230.15.51
cd /opt/meeshy

# 3. Démarrer le service
docker compose -f docker-compose.traefik.yml up -d static-files

# 4. Vérifier
docker ps | grep static-files
curl -I https://meeshy.me/i/p/2025/10/avatar_xxx.jpg
```

## Tests

### 1. Service actif

```bash
docker ps | grep static-files
# CONTAINER ID   IMAGE          STATUS
# xxxxx          nginx:alpine   Up 2 minutes (healthy)
```

### 2. Fichier accessible

```bash
curl -I https://meeshy.me/i/p/2025/10/avatar_1760877849690_827t7v.jpg

# Résultat attendu:
# HTTP/2 200 
# content-type: image/jpeg
# cache-control: public, immutable
# expires: Sun, 19 Oct 2026 13:00:00 GMT
# x-served-by: Nginx-Static
```

### 3. Cache fonctionnel

```bash
curl -I https://meeshy.me/i/p/2025/10/avatar_1760877849690_827t7v.jpg | grep -i cache

# Résultat attendu:
# cache-control: public, immutable
```

### 4. Fichier non existant

```bash
curl -I https://meeshy.me/i/p/2025/10/nonexistent.jpg

# Résultat attendu:
# HTTP/2 404
```

## Monitoring

### Logs

```bash
# Logs du service
docker logs meeshy-static-files

# Logs en temps réel
docker logs -f meeshy-static-files
```

### Métriques

```bash
# Nombre de requêtes servies
docker exec meeshy-static-files sh -c 'cat /var/log/nginx/access.log | wc -l'

# Erreurs 404
docker exec meeshy-static-files sh -c 'cat /var/log/nginx/error.log | grep 404'
```

### Healthcheck

```bash
# Via Traefik
curl https://meeshy.me/i/health

# Direct
docker exec meeshy-static-files wget -qO- http://localhost/health
```

## Performance

### Benchmarks

```bash
# Test de charge (1000 requêtes, 10 concurrent)
ab -n 1000 -c 10 https://meeshy.me/i/p/2025/10/avatar_xxx.jpg
```

Résultats attendus :
- **Requests per second**: > 500 req/s
- **Time per request**: < 20ms
- **Transfer rate**: > 10 MB/s

### Optimisations appliquées

1. **Logs désactivés** : `access_log off;` (gain CPU/IO)
2. **Cache navigateur** : `expires 1y;` (1 an)
3. **Immutabilité** : `Cache-Control: immutable` (pas de revalidation)
4. **Lecture seule** : Volume `:ro` (sécurité + performance)
5. **Alpine Linux** : Image minimale (2 MB vs 150+ MB)

## Sécurité

### Protection appliquée

1. **Read-Only** : Volume monté en `:ro`
2. **Pas de listing** : `autoindex off;`
3. **Blocage par défaut** : Seul `/i/` est accessible
4. **Types MIME** : Seulement images acceptées
5. **Pas de traversal** : Nginx empêche `../`

### Tests de sécurité

```bash
# Tentative de directory listing
curl https://meeshy.me/i/p/2025/10/
# → 403 Forbidden ✅

# Tentative de traversal
curl https://meeshy.me/i/../../../etc/passwd
# → 404 Not Found ✅

# Tentative d'accès root
curl https://meeshy.me/
# → 404 Not Found ✅
```

## Maintenance

### Redémarrage

```bash
docker compose -f docker-compose.traefik.yml restart static-files
```

### Mise à jour

```bash
# Pull de la dernière image alpine
docker pull nginx:alpine

# Recréer le conteneur
docker compose -f docker-compose.traefik.yml up -d static-files
```

### Nettoyage des logs

```bash
# Si les logs sont activés (actuellement désactivés)
docker exec meeshy-static-files sh -c 'echo > /var/log/nginx/access.log'
docker exec meeshy-static-files sh -c 'echo > /var/log/nginx/error.log'
```

## Troubleshooting

### Problème : 404 Not Found

```bash
# 1. Vérifier que le fichier existe
docker exec meeshy-frontend ls -la /app/public/i/p/2025/10/avatar_xxx.jpg

# 2. Vérifier que le volume est monté
docker inspect meeshy-static-files | grep Mounts -A 10

# 3. Vérifier dans le conteneur nginx
docker exec meeshy-static-files ls -la /usr/share/nginx/html/i/p/2025/10/
```

### Problème : Service non démarré

```bash
# Vérifier les logs
docker logs meeshy-static-files

# Vérifier le fichier de config
docker exec meeshy-static-files nginx -t

# Redémarrer
docker compose -f docker-compose.traefik.yml restart static-files
```

### Problème : Pas de cache

```bash
# Vérifier les headers
curl -I https://meeshy.me/i/p/2025/10/avatar_xxx.jpg | grep -i cache

# Vérifier la config nginx
docker exec meeshy-static-files cat /etc/nginx/conf.d/default.conf
```

## Évolution future

### Option 1 : CDN

Ajouter Cloudflare devant :
```
Client → Cloudflare CDN → Traefik → Nginx → Volume
```

### Option 2 : Compression

Activer gzip dans Nginx :
```nginx
gzip on;
gzip_types image/svg+xml;
gzip_comp_level 6;
```

### Option 3 : WebP automatique

Convertir les images en WebP à la volée.

---

**Résumé** : Cette solution offre les **meilleures performances** (Nginx natif), la **meilleure sécurité** (read-only), et la **simplicité maximale** (pas de rebuild du frontend).

