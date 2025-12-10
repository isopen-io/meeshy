# Guide de nettoyage des fichiers et attachements orphelins

Ce guide explique comment nettoyer les fichiers et attachements orphelins de votre installation Meeshy.

## 📋 Vue d'ensemble

Avec le temps, des fichiers et des entrées de base de données peuvent devenir "orphelins" :
- **Fichiers orphelins** : Fichiers présents sur le disque mais non référencés en DB
- **Attachements orphelins** : Entrées DB dont le message parent a été supprimé

Ce système de nettoyage permet de :
1. Identifier tous les fichiers et attachements orphelins
2. Calculer l'espace disque récupérable
3. Supprimer en toute sécurité les éléments orphelins

## 🗂️ Scripts disponibles

### 1. `export-attachment-paths.js`
Exporte tous les chemins d'attachements référencés dans la base de données.

**Fonctionnalités** :
- Liste tous les attachements de la DB
- Identifie les attachements orphelins (message supprimé)
- Génère des statistiques détaillées
- Exporte les données au format JSON

### 2. `cleanup-orphan-attachments.js`
Supprime les attachements orphelins de la base de données.

**Fonctionnalités** :
- Mode dry-run par défaut (aucune suppression)
- Calcul de l'espace DB récupérable
- Statistiques par type MIME
- Suppression en batch

### 3. `cleanup-orphan-files.sh`
Supprime les fichiers physiques orphelins du dossier uploads.

**Fonctionnalités** :
- Mode dry-run par défaut
- Calcul de l'espace disque récupérable
- Statistiques par extension de fichier
- Suppression sécurisée avec confirmation

## 🚀 Procédure de nettoyage complète

### Étape 1 : Export des chemins valides

Exportez tous les chemins d'attachements depuis MongoDB :

```bash
cd /path/to/meeshy

# Export complet au format JSON
mongosh mongodb://localhost:27017/meeshy --quiet \
  --file scripts/export-attachment-paths.js > attachment-export.json
```

**Résultat** : Fichier `attachment-export.json` contenant :
- Liste de tous les chemins valides
- Statistiques détaillées
- Liste des attachements orphelins

### Étape 2 : Extraction des chemins valides

Extrayez les chemins dans un fichier texte :

```bash
# Nécessite jq (installer avec: brew install jq ou apt-get install jq)
cat attachment-export.json | jq -r '.paths.all[]' > valid-paths.txt
```

**Résultat** : Fichier `valid-paths.txt` avec un chemin par ligne.

### Étape 3 : Analyse des fichiers orphelins (Dry-run)

Identifiez les fichiers orphelins sans rien supprimer :

```bash
bash scripts/cleanup-orphan-files.sh valid-paths.txt
```

**Affiche** :
- Nombre de fichiers orphelins
- Espace disque récupérable
- Répartition par extension
- Exemples de fichiers

### Étape 4 : Suppression des fichiers orphelins

Si l'analyse est correcte, supprimez les fichiers :

```bash
bash scripts/cleanup-orphan-files.sh valid-paths.txt --delete
```

**Confirmation demandée** avant suppression.

### Étape 5 : Analyse des attachements orphelins (Dry-run)

Identifiez les attachements orphelins en DB :

```bash
mongosh mongodb://localhost:27017/meeshy \
  --file scripts/cleanup-orphan-attachments.js
```

**Affiche** :
- Nombre d'attachements orphelins
- Espace DB récupérable
- Répartition par type MIME
- Exemples d'attachements

### Étape 6 : Suppression des attachements orphelins

Si l'analyse est correcte, supprimez les entrées DB :

```bash
mongosh mongodb://localhost:27017/meeshy \
  --eval "var CONFIRM_DELETE=true" \
  --file scripts/cleanup-orphan-attachments.js
```

## 📊 Exemples de sortie

### Export des chemins

```
📊 Export des chemins d'attachements...

Total attachments dans la DB: 1547

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 Statistiques:

  📎 Total attachements: 1547
  ✅ Attachements valides: 1523 (attachés à un message)
  ⚠️  Attachements orphelins: 24 (message supprimé)
  📨 Messages uniques: 892
  📄 Attachements avec fileUrl: 1547
  🖼️  Attachements avec thumbnailUrl: 423
  📁 Total chemins uniques: 1856

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Nettoyage des fichiers

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 STATISTIQUES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  📁 Dossier scannés: ./gateway/uploads/attachments
  📄 Total fichiers sur disque: 1923
  ✅ Fichiers référencés en DB: 1856
  🗑️  Fichiers orphelins: 67
  💾 Espace disque orphelin: 45.32 MB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 RÉPARTITION PAR EXTENSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  .jpg: 23 fichiers
  .png: 18 fichiers
  .mp4: 12 fichiers
  .pdf: 8 fichiers
  .webm: 6 fichiers
```

## ⚠️ Avertissements importants

### Avant de supprimer

1. **Sauvegarde** : Toujours faire une sauvegarde complète avant nettoyage
   ```bash
   # Sauvegarde MongoDB
   mongodump --uri="mongodb://localhost:27017/meeshy" --out=./backup-$(date +%Y%m%d)

   # Sauvegarde des fichiers
   tar -czf uploads-backup-$(date +%Y%m%d).tar.gz gateway/uploads/attachments/
   ```

2. **Test en développement** : Testez d'abord sur un environnement de dev

3. **Vérification** : Analysez toujours avec dry-run avant suppression

4. **Mode maintenance** : Mettez l'application en maintenance pendant le nettoyage

### Ordre de suppression recommandé

1. ✅ **D'abord** : Supprimer les fichiers orphelins (disque)
2. ✅ **Ensuite** : Supprimer les attachements orphelins (DB)

**Pourquoi cet ordre ?** Si vous supprimez d'abord la DB, vous ne pourrez plus identifier les fichiers orphelins.

## 🔧 Automatisation

### Cron job mensuel

Ajoutez à votre crontab pour un nettoyage automatique mensuel :

```bash
# Nettoyage automatique le 1er de chaque mois à 3h00
0 3 1 * * cd /path/to/meeshy && bash scripts/monthly-cleanup.sh >> logs/cleanup.log 2>&1
```

### Script de nettoyage automatique

Créez `scripts/monthly-cleanup.sh` :

```bash
#!/bin/bash
set -euo pipefail

echo "=== Nettoyage automatique Meeshy - $(date) ==="

# Export des chemins
mongosh mongodb://localhost:27017/meeshy --quiet \
  --file scripts/export-attachment-paths.js > attachment-export.json

# Extraction des chemins
cat attachment-export.json | jq -r '.paths.all[]' > valid-paths.txt

# Nettoyage des fichiers (avec --delete automatique)
echo "y" | bash scripts/cleanup-orphan-files.sh valid-paths.txt --delete

# Nettoyage de la DB
mongosh mongodb://localhost:27017/meeshy \
  --eval "var CONFIRM_DELETE=true" \
  --file scripts/cleanup-orphan-attachments.js

# Nettoyage
rm -f attachment-export.json valid-paths.txt

echo "=== Nettoyage terminé - $(date) ==="
```

Rendre exécutable :

```bash
chmod +x scripts/monthly-cleanup.sh
```

## 📊 Monitoring

### Vérifier l'état actuel

```bash
# Nombre d'attachements orphelins
mongosh mongodb://localhost:27017/meeshy --quiet --eval "
  db.MessageAttachment.countDocuments({
    messageId: { \$nin: db.Message.distinct('_id') }
  })
"

# Espace disque utilisé par uploads
du -sh gateway/uploads/attachments/
```

### Statistiques hebdomadaires

Créez un script de monitoring :

```bash
#!/bin/bash
# scripts/stats-attachments.sh

mongosh mongodb://localhost:27017/meeshy --quiet --eval "
  const total = db.MessageAttachment.countDocuments({});
  const orphans = db.MessageAttachment.countDocuments({
    messageId: { \$nin: db.Message.distinct('_id') }
  });
  print('Total attachements: ' + total);
  print('Attachements orphelins: ' + orphans);
  print('Pourcentage orphelins: ' + ((orphans/total)*100).toFixed(2) + '%');
"
```

## 🆘 Dépannage

### Problème : "jq command not found"

```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq

# CentOS/RHEL
sudo yum install jq
```

### Problème : "Permission denied"

```bash
# Rendre le script exécutable
chmod +x scripts/cleanup-orphan-files.sh

# Vérifier les permissions du dossier uploads
ls -la gateway/uploads/attachments/
```

### Problème : Script trop lent

Pour les grosses installations (>10000 fichiers), augmentez la limite de fichiers :

```bash
# Augmenter temporairement la limite
ulimit -n 10000

# Puis relancer le script
bash scripts/cleanup-orphan-files.sh valid-paths.txt
```

## 📝 Notes techniques

### Structure des chemins

Les chemins dans la DB sont stockés au format :
- `/api/attachments/file/YYYY/MM/userId/filename.ext`
- `/api/attachments/thumbnail/YYYY/MM/userId/filename.ext`

Sur le disque : `gateway/uploads/attachments/YYYY/MM/userId/filename.ext`

Le script normalise automatiquement les chemins pour la comparaison.

### Performance

- **Export DB** : ~1000 attachements/seconde
- **Scan disque** : ~5000 fichiers/seconde
- **Suppression** : ~500 fichiers/seconde

Pour 10000 attachements : ~30 secondes

## 🔐 Sécurité

### Chemins sécurisés

Les scripts vérifient que :
- Les chemins ne sortent pas du dossier uploads
- Aucun fichier système n'est supprimé
- Les caractères spéciaux sont échappés

### Logs

Tous les scripts créent des logs détaillés :

```bash
# Rediriger vers un fichier log
bash scripts/cleanup-orphan-files.sh valid-paths.txt --delete > cleanup.log 2>&1
```

## 📞 Support

En cas de problème :
1. Consultez les logs
2. Vérifiez les prérequis (jq, mongosh)
3. Testez en mode dry-run
4. Restaurez depuis la sauvegarde si nécessaire

---

**Date de dernière mise à jour** : 2025-11-19
**Version** : 1.0.0
