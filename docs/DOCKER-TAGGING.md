# 🐳 Stratégie de Tagging Docker

Ce document explique la stratégie de tagging Docker avec SemVer + date/heure.

---

## 🎯 Objectif

- **SemVer** pour la logique de version (1.0.0, 1.1.0, 2.0.0)
- **Date/heure** pour le traçage des builds (20260124.143022)
- **Flexibilité** de déploiement selon le contexte

---

## 📦 Types de builds

### 1️⃣ **Release officielle** (avec Changesets)

**Déclenchement :**
- Push sur `main` ou `dev` avec changesets
- Workflow dispatch manuel avec changeset

**Tags Docker générés :**
```bash
# Exemple pour gateway v1.0.41 (release officielle)

✅ 1.0.41                        # SemVer UNIQUEMENT (version stable)
✅ latest                        # Si branch main
✅ dev                           # Si branch dev
✅ sha-abc1234                   # Commit SHA

❌ PAS de timestamp pour les releases officielles
```

**Utilisation :**
```bash
# Production : utiliser la version SemVer stable
docker pull isopen/meeshy-gateway:1.0.41

# Toujours la dernière version
docker pull isopen/meeshy-gateway:latest
```

---

### 2️⃣ **Build automatique** (sans Changesets)

**Déclenchement :**
- Push sur `main` ou `dev` sans changeset
- Workflow Docker manuel
- Modifications de code qui ne nécessitent pas de version bump

**Tags Docker générés :**
```bash
# Exemple buildé le 24 janvier 2026 à 14:30:22 UTC

✅ 1.0.40-20260124.143022        # SemVer + timestamp (version actuelle + date)
✅ 20260124.143022               # Timestamp seul
✅ latest                        # Si branch main
✅ dev                           # Si branch dev
✅ sha-abc1234                   # Commit SHA
```

**Utilisation :**
```bash
# Utiliser le build avec SemVer + date
docker pull isopen/meeshy-gateway:1.0.40-20260124.143022

# Ou utiliser le build par date seule
docker pull isopen/meeshy-gateway:20260124.143022

# Ou utiliser latest/dev
docker pull isopen/meeshy-gateway:dev
```

---

## 🔄 Workflows

### Workflow Release (`.github/workflows/release.yml`)

**Quand :** Changesets détectés
**Tags :** SemVer UNIQUEMENT + latest/dev

```yaml
Déclenchement:
  - Push avec changesets dans .changeset/
  - Workflow dispatch manuel

Processus:
  1. ✓ Détecte changesets
  2. ✓ Applique changeset version (bumpe SemVer)
  3. ✓ Sync VERSION files
  4. ✓ Commit + Tag Git (v1.0.41)
  5. ✓ Build Docker avec SemVer UNIQUEMENT

Tags Docker:
  - 1.0.41                        # SemVer UNIQUEMENT
  - latest (si main)
  - dev (si dev)
  - sha-abc1234                   # Commit SHA
```

---

### Workflow Docker (`.github/workflows/docker.yml`)

**Quand :** Push sans changeset ou manuel
**Tags :** SemVer+Date + Date + latest/dev

```yaml
Déclenchement:
  - Push sur main/dev (modif code)
  - Workflow dispatch manuel

Processus:
  1. ✓ Détecte changements de fichiers
  2. ✓ Lit VERSION files (version actuelle)
  3. ✓ Génère timestamp (20260124.143022)
  4. ✓ Build Docker avec SemVer+date + date

Tags Docker:
  - 1.0.40-20260124.143022        # SemVer + date
  - 20260124.143022               # Date seule
  - latest (si main)
  - dev (si dev)
  - sha-abc1234                   # Commit SHA
```

---

## 📅 Format de date/heure

### Format : `YYYYMMdd.HHmmss`

```
20260124.143022
│││││││  ││││││
│││││││  │││││└─ Secondes (22)
│││││││  ││││└── Minutes (30)
│││││││  │││└─── Heures (14 = 2PM UTC)
│││││││  ││└──── Point séparateur
│││││││  │└───── Jour (24)
│││││││  └────── Mois (01 = janvier)
││││└─────────── Année (2026)
│││└──────────── Point séparateur
```

**Avantages :**
- ✅ Tri chronologique naturel (ordre alphabétique = ordre chronologique)
- ✅ Lisible et compact
- ✅ UTC (pas d'ambiguïté de timezone)
- ✅ Compatible Docker tags (pas de caractères spéciaux interdits)

**Exemples :**
```
20260124.143022  →  24 janvier 2026, 14:30:22 UTC
20260125.083015  →  25 janvier 2026, 08:30:15 UTC
20260201.000000  →  1 février 2026, 00:00:00 UTC
```

---

## 🎯 Cas d'usage

### Scénario 1 : Déploiement en production

```bash
# Utiliser une version SemVer stable
docker-compose.yml:
  gateway:
    image: isopen/meeshy-gateway:1.0.41

# Ou utiliser latest (met à jour automatiquement)
  gateway:
    image: isopen/meeshy-gateway:latest
```

### Scénario 2 : Debug d'un problème spécifique

```bash
# Identifier le build exact qui a introduit le bug
# Build avant le bug : 20260124.120000 ✅
# Build avec le bug  : 20260124.143022 ❌
# Rollback :
docker pull isopen/meeshy-gateway:20260124.120000
```

### Scénario 3 : Testing d'une branche de développement

```bash
# Utiliser le tag dev (dernière version de la branche dev)
docker pull isopen/meeshy-gateway:dev

# Ou un build spécifique par date
docker pull isopen/meeshy-gateway:20260124.143022
```

### Scénario 4 : Reproduire un environnement exact

```bash
# Grâce aux tags SemVer+date, on peut reproduire exactement
# l'environnement d'un moment précis

docker-compose.yml:
  web:        isopen/meeshy-web:1.0.2-20260124.143022
  gateway:    isopen/meeshy-gateway:1.0.41-20260124.143022
  translator: isopen/meeshy-translator:1.0.3-20260124.143022
```

---

## 🔍 Vérification des tags

### Vérifier les tags disponibles

```bash
# Lister tous les tags d'une image
docker images isopen/meeshy-gateway --format "{{.Tag}}"

# Via Docker Hub API
curl -s https://hub.docker.com/v2/repositories/isopen/meeshy-gateway/tags/ | jq -r '.results[].name'
```

### Inspecter les métadonnées d'une image

```bash
# Voir la version et la date de build
docker inspect isopen/meeshy-gateway:1.0.41 | jq '.[0].Config.Labels'

# Labels générés automatiquement :
{
  "org.opencontainers.image.version": "1.0.41",
  "org.opencontainers.image.created": "2026-01-24T14:30:22Z",
  "org.opencontainers.image.revision": "abc1234...",
  "build.timestamp": "20260124.143022"
}
```

---

## 📊 Comparaison des approches

| Aspect | Release officielle | Build automatique |
|--------|-------------------|-------------------|
| **Déclenchement** | Changeset mergé | Push direct |
| **SemVer seul** | ✅ Oui (1.0.41) | ❌ Non |
| **SemVer+Date** | ❌ Non | ✅ Oui (1.0.40-20260124.143022) |
| **Date seule** | ❌ Non | ✅ Oui (20260124.143022) |
| **Tag latest** | ✅ Si main | ✅ Si main |
| **CHANGELOG** | ✅ Généré | ❌ Non |
| **Git tag** | ✅ v1.0.41 | ❌ Non |
| **GitHub Release** | ✅ Oui | ❌ Non |

---

## 🚀 Best Practices

### 1. Production

```bash
# ✅ Utiliser des versions SemVer stables
image: isopen/meeshy-gateway:1.0.41

# ⚠️  Éviter latest en production (unpredictable)
# image: isopen/meeshy-gateway:latest
```

### 2. Staging

```bash
# ✅ Utiliser latest ou dev pour tester les dernières versions
image: isopen/meeshy-gateway:latest
```

### 3. Development

```bash
# ✅ Utiliser dev pour le développement actif
image: isopen/meeshy-gateway:dev

# ✅ Ou un build spécifique par date pour reproduire un bug
image: isopen/meeshy-gateway:20260124.143022
```

### 4. Rollback

```bash
# ✅ Utiliser la version SemVer précédente
image: isopen/meeshy-gateway:1.0.40

# ✅ Ou un build spécifique par date
image: isopen/meeshy-gateway:1.0.40-20260123.120000
```

---

## 📝 Exemples concrets

### Release officielle complète

```bash
# Développeur crée un changeset
pnpm changeset
# → gateway: minor (1.0.41 → 1.1.0)

# PR mergée sur main
# → CI déclenche release.yml

# Tags Docker créés :
isopen/meeshy-gateway:1.1.0                    # SemVer UNIQUEMENT
isopen/meeshy-gateway:latest
isopen/meeshy-gateway:sha-abc1234

# PAS de timestamp pour les releases officielles
```

### Build automatique (hotfix urgent)

```bash
# Développeur fixe un bug critique
vim services/gateway/src/auth.ts
git commit -m "fix: critical auth bug"
git push origin dev

# CI déclenche docker.yml (pas de changeset)

# Tags Docker créés :
isopen/meeshy-gateway:1.0.40-20260124.153045   # SemVer + date
isopen/meeshy-gateway:20260124.153045          # Date seule
isopen/meeshy-gateway:dev
isopen/meeshy-gateway:sha-def5678
```

---

## 🛠️ Troubleshooting

### Problème : "Trop de tags, difficile de trouver la bonne version"

**Solution :**
```bash
# Filtrer par SemVer seulement
docker images isopen/meeshy-gateway --filter "label=org.opencontainers.image.version"

# Ou utiliser latest pour la dernière version stable
docker pull isopen/meeshy-gateway:latest
```

### Problème : "Comment savoir quel build correspond à un commit ?"

**Solution :**
```bash
# Utiliser le tag SHA
docker pull isopen/meeshy-gateway:sha-abc1234

# Ou inspecter les labels
docker inspect isopen/meeshy-gateway:1.0.41 | jq '.[0].Config.Labels."org.opencontainers.image.revision"'
```

### Problème : "Builds multiples le même jour, comment différencier ?"

**Solution :**
```bash
# Les timestamps incluent l'heure, minute, seconde
20260124.143022  # 14:30:22
20260124.153045  # 15:30:45
20260124.163010  # 16:30:10

# Tri chronologique automatique
```

---

## 📚 Références

- [SemVer Specification](https://semver.org/)
- [Docker Tag Best Practices](https://docs.docker.com/engine/reference/commandline/tag/)
- [OCI Image Spec](https://github.com/opencontainers/image-spec)
- [Changesets Documentation](https://github.com/changesets/changesets)
