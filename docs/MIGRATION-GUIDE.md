# 🔄 Migration vers Changesets - Guide de Migration

## Qu'est-ce qui a changé ?

### ❌ Ancien système (Manuel)

```bash
# Developer devait :
1. Modifier le code
2. Bumper manuellement package.json
3. Bumper manuellement VERSION file
4. Créer un commit de version
5. Pousser
6. Déclencher manuellement le workflow release via UI GitHub
```

**Problèmes :**
- ❌ Versions désynchronisées (package.json ≠ VERSION)
- ❌ Oublis fréquents de bumper les versions
- ❌ Pas de CHANGELOG automatique
- ❌ Process manuel et sujet aux erreurs
- ❌ Difficile de gérer les dépendances inter-packages

### ✅ Nouveau système (Changesets)

```bash
# Developer fait :
1. Modifier le code
2. Créer un changeset (pnpm changeset) → décrit le changement
3. Commit + Push
4. Merger la PR → CI automatise TOUT le reste
```

**Avantages :**
- ✅ Versions toujours synchronisées (auto)
- ✅ CHANGELOG généré automatiquement
- ✅ Dépendances inter-packages gérées automatiquement
- ✅ Process unifié et fiable
- ✅ Historique des changements clair
- ✅ Moins d'erreurs humaines

---

## 🚀 Comment migrer ?

### 1. Synchroniser les versions actuelles

**Avant de créer votre premier changeset**, synchronisez les versions existantes :

```bash
# Vérifier les versions actuelles
cat services/gateway/VERSION
jq -r '.version' services/gateway/package.json

# Si différentes, choisir la version correcte et mettre à jour
```

**Décider quelle version garder :**

Option A : Garder VERSION (celle utilisée par Docker actuellement)
```bash
# Copier VERSION → package.json
VERSION=$(cat services/gateway/VERSION)
jq --arg v "$VERSION" '.version = $v' services/gateway/package.json > tmp.json
mv tmp.json services/gateway/package.json
```

Option B : Garder package.json (si plus récente)
```bash
# Le script sync-versions.js s'en occupera
pnpm sync-versions
```

### 2. Tester le script de sync

```bash
# Exécuter le script de synchronisation
pnpm sync-versions

# Vérifier que les versions sont cohérentes
echo "Gateway:"
cat services/gateway/VERSION
jq -r '.version' services/gateway/package.json

echo "Web:"
cat apps/web/VERSION
jq -r '.version' apps/web/package.json

echo "Translator:"
cat services/translator/VERSION
jq -r '.version' services/translator/package.json
```

### 3. Commit les changements de sync

```bash
git add -A
git commit -m "chore: synchronize VERSION files with package.json"
git push
```

### 4. Créer votre premier changeset

```bash
# Pour tester, créez un changeset fictif
pnpm changeset

# Sélectionnez un package (ex: gateway)
# Type: patch
# Résumé: "Test du système Changesets"
```

### 5. Tester localement

```bash
# Appliquer le changeset localement (sans push)
pnpm version

# Vérifier le résultat
git status
git diff

# Vérifier que VERSION files ont été mis à jour
cat services/gateway/VERSION
```

Si tout est OK :
```bash
# Annuler les changements de test (si c'était un test)
git reset --hard HEAD

# OU Commit si c'était un vrai changeset
git add -A
git commit -m "chore: add changeset for testing"
git push
```

### 6. Surveiller le premier workflow automatique

Après push sur `dev` ou `main` :

1. Aller sur GitHub → Actions → Release workflow
2. Observer le workflow s'exécuter automatiquement
3. Vérifier :
   - ✅ Versions bumpées
   - ✅ VERSION files synchronisés
   - ✅ Tag Git créé
   - ✅ Images Docker buildées avec bonnes versions
   - ✅ GitHub Release créée

---

## 📝 Comparaison des workflows

### Release patch (bug fix)

#### ❌ Ancien workflow

```bash
# 1. Modifier le code
vim services/gateway/src/auth.ts

# 2. Bumper manuellement
vim services/gateway/package.json  # 1.0.40 → 1.0.41
echo "1.0.41" > services/gateway/VERSION

# 3. Commit
git add .
git commit -m "fix(gateway): correction bug auth"
git push

# 4. Aller sur GitHub Actions UI
# 5. Cliquer "Run workflow"
# 6. Sélectionner "patch"
# 7. Attendre le build
```

#### ✅ Nouveau workflow

```bash
# 1. Modifier le code
vim services/gateway/src/auth.ts

# 2. Créer un changeset
pnpm changeset
# → gateway: patch
# → "Correction bug auth"

# 3. Commit + Push
git add .
git commit -m "fix(gateway): correction bug auth"
git push

# 4. Merger la PR
# → CI automatise TOUT (version, sync, build, release)
```

**Gain :** 5 étapes manuelles → 1 seule

---

### Release minor (nouvelle feature)

#### ❌ Ancien workflow

```bash
# Même process long + risque d'oublier de bumper les dépendances
```

#### ✅ Nouveau workflow

```bash
pnpm changeset
# → gateway: minor
# → shared: patch (si modifié aussi)
# → "Ajout feature OAuth2"

git commit -m "feat(gateway): ajout OAuth2"
git push
# → Merger PR → Automatique
```

**Bonus :** Changesets bumpe automatiquement gateway si shared change !

---

## 🔧 Configuration requise

### Secrets GitHub Actions

Vérifier que ces secrets sont configurés dans GitHub :

```
Settings → Secrets and variables → Actions → Repository secrets
```

**Requis :**
- `DOCKERHUB_USERNAME` : votre username Docker Hub
- `DOCKERHUB_TOKEN` : votre token Docker Hub

**Optionnel mais recommandé :**
- `GH_TOKEN` ou utiliser `GITHUB_TOKEN` par défaut

### Permissions GitHub Actions

Le workflow nécessite ces permissions (déjà configurées) :

```yaml
permissions:
  contents: write        # Pour commit et tag
  packages: write        # Pour Docker images
  pull-requests: write   # Pour Changesets bot (optionnel)
```

---

## 🐛 Problèmes connus et solutions

### "VERSION files not found"

**Cause :** Première utilisation, fichiers VERSION n'existent pas encore

**Solution :**
```bash
# Créer les fichiers VERSION avec les versions actuelles
echo "1.0.0" > apps/web/VERSION
echo "1.0.0" > services/gateway/VERSION
echo "1.0.0" > services/translator/VERSION

git add apps/web/VERSION services/gateway/VERSION services/translator/VERSION
git commit -m "chore: add VERSION files"
git push
```

### "Workflow ne détecte pas les changesets"

**Cause :** Changeset pas dans le bon format ou pas commité

**Solution :**
```bash
# Vérifier que les changesets existent
ls -la .changeset/*.md

# Doivent être committés
git status .changeset/

# Si pas commités
git add .changeset/
git commit -m "chore: add changeset"
git push
```

### "Docker images avec anciennes versions"

**Cause :** Script sync-versions.js pas exécuté ou VERSION files pas committés

**Solution :**
```bash
# Exécuter manuellement
pnpm sync-versions

# Vérifier
git status services/*/VERSION apps/*/VERSION

# Commit si modifiés
git add services/*/VERSION apps/*/VERSION
git commit -m "chore: sync VERSION files"
git push
```

---

## 📊 Rollback

Si besoin de revenir à l'ancien système :

```bash
# 1. Restaurer l'ancien workflow
cp .github/workflows/release.yml.manual-backup .github/workflows/release.yml

# 2. Supprimer les scripts de changeset du package.json
# (éditer manuellement)

# 3. Désinstaller changesets (optionnel)
pnpm remove -w @changesets/cli

# 4. Commit
git add .
git commit -m "chore: revert to manual release workflow"
git push
```

**Note :** Les changesets déjà appliqués et les versions bumpées restent inchangés.

---

## ✅ Validation de la migration

Checklist pour confirmer que tout fonctionne :

- [ ] Versions synchronisées (package.json = VERSION files)
- [ ] Script `pnpm sync-versions` fonctionne
- [ ] Création de changeset fonctionne (`pnpm changeset`)
- [ ] Workflow automatique se déclenche sur push
- [ ] Versions sont bumpées correctement
- [ ] VERSION files mis à jour automatiquement
- [ ] Tags Git créés
- [ ] Images Docker buildées avec bonnes versions
- [ ] GitHub Releases créées
- [ ] CHANGELOG.md généré

---

## 🎓 Formation équipe

Points à communiquer à l'équipe :

1. **Ne plus bumper manuellement les versions** dans package.json
2. **Toujours créer un changeset** après une modification (`pnpm changeset`)
3. **Le résumé du changeset va dans le CHANGELOG** → être descriptif
4. **La CI gère le reste** automatiquement après merge
5. **En cas de doute**, consulter `.changeset/USAGE.md` et `.changeset/RELEASE.md`

---

## 📞 Support

En cas de problème :

1. Consulter `.changeset/RELEASE.md` (guide complet)
2. Vérifier les logs du workflow GitHub Actions
3. Tester localement avec `pnpm version` (sans push)
4. Vérifier la synchronisation avec `pnpm sync-versions`
