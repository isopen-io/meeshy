# Déploiement des Scripts de Nettoyage

Ce document explique comment déployer les scripts de nettoyage des fichiers et attachements orphelins sur le serveur de production.

## 🚀 Utilisation rapide

```bash
cd scripts/deployment
./deploy-cleanup-scripts.sh [IP_DU_SERVEUR]
```

**Exemple** :
```bash
./deploy-cleanup-scripts.sh 192.168.1.100
# ou
./deploy-cleanup-scripts.sh prod.meeshy.me
```

## 📦 Scripts déployés

Le script déploie automatiquement :

| Fichier | Type | Description |
|---------|------|-------------|
| `export-attachment-paths.js` | MongoDB | Export des chemins d'attachements |
| `cleanup-orphan-attachments.js` | MongoDB | Nettoyage attachements orphelins (DB) |
| `cleanup-orphan-files.sh` | Shell | Nettoyage fichiers orphelins (disque) |
| `test-cleanup-system.sh` | Shell | Test du système complet |
| `monthly-cleanup.sh` | Shell | Script de nettoyage automatique |
| `CLEANUP-README.md` | Doc | Guide d'utilisation rapide |
| `CLEANUP-GUIDE.md` | Doc | Documentation complète |

## 🔄 Processus de déploiement

Le script effectue automatiquement les étapes suivantes :

### 1. Vérification locale
- ✅ Vérifie que tous les scripts sont présents localement
- ✅ Valide l'intégrité des fichiers

### 2. Préparation du serveur
- ✅ Crée le dossier `/opt/meeshy/scripts`
- ✅ Vérifie les permissions

### 3. Copie des fichiers
- ✅ Transfère tous les scripts via SCP
- ✅ Copie la documentation

### 4. Configuration
- ✅ Rend les scripts shell exécutables
- ✅ Configure les permissions appropriées

### 5. Installation des dépendances
- ✅ Installe `jq` si nécessaire
- ✅ Vérifie `mongosh`

### 6. Configuration automatique
- ✅ Crée le script de nettoyage mensuel
- ✅ Prépare la configuration cron

### 7. Vérification
- ✅ Teste l'installation complète
- ✅ Vérifie la connexion MongoDB
- ✅ Affiche les statistiques

## 📊 Sortie attendue

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧹 DÉPLOIEMENT DES SCRIPTS DE NETTOYAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Serveur cible: 192.168.1.100

✅ Vérification des scripts locaux...
✅ Création du dossier scripts...
✅ Copie des scripts...
✅ Configuration des permissions...
✅ Installation de jq...
✅ Configuration du nettoyage automatique...
✅ Vérification de l'installation...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ DÉPLOIEMENT TERMINÉ AVEC SUCCÈS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Scripts déployés dans /opt/meeshy/scripts:
  • export-attachment-paths.js
  • cleanup-orphan-attachments.js
  • cleanup-orphan-files.sh
  • test-cleanup-system.sh
  • monthly-cleanup.sh
  • CLEANUP-README.md
  • CLEANUP-GUIDE.md

🚀 Prochaines étapes sur le serveur:
  1. ssh root@192.168.1.100
  2. cd /opt/meeshy
  3. bash scripts/test-cleanup-system.sh
```

## 🔧 Prérequis

### Sur la machine locale
- ✅ SSH configuré avec accès root au serveur
- ✅ Scripts de nettoyage présents dans `scripts/`
- ✅ Script `deploy-config.sh` chargé

### Sur le serveur
- ✅ Docker Compose installé
- ✅ MongoDB accessible via Docker
- ✅ Dossier `/opt/meeshy` existant
- ⚠️ `jq` (installé automatiquement si manquant)
- ⚠️ `mongosh` (devrait déjà être installé)

## 🧪 Test après déploiement

Connectez-vous au serveur et testez :

```bash
# 1. Connexion
ssh root@[IP_SERVEUR]

# 2. Aller dans le dossier Meeshy
cd /opt/meeshy

# 3. Tester le système
bash scripts/test-cleanup-system.sh
```

**Sortie attendue** :
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 VÉRIFICATION DES PRÉREQUIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ mongosh installé: 2.0.0
✅ jq installé: jq-1.6

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗄️  VÉRIFICATION DE MONGODB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Connexion MongoDB OK
ℹ️  Messages: 1234
ℹ️  Attachements: 567

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 VÉRIFICATION DU DOSSIER UPLOADS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Dossier uploads trouvé
ℹ️  Fichiers: 689
ℹ️  Taille: 2.3G

✅ Tous les tests sont passés avec succès!
```

## 📋 Configuration du nettoyage automatique

Le script crée automatiquement `/opt/meeshy/scripts/monthly-cleanup.sh` pour le nettoyage mensuel.

### Activation du cron job

Sur le serveur :

```bash
# Éditer le crontab
crontab -e

# Ajouter cette ligne (nettoyage le 1er de chaque mois à 3h00)
0 3 1 * * cd /opt/meeshy && bash scripts/monthly-cleanup.sh
```

### Vérifier le cron

```bash
# Lister les cron jobs
crontab -l

# Consulter les logs
tail -f /opt/meeshy/logs/cleanup.log
```

### Test manuel du nettoyage automatique

```bash
cd /opt/meeshy
bash scripts/monthly-cleanup.sh
```

## 🗂️ Structure sur le serveur

Après déploiement, la structure sur le serveur sera :

```
/opt/meeshy/
├── scripts/
│   ├── export-attachment-paths.js          # Export MongoDB
│   ├── cleanup-orphan-attachments.js       # Nettoyage DB
│   ├── cleanup-orphan-files.sh             # Nettoyage disque
│   ├── test-cleanup-system.sh              # Test système
│   ├── monthly-cleanup.sh                  # Nettoyage auto
│   ├── CLEANUP-README.md                   # Doc rapide
│   └── CLEANUP-GUIDE.md                    # Doc complète
├── logs/
│   └── cleanup.log                         # Logs des nettoyages
└── gateway/
    └── uploads/
        └── attachments/                    # Fichiers à nettoyer
```

## 🔍 Vérification de l'installation

Sur le serveur, vérifiez que tout est en place :

```bash
cd /opt/meeshy

# Lister les scripts
ls -lh scripts/*.js scripts/*.sh scripts/*.md

# Vérifier l'exécutabilité
ls -l scripts/*.sh | grep rwxr

# Tester l'aide
bash scripts/cleanup-orphan-files.sh

# Afficher la documentation
cat scripts/CLEANUP-README.md
```

## 🆘 Dépannage

### Problème : Script de déploiement échoue

```bash
# Vérifier la connexion SSH
ssh root@[IP_SERVEUR] "echo 'OK'"

# Vérifier que deploy-config.sh existe
ls -l scripts/deployment/deploy-config.sh
```

### Problème : jq non installé après déploiement

```bash
# Sur le serveur
ssh root@[IP_SERVEUR]
apt-get update && apt-get install -y jq
```

### Problème : MongoDB non accessible

```bash
# Sur le serveur
cd /opt/meeshy
docker compose ps
docker compose logs mongodb
```

### Problème : Permissions incorrectes

```bash
# Sur le serveur
cd /opt/meeshy/scripts
chmod +x cleanup-orphan-files.sh test-cleanup-system.sh monthly-cleanup.sh
```

## 📊 Monitoring après déploiement

### Vérifier l'utilisation du disque

```bash
# Sur le serveur
cd /opt/meeshy
du -sh gateway/uploads/attachments/
```

### Vérifier les statistiques MongoDB

```bash
# Sur le serveur
cd /opt/meeshy
docker compose exec mongodb mongosh meeshy --quiet --eval "
  print('Messages:', db.Message.countDocuments({}));
  print('Attachements:', db.MessageAttachment.countDocuments({}));
"
```

### Consulter les logs de nettoyage

```bash
# Sur le serveur
tail -f /opt/meeshy/logs/cleanup.log
```

## 🔄 Mise à jour des scripts

Pour mettre à jour les scripts après modification :

```bash
# Sur la machine locale
cd scripts/deployment
./deploy-cleanup-scripts.sh [IP_SERVEUR]
```

Le script écrasera les anciens fichiers avec les nouvelles versions.

## 📖 Documentation

Pour plus d'informations, consultez :

- **Guide rapide** : `/opt/meeshy/scripts/CLEANUP-README.md`
- **Guide complet** : `/opt/meeshy/scripts/CLEANUP-GUIDE.md`
- **Documentation locale** : `scripts/CLEANUP-GUIDE.md`

## 🔐 Sécurité

Le script de déploiement :
- ✅ Utilise SSH avec StrictHostKeyChecking
- ✅ Configure les permissions appropriées (755 pour scripts, 644 pour docs)
- ✅ Crée les dossiers avec les bonnes permissions
- ✅ N'expose pas de données sensibles dans les logs

## 💡 Bonnes pratiques

1. **Avant déploiement** :
   - Vérifier que tous les scripts fonctionnent localement
   - Tester avec `bash scripts/test-cleanup-system.sh`
   - Faire une sauvegarde de la production

2. **Après déploiement** :
   - Tester immédiatement avec `test-cleanup-system.sh`
   - Vérifier les logs
   - Configurer le cron job si souhaité

3. **Maintenance** :
   - Consulter les logs mensuels
   - Mettre à jour les scripts si nécessaire
   - Surveiller l'espace disque

---

**Date de création** : 2025-11-19
**Version** : 1.0.0
**Auteur** : Meeshy DevOps
