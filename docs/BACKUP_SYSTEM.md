# 💾 Système de Backup Automatique Meeshy

## Vue d'ensemble

Le système de backup de Meeshy protège automatiquement vos données **AVANT** chaque déploiement ou mise à jour, en conservant les **3 derniers backups** pour permettre une restauration rapide en cas de problème.

## 🛡️ Protection Automatique

### Backup Pré-Déploiement

**Chaque fois que vous déployez**, un backup automatique est créé AVANT toute modification :

```bash
# Déploiement avec backup automatique (par défaut)
./meeshy.sh deploy deploy 192.168.1.100

# Le système fait automatiquement :
# 1. Validation de la configuration
# 2. 💾 BACKUP AUTOMATIQUE (sauvegarde complète)
# 3. Test de connexion
# 4. Déploiement...
```

### Backup Pré-Reset

Pour les opérations destructives (reset complet), un **backup critique complet** est créé :

```bash
# Reset avec backup complet automatique
./meeshy.sh deploy deploy-reset 192.168.1.100

# Le système fait :
# 1. Validation
# 2. 🛡️ BACKUP CRITIQUE COMPLET (DB + volumes + config + secrets)
# 3. Reset du système
# 4. Redéploiement...
```

### Sauter le Backup (Non recommandé)

```bash
# Déployer SANS backup (⚠️ RISQUE DE PERTE DE DONNÉES)
./meeshy.sh deploy deploy 192.168.1.100 --skip-backup
```

> ⚠️ **ATTENTION**: Utiliser `--skip-backup` expose à des pertes de données irréversibles!

## 📦 Types de Backups

### 1. Backup de Base de Données

Sauvegarde rapide de MongoDB uniquement :

```bash
# Local (production)
./meeshy.sh prod backup

# Distant (serveur)
./meeshy.sh deploy backup 192.168.1.100
```

**Contenu** :
- Base de données MongoDB (mongodump)
- Métadonnées (date, version, état des services)

### 2. Backup Complet

Sauvegarde complète de tous les composants :

```bash
# Via le module de backup
cd scripts/deployment
./deploy-backup.sh backup-all 192.168.1.100
```

**Contenu** :
- ✅ Base de données MongoDB
- ✅ Volumes Docker (uploads, Redis data, models ML)
- ✅ Configuration (docker-compose.yml, .env, nginx)
- ✅ Secrets (JWT, API keys, certificats)
- ✅ État complet du système

## 🔄 Restauration de Backups

### Lister les Backups Disponibles

```bash
# Local
./meeshy.sh prod list-backups

# Ou directement
cd scripts/production
./meeshy-restore-backup.sh --list
```

### Restaurer un Backup Local

```bash
# Méthode 1 : Interactive
./meeshy.sh prod restore

# Méthode 2 : Spécifier le fichier
./meeshy.sh prod restore /chemin/vers/backup/pre-update-20241019_143022.tar.gz

# Méthode 3 : Script direct
cd scripts/production
./meeshy-restore-backup.sh ./backups/pre-update-20241019_143022.tar.gz
```

### Restaurer un Backup Distant

```bash
# Restauration interactive sur le serveur
./meeshy.sh deploy restore 192.168.1.100

# Ou via le module
cd scripts/deployment
./deploy-backup.sh restore-interactive 192.168.1.100
```

## 📁 Emplacement des Backups

### Local (Production)

```
/Users/smpceo/Documents/Services/Meeshy/meeshy/backups/
├── pre-update-20241019_143022.tar.gz  (3e plus récent)
├── pre-update-20241019_150145.tar.gz  (2e plus récent)
└── pre-update-20241019_163012.tar.gz  (le plus récent)
```

### Distant (Serveur)

```
/opt/meeshy/backups/
├── pre-update-20241019_143022.tar.gz
├── pre-update-20241019_150145.tar.gz
└── pre-update-20241019_163012.tar.gz
```

## ⚙️ Gestion des Backups

### Rotation Automatique

Le système **conserve automatiquement les 3 derniers backups** et supprime les plus anciens :

```bash
# Avant : 6 backups
backups/
├── pre-update-20241015_100000.tar.gz  ❌ Sera supprimé
├── pre-update-20241016_100000.tar.gz  ❌ Sera supprimé
├── pre-update-20241017_100000.tar.gz  ❌ Sera supprimé
├── pre-update-20241019_143022.tar.gz  ✅ Conservé (3e)
├── pre-update-20241019_150145.tar.gz  ✅ Conservé (2e)
└── pre-update-20241019_163012.tar.gz  ✅ Conservé (1er)

# Après nettoyage automatique : 3 backups
backups/
├── pre-update-20241019_143022.tar.gz  ✅ 
├── pre-update-20241019_150145.tar.gz  ✅ 
└── pre-update-20241019_163012.tar.gz  ✅ 
```

### Modification du Nombre de Backups

Pour conserver un nombre différent de backups, modifiez :

```bash
# Éditer scripts/production/meeshy-auto-backup.sh
# Ligne 206-207

if [ "$backup_count" -gt 3 ]; then  # Changer 3 par le nombre souhaité
    ls -1t pre-update-*.tar.gz | tail -n +4 | xargs rm -f  # Ajuster +4 = +nombre+1
```

## 🔍 Contenu d'un Backup

### Structure

```
pre-update-20241019_143022/
├── volumes/
│   ├── gateway_uploads.tar.gz      (uploads utilisateurs)
│   ├── redis_data.tar.gz            (cache Redis)
│   └── translator_models.tar.gz     (modèles ML)
├── database/
│   └── mongodb_20241019_143022/     (dump MongoDB)
├── redis/
│   └── redis_dump_20241019_143022.rdb
├── config/
│   ├── docker-compose.yml
│   ├── .env
│   └── env.production
└── backup-metadata.txt              (informations système)
```

### Métadonnées

Chaque backup contient un fichier `backup-metadata.txt` avec :

- Date et heure du backup
- Liste des conteneurs actifs
- Liste des volumes
- Tailles des composants
- Images Docker utilisées

## 📊 Taille des Backups

Typiquement, un backup complet occupe :

- **Base de données seule** : 50-500 MB (selon le contenu)
- **Volumes** : 100-2000 MB (selon les uploads)
- **Backup complet** : 200-3000 MB
- **Compressé (.tar.gz)** : ~30-50% de la taille originale

**Pour 3 backups** : prévoir 1-10 GB d'espace disque.

## 🚨 Procédures d'Urgence

### Restauration Rapide après Perte de Données

```bash
# 1. Arrêter les services
./meeshy.sh prod stop

# 2. Lister les backups
./meeshy.sh prod list-backups

# 3. Restaurer le dernier backup
./meeshy.sh prod restore

# 4. Confirmer avec "OUI"
# 5. Redémarrer les services
cd /opt/meeshy && docker-compose restart
```

### Restauration depuis un Serveur Distant

```bash
# 1. SSH vers le serveur
ssh root@192.168.1.100

# 2. Lister les backups
cd /opt/meeshy/backups
ls -lht

# 3. Restaurer
cd /opt/meeshy
./scripts/production/meeshy-restore-backup.sh ./backups/pre-update-20241019_143022.tar.gz

# 4. Redémarrer
docker-compose restart
```

## 🔐 Sécurité des Backups

### Chiffrement (Optionnel)

Pour des backups chiffrés :

```bash
# Chiffrer un backup
gpg -c backups/pre-update-20241019_143022.tar.gz

# Déchiffrer
gpg -d backups/pre-update-20241019_143022.tar.gz.gpg > backup.tar.gz
```

### Backup Hors Site

```bash
# Copier vers un stockage externe
scp backups/pre-update-*.tar.gz user@backup-server:/backups/meeshy/

# Ou vers un bucket S3
aws s3 cp backups/pre-update-*.tar.gz s3://meeshy-backups/
```

## 📋 Checklist de Vérification

Avant chaque déploiement important :

- [ ] Vérifier l'espace disque disponible (`df -h`)
- [ ] Confirmer que les 3 derniers backups existent
- [ ] Tester une restauration sur un environnement de test
- [ ] Documenter les changements importants
- [ ] Avoir un plan de rollback

## 🛠️ Scripts Disponibles

### Production Locale

| Script | Description |
|--------|-------------|
| `meeshy-auto-backup.sh` | Backup automatique avant mise à jour |
| `meeshy-restore-backup.sh` | Restauration de backup |

### Déploiement Distant

| Script | Description |
|--------|-------------|
| `deploy-backup.sh` | Module de backup pour déploiement |
| `deploy-orchestrator.sh` | Orchestration avec backup intégré |

## ❓ FAQ

### Q: Les backups sont-ils automatiques ?

**R**: Oui! Les backups sont **automatiquement créés** :
- AVANT chaque déploiement (`./meeshy.sh deploy deploy`)
- AVANT chaque reset (`./meeshy.sh deploy deploy-reset`)
- Avant les mises à jour de production

### Q: Puis-je désactiver les backups automatiques ?

**R**: Oui, avec `--skip-backup`, mais **c'est fortement déconseillé**. Vous risquez de perdre des données irréversiblement.

### Q: Combien de temps prend un backup ?

**R**: 
- **Base de données seule** : 10-30 secondes
- **Backup complet** : 1-3 minutes
- Dépend de la taille de vos données

### Q: Que faire si un backup échoue ?

**R**: 
1. Vérifier l'espace disque (`df -h`)
2. Vérifier que les conteneurs sont en cours d'exécution
3. Consulter les logs : `./meeshy.sh prod logs`
4. Créer un backup manuel : `./meeshy.sh prod backup`

### Q: Puis-je restaurer partiellement (seulement la DB) ?

**R**: Oui! Extrayez le backup et restaurez manuellement :

```bash
# Extraire
tar xzf pre-update-20241019_143022.tar.gz
cd pre-update-20241019_143022

# Restaurer uniquement MongoDB
docker cp database/mongodb_* meeshy-database:/tmp/restore
docker exec meeshy-database mongorestore --drop /tmp/restore
```

### Q: Les backups incluent-ils les secrets ?

**R**: 
- **Backup de base de données** : Non
- **Backup complet** : Oui (fichiers .env, secrets/)

### Q: Où sont stockés les backups distants ?

**R**: Sur le serveur dans `/opt/meeshy/backups/`

## 📞 Support

En cas de problème avec les backups :

1. Vérifier les logs : `./meeshy.sh prod logs`
2. Consulter `backup-metadata.txt` dans le backup
3. Tester en mode `--dry-run`
4. Contacter le support technique

## 🔗 Liens Utiles

- [Documentation de déploiement](./DEPLOYMENT.md)
- [Guide de production](./PRODUCTION.md)
- [Troubleshooting](./TROUBLESHOOTING.md)

---

**Dernière mise à jour** : 19 octobre 2024
**Version du système de backup** : 2.0.0 (avec protection automatique)

