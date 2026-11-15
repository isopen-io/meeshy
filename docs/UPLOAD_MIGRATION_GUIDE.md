# Guide de Migration des Uploads vers /u

## Vue d'ensemble

Ce guide décrit la migration sécurisée des fichiers uploadés vers le nouveau chemin `/u` en production, sans perte de données.

## Changements effectués

### Structure des chemins

**Avant:**
```
Volume: frontend_uploads → /app/public
Nginx:  frontend_uploads → /usr/share/nginx/html
URLs:   https://static.meeshy.me/i/2025/10/avatar.jpg
```

**Après:**
```
Volume: frontend_uploads → /app/public/u
Nginx:  frontend_uploads → /usr/share/nginx/html/u
URLs:   https://static.meeshy.me/u/i/2025/10/avatar.jpg
```

### Fichiers modifiés

1. **docker-compose.traefik.yml**
   - Volume frontend: `/app/public/u`
   - Volume static-files: `/usr/share/nginx/html/u`

2. **frontend/app/api/upload/avatar/route.ts**
   - Sauvegarde dans `public/u/i/YYYY/MM/`
   - URLs avec préfixe `/u`

3. **frontend/utils/avatar-upload.ts**
   - Chemins mis à jour avec `/u/i/`

## Prérequis

- Accès SSH au serveur de production
- Docker installé et en cours d'exécution
- Variables d'environnement configurées dans `secrets/production-secrets.env` ou `env.production`
- IP du serveur disponible

## Processus de migration

### Option 1: Migration complète automatisée (RECOMMANDÉ)

Ce script effectue toutes les étapes automatiquement:

```bash
# Depuis la racine du projet
./scripts/deploy-upload-migration.sh [SERVER_IP]
```

Le script effectue:
1. ✅ Sauvegarde de la configuration actuelle
2. ✅ Migration des fichiers existants vers /u (sans perte)
3. ✅ Déploiement de la nouvelle configuration
4. ✅ Redémarrage des services
5. ✅ Vérification du fonctionnement

### Option 2: Migration manuelle étape par étape

#### Étape 1: Test en local (optionnel mais recommandé)

```bash
# Tester la migration localement d'abord
./scripts/migrate-uploads-to-u.sh local

# Vérifier la structure créée
ls -la frontend/public/u/
```

#### Étape 2: Sauvegarde de la production

```bash
SERVER_IP="votre.ip.serveur"

# Connexion SSH
ssh root@$SERVER_IP

# Créer une sauvegarde du docker-compose actuel
cd /opt/meeshy
cp docker-compose.yml docker-compose.yml.backup-$(date +%Y%m%d)
```

#### Étape 3: Migration des fichiers en production

```bash
# Sur le serveur, arrêter temporairement les services concernés
cd /opt/meeshy
docker-compose down frontend static-files

# Migrer les fichiers dans le volume
docker run --rm \
  -v meeshy_frontend_uploads:/data \
  alpine:latest \
  sh -c '
    mkdir -p /data/u/i
    if [ -d /data/i ]; then
      cp -r /data/i/* /data/u/i/ 2>/dev/null || true
      echo "Fichiers migrés"
    fi
    chmod -R 755 /data/u
  '
```

#### Étape 4: Déployer la nouvelle configuration

```bash
# Depuis votre machine locale
scp docker-compose.traefik.yml root@$SERVER_IP:/opt/meeshy/docker-compose.yml
scp docker/nginx/static-files.conf root@$SERVER_IP:/opt/meeshy/docker/nginx/static-files.conf
```

#### Étape 5: Redémarrer les services

```bash
# Sur le serveur
cd /opt/meeshy
docker-compose pull frontend static-files
docker-compose up -d frontend static-files

# Vérifier les logs
docker-compose logs -f frontend static-files
```

## Vérifications post-migration

### 1. Vérifier la structure du volume

```bash
ssh root@$SERVER_IP
docker run --rm \
  -v meeshy_frontend_uploads:/data \
  alpine:latest \
  ls -laR /data/u
```

### 2. Tester les URLs

```bash
# Health check du serveur static
curl https://static.meeshy.me/health

# Frontend accessible
curl -I https://meeshy.me
```

### 3. Tester l'upload d'un nouvel avatar

1. Se connecter à l'application
2. Aller dans Paramètres → Photo de profil
3. Uploader une nouvelle image
4. Vérifier que l'URL contient `/u/i/`

### 4. Vérifier les images existantes

Si vous avez des avatars existants en base de données:

```bash
# Se connecter à MongoDB
ssh root@$SERVER_IP
docker-compose exec database mongosh meeshy

# Vérifier un échantillon d'avatars
db.User.find({ avatar: { $exists: true, $ne: null } }).limit(5)
```

## Rollback en cas de problème

### Option 1: Rollback automatique

Si vous avez utilisé le script de déploiement, un backup a été créé:

```bash
SERVER_IP="votre.ip.serveur"
BACKUP_DIR="backups/upload-migration-YYYYMMDD-HHMMSS"

# Restaurer l'ancienne configuration
scp $BACKUP_DIR/docker-compose.yml.backup root@$SERVER_IP:/opt/meeshy/docker-compose.yml

# Redémarrer
ssh root@$SERVER_IP 'cd /opt/meeshy && docker-compose up -d frontend static-files'
```

### Option 2: Rollback manuel

```bash
# Sur le serveur
cd /opt/meeshy

# Restaurer l'ancien docker-compose
cp docker-compose.yml.backup-YYYYMMDD docker-compose.yml

# Redémarrer les services
docker-compose up -d frontend static-files
```

## Migration des URLs en base de données

Si vous avez des URLs d'avatars en base de données qui pointent vers l'ancien chemin, créez un script de migration:

```javascript
// migrate-avatar-urls.js
const { MongoClient } = require('mongodb');

async function migrateUrls() {
  const client = await MongoClient.connect('mongodb://localhost:27017/meeshy');
  const db = client.db('meeshy');
  
  // Mettre à jour les URLs d'avatars
  const result = await db.collection('User').updateMany(
    { avatar: { $regex: /^https:\/\/static\.meeshy\.me\/i\// } },
    [{ 
      $set: { 
        avatar: { 
          $replaceAll: { 
            input: "$avatar", 
            find: "static.meeshy.me/i/", 
            replacement: "static.meeshy.me/u/i/" 
          } 
        } 
      } 
    }]
  );
  
  console.log(`${result.modifiedCount} avatars mis à jour`);
  await client.close();
}

migrateUrls();
```

## Surveillance post-déploiement

### Logs à surveiller

```bash
# Logs du frontend
docker-compose logs -f frontend

# Logs du serveur static
docker-compose logs -f static-files

# Logs Traefik
docker-compose logs -f traefik
```

### Métriques à surveiller

- Nombre d'erreurs 404 sur static.meeshy.me
- Temps de réponse de l'upload d'avatars
- Espace disque utilisé par le volume

## Commandes utiles

```bash
# Voir la taille du volume
docker system df -v | grep frontend_uploads

# Inspecter le volume
docker volume inspect meeshy_frontend_uploads

# Lister le contenu du volume
docker run --rm -v meeshy_frontend_uploads:/data alpine:latest du -sh /data/*

# Sauvegarder le volume
docker run --rm \
  -v meeshy_frontend_uploads:/data \
  -v $(pwd)/backups:/backup \
  alpine:latest \
  tar czf /backup/frontend_uploads_$(date +%Y%m%d).tar.gz /data
```

## FAQ

### Q: Les anciennes images fonctionneront-elles encore ?

R: Oui, la migration copie les fichiers de `/i` vers `/u/i`. Les deux chemins existent temporairement. Cependant, les nouvelles URLs générées utiliseront `/u/i`.

### Q: Que se passe-t-il si la migration échoue ?

R: Le script de migration automatique crée une sauvegarde avant toute modification. Vous pouvez facilement faire un rollback.

### Q: Combien de temps prend la migration ?

R: Dépend du nombre de fichiers. Typiquement:
- Volume vide ou peu de fichiers: < 1 minute
- Volume avec beaucoup de fichiers: 2-5 minutes
- Le service n'est pas interrompu pendant la migration

### Q: Dois-je mettre à jour les URLs en base de données ?

R: Pas immédiatement. Les anciens fichiers restent accessibles. Vous pouvez planifier la migration des URLs progressivement.

## Support

En cas de problème:
1. Vérifier les logs des conteneurs
2. Vérifier la structure du volume
3. Tester manuellement l'upload
4. Faire un rollback si nécessaire

## Checklist de déploiement

- [ ] Sauvegarder la configuration actuelle
- [ ] Tester la migration en local
- [ ] Migrer les fichiers en production
- [ ] Déployer la nouvelle configuration
- [ ] Vérifier les services
- [ ] Tester l'upload d'un avatar
- [ ] Surveiller les logs
- [ ] Documenter les URLs migrées

---

**Date de création:** 19 octobre 2025  
**Version:** 1.0  
**Auteur:** Meeshy Team

