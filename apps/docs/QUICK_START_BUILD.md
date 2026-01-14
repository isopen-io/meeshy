# ⚡ Guide de Démarrage Rapide - Build Docker Frontend

## 🔍 Problèmes Identifiés

Le diagnostic a détecté **2 problèmes** qui causent les timeouts:

### ❌ Problème 1: Espace Disque Insuffisant
**État actuel**: 2GB disponible
**Requis**: Au moins 5GB (recommandé: 10GB+)

**Solution**:
```bash
# Nettoyer le cache Docker
docker system prune -a --volumes

# Vérifier l'espace libéré
df -h
```

### ❌ Problème 2: Non Connecté à Docker Hub
**Requis pour**: Push des images vers Docker Hub

**Solution**:
```bash
docker login
# Entrez vos identifiants Docker Hub
```

## ✅ Solutions Disponibles

### 🚀 Solution 1: Build Optimisée (RECOMMANDÉ)

**Après avoir corrigé les problèmes ci-dessus**:

```bash
cd frontend

# 1. Diagnostic d'abord
./scripts/docker-build-diagnose.sh

# 2. Si tout est OK, lancer la build optimisée
./scripts/docker-build-optimized.sh
```

**Avantages**:
- ✅ Utilise le cache Docker (builds 10x plus rapides après la première fois)
- ✅ Build multi-plateforme (ARM64 + AMD64)
- ✅ Push automatique vers Docker Hub
- ✅ Gestion automatique du builder

### 🛡️ Solution 2: Build Séparée (Si Timeout Persiste)

Si la solution 1 timeout encore:

```bash
cd frontend
./scripts/docker-build-separate.sh
```

**Avantages**:
- ✅ Plus fiable pour connexions instables
- ✅ Build ARM64 d'abord, puis AMD64
- ✅ Peut reprendre où ça s'est arrêté

### 💻 Solution 3: Build Locale Uniquement

Pour développement/test sans push:

```bash
cd frontend

# Build locale ARM64 seulement (si Mac Silicon)
PUSH=false PLATFORMS=linux/arm64 ./scripts/docker-build-optimized.sh

# Test de l'image
docker run -p 3100:80 isopen/meeshy-web:latest

# Si OK, push manuellement
docker push isopen/meeshy-web:latest
```

## 📊 Commandes NPM/PNPM

Les scripts sont aussi disponibles via npm/pnpm:

```bash
cd frontend

# Build optimisée avec push
pnpm run docker:build

# Build locale rapide (ARM64 uniquement)
pnpm run docker:build:fast

# Build locale multi-plateforme
pnpm run docker:build:local

# Build séparée par plateforme
pnpm run docker:build:separate

# Build ancienne méthode (legacy)
pnpm run docker:build:legacy
```

## 🔧 Étapes à Suivre MAINTENANT

### Étape 1: Libérer de l'Espace Disque

```bash
# Voir l'utilisation Docker
docker system df

# Nettoyer (ATTENTION: supprime tout)
docker system prune -a --volumes

# Vérifier l'espace libéré
df -h
```

### Étape 2: Se Connecter à Docker Hub

```bash
docker login
# Username: [votre username]
# Password: [votre password ou token]
```

### Étape 3: Vérifier l'Environnement

```bash
cd frontend
./scripts/docker-build-diagnose.sh
```

Vous devriez voir:
```
✅ Aucun problème détecté!
✅ Vous pouvez lancer la build en toute sécurité
```

### Étape 4: Lancer la Build

```bash
# Méthode 1: Script optimisé (recommandé)
./scripts/docker-build-optimized.sh

# OU Méthode 2: Via pnpm
pnpm run docker:build

# OU Méthode 3: Build séparée (si timeout)
./scripts/docker-build-separate.sh
```

## ⏱️ Temps de Build Estimé

| Build | Première Fois | Suivantes |
|-------|--------------|-----------|
| Optimisée (avec cache) | ~15-20 min | ~2-5 min ⚡ |
| Séparée | ~20-30 min | ~20-30 min |
| Locale ARM64 | ~8-10 min | ~8-10 min |

## 🐛 Si Ça Ne Marche Toujours Pas

### Timeout après 60 secondes?

**Cause probable**: Connexion réseau lente

**Solution**:
```bash
# Utiliser la build séparée (plus tolérante)
./scripts/docker-build-separate.sh
```

### Erreur "insufficient_scope"?

**Cause**: Droits Docker Hub insuffisants

**Solution**:
```bash
docker logout
docker login
# Vérifiez que vous avez les droits sur isopen/meeshy-web
```

### Erreur "failed to solve with frontend dockerfile.v0"?

**Cause**: Cache buildx corrompu

**Solution**:
```bash
docker buildx prune -af
docker buildx rm meeshy-builder-fresh
docker buildx create --name meeshy-builder-fresh --bootstrap
docker buildx use meeshy-builder-fresh
```

## 📚 Documentation Complète

Pour plus de détails, voir: `DOCKER_BUILD_GUIDE.md`

## 💡 Astuces

### Build encore plus rapide en développement

```bash
# Build ARM64 uniquement (si Mac Silicon)
PUSH=false PLATFORMS=linux/arm64 ./scripts/docker-build-optimized.sh
```

### Vérifier l'image avant de push

```bash
# Build sans push
PUSH=false ./scripts/docker-build-optimized.sh

# Tester
docker run -p 3100:80 isopen/meeshy-web:latest

# Si OK, push
docker push isopen/meeshy-web:latest
```

### Utiliser un tag spécifique

```bash
DOCKER_TAG=v1.0.0 ./scripts/docker-build-optimized.sh
```

## 🎯 TL;DR

```bash
# Fix les problèmes
docker system prune -a --volumes  # Libérer de l'espace
docker login                      # Se connecter

# Vérifier
cd frontend
./scripts/docker-build-diagnose.sh

# Build
./scripts/docker-build-optimized.sh
```

C'est tout! 🚀

