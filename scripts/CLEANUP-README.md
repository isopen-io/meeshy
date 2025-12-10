# Nettoyage des Fichiers et Attachements Orphelins

## 🚀 Utilisation rapide

### 1. Export des chemins valides (5 secondes)

```bash
mongosh mongodb://localhost:27017/meeshy --quiet \
  --file scripts/export-attachment-paths.js > attachment-export.json

cat attachment-export.json | jq -r '.paths.all[]' > valid-paths.txt
```

### 2. Analyse des fichiers orphelins (Dry-run)

```bash
bash scripts/cleanup-orphan-files.sh valid-paths.txt
```

### 3. Suppression des fichiers orphelins

```bash
bash scripts/cleanup-orphan-files.sh valid-paths.txt --delete
```

### 4. Analyse des attachements orphelins en DB (Dry-run)

```bash
mongosh mongodb://localhost:27017/meeshy \
  --file scripts/cleanup-orphan-attachments.js
```

### 5. Suppression des attachements orphelins en DB

```bash
mongosh mongodb://localhost:27017/meeshy \
  --eval "var CONFIRM_DELETE=true" \
  --file scripts/cleanup-orphan-attachments.js
```

## 📊 Ce que font les scripts

### `export-attachment-paths.js`
- ✅ Liste tous les chemins d'attachements dans la DB
- ✅ Identifie les attachements orphelins (message supprimé)
- ✅ Génère des statistiques complètes
- ✅ Exporte au format JSON

**Résultat** : Fichier JSON avec tous les chemins valides

### `cleanup-orphan-files.sh`
- ✅ Compare fichiers disque vs DB
- ✅ Identifie les fichiers orphelins
- ✅ Calcule l'espace récupérable
- ✅ Supprime les fichiers (avec confirmation)

**Résultat** : Fichiers physiques orphelins supprimés

### `cleanup-orphan-attachments.js`
- ✅ Trouve les attachements sans message parent
- ✅ Calcule l'espace DB récupérable
- ✅ Statistiques par type MIME
- ✅ Suppression en batch

**Résultat** : Entrées DB orphelines supprimées

## 🎯 Exemple complet

```bash
# 1. Export (5s)
mongosh mongodb://localhost:27017/meeshy --quiet \
  --file scripts/export-attachment-paths.js > attachment-export.json

# 2. Extraction des chemins (1s)
cat attachment-export.json | jq -r '.paths.all[]' > valid-paths.txt

# 3. Analyse fichiers (10s pour 10000 fichiers)
bash scripts/cleanup-orphan-files.sh valid-paths.txt

# Résultat attendu:
# 📊 STATISTIQUES
#   📄 Total fichiers sur disque: 1923
#   ✅ Fichiers référencés en DB: 1856
#   🗑️  Fichiers orphelins: 67
#   💾 Espace disque orphelin: 45.32 MB

# 4. Suppression fichiers (15s)
bash scripts/cleanup-orphan-files.sh valid-paths.txt --delete

# 5. Analyse DB (5s)
mongosh mongodb://localhost:27017/meeshy \
  --file scripts/cleanup-orphan-attachments.js

# Résultat attendu:
# 📊 Résultats:
#   📎 Total attachements: 1547
#   ✅ Attachements valides: 1523
#   ⚠️  Attachements orphelins: 24
#   💾 Espace total: 2.34 GB
#   🗑️  Espace orphelin: 12.45 MB

# 6. Suppression DB (3s)
mongosh mongodb://localhost:27017/meeshy \
  --eval "var CONFIRM_DELETE=true" \
  --file scripts/cleanup-orphan-attachments.js
```

## ⚠️ Points importants

### Avant de supprimer

```bash
# SAUVEGARDE OBLIGATOIRE
mongodump --uri="mongodb://localhost:27017/meeshy" --out=./backup-$(date +%Y%m%d)
tar -czf uploads-backup-$(date +%Y%m%d).tar.gz gateway/uploads/attachments/
```

### Ordre de suppression

1. **D'abord** : Fichiers disque (`cleanup-orphan-files.sh`)
2. **Ensuite** : Entrées DB (`cleanup-orphan-attachments.js`)

### Mode dry-run par défaut

Tous les scripts sont en mode "dry-run" par défaut :
- ✅ Analyse et affichage
- ❌ Aucune suppression

Pour supprimer, ajoutez `--delete` (fichiers) ou `CONFIRM_DELETE=true` (DB).

## 🔧 Prérequis

```bash
# Installation des outils nécessaires

# macOS
brew install jq mongosh

# Ubuntu/Debian
sudo apt-get install jq mongodb-mongosh

# Vérification
jq --version
mongosh --version
```

## 📈 Statistiques typiques

Pour une installation moyenne (1000 messages, 1500 attachements) :

| Métrique | Valeur moyenne |
|----------|----------------|
| Fichiers orphelins | 2-5% du total |
| Espace récupérable | 50-200 MB |
| Temps d'analyse | 10-30 secondes |
| Temps de suppression | 20-60 secondes |

## 🆘 Problèmes courants

### "jq: command not found"

```bash
brew install jq  # macOS
sudo apt-get install jq  # Ubuntu
```

### "Permission denied"

```bash
chmod +x scripts/cleanup-orphan-files.sh
```

### Script lent

```bash
# Augmenter la limite de fichiers
ulimit -n 10000
```

## 📝 Documentation complète

Consultez `CLEANUP-GUIDE.md` pour :
- Guide détaillé pas à pas
- Automatisation avec cron
- Monitoring et statistiques
- Dépannage avancé
- Notes techniques

## 🔐 Sécurité

- ✅ Mode dry-run par défaut
- ✅ Confirmation avant suppression
- ✅ Vérification des chemins
- ✅ Logs détaillés
- ✅ Pas de suppression de fichiers système

## 💡 Maintenance recommandée

Exécutez ces scripts :
- **Mensuellement** : Nettoyage automatique
- **Après migration** : Vérification immédiate
- **Avant backup** : Pour réduire la taille

---

**Documentation complète** : [CLEANUP-GUIDE.md](./CLEANUP-GUIDE.md)
