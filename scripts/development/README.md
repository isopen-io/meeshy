# Scripts de développement local

## Vue d'ensemble

Ces scripts permettent de démarrer et arrêter l'environnement de développement Meeshy en mode **local** (services natifs + infrastructure Docker).

## Scripts disponibles

### 1. `development-start-local.sh`

Démarre tous les services Meeshy en mode développement.

**Usage de base (services natifs uniquement) :**
```bash
./scripts/development/development-start-local.sh
```

**Avec conteneurs Docker :**
```bash
./scripts/development/development-start-local.sh --with-containers
```

**Aide :**
```bash
./scripts/development/development-start-local.sh --help
```

#### Comportement par défaut

- ✅ Démarre les services **natifs** (Node.js, Python)
  - Frontend (Next.js) sur port 3100
  - Gateway (Fastify) sur port 3000
  - Translator (FastAPI) sur port 8000
- ❌ **Ne démarre PAS** les conteneurs Docker
- ⚠️ **Vérifie** que MongoDB et Redis sont accessibles
  - Si non accessibles → erreur et arrêt
  - Message d'aide pour les démarrer manuellement

#### Avec option `--with-containers`

- ✅ Démarre les conteneurs Docker
  - MongoDB sur port 27017
  - Redis sur port 6379
- ✅ Initialise le replica set MongoDB
- ✅ Démarre les services natifs

#### Prérequis

- Node.js 22+
- pnpm
- Python 3.12+
- Docker et docker-compose

---

### 2. `development-stop-local.sh`

Arrête tous les services Meeshy démarrés par le script de démarrage.

**Usage de base (services natifs uniquement) :**
```bash
./scripts/development/development-stop-local.sh
```

**Avec conteneurs Docker :**
```bash
./scripts/development/development-stop-local.sh --with-containers
```

**Aide :**
```bash
./scripts/development/development-stop-local.sh --help
```

#### Comportement par défaut

- ✅ Arrête les services **natifs** (Node.js, Python)
  - Frontend (PID)
  - Gateway (PID)
  - Translator (PID)
- ✅ Libère les ports 3000, 3100, 8000
- ✅ Nettoie les fichiers de logs
- ❌ **Ne touche PAS** aux conteneurs Docker
  - MongoDB et Redis restent actifs

#### Avec option `--with-containers`

- ✅ Arrête les services natifs
- ✅ **Arrête aussi** les conteneurs Docker
  - MongoDB
  - Redis

---

## Scénarios d'utilisation

### Scénario 1 : Développement normal (recommandé)

**Objectif :** Travailler sur le code sans redémarrer MongoDB/Redis à chaque fois.

**Setup initial (une fois) :**
```bash
# Démarrer MongoDB et Redis
docker-compose -f docker-compose.local.yml up -d

# Initialiser le replica set MongoDB (si nécessaire)
docker exec meeshy-dev-database mongosh --eval 'rs.initiate({_id: "rs0", members: [{_id: 0, host: "localhost:27017"}]})'
```

**Workflow quotidien :**
```bash
# Démarrer les services
./scripts/development/development-start-local.sh

# Travailler...

# Arrêter les services (MongoDB/Redis restent actifs)
./scripts/development/development-stop-local.sh

# Redémarrer rapidement sans attendre MongoDB/Redis
./scripts/development/development-start-local.sh
```

**Avantages :**
- ⚡ Démarrage ultra-rapide (5-10 secondes au lieu de 30-60 secondes)
- 💾 Données persistantes entre les redémarrages
- 🔄 Pas besoin de réinitialiser le replica set MongoDB

---

### Scénario 2 : Démarrage complet (from scratch)

**Objectif :** Tout démarrer depuis zéro (première utilisation ou après un reboot).

```bash
# Démarrer TOUT (conteneurs + services)
./scripts/development/development-start-local.sh --with-containers

# Travailler...

# Arrêter TOUT
./scripts/development/development-stop-local.sh --with-containers
```

**Avantages :**
- 🎯 Un seul script pour tout gérer
- 🧹 Environnement propre à chaque démarrage
- 📦 Idéal pour les tests de déploiement

---

### Scénario 3 : Redémarrage rapide d'un service spécifique

**Objectif :** Redémarrer uniquement le Frontend ou le Gateway sans tout arrêter.

```bash
# Identifier le PID du service
ps aux | grep "next.*start"  # Frontend
ps aux | grep "node.*gateway"  # Gateway
ps aux | grep "python.*main.py"  # Translator

# Arrêter le service
kill <PID>

# Dans le terminal du script de démarrage, le service sera automatiquement détecté comme arrêté
# Relancer manuellement :
cd frontend && pnpm run dev > frontend.log 2>&1 &
# OU
cd gateway && pnpm run dev > gateway.log 2>&1 &
# OU
cd translator && source venv/bin/activate && python3 src/main.py > translator.log 2>&1 &
```

---

## Gestion des conteneurs Docker

### Démarrer MongoDB et Redis manuellement

```bash
# Démarrer les conteneurs
docker-compose -f docker-compose.local.yml up -d

# Vérifier le statut
docker-compose -f docker-compose.local.yml ps

# Voir les logs
docker-compose -f docker-compose.local.yml logs -f
```

### Arrêter MongoDB et Redis manuellement

```bash
# Arrêter sans supprimer
docker-compose -f docker-compose.local.yml stop

# Arrêter et supprimer
docker-compose -f docker-compose.local.yml down

# Arrêter, supprimer ET supprimer les volumes (⚠️ perte de données)
docker-compose -f docker-compose.local.yml down -v
```

### Vérifier que les conteneurs sont actifs

```bash
# Vérifier MongoDB
docker exec meeshy-dev-database mongosh --eval "db.runCommand({ping: 1})"

# Vérifier Redis
docker exec meeshy-dev-redis redis-cli ping
```

---

## Logs des services

### Voir les logs en temps réel

```bash
# Frontend
tail -f frontend/frontend.log

# Gateway
tail -f gateway/gateway.log

# Translator
tail -f translator/translator.log

# Tous en même temps
tail -f frontend/frontend.log gateway/gateway.log translator/translator.log
```

### Logs Docker

```bash
# MongoDB
docker logs -f meeshy-dev-database

# Redis
docker logs -f meeshy-dev-redis
```

---

## Troubleshooting

### Erreur : "MongoDB n'est pas accessible"

**Problème :** MongoDB n'est pas démarré ou le replica set n'est pas initialisé.

**Solutions :**
```bash
# Option 1 : Démarrer avec --with-containers
./scripts/development/development-start-local.sh --with-containers

# Option 2 : Démarrer MongoDB manuellement
docker-compose -f docker-compose.local.yml up -d
docker exec meeshy-dev-database mongosh --eval 'rs.initiate({_id: "rs0", members: [{_id: 0, host: "localhost:27017"}]})'
./scripts/development/development-start-local.sh
```

### Erreur : "Port déjà utilisé"

**Problème :** Un service est déjà en cours d'exécution sur le port.

**Solutions :**
```bash
# Arrêter tous les services
./scripts/development/development-stop-local.sh

# Vérifier les ports
lsof -ti:3000  # Gateway
lsof -ti:3100  # Frontend
lsof -ti:8000  # Translator

# Forcer l'arrêt si nécessaire
kill -9 $(lsof -ti:3000)
```

### Erreur : "Service s'arrête immédiatement"

**Problème :** Le service crash au démarrage.

**Solutions :**
```bash
# Voir les logs
tail -f <service>/service.log

# Exemples courants :
# - Dépendances manquantes → pnpm install
# - Prisma non généré → cd gateway && pnpm run generate:prisma
# - Environnement Python manquant → cd translator && python3 -m venv venv
```

---

## Recommandations

### Pour le développement quotidien

1. **Démarrer les conteneurs une fois** :
   ```bash
   docker-compose -f docker-compose.local.yml up -d
   ```

2. **Utiliser les scripts sans --with-containers** :
   ```bash
   ./scripts/development/development-start-local.sh
   # Travailler...
   ./scripts/development/development-stop-local.sh
   ```

3. **Arrêter les conteneurs en fin de journée** (optionnel) :
   ```bash
   docker-compose -f docker-compose.local.yml stop
   ```

### Avantages de cette approche

- ⚡ **Démarrage rapide** : 5-10 secondes au lieu de 30-60 secondes
- 💾 **Données persistantes** : MongoDB/Redis gardent les données entre redémarrages
- 🔄 **Itération rapide** : Redémarrer uniquement les services applicatifs
- 💻 **Ressources** : Économie de ressources (pas de redémarrage conteneurs)

---

## Commandes utiles

### Vérifier l'état des services

```bash
# Vérifier les processus
ps aux | grep -E "next|gateway|translator|python|node"

# Vérifier les ports
lsof -i:3000  # Gateway
lsof -i:3100  # Frontend
lsof -i:8000  # Translator
lsof -i:27017 # MongoDB
lsof -i:6379  # Redis

# Vérifier les conteneurs
docker-compose -f docker-compose.local.yml ps
```

### Nettoyage complet

```bash
# Arrêter tout
./scripts/development/development-stop-local.sh --with-containers

# Supprimer les logs
rm -f frontend/frontend.log gateway/gateway.log translator/translator.log

# Supprimer les conteneurs et volumes (⚠️ perte de données)
docker-compose -f docker-compose.local.yml down -v

# Supprimer les dépendances
rm -rf frontend/node_modules gateway/node_modules translator/venv

# Supprimer le cache Next.js
rm -rf frontend/.next
```

---

## Structure des fichiers créés

```
meeshy/
├── .env.local                    # Config racine
├── frontend/
│   ├── .env.local               # Config Frontend
│   └── frontend.log             # Logs Frontend
├── gateway/
│   ├── .env.local               # Config Gateway
│   └── gateway.log              # Logs Gateway
└── translator/
    ├── .env.local               # Config Translator
    └── translator.log           # Logs Translator
```

---

## Notes importantes

1. **Fichiers .env.local** : Générés automatiquement par le script de démarrage
2. **Logs** : Stockés dans chaque répertoire de service
3. **PIDs** : Affichés au démarrage pour pouvoir arrêter manuellement si nécessaire
4. **Ctrl+C** : Arrête proprement tous les services (cleanup automatique)
5. **Monitoring** : Le script surveille les services et alerte s'ils s'arrêtent

---

## Date de création

2025-10-16

## Auteur

Scripts de développement Meeshy
