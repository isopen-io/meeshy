# 🎯 Prêt à Déployer Staging

**Date:** 2026-01-25 23:20 UTC
**Status:** ✅ Configuration complète récupérée depuis production

---

## ✅ Fichiers de Configuration Récupérés

### 1. `.env.staging` - Configuration Staging Complète

**Source:** Production `/opt/meeshy/.env`
**Location:** `infrastructure/docker/compose/.env.staging`
**Taille:** 9.1 KB

**Adaptations pour staging:**
- `NODE_ENV="staging"` (au lieu de production)
- `DEBUG="true"` (logs détaillés)
- `LOG_LEVEL="debug"` (logs verbeux)
- Domaines: `staging.meeshy.me`, `gate.staging.meeshy.me`, etc.
- URLs CORS adaptées pour staging
- Ports: 8080/8443 (au lieu de 80/443)
- Services Docker: `-staging` suffix
- Backup désactivé (staging temporaire)
- Auto-scaling désactivé
- Debug tools activés

**Secrets conservés depuis production:**
- ✅ `JWT_SECRET` - Token JWT
- ✅ `MONGODB_PASSWORD` - MongoDB
- ✅ `REDIS_PASSWORD` - Redis
- ✅ `ADMIN_PASSWORD` - Utilisateur admin
- ✅ `MEESHY_PASSWORD` - Utilisateur meeshy
- ✅ `ATABETH_PASSWORD` - Utilisateur atabeth
- ✅ `TRAEFIK_USERS` - Basic Auth Traefik
- ✅ `MONGO_USERS` - Basic Auth MongoDB UI
- ✅ `REDIS_USERS` - Basic Auth Redis UI
- ✅ `API_USERS` - Basic Auth API
- ✅ Firebase configuration complète

### 2. `firebase-admin-sdk.json` - Credentials Firebase

**Source:** Production `/opt/meeshy/secrets/firebase-admin-sdk.json`
**Location:** `secrets/firebase-admin-sdk.json`
**Taille:** 2.3 KB

Credentials pour:
- Push notifications PWA
- Firebase Cloud Messaging
- Firebase Admin SDK

---

## 🚀 Déploiement Staging - Prêt!

Tous les fichiers nécessaires sont maintenant en place:

### Étape 1: Déployer Staging (15-20 min)

```bash
./infrastructure/scripts/deploy-staging.sh
```

**Ce script va:**
1. ✅ Vérifier que .env.staging existe (✅ fait!)
2. ✅ Créer la structure sur le serveur
3. ✅ Copier docker-compose.staging.yml
4. ✅ Copier .env.staging
5. ✅ Copier firebase-admin-sdk.json
6. ✅ Pull des images Docker
7. ✅ Créer les volumes staging
8. ✅ Optionnel: Copier modèles ML (~5GB)
9. ✅ Démarrer les services
10. ✅ Tests health checks

**URLs Staging après déploiement:**
- Frontend: https://staging.meeshy.me
- Gateway: https://gate.staging.meeshy.me
- ML Service: https://ml.staging.meeshy.me
- MongoDB UI: https://mongo.staging.meeshy.me (admin/admin)
- Redis UI: https://redis.staging.meeshy.me (admin/admin)
- Traefik: https://traefik.staging.meeshy.me (admin/admin)

### Étape 2: Migrer les Données (10-15 min)

```bash
./infrastructure/scripts/migrate-to-staging.sh
```

**Ce script va:**
1. 📦 Backup production MongoDB
2. 📥 Restaurer dans staging
3. 🧪 Dry-run migration
4. 🔄 Migration réelle (après confirmation)
5. ✅ Validation post-migration

### Étape 3: Valider Staging (30-60 min)

```bash
./infrastructure/scripts/validate-staging.sh
```

**Tests automatiques + manuels**

### Étape 4: Switch Production (≤10 min downtime)

```bash
./infrastructure/scripts/capture-pre-switch-state.sh
./infrastructure/scripts/switch-to-production.sh
```

---

## 📋 Credentials de Connexion

### Utilisateurs Test (même que production)

**Admin:**
- Username: `admin`
- Email: `admin@meeshy.me`
- Password: `YTSjTIeripnz6u2T7I4j`
- Role: ADMIN

**Meeshy (BIGBOSS):**
- Username: `meeshy`
- Email: `meeshy@meeshy.me`
- Password: `EgGFulMmmmB955zUd3TH`
- Role: BIGBOSS

**Atabeth:**
- Username: `atabeth`
- Email: `atabeth@meeshy.me`
- Password: `Lya636ThQ5v9UJ4pcFKY`
- Role: USER

### Interfaces Admin (Basic Auth)

**Credentials pour toutes les interfaces:**
- Username: `admin`
- Password: `admin`

**URLs:**
- MongoDB Express: https://mongo.staging.meeshy.me
- Redis Commander: https://redis.staging.meeshy.me
- Traefik Dashboard: https://traefik.staging.meeshy.me

---

## 🔒 Sécurité

**⚠️ IMPORTANT:**
- Les fichiers `.env.staging` et `secrets/firebase-admin-sdk.json` contiennent des secrets de production
- Ces fichiers sont dans `.gitignore` et ne seront JAMAIS commités
- Ne partagez jamais ces fichiers
- Ils sont identiques à la production pour faciliter les tests

**Après validation staging:**
- Si tout fonctionne, ces secrets seront utilisés en production
- Si problème de sécurité détecté, régénérer tous les secrets

---

## 📊 Comparaison Staging vs Production

| Aspect | Production | Staging |
|--------|-----------|---------|
| **Domaine** | meeshy.me | staging.meeshy.me |
| **Ports** | 80/443 | 8080/8443 |
| **MongoDB Port** | 27017 (interne) | 27018 (externe) |
| **Redis Port** | 6379 (interne) | 6380 (externe) |
| **Volumes** | `meeshy-*` | `meeshy-staging-*` |
| **Network** | `meeshy-network` | `meeshy-staging-network` |
| **Containers** | `meeshy-*` | `meeshy-*-staging` |
| **NODE_ENV** | production | staging |
| **DEBUG** | false | true |
| **LOG_LEVEL** | info | debug |
| **Backup** | Activé | Désactivé |
| **Auto-scaling** | Activé | Désactivé |
| **Secrets** | ✅ Identiques | ✅ Identiques |

---

## 🎯 Prochaines Étapes

### Maintenant: Déployer Staging

```bash
# 1. Déployer staging (15-20 min)
./infrastructure/scripts/deploy-staging.sh

# 2. Vérifier les logs
ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose logs -f"

# 3. Vérifier les services
ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose ps"

# 4. Tester les URLs
curl https://gate.staging.meeshy.me/health
curl https://ml.staging.meeshy.me/health
curl https://staging.meeshy.me
```

### Ensuite: Migrer les Données

```bash
./infrastructure/scripts/migrate-to-staging.sh
```

### Puis: Valider et Tester

```bash
./infrastructure/scripts/validate-staging.sh

# Tests manuels:
# - Login admin@meeshy.me
# - Envoyer un message
# - Tester traduction
# - Upload fichier
# - Vérifier communautés
```

### Enfin: Switch Production (≤10 min)

```bash
./infrastructure/scripts/capture-pre-switch-state.sh
./infrastructure/scripts/switch-to-production.sh
```

---

## 📚 Documentation

- **Guide complet:** `docs/infrastructure/MIGRATION-COMPLETE-GUIDE.md`
- **Stratégie:** `docs/infrastructure/migration-strategy.md`
- **État actuel:** `docs/infrastructure/current-state-analysis.md`
- **Staging ready:** `docs/infrastructure/STAGING-READY.md`

---

## 🐛 Troubleshooting

### Si staging ne démarre pas

```bash
# Vérifier les logs
ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose logs gateway"
ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose logs database-staging"

# Vérifier les services
ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose ps"

# Redémarrer un service
ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose restart gateway"
```

### Si migration échoue

```bash
# Re-lancer le dry-run
ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose exec -T gateway \
  tsx /app/migrations/migrate-from-legacy.ts --dry-run"

# Vérifier la connexion MongoDB
ssh root@meeshy.me "docker exec meeshy-database-staging mongosh meeshy --eval 'db.stats()'"
```

### Si switch production échoue

```bash
# Rollback complet disponible
# Voir: /opt/meeshy/pre-switch-snapshots/pre-switch-*/MANIFEST.md
```

---

**Status:** ✅ PRÊT À DÉPLOYER
**Prochaine action:** `./infrastructure/scripts/deploy-staging.sh`

**Dernière mise à jour:** 2026-01-25 23:20 UTC
