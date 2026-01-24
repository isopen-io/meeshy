# 📦 Architecture du Système de Versioning

Ce document explique l'architecture complète du système de versioning automatisé de Meeshy.

---

## 🏗️ Architecture globale

```
┌─────────────────────────────────────────────────────────────────┐
│                        Developer Workflow                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
                    pnpm changeset (CLI)
                              │
                              ↓
                   .changeset/*.md files
                              │
                              ↓
                    Git commit + push
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Actions Trigger                       │
│  (.github/workflows/release.yml)                                │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ↓                     ↓                     ↓
   ┌────────┐         ┌──────────────┐      ┌──────────┐
   │ Check  │   →     │   Version    │  →   │  Build   │
   └────────┘         └──────────────┘      └──────────┘
  Detect                Apply changesets     Docker images
  changesets            Sync VERSION files   avec versions
                        Commit + Tag         correctes
                              │
                              ↓
                    ┌──────────────────┐
                    │  GitHub Release  │
                    └──────────────────┘
                              │
                              ↓
                   🎉 Release complète
```

---

## 📁 Structure des fichiers

```
v2_meeshy/
├── .changeset/
│   ├── config.json           # Configuration Changesets
│   ├── README.md             # Guide Changesets auto-généré
│   ├── USAGE.md              # Guide d'utilisation détaillé
│   ├── RELEASE.md            # Documentation workflow release
│   ├── MIGRATION.md          # Guide de migration
│   └── *.md                  # Changesets individuels (temporaires)
│
├── scripts/
│   └── sync-versions.js      # Script de sync package.json → VERSION
│
├── .github/workflows/
│   ├── release.yml           # Workflow release automatisé
│   ├── release.yml.manual-backup  # Backup ancien workflow
│   └── docker.yml            # Workflow Docker (inchangé)
│
├── package.json              # Version root (référence principale)
├── apps/web/
│   ├── package.json          # Version web
│   └── VERSION               # Version pour Docker
│
├── services/gateway/
│   ├── package.json          # Version gateway
│   └── VERSION               # Version pour Docker
│
└── services/translator/
    ├── package.json          # Version translator
    └── VERSION               # Version pour Docker
```

---

## 🔄 Flux de données

### 1. Création du changeset

```
Developer
   ↓
pnpm changeset (CLI interactive)
   ↓
.changeset/random-name-abc.md
```

**Contenu du fichier changeset :**
```markdown
---
"@meeshy/gateway": patch
"@meeshy/shared": minor
---

Ajout de la validation des JWT avec expiration configurable
```

### 2. Application du changeset

```
GitHub Actions trigger
   ↓
pnpm changeset version
   ↓
┌────────────────────────────────────┐
│ Changesets lit tous les *.md      │
│ Détermine les bumps nécessaires   │
│ Met à jour package.json            │
│ Génère/update CHANGELOG.md        │
│ Supprime les changesets appliqués │
└────────────────────────────────────┘
   ↓
package.json updated:
  - gateway: 1.0.40 → 1.0.41
  - shared: 1.0.0 → 1.1.0
```

### 3. Synchronisation VERSION files

```
node scripts/sync-versions.js
   ↓
┌──────────────────────────────────────────┐
│ Pour chaque package:                     │
│   1. Lit package.json                    │
│   2. Extrait version                     │
│   3. Écrit dans VERSION file             │
└──────────────────────────────────────────┘
   ↓
VERSION files updated:
  - services/gateway/VERSION: 1.0.41
  - packages/shared/VERSION: 1.1.0 (si existe)
```

### 4. Commit et Tag

```
git add -A
git commit -m "chore(release): version packages [skip ci]"
   ↓
git tag -a "v1.0.41" -m "Release v1.0.41"
   ↓
git push origin dev
git push origin v1.0.41
```

### 5. Docker Build

```
Checkout au tag: v1.0.41
   ↓
Lit VERSION files:
  - apps/web/VERSION → 1.0.2
  - services/gateway/VERSION → 1.0.41
  - services/translator/VERSION → 1.0.3
   ↓
Build Docker images:
  - isopen/meeshy-web:v1.0.2
  - isopen/meeshy-gateway:v1.0.41
  - isopen/meeshy-translator:v1.0.3
   ↓
Tag latest (si main):
  - isopen/meeshy-gateway:latest
```

---

## 🧩 Composants clés

### 1. Changesets CLI

**Rôle :** Gérer les versions de manière déclarative

**Commandes principales :**
```bash
pnpm changeset        # Créer un changeset
pnpm changeset version # Appliquer les changesets
pnpm changeset status  # Voir les changesets en attente
```

**Configuration :** `.changeset/config.json`
```json
{
  "baseBranch": "dev",
  "updateInternalDependencies": "patch",
  "changelog": "@changesets/cli/changelog"
}
```

### 2. Script de synchronisation

**Fichier :** `scripts/sync-versions.js`

**Rôle :** Synchroniser `package.json` → `VERSION`

**Mapping :**
```javascript
const VERSION_FILES = [
  {
    packagePath: 'apps/web/package.json',
    versionPath: 'apps/web/VERSION',
    name: 'web'
  },
  {
    packagePath: 'services/gateway/package.json',
    versionPath: 'services/gateway/VERSION',
    name: 'gateway'
  },
  {
    packagePath: 'services/translator/package.json',
    versionPath: 'services/translator/VERSION',
    name: 'translator'
  }
];
```

**Algorithme :**
```
Pour chaque config:
  1. Lire package.json
  2. Extraire version
  3. Comparer avec VERSION file
  4. Si différent → écrire nouvelle version
  5. Logger le changement
```

### 3. Workflow GitHub Actions

**Fichier :** `.github/workflows/release.yml`

**Jobs :**
```yaml
check:
  - Détecte les changesets en attente
  - Output: has_changesets (true/false)

version:
  - Applique changesets
  - Synchronise VERSION files
  - Commit + Tag
  - Output: version, tag

build:
  - Build Docker images
  - Lit VERSION files
  - Tag avec versions correctes

release:
  - Crée GitHub Release
  - Génère changelog
```

**Triggers :**
```yaml
on:
  push:
    branches: [main, dev]
    paths:
      - '.changeset/**'
      - '**/package.json'
  workflow_dispatch:
    # Manuel trigger
```

---

## 🔀 Gestion des dépendances internes

### Problème

Quand `@meeshy/shared` change, `gateway` et `web` qui l'utilisent doivent aussi être bumpés.

### Solution Changesets

**Configuration :** `updateInternalDependencies: "patch"`

**Comportement :**
```
Si shared: 1.0.0 → 1.1.0 (minor)
Alors automatiquement:
  - gateway: 1.0.40 → 1.0.41 (patch)
  - web: 1.0.2 → 1.0.3 (patch)

Et met à jour les dépendances:
  gateway/package.json:
    dependencies: {
      "@meeshy/shared": "workspace:*" → "workspace:*" (reste)
    }
```

**Exemple de changeset :**
```markdown
---
"@meeshy/shared": minor
"@meeshy/gateway": patch
"@meeshy/web": patch
---

Ajout du module de validation Zod dans shared
Adaptation de gateway et web pour utiliser le nouveau module
```

---

## 🏷️ Stratégie de tagging

### Git Tags

```
Format: v{version}
Exemple: v1.0.41, v1.1.0, v2.0.0-alpha

Créés automatiquement par le workflow
Basés sur la version du package.json root
```

### Docker Tags

```
Par service, basé sur VERSION file:

gateway:
  - isopen/meeshy-gateway:v1.0.41
  - isopen/meeshy-gateway:latest (si main)
  - isopen/meeshy-gateway:dev (si dev)
  - isopen/meeshy-gateway:sha-abc123

web:
  - isopen/meeshy-web:v1.0.2
  - isopen/meeshy-web:latest (si main)
  - isopen/meeshy-web:dev (si dev)

translator:
  - isopen/meeshy-translator:v1.0.3
  - isopen/meeshy-translator:latest (si main)
  - isopen/meeshy-translator:cpu (variant)
  - isopen/meeshy-translator:gpu (variant)
```

---

## 🔐 Sécurité et validation

### Pre-commit hooks

```bash
# Recommandé (optionnel)
pnpm add -Dw husky lint-staged

# .husky/pre-commit
pnpm lint
pnpm type-check
pnpm version:check  # Vérifie les changesets
```

### CI validations

```yaml
# Dans release.yml
- Vérifier que changesets existent
- Valider le format des changesets
- Confirmer versions synchronisées
- Tests passent avant release
```

---

## 📊 Métriques et monitoring

### Logs importants

**Workflow GitHub Actions :**
```
✅ Found 3 changeset(s) to publish
📦 Applying changesets...
✅ Versions updated
🔄 Synchronizing package.json → VERSION files...
✨ UPDATED gateway: 1.0.40 → 1.0.41
📌 New version: 1.0.41
```

**Script de sync :**
```
🔄 Synchronisation des versions package.json → VERSION files...

✨ UPDATED gateway: 1.0.40 → 1.0.41
✓ OK web: 1.0.2 → 1.0.2
✨ UPDATED translator: 1.0.2 → 1.0.3

============================================================
✅ Synchronisation terminée avec succès (modifications détectées)
============================================================
```

### Vérifications post-release

```bash
# Vérifier que tout est synchronisé
for dir in apps/web services/gateway services/translator; do
  if [[ -f "$dir/package.json" ]]; then
    PKG_VERSION=$(jq -r '.version' "$dir/package.json")
    VERSION_FILE=$(cat "$dir/VERSION" 2>/dev/null || echo "N/A")
    echo "$dir: package.json=$PKG_VERSION, VERSION=$VERSION_FILE"
  fi
done
```

---

## 🚀 Optimisations futures

### Possibles améliorations

1. **Changesets bot** pour PRs
   ```yaml
   - Commenter automatiquement sur les PRs
   - Rappeler de créer un changeset
   - Prévisualiser les bumps de version
   ```

2. **Pre-release workflow**
   ```yaml
   - Workflow séparé pour alpha/beta/rc
   - Snapshot releases
   - Canary deployments
   ```

3. **Version matrix**
   ```yaml
   - Matrice de compatibilité des versions
   - Tests de régression inter-versions
   ```

4. **Automated rollback**
   ```yaml
   - Rollback automatique si tests échouent
   - Revert de tags Git
   - Unpublish Docker images
   ```

---

## 📖 Références

- [Changesets Documentation](https://github.com/changesets/changesets)
- [Semantic Versioning](https://semver.org/)
- [GitHub Actions](https://docs.github.com/en/actions)
- [Docker Tagging Best Practices](https://docs.docker.com/engine/reference/commandline/tag/)
