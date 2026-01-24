# Guide d'utilisation de Changesets

## 📦 Workflow de versioning

### 1. Lors d'une modification de code

Après avoir fait vos changements (feature, fix, refactor), créez un changeset :

```bash
pnpm changeset
# ou
pnpm changeset:add
```

Répondez aux questions interactives :
- **Quel(s) package(s) avez-vous modifié ?** (gateway, shared, etc.)
- **Type de changement ?**
  - `patch` (1.0.0 → 1.0.1) : bug fixes, petites corrections
  - `minor` (1.0.0 → 1.1.0) : nouvelles features, non-breaking
  - `major` (1.0.0 → 2.0.0) : breaking changes
- **Résumé du changement** (sera dans le CHANGELOG)

Cela crée un fichier dans `.changeset/` avec vos modifications.

### 2. Vérifier les changesets en attente

```bash
pnpm version:check
```

Affiche tous les changesets qui n'ont pas encore été appliqués.

### 3. Appliquer les changements de version

Quand vous êtes prêts à bumper les versions :

```bash
pnpm version
```

Cela va :
- ✅ Bumper les versions dans les `package.json`
- ✅ Mettre à jour les dépendances internes automatiquement
- ✅ Générer/mettre à jour les CHANGELOG.md
- ✅ Supprimer les fichiers changeset appliqués

### 4. Commiter et pusher

```bash
git add .
git commit -m "chore: version packages"
git push
```

---

## 🎯 Exemples pratiques

### Scénario 1 : Bug fix dans gateway

```bash
# 1. Fixer le bug
# 2. Créer un changeset
pnpm changeset
# → Sélectionner @meeshy/gateway
# → Choisir "patch"
# → Décrire : "Correction du bug de connexion WebSocket"

# 3. Commit du code + changeset
git add .
git commit -m "fix(gateway): correction bug WebSocket"
git push
```

### Scénario 2 : Nouvelle feature dans shared

```bash
# 1. Ajouter la feature
# 2. Créer un changeset
pnpm changeset
# → Sélectionner @meeshy/shared
# → Choisir "minor"
# → Décrire : "Ajout du module de validation Zod"

# 3. Commit
git commit -m "feat(shared): ajout module validation"
```

### Scénario 3 : Modification de shared qui impacte gateway

```bash
# 1. Modifier shared
# 2. Créer un changeset
pnpm changeset
# → Sélectionner @meeshy/shared ET @meeshy/gateway
# → shared: minor
# → gateway: patch (si juste adaptation)

# Changesets mettra à jour automatiquement la dépendance
# de gateway vers la nouvelle version de shared
```

### Scénario 4 : Release complète

```bash
# 1. Vérifier les changesets en attente
pnpm version:check

# 2. Appliquer toutes les versions
pnpm release  # Build + version

# 3. Commit la release
git add .
git commit -m "chore: release packages"
git push
```

---

## 🔧 Configuration actuelle

- **baseBranch** : `dev`
- **updateInternalDependencies** : `patch`
  - Quand `@meeshy/shared` change, ses dépendants (gateway, web) sont automatiquement bumpés en patch

---

## 💡 Bonnes pratiques

### ✅ À faire
- Créer un changeset pour **chaque PR** qui modifie du code
- Être descriptif dans les résumés (ils vont dans le CHANGELOG)
- Grouper les changesets liés dans un seul commit
- Vérifier `pnpm version:check` avant une release

### ❌ À éviter
- Ne pas commit directement les modifications de version sans changeset
- Ne pas éditer manuellement les versions dans package.json
- Ne pas bumper major sans discussion d'équipe

---

## 📚 Ressources

- [Documentation Changesets](https://github.com/changesets/changesets)
- [Conventional Commits](https://www.conventionalcommits.org/)
