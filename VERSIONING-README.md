# 🚀 Système de Versioning Automatisé - Meeshy

## Vue d'ensemble rapide

Meeshy utilise **Changesets** pour gérer automatiquement les versions entre les services (web, gateway, translator) et garantir que les images Docker utilisent toujours les bonnes versions.

---

## ⚡ Quick Start

### Pour les développeurs

```bash
# 1. Faire vos modifications
vim services/gateway/src/auth.ts

# 2. Créer un changeset
pnpm changeset
# → Sélectionner gateway
# → Choisir patch/minor/major
# → Décrire le changement

# 3. Commit et push
git add .
git commit -m "feat(gateway): ajout validation JWT"
git push

# 4. Merger la PR
# → La CI gère automatiquement le reste 🎉
```

**C'est tout !** La CI va :
- ✅ Bumper les versions (SemVer)
- ✅ Synchroniser les fichiers VERSION
- ✅ Créer le tag Git (v1.0.41)
- ✅ Générer un timestamp de build (20260124.143022)
- ✅ Builder les images Docker avec tags multiples :
  - `1.0.41` (SemVer)
  - `1.0.41-20260124.143022` (SemVer + date)
  - `20260124.143022` (date seule)
  - `latest` (si main)
- ✅ Créer la GitHub Release

---

## 📚 Documentation complète

| Document | Description |
|----------|-------------|
| [`.changeset/USAGE.md`](.changeset/USAGE.md) | Guide d'utilisation détaillé de Changesets |
| [`.changeset/RELEASE.md`](.changeset/RELEASE.md) | Workflow de release complet étape par étape |
| [`.changeset/MIGRATION.md`](.changeset/MIGRATION.md) | Guide de migration depuis l'ancien système |
| [`docs/VERSIONING.md`](docs/VERSIONING.md) | Architecture technique du système |

---

## 🎯 Pourquoi Changesets ?

### Problème résolu

**Avant :**
```
❌ gateway/package.json: 1.0.40-alpha
❌ services/gateway/VERSION: 1.0.1
→ Image Docker taguée v1.0.1 (MAUVAISE VERSION!)
```

**Maintenant :**
```
✅ gateway/package.json: 1.0.41-alpha
✅ services/gateway/VERSION: 1.0.41-alpha (auto-sync)
→ Image Docker taguée v1.0.41-alpha (CORRECTE!)
```

### Avantages

- ✅ **Versions toujours synchronisées** (package.json ↔ VERSION files)
- ✅ **Process automatisé** (plus d'oublis, moins d'erreurs)
- ✅ **CHANGELOG automatique** (historique clair des changements)
- ✅ **Gestion des dépendances** (bumpe auto les packages dépendants)
- ✅ **Release cohérente** (un seul tag pour tous les services)
- ✅ **Tags Docker multiples** (SemVer + date/heure pour traçabilité)
- ✅ **Builds traçables** (savoir exactement quand une image a été construite)

---

## 🔄 Workflow visuel

```
┌─────────────────────┐
│  Code changes       │
│  + pnpm changeset   │
└──────────┬──────────┘
           │
           ↓
┌──────────────────────┐
│  Git commit + push   │
│  Merge PR            │
└──────────┬───────────┘
           │
           ↓
┌──────────────────────────────────────────┐
│  🤖 GitHub Actions (automatique)         │
│                                          │
│  1. Détecte changesets                   │
│  2. Applique changeset version           │
│  3. Sync package.json → VERSION files    │
│  4. Commit + Tag (v1.0.41)               │
│  5. Build Docker avec bonnes versions    │
│  6. Crée GitHub Release                  │
└──────────┬───────────────────────────────┘
           │
           ↓
┌──────────────────────────────────────────┐
│  🎉 Release complète                     │
│                                          │
│  ✓ isopen/meeshy-gateway:v1.0.41        │
│  ✓ isopen/meeshy-web:v1.0.2             │
│  ✓ isopen/meeshy-translator:v1.0.3      │
│  ✓ Tag Git: v1.0.41                      │
│  ✓ GitHub Release avec CHANGELOG         │
└──────────────────────────────────────────┘
```

---

## 📦 Architecture des versions

```
v2_meeshy/
├── package.json (v1.0.0)           ← Version root (tag Git)
│
├── apps/web/
│   ├── package.json (v1.0.2)       ← Version du service
│   └── VERSION (1.0.2)             ← Utilisé par Docker
│
├── services/gateway/
│   ├── package.json (v1.0.41)      ← Version du service
│   └── VERSION (1.0.41)            ← Utilisé par Docker
│
├── services/translator/
│   ├── package.json (v1.0.3)       ← Version du service
│   └── VERSION (1.0.3)             ← Utilisé par Docker
│
└── packages/shared/
    └── package.json (v1.0.0)       ← Version du package partagé
```

**Synchronisation automatique :**
```
package.json → VERSION (via scripts/sync-versions.js)
```

---

## 🐳 Tags Docker

### Release officielle (avec Changesets)

Quand vous mergez un changeset, les images Docker reçoivent **plusieurs tags** :

```bash
# Exemple pour gateway v1.0.41 buildé le 24 janvier 2026 à 14:30:22 UTC

isopen/meeshy-gateway:1.0.41                    # Version SemVer
isopen/meeshy-gateway:1.0.41-20260124.143022    # SemVer + timestamp
isopen/meeshy-gateway:20260124.143022           # Timestamp seul
isopen/meeshy-gateway:latest                    # Latest (si main)
isopen/meeshy-gateway:dev                       # Branch (si dev)
```

**Utilisation :**
```bash
# Production : version stable
docker pull isopen/meeshy-gateway:1.0.41

# Debug : build exact
docker pull isopen/meeshy-gateway:1.0.41-20260124.143022

# Développement : dernière version
docker pull isopen/meeshy-gateway:latest
```

### Build automatique (sans Changesets)

Push direct sur main/dev sans changeset → **seulement tags date** :

```bash
isopen/meeshy-gateway:20260124.143022           # Timestamp uniquement
isopen/meeshy-gateway:latest                    # Latest (si main)
isopen/meeshy-gateway:dev                       # Branch (si dev)
```

**Pas de tag SemVer** pour les builds automatiques !

📖 **Documentation complète :** `.changeset/DOCKER-TAGGING.md`

---

## 🛠️ Commandes utiles

```bash
# Créer un changeset
pnpm changeset

# Voir les changesets en attente
pnpm version:check

# Appliquer les versions localement (test)
pnpm version

# Synchroniser manuellement VERSION files
pnpm sync-versions

# Release locale (test sans push)
pnpm release:local
```

---

## 🎓 Formation rapide

### Types de version (Semantic Versioning)

| Type | Format | Exemple | Quand l'utiliser |
|------|--------|---------|------------------|
| **patch** | x.x.**N** | 1.0.0 → 1.0.1 | Bug fixes, corrections mineures |
| **minor** | x.**N**.0 | 1.0.0 → 1.1.0 | Nouvelles features, non-breaking |
| **major** | **N**.0.0 | 1.0.0 → 2.0.0 | Breaking changes |

### Workflow en équipe

1. **Developer A** : Modifie gateway, crée changeset (patch)
2. **Developer B** : Modifie web, crée changeset (minor)
3. **Developer C** : Modifie shared, crée changeset (minor)

Quand les 3 PRs sont mergées :
→ La CI applique **tous** les changesets en une fois
→ Une seule release cohérente avec tout

---

## 🔍 Vérification rapide

Tester que tout fonctionne :

```bash
# 1. Vérifier que Changesets est installé
pnpm changeset --version

# 2. Vérifier la synchronisation
pnpm sync-versions

# 3. Vérifier la cohérence des versions
for dir in apps/web services/gateway services/translator; do
  echo "$dir:"
  echo "  package.json: $(jq -r '.version' $dir/package.json)"
  echo "  VERSION:      $(cat $dir/VERSION)"
done

# Toutes les lignes doivent être identiques pour chaque service
```

---

## 🚨 En cas de problème

| Problème | Solution rapide |
|----------|----------------|
| Versions désynchronisées | `pnpm sync-versions` |
| Pas de changeset | `pnpm changeset` |
| Workflow ne se déclenche pas | Vérifier que `.changeset/*.md` est commité |
| Docker avec mauvaise version | Vérifier `services/*/VERSION` est commité |

**Documentation complète :** `.changeset/RELEASE.md` → Section "Dépannage"

---

## 📞 Support

1. Consulter les docs dans `.changeset/`
2. Tester localement avec `pnpm version`
3. Vérifier les logs GitHub Actions
4. Examiner le script `scripts/sync-versions.js`

---

## 🎯 Prochaines étapes

Pour commencer :

1. ✅ Lire `.changeset/USAGE.md` (10 min)
2. ✅ Créer un premier changeset de test
3. ✅ Vérifier le workflow automatique
4. ✅ Partager avec l'équipe

**Besoin d'aide ?** Consulter `.changeset/MIGRATION.md`
