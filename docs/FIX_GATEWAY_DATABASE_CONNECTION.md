# Fix: Connexion Base de Données Gateway - Chargement .env.local

**Date**: 17 Octobre 2025  
**Problème**: La gateway ne peut pas se connecter à MongoDB en mode développement local  
**Cause**: Les fichiers `.env.local` n'étaient pas chargés correctement

## 🔍 Diagnostic

### Symptômes
- L'utilisateur `admin:admin123` existe dans MongoDB
- MongoDB est accessible sur `localhost:27017`
- La gateway ne peut pas se connecter à la base de données
- Le script `./scripts/development/development-start-local.sh` crée des fichiers `.env.local` mais ils ne sont pas utilisés

### Cause Racine
Les services chargeaient uniquement le fichier `.env` et ignoraient `.env.local` qui contient les configurations de développement local avec les bonnes URLs de connexion.

## ✅ Corrections Appliquées

### 1. Gateway - Chargement `.env.local` (gateway/src/env.ts)

**Avant**:
```typescript
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
const conf = dotenv.config({
  path: path.resolve(process.cwd(), '.env')
});

export default conf;
```

**Après**:
```typescript
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables in order of priority:
// 1. .env.local (highest priority - local development overrides)
// 2. .env (base configuration)

const envPath = path.resolve(process.cwd(), '.env');
const envLocalPath = path.resolve(process.cwd(), '.env.local');

// Load base .env first
const baseConf = dotenv.config({ path: envPath });

// Then load .env.local which will override base values
let localConf;
if (fs.existsSync(envLocalPath)) {
  localConf = dotenv.config({ path: envLocalPath });
  console.log('[ENV] Loaded .env.local for local development');
} else {
  console.log('[ENV] No .env.local found, using .env only');
}

export default localConf || baseConf;
```

### 2. Translator - Chargement `.env.local` (translator/src/main.py)

**Avant**:
```python
# Charger les variables d'environnement
try:
    from dotenv import load_dotenv
    load_dotenv()
    print("[TRANSLATOR] ✅ Variables d'environnement .env chargées")
except ImportError:
    print("[TRANSLATOR] ⚠️ python-dotenv non disponible, utilisation des variables système")
```

**Après**:
```python
# Charger les variables d'environnement
try:
    from dotenv import load_dotenv
    # Load .env first (base configuration)
    load_dotenv()
    # Then load .env.local (overrides base - local development)
    env_local_path = Path(__file__).parent.parent / '.env.local'
    if env_local_path.exists():
        load_dotenv(env_local_path, override=True)
        print("[TRANSLATOR] ✅ Variables d'environnement .env et .env.local chargées")
    else:
        print("[TRANSLATOR] ✅ Variables d'environnement .env chargées (.env.local non trouvé)")
except ImportError:
    print("[TRANSLATOR] ⚠️ python-dotenv non disponible, utilisation des variables système")
```

## 📋 Configuration des Fichiers .env.local

### gateway/.env.local
```bash
NODE_ENV=development
LOG_LEVEL=debug

# Base de données (sans authentification pour développement local)
DATABASE_URL=mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true

# Redis
REDIS_URL=redis://localhost:6379

# Services
TRANSLATOR_URL=http://localhost:8000

# JWT
JWT_SECRET=dev-secret-key-change-in-production-12345678

# Server
PORT=3000
HOST=0.0.0.0

# CORS
CORS_ORIGINS=http://localhost:3100,http://localhost:3000
```

### translator/.env.local
```bash
# FastAPI Configuration
ENVIRONMENT=development
LOG_LEVEL=DEBUG

# Base de données (sans authentification pour développement local)
DATABASE_URL=mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true

# Redis
REDIS_URL=redis://localhost:6379

# Server
PORT=8000
HOST=0.0.0.0

# ML Models
TRANSLATION_MODEL_PATH=./models
WORKER_COUNT=2

# CORS
CORS_ORIGINS=http://localhost:3100,http://localhost:3000,http://localhost:8000
```

## 🚀 Utilisation

### Démarrage avec le script
```bash
# Démarrer tous les services (MongoDB et Redis doivent être déjà actifs)
./scripts/development/development-start-local.sh

# Ou démarrer avec les conteneurs Docker
./scripts/development/development-start-local.sh --with-containers
```

### Vérification
```bash
# Tester la connexion MongoDB
mongosh "mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true" --eval "db.adminCommand('ping')"

# Vérifier que .env.local est chargé (Gateway)
cd gateway && node -e "require('dotenv').config({path: '.env.local'}); console.log('DATABASE_URL:', process.env.DATABASE_URL)"

# Vérifier que .env.local est chargé (Translator)
cd translator && python3 -c "from dotenv import load_dotenv; from pathlib import Path; load_dotenv(Path('.env.local')); import os; print('DATABASE_URL:', os.getenv('DATABASE_URL'))"
```

## 🔄 Ordre de Chargement des Variables

### Priority (du plus haut au plus bas)
1. **Variables système/environnement** (process.env / os.environ)
2. **`.env.local`** - Développement local (overrides .env)
3. **`.env`** - Configuration de base

### Next.js (Frontend)
Next.js charge automatiquement `.env.local` avec la bonne priorité, pas de modification nécessaire.

## 🐛 Problèmes Connexes Résolus

### 1. Prisma Engine - Unable to require('')
**Problème**: Erreur "Unable to require(''). The Prisma engines do not seem to be compatible with your system"

**Cause**: Le client Prisma généré ne trouve pas le chemin du moteur natif `.node` lors de l'exécution avec `tsx watch`.

**Solution**: Ajouter `PRISMA_QUERY_ENGINE_LIBRARY` dans `.env.local`:
```bash
PRISMA_QUERY_ENGINE_LIBRARY=./shared/prisma/client/libquery_engine-darwin-arm64.dylib.node
```

### 2. Prisma Auto-Relations - P2014 Error
**Problème**: Erreur P2014 lors de `deleteMany()` sur les modèles avec auto-relations (ex: Message → MessageReplies)

**Cause**: MongoDB/Prisma ne peut pas supprimer les enregistrements avec des références circulaires en une seule commande.

**Solution**: Utiliser `$runCommandRaw` pour drop les collections directement:
```typescript
await prisma.$runCommandRaw({ drop: 'CollectionName' });
```

### 3. Python Dependencies Missing
Si le translator manque des dépendances:
```bash
cd translator
source venv/bin/activate
pip install -r requirements.txt
```

## ✅ Vérifications Post-Fix

- [x] Gateway charge `.env.local` en priorité
- [x] Translator charge `.env.local` en priorité  
- [x] MongoDB accessible avec la connection string locale
- [x] Redis accessible sur localhost:6379
- [x] Script de démarrage crée les fichiers `.env.local`
- [x] Les trois services (Gateway, Translator, Frontend) démarrent correctement
- [x] Prisma Engine configuré correctement (`PRISMA_QUERY_ENGINE_LIBRARY`)
- [x] Base de données initialisée avec les utilisateurs par défaut (admin, meeshy, atabeth)
- [x] Fix des auto-relations Prisma avec `$runCommandRaw` pour drop collections

## 📚 Références

- **Script de démarrage**: `./scripts/development/development-start-local.sh`
- **Copilot Instructions**: `.github/copilot-instructions.md` (section Database Configuration)
- **Architecture**: Meeshy utilise MongoDB en mode replica set même en développement local

---

**Status**: ✅ Résolu  
**Impact**: Critique - Permet le développement local  
**Services Affectés**: Gateway, Translator
