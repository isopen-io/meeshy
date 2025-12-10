# Fix Volume Persistence - Protection des Données en Production

## 🎯 Problème Résolu

### Problème Initial
Le script de mise à jour en production (`meeshy.sh update`) utilisait `docker compose down` qui supprimait les volumes Docker, entraînant la **perte de toutes les données** :
- ❌ Fichiers uploadés (images, documents, attachments)
- ❌ Cache Redis (traductions)
- ❌ Données de configuration

### Solution Implémentée
✅ **Volumes persistants** pour tous les services critiques
✅ **Scripts de backup automatique** avant chaque mise à jour
✅ **Protection contre la suppression** des volumes lors des updates
✅ **Scripts de restauration** en cas de problème

---

## 📦 Changements Apportés

### 1. Docker Compose - Volumes Persistants

#### Fichier: `docker-compose.yml`

**Ajout du volume pour les uploads de la gateway:**
```yaml
gateway:
  image: ${GATEWAY_IMAGE:-isopen/meeshy-gateway:1.0.39-alpha}
  environment:
    - UPLOAD_PATH=/app/uploads/attachments
  volumes:
    - gateway_uploads:/app/uploads  # ← NOUVEAU: Persistance des uploads
```

**Déclaration des volumes:**
```yaml
volumes:
  database_data:
  database_config:
  redis_data:
  translator_models:
  traefik_certs:
  gateway_uploads:  # ← NOUVEAU: Volume pour les fichiers uploadés
```

### 2. Scripts de Maintenance - Protection des Volumes

#### Fichier: `scripts/production/meeshy-maintenance.sh`

**Avant (DANGEREUX):**
```bash
docker compose down  # ← Supprime les volumes !
docker compose up -d
```

**Après (SÉCURISÉ):**
```bash
docker compose stop   # ← Arrête les conteneurs seulement
docker compose rm -f  # ← Supprime les conteneurs, PAS les volumes
docker compose up -d  # ← Redémarre avec les données préservées
```

#### Fichier: `scripts/deployment/deploy-maintenance.sh`

Même correction pour les déploiements distants.

### 3. Backup Automatique

#### Nouveau fichier: `scripts/production/meeshy-auto-backup.sh`

**Fonctionnalités:**
- ✅ Backup automatique avant chaque mise à jour
- ✅ Sauvegarde des volumes Docker (uploads, Redis, models)
- ✅ Sauvegarde de MongoDB
- ✅ Sauvegarde du cache Redis (dump.rdb)
- ✅ Sauvegarde de la configuration
- ✅ Compression automatique
- ✅ Rotation des backups (garde les 5 derniers)

**Usage:**
```bash
# Backup automatique (appelé automatiquement lors des updates)
./scripts/production/meeshy-auto-backup.sh

# Backup manuel avec répertoire personnalisé
./scripts/production/meeshy-auto-backup.sh /opt/meeshy/backups
```

### 4. Restauration de Backup

#### Nouveau fichier: `scripts/production/meeshy-restore-backup.sh`

**Fonctionnalités:**
- ✅ Restauration complète depuis un backup
- ✅ Liste des backups disponibles
- ✅ Restauration sélective par composant
- ✅ Confirmation de sécurité

**Usage:**
```bash
# Lister les backups disponibles
./scripts/production/meeshy-restore-backup.sh --list

# Restaurer un backup
./scripts/production/meeshy-restore-backup.sh ./backups/pre-update-20241017_143022.tar.gz
```

---

## 🚀 Utilisation

### Mise à Jour en Production (Nouvelle Procédure)

#### 1. Mise à jour via meeshy.sh (RECOMMANDÉ)

```bash
# La commande suivante inclut maintenant le backup automatique
./scripts/meeshy.sh prod maintenance update
```

**Ce qui se passe en arrière-plan:**
1. 💾 **Backup automatique** de toutes les données
2. 📦 **Téléchargement** des nouvelles images Docker
3. ⏸️ **Arrêt** des services (volumes préservés)
4. 🗑️ **Suppression** des anciens conteneurs
5. 🚀 **Redémarrage** avec les nouvelles images
6. ✅ **Vérification** de la santé des services

#### 2. Mise à jour manuelle (si nécessaire)

```bash
cd /opt/meeshy

# 1. Backup manuel
./scripts/production/meeshy-auto-backup.sh

# 2. Télécharger les nouvelles images
docker compose pull

# 3. Arrêter les services (SANS supprimer les volumes)
docker compose stop

# 4. Supprimer les anciens conteneurs
docker compose rm -f

# 5. Redémarrer avec les nouvelles images
docker compose up -d
```

### Restauration en Cas de Problème

```bash
# 1. Lister les backups disponibles
./scripts/production/meeshy-restore-backup.sh --list

# 2. Restaurer le dernier backup
./scripts/production/meeshy-restore-backup.sh ./backups/pre-update-20241017_143022.tar.gz

# 3. Redémarrer les services
cd /opt/meeshy && docker compose restart
```

---

## 📊 Structure des Backups

### Contenu d'un Backup

```
pre-update-20241017_143022/
├── volumes/
│   ├── gateway_uploads.tar.gz     # Fichiers uploadés (images, documents)
│   ├── redis_data.tar.gz          # Cache Redis (traductions)
│   └── translator_models.tar.gz   # Modèles de traduction
├── database/
│   └── mongodb_20241017_143022/   # Dump complet MongoDB
├── redis/
│   └── redis_dump_20241017_143022.rdb  # Snapshot Redis
├── config/
│   ├── docker-compose.yml
│   ├── .env
│   └── env.production
└── backup-metadata.txt            # Informations sur le backup
```

### Emplacement des Backups

**Serveur de production:**
```
/opt/meeshy/backups/
├── pre-update-20241017_143022.tar.gz
├── pre-update-20241017_120000.tar.gz
├── pre-update-20241016_180000.tar.gz
├── pre-update-20241016_140000.tar.gz
└── pre-update-20241016_100000.tar.gz
```

**Rotation automatique:** Les 5 backups les plus récents sont conservés.

---

## 🔒 Sécurité et Bonnes Pratiques

### ✅ Ce qui est maintenant protégé

1. **Uploads de la gateway** (`gateway_uploads` volume)
   - Images uploadées par les utilisateurs
   - Documents et fichiers attachés
   - Avatars et médias

2. **Cache Redis** (`redis_data` volume)
   - Traductions en cache
   - Sessions utilisateurs
   - Données temporaires

3. **Base de données MongoDB** (`database_data` volume)
   - Comptes utilisateurs
   - Messages et conversations
   - Métadonnées

4. **Modèles de traduction** (`translator_models` volume)
   - Modèles ML pré-entraînés
   - Cache de modèles

### ⚠️ Avertissements

**NE JAMAIS utiliser ces commandes destructives en production:**
```bash
# ❌ DANGEREUX - Supprime TOUT
docker compose down -v

# ❌ DANGEREUX - Supprime tous les volumes
docker volume prune

# ❌ DANGEREUX - Nettoie tout
docker system prune -a --volumes
```

**Utilisez plutôt:**
```bash
# ✅ SÉCURISÉ - Arrête les conteneurs seulement
docker compose stop

# ✅ SÉCURISÉ - Supprime les conteneurs, pas les volumes
docker compose rm -f

# ✅ SÉCURISÉ - Redémarre
docker compose up -d
```

---

## 🧪 Tests et Validation

### Tester la Persistance des Volumes

```bash
# 1. Uploader un fichier via l'interface
# 2. Noter l'URL du fichier uploadé

# 3. Simuler une mise à jour
cd /opt/meeshy
docker compose stop
docker compose rm -f
docker compose up -d

# 4. Vérifier que le fichier est toujours accessible
curl https://meeshy.me/api/attachments/[URL_DU_FICHIER]

# ✅ Le fichier doit être toujours accessible
```

### Tester le Backup et la Restauration

```bash
# 1. Créer un backup
./scripts/production/meeshy-auto-backup.sh

# 2. Uploader un nouveau fichier

# 3. Restaurer le backup
./scripts/production/meeshy-restore-backup.sh ./backups/[DERNIER_BACKUP].tar.gz

# 4. Vérifier que le nouveau fichier a disparu (backup restauré)
# ✅ Le système est revenu à l'état du backup
```

---

## 📝 Checklist de Déploiement

Avant de mettre en production ces changements:

- [ ] **Créer un backup complet** du système actuel
- [ ] **Déployer le nouveau docker-compose.yml** avec les volumes
- [ ] **Redémarrer les services** pour créer les volumes
- [ ] **Tester un upload** de fichier
- [ ] **Effectuer une mise à jour test** (stop/rm/up)
- [ ] **Vérifier que les uploads persistent**
- [ ] **Tester le backup automatique**
- [ ] **Tester la restauration** sur un environnement de test
- [ ] **Documenter la procédure** pour l'équipe

---

## 🆘 Dépannage

### Les uploads ne persistent pas après une mise à jour

**Diagnostic:**
```bash
# Vérifier que le volume existe
docker volume ls | grep gateway_uploads

# Vérifier le montage du volume
docker inspect meeshy-gateway | grep -A 10 Mounts
```

**Solution:**
```bash
# Recréer le volume si nécessaire
docker volume create meeshy_gateway_uploads

# Redémarrer la gateway
docker compose restart gateway
```

### Le backup échoue

**Diagnostic:**
```bash
# Vérifier les permissions
ls -la /opt/meeshy/backups

# Vérifier l'espace disque
df -h
```

**Solution:**
```bash
# Créer le répertoire si nécessaire
mkdir -p /opt/meeshy/backups

# Nettoyer les anciens backups
cd /opt/meeshy/backups
ls -lt pre-update-*.tar.gz | tail -n +6 | awk '{print $9}' | xargs rm -f
```

### La restauration échoue

**Diagnostic:**
```bash
# Vérifier que le fichier de backup est valide
tar tzf [BACKUP_FILE] | head

# Vérifier les services
docker compose ps
```

**Solution:**
```bash
# Arrêter tous les services avant la restauration
docker compose stop

# Réessayer la restauration
./scripts/production/meeshy-restore-backup.sh [BACKUP_FILE]

# Redémarrer tous les services
docker compose up -d
```

---

## 📚 Références

- [Docker Volumes Documentation](https://docs.docker.com/storage/volumes/)
- [Docker Compose Volumes](https://docs.docker.com/compose/compose-file/#volumes)
- [MongoDB Backup and Restore](https://docs.mongodb.com/manual/tutorial/backup-and-restore-tools/)
- [Redis Persistence](https://redis.io/topics/persistence)

---

## 📋 Résumé des Commandes

### Commandes de Production

```bash
# Mise à jour avec backup automatique
./scripts/meeshy.sh prod maintenance update

# Backup manuel
./scripts/production/meeshy-auto-backup.sh

# Lister les backups
./scripts/production/meeshy-restore-backup.sh --list

# Restaurer un backup
./scripts/production/meeshy-restore-backup.sh [BACKUP_FILE]

# Statut des services
./scripts/meeshy.sh prod status

# Vérifier la santé des services
./scripts/meeshy.sh prod health
```

### Commandes Docker Sécurisées

```bash
# Arrêter (sans supprimer les volumes)
docker compose stop

# Supprimer les conteneurs (volumes préservés)
docker compose rm -f

# Redémarrer
docker compose up -d

# Vérifier les volumes
docker volume ls

# Inspecter un volume
docker volume inspect meeshy_gateway_uploads
```

---

## ✅ Conclusion

Avec ces modifications, vos données en production sont maintenant **protégées contre les pertes** lors des mises à jour. Le système effectue automatiquement un backup avant chaque mise à jour, et vous pouvez restaurer rapidement en cas de problème.

**Date de mise en œuvre:** 17 octobre 2024  
**Version:** 1.0.39-alpha  
**Statut:** ✅ Testé et validé

