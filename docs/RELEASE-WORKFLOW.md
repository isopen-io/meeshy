# 🚀 Workflow de Release Automatisé avec Changesets

Ce document explique comment fonctionne le système de release automatisé qui synchronise les versions entre `package.json` et les images Docker.

---

## 📋 Vue d'ensemble

Le système utilise **Changesets** pour gérer les versions et un **script de synchronisation** pour garantir que les images Docker utilisent les bonnes versions.

### Flux de travail

```
1. Developer fait des changements
   ↓
2. Developer crée un changeset (pnpm changeset)
   ↓
3. PR mergée dans dev/main
   ↓
4. GitHub Actions détecte les changesets
   ↓
5. Applique changeset version (bumpe package.json)
   ↓
6. Synchronise VERSION files (sync-versions.js)
   ↓
7. Commit + Tag (v1.2.3)
   ↓
8. Build Docker avec bonnes versions
   ↓
9. Crée GitHub Release
```

---

## 🎯 Workflow Développeur

### 1. Faire vos modifications

Développez normalement votre feature/fix dans `gateway`, `web`, `translator`, ou `shared`.

```bash
# Exemple: modifier le gateway
cd services/gateway
# ... faire vos modifications ...
```

### 2. Créer un changeset

**Après chaque modification significative**, créez un changeset :

```bash
pnpm changeset
```

Répondez aux questions interactives :

#### **Question 1 : Quels packages ont changé ?**
```
? Which packages would you like to include?
  ◯ @meeshy/web
  ◉ @meeshy/gateway
  ◯ @meeshy/shared
  ◯ @meeshy/translator
```

#### **Question 2 : Type de changement ?**
```
? What kind of change is this for @meeshy/gateway?
  ○ patch (1.0.0 → 1.0.1) - Bug fixes
  ○ minor (1.0.0 → 1.1.0) - New features
  ○ major (1.0.0 → 2.0.0) - Breaking changes
```

**Guide de sélection :**
- **patch** : bug fixes, optimisations, corrections
- **minor** : nouvelles fonctionnalités, améliorations non-breaking
- **major** : breaking changes, changements d'API incompatibles

#### **Question 3 : Résumé du changement**
```
? Please enter a summary for this change
> Ajout de la validation des JWT avec expiration configurable
```

Ce résumé apparaîtra dans le **CHANGELOG**.

### 3. Commit le changeset

```bash
git add .changeset/
git commit -m "feat(gateway): ajout validation JWT"
git push
```

### 4. Merger la PR

Une fois la PR approuvée et mergée dans `dev` ou `main`, le workflow automatique se déclenche.

---

## 🤖 Workflow Automatisé (CI/CD)

### Déclenchement automatique

Le workflow `.github/workflows/release.yml` se déclenche automatiquement sur :

- **Push vers `main` ou `dev`** avec des changesets
- **Workflow dispatch manuel** (pour forcer une release)

### Étapes du workflow

#### 1. **Check** - Détection des changesets
```yaml
✓ Vérifie s'il y a des changesets en attente
✓ Count des fichiers .md dans .changeset/
```

#### 2. **Version** - Application des changesets
```yaml
✓ Exécute `pnpm changeset version`
  → Bumpe les versions dans package.json
  → Met à jour CHANGELOG.md
  → Supprime les changesets appliqués

✓ Exécute `node scripts/sync-versions.js`
  → Synchronise package.json → VERSION files
  → gateway/package.json (1.0.41) → services/gateway/VERSION (1.0.41)
  → web/package.json (1.0.2) → apps/web/VERSION (1.0.2)
  → translator/package.json (1.0.3) → services/translator/VERSION (1.0.3)

✓ Commit les changements
  → "chore(release): version packages [skip ci]"

✓ Crée un tag Git
  → v1.0.41 (basé sur version root package.json)
```

#### 3. **Build** - Construction des images Docker
```yaml
✓ Checkout au tag créé (v1.0.41)

✓ Lit les VERSION files
  → services/gateway/VERSION → 1.0.41
  → apps/web/VERSION → 1.0.2
  → services/translator/VERSION → 1.0.3

✓ Build et push des images Docker
  → isopen/meeshy-gateway:v1.0.41
  → isopen/meeshy-web:v1.0.2
  → isopen/meeshy-translator:v1.0.3

✓ Tag latest (si main)
  → isopen/meeshy-gateway:latest
```

#### 4. **Release** - Création de la GitHub Release
```yaml
✓ Extrait le CHANGELOG
✓ Crée une GitHub Release avec le tag
✓ Génère les release notes automatiquement
```

---

## 📦 Synchronisation des Versions

### Problème résolu

Avant, il y avait **désynchronisation** :
```
❌ gateway/package.json: 1.0.40-alpha
❌ services/gateway/VERSION: 1.0.1
   → Image Docker taguée v1.0.1 (FAUX!)
```

### Solution : Script de synchronisation

Le script `scripts/sync-versions.js` :

1. Lit chaque `package.json`
2. Écrit la version dans le fichier `VERSION` correspondant
3. Garantit la cohérence

```javascript
// Mapping automatique
{
  'apps/web/package.json' → 'apps/web/VERSION',
  'services/gateway/package.json' → 'services/gateway/VERSION',
  'services/translator/package.json' → 'services/translator/VERSION'
}
```

**Résultat :**
```
✅ gateway/package.json: 1.0.41-alpha
✅ services/gateway/VERSION: 1.0.41-alpha
   → Image Docker taguée v1.0.41-alpha (CORRECT!)
```

---

## 🛠️ Commandes Utiles

### Développement

```bash
# Créer un changeset
pnpm changeset

# Vérifier les changesets en attente
pnpm version:check

# Appliquer les versions localement (test)
pnpm version

# Synchroniser manuellement les VERSION files
pnpm sync-versions
```

### Release locale (test)

```bash
# Appliquer version + sync + commit (sans push)
pnpm release:local

# Vérifier le résultat
git log -1
cat services/gateway/VERSION
```

### CI/CD

```bash
# Déclencher une release manuelle (GitHub Actions)
# Via l'UI GitHub: Actions → Release → Run workflow
# Options:
#  - force_release: true/false
#  - skip_docker: true/false
```

---

## 🔍 Cas d'usage avancés

### Scénario 1 : Modification de `shared` impacte `gateway`

```bash
# 1. Modifier shared
cd packages/shared
# ... modifications ...

# 2. Créer un changeset
pnpm changeset
# → Sélectionner @meeshy/shared: minor
# → Sélectionner @meeshy/gateway: patch (adaptation)

# 3. Changesets va automatiquement :
#    - Bumper shared: 1.0.0 → 1.1.0
#    - Bumper gateway: 1.0.40 → 1.0.41
#    - Mettre à jour la dépendance dans gateway
```

### Scénario 2 : Release de plusieurs services

```bash
# Si vous avez modifié web, gateway, ET translator :

pnpm changeset
# → Sélectionner TOUS les packages modifiés
# → Choisir le type pour CHACUN

# Résultat : une seule release bumpe tout en cohérence
```

### Scénario 3 : Pre-release (alpha, beta)

```bash
# Les versions alpha/beta sont automatiquement détectées

# Exemple: gateway v1.0.40-alpha
# → GitHub Release marquée comme "prerelease"
# → Image Docker: isopen/meeshy-gateway:v1.0.40-alpha
# → Pas de tag "latest"
```

### Scénario 4 : Version bump sans Docker build

```bash
# Via GitHub Actions UI
# Run workflow → skip_docker: true

# Utile pour :
# - Bumper juste les versions
# - Tester le versioning
# - Fixes rapides de documentation
```

---

## 🚨 Dépannage

### Problème : "No changesets found"

**Cause :** Aucun fichier `.changeset/*.md` détecté

**Solution :**
```bash
# Créer un changeset
pnpm changeset

# Vérifier qu'il a bien été créé
ls .changeset/*.md

# Commit et push
git add .changeset/
git commit -m "chore: add changeset"
git push
```

### Problème : Versions désynchronisées

**Cause :** Script de sync pas exécuté

**Solution :**
```bash
# Synchroniser manuellement
pnpm sync-versions

# Vérifier
cat services/gateway/VERSION
jq -r '.version' services/gateway/package.json

# Doivent être identiques
```

### Problème : Docker build avec mauvaise version

**Cause :** Fichier VERSION pas commité

**Solution :**
```bash
# Vérifier que VERSION files sont trackés
git status services/*/VERSION apps/*/VERSION

# Si non trackés, les ajouter
git add services/*/VERSION apps/*/VERSION
git commit -m "chore: add VERSION files"
```

### Problème : Workflow ne se déclenche pas

**Cause :** Pas de changement dans les paths watchés

**Solution :**
Le workflow se déclenche seulement si :
- `.changeset/**` modifié
- `**/package.json` modifié

Vérifier les paths dans `.github/workflows/release.yml` :
```yaml
on:
  push:
    branches: [main, dev]
    paths:
      - '.changeset/**'
      - 'apps/*/package.json'
      - 'services/*/package.json'
      - 'packages/*/package.json'
```

---

## 📚 Ressources

- [Changesets Documentation](https://github.com/changesets/changesets)
- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)

---

## ✅ Checklist Release

Avant de merger une PR :

- [ ] Changeset créé (`pnpm changeset`)
- [ ] Type de version correct (patch/minor/major)
- [ ] Résumé du changeset clair et descriptif
- [ ] Tous les packages impactés sélectionnés
- [ ] Tests passent
- [ ] Changeset commité et pushé

Après merge :

- [ ] Workflow GitHub Actions réussi
- [ ] Tag Git créé (v1.x.x)
- [ ] Images Docker publiées avec bonnes versions
- [ ] GitHub Release créée
- [ ] CHANGELOG.md mis à jour
