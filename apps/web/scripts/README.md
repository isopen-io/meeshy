# 📦 Scripts Docker Build - Frontend

Scripts optimisés pour résoudre les problèmes de timeout lors du build multi-plateforme.

## 🎯 Scripts Disponibles

### `docker-build-diagnose.sh` 🔍
**Diagnostic complet de l'environnement**

Vérifie:
- Docker et Buildx installation
- Builders configurés
- Authentification Docker Hub
- Espace disque disponible
- Connectivité réseau
- Fichiers requis

**Utilisation**:
```bash
./scripts/docker-build-diagnose.sh
```

**Quand l'utiliser**: TOUJOURS avant une build!

---

### `docker-build-optimized.sh` ⚡
**Build optimisée avec cache (RECOMMANDÉ)**

Fonctionnalités:
- ✅ Cache Docker Registry
- ✅ Build incrémentale
- ✅ Multi-plateforme (ARM64 + AMD64)
- ✅ Gestion automatique du builder
- ✅ Push automatique

**Utilisation**:
```bash
# Build et push (défaut)
./scripts/docker-build-optimized.sh

# Build locale uniquement
PUSH=false ./scripts/docker-build-optimized.sh

# Build ARM64 uniquement
PLATFORMS=linux/arm64 ./scripts/docker-build-optimized.sh

# Build avec tag personnalisé
DOCKER_TAG=v1.0.0 ./scripts/docker-build-optimized.sh

# Combinaisons
PUSH=false PLATFORMS=linux/arm64 DOCKER_TAG=dev ./scripts/docker-build-optimized.sh
```

**Temps de build**:
- Première fois: ~15-20 min
- Suivantes: ~2-5 min ⚡

---

### `docker-build-separate.sh` 🛡️
**Build séparée par plateforme**

Fonctionnalités:
- ✅ Build ARM64 puis AMD64 séparément
- ✅ Plus fiable pour connexions instables
- ✅ Création de manifest multi-arch
- ✅ Possibilité de reprendre

**Utilisation**:
```bash
./scripts/docker-build-separate.sh
```

**Quand l'utiliser**: 
- Connexion réseau instable
- Timeouts récurrents avec la méthode optimisée
- Besoin de plus de contrôle

**Temps de build**: ~20-30 min (séquentiel)

---

### `prepare-docker-build.sh` 📋
**Préparation du contexte Docker**

Actions:
- Build des types shared
- Distribution des fichiers shared
- Configuration pnpm workspace

**Utilisation**:
```bash
./scripts/prepare-docker-build.sh
```

**Note**: Appelé automatiquement par les autres scripts.

---

## 🚀 Workflows Recommandés

### Développement Local (Mac Silicon)
```bash
# Build rapide ARM64 uniquement
PUSH=false PLATFORMS=linux/arm64 ./scripts/docker-build-optimized.sh

# Test
docker run -p 3100:80 isopen/meeshy-web:latest
```

### Production (Multi-plateforme)
```bash
# Diagnostic
./scripts/docker-build-diagnose.sh

# Build optimisée
./scripts/docker-build-optimized.sh
```

### CI/CD
```bash
# Build avec cache
./scripts/docker-build-optimized.sh

# Ou si timeout
./scripts/docker-build-separate.sh
```

---

## 📊 Comparaison

| Script | Vitesse | Fiabilité | Cache | Usage |
|--------|---------|-----------|-------|-------|
| `docker-build-diagnose.sh` | Instant | N/A | N/A | Diagnostic |
| `docker-build-optimized.sh` | ⚡⚡⚡ | ⭐⭐⭐⭐ | ✅ | Recommandé |
| `docker-build-separate.sh` | ⚡⚡ | ⭐⭐⭐⭐⭐ | ✅ | Backup |
| `prepare-docker-build.sh` | ⚡ | N/A | N/A | Setup |

---

## 🔧 Variables d'Environnement

### Toutes disponibles pour `docker-build-optimized.sh`:

| Variable | Défaut | Description |
|----------|--------|-------------|
| `DOCKER_IMAGE` | `isopen/meeshy-web` | Nom de l'image |
| `DOCKER_TAG` | `latest` | Tag de l'image |
| `PLATFORMS` | `linux/arm64,linux/amd64` | Plateformes cibles |
| `DOCKERFILE` | `Dockerfile.optimized` | Fichier Dockerfile |
| `PUSH` | `true` | Push vers Docker Hub |

### Exemple d'usage:
```bash
DOCKER_IMAGE=myregistry/frontend \
DOCKER_TAG=v2.0.0 \
PLATFORMS=linux/amd64 \
PUSH=true \
./scripts/docker-build-optimized.sh
```

---

## 🐛 Dépannage

### "Permission denied"
```bash
chmod +x scripts/*.sh
```

### "Builder not found"
Le script créera automatiquement le builder nécessaire.

### "Timeout exceeded"
Utilisez `docker-build-separate.sh` au lieu de `docker-build-optimized.sh`.

### "Insufficient scope"
```bash
docker logout
docker login
```

---

## 📚 Documentation Complète

- `../DOCKER_BUILD_GUIDE.md` - Guide détaillé avec explications
- `../QUICK_START_BUILD.md` - Guide de démarrage rapide
- `../Dockerfile.optimized` - Dockerfile avec cache optimisé

---

## 💡 Astuces Pro

### Build super rapide en dev
```bash
# ARM64 uniquement + pas de push
PUSH=false PLATFORMS=linux/arm64 ./scripts/docker-build-optimized.sh
```

### Forcer rebuild complet
```bash
docker buildx prune -af
./scripts/docker-build-optimized.sh
```

### Voir l'utilisation du cache
```bash
docker buildx du --verbose
```

### Nettoyer le cache
```bash
docker buildx prune -af
```

---

## 🎓 En Savoir Plus

### Architecture des Scripts

```
docker-build-diagnose.sh
    └─> Vérifie l'environnement
    
docker-build-optimized.sh
    ├─> prepare-docker-build.sh
    ├─> Vérifie/crée builder
    ├─> Build avec cache
    └─> Push (optionnel)
    
docker-build-separate.sh
    ├─> prepare-docker-build.sh
    ├─> Build ARM64 → Push
    ├─> Build AMD64 → Push
    └─> Crée manifest multi-arch
```

### Ordre d'Exécution Recommandé

1. `docker-build-diagnose.sh` - Vérifier l'environnement
2. Corriger les problèmes identifiés
3. `docker-build-optimized.sh` - Lancer la build
4. Si échec/timeout: `docker-build-separate.sh`

---

**Créé pour résoudre**: Timeout de 60 secondes lors de `docker buildx build --platform linux/arm64,linux/amd64`

**Auteur**: Meeshy Dev Team
**Date**: 2025-10-16

