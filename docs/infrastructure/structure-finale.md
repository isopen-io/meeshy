# Structure d'Infrastructure Finale - Meeshy

**Date:** 2026-01-27
**Status:** ✅ Opérationnelle

---

## 📁 Arborescence Serveur

```
/opt/meeshy/
├── production/                    → 🟢 PRODUCTION (tourne en continu)
│   ├── docker-compose.yml         → Config production (name: meeshy)
│   ├── .env                       → Variables d'environnement
│   ├── secrets/                   → Secrets (JWT, API keys, etc.)
│   ├── config/
│   │   └── dynamic.yaml           → Configuration Traefik
│   ├── backups/                   → Backups MongoDB
│   │   └── migration-*.tar.gz     → Backup de migration staging→prod
│   ├── logs/                      → Logs application
│   ├── scripts/                   → Scripts utilitaires
│   └── shared/                    → Fichiers partagés
│
└── staging/                       → 🔵 STAGING (à démarrer au besoin)
    ├── docker-compose.yml         → Config staging (name: meeshy-staging)
    ├── .env                       → Variables staging
    ├── secrets/                   → Secrets staging
    ├── config/                    → Config staging
    ├── scripts/                   → Scripts de validation
    └── migrations/                → Scripts de migration
```

---

## 🐳 Services Production

### Commandes depuis `/opt/meeshy/production/`

```bash
# Démarrer la production
cd /opt/meeshy/production && docker compose up -d

# Arrêter la production
cd /opt/meeshy/production && docker compose down

# Redémarrer un service
cd /opt/meeshy/production && docker compose restart gateway

# Voir les logs
cd /opt/meeshy/production && docker compose logs -f gateway

# Voir le statut
cd /opt/meeshy/production && docker compose ps
```

### Conteneurs Production (name: meeshy)

| Conteneur | Port Externe | Status | Image |
|-----------|--------------|--------|-------|
| meeshy-traefik | 80, 443 | Running | traefik:v3.3 |
| meeshy-database | - | Healthy | mongo:8.0 |
| meeshy-redis | - | Healthy | redis:8-alpine |
| meeshy-gateway | - | Healthy | isopen/meeshy-gateway:latest |
| meeshy-frontend | - | Healthy | isopen/meeshy-web:latest |
| meeshy-translator | - | Healthy | isopen/meeshy-translator:latest |
| meeshy-static-files | - | Healthy | nginx:alpine |
| meeshy-nosqlclient | - | Healthy | mongoclient/mongoclient |
| meeshy-p3x-redis-ui | - | Running | patrikx3/p3x-redis-ui |

### Volumes Production (préfixe: meeshy_)

```
meeshy_database_data          → Données MongoDB (207 users, 125K docs)
meeshy_database_config        → Config MongoDB
meeshy_redis_data             → Cache Redis
meeshy_gateway_uploads        → Fichiers uploadés (gateway)
meeshy_frontend_uploads       → Fichiers uploadés (frontend)
meeshy_models_data            → Modèles ML (translator)
meeshy_traefik_certs          → Certificats SSL Let's Encrypt
```

### Réseau Production

```
meeshy_meeshy-network (bridge)
```

---

## 🧪 Services Staging

### Commandes depuis `/opt/meeshy/staging/`

```bash
# Démarrer le staging
cd /opt/meeshy/staging && docker compose up -d

# Arrêter le staging
cd /opt/meeshy/staging && docker compose down

# Supprimer staging + volumes
cd /opt/meeshy/staging && docker compose down -v

# Voir le statut
cd /opt/meeshy/staging && docker compose ps
```

### Conteneurs Staging (name: meeshy-staging)

Mêmes services que production mais avec suffixe `-staging` :
- meeshy-traefik-staging
- meeshy-database-staging
- meeshy-gateway-staging
- etc.

### Ports Staging (différents de production)

| Service | Port Staging | Port Production |
|---------|--------------|-----------------|
| HTTP | 8080 | 80 |
| HTTPS | 8443 | 443 |
| MongoDB | 27018 | 27017 (interne) |
| Redis | 6380 | 6379 (interne) |

### Domaines Staging

- Frontend: https://staging.meeshy.me (port 8443)
- API Gateway: https://gate.staging.meeshy.me (port 8443)

---

## 🔄 Workflow de Déploiement

### 1. Tester en Staging

```bash
# Démarrer staging
cd /opt/meeshy/staging
docker compose up -d

# Attendre le démarrage
sleep 30

# Valider
curl https://staging.meeshy.me:8443
curl https://gate.staging.meeshy.me:8443/health

# Tester les fonctionnalités
./scripts/validate-staging.sh
```

### 2. Migrer vers Production

```bash
# Depuis la machine locale
cd /Users/smpceo/Documents/v2_meeshy
./infrastructure/scripts/migrate-staging-to-prod.sh

# Redémarrer production
ssh root@meeshy.me "cd /opt/meeshy/production && docker compose restart gateway"
```

### 3. Valider Production

```bash
# Health check
curl https://gate.meeshy.me/health

# Vérifier les services
ssh root@meeshy.me "cd /opt/meeshy/production && docker compose ps"

# Vérifier les logs
ssh root@meeshy.me "cd /opt/meeshy/production && docker compose logs -f gateway --tail=50"
```

### 4. Arrêter Staging (optionnel)

```bash
ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose down"
```

---

## 🔐 Sécurité

### Secrets Production

Stockés dans `/opt/meeshy/production/secrets/` :
- `jwt-private.key` - Clé privée JWT
- `jwt-public.key` - Clé publique JWT
- `mongodb-root-password` - Mot de passe MongoDB root
- (autres secrets selon besoins)

### Secrets Staging

Stockés dans `/opt/meeshy/staging/secrets/` :
- Mêmes types de secrets mais **valeurs différentes** pour l'isolation

---

## 📊 État Actuel (2026-01-27)

### Production ✅

- **Status**: Opérationnelle
- **Schéma DB**: v1.0.0 (PascalCase, sans @@map)
- **Collections**: 28 collections migrées
- **Documents**: 124,896 documents
- **Utilisateurs**: 207
- **Uptime**: Stable
- **URLs**:
  - Frontend: https://meeshy.me
  - API: https://gate.meeshy.me

### Staging 🔵

- **Status**: Arrêtée (à démarrer au besoin)
- **Schéma DB**: Peut être recréée avec données de test
- **Ports**: 8080 (HTTP), 8443 (HTTPS)
- **URLs**:
  - Frontend: https://staging.meeshy.me:8443
  - API: https://gate.staging.meeshy.me:8443

---

## 🎯 Avantages de cette Structure

### ✅ Séparation Claire

- Production et staging sont des entités **complètement indépendantes**
- Chacun a son propre `name:` dans docker-compose
- Volumes, réseaux et conteneurs séparés

### ✅ Isolation Complète

- Staging peut être démarré/arrêté sans affecter production
- Ports différents = pas de conflit
- Volumes différents = pas de risque de perte de données

### ✅ Facilité de Gestion

```bash
# Production
cd /opt/meeshy/production && docker compose <commande>

# Staging
cd /opt/meeshy/staging && docker compose <commande>
```

### ✅ Sécurité

- Secrets séparés entre prod et staging
- Configuration réseau isolée
- Pas de risque de "tester en prod par erreur"

---

## 📝 Notes Importantes

1. **Backup Avant Migration**: Toujours créer un backup avant de migrer staging → prod
   ```bash
   ssh root@meeshy.me "docker exec meeshy-database mongodump --db=meeshy --out=/opt/meeshy/production/backups/pre-migration-$(date +%Y%m%d)"
   ```

2. **Volumes Existants**: Production utilise les volumes `meeshy_*` qui contiennent les données réelles

3. **Staging Jetable**: Staging peut être complètement supprimé et recréé au besoin :
   ```bash
   cd /opt/meeshy/staging && docker compose down -v
   ```

4. **Redémarrage Production**: Toujours depuis `/opt/meeshy/production/`

---

**Maintenu par:** Claude Sonnet 4.5
**Dernière mise à jour:** 2026-01-27
**Status:** ✅ Production opérationnelle, Staging prête à l'emploi
