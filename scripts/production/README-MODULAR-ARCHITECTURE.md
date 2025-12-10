# 🚀 Meeshy - Architecture Modulaire V2.0

## Vue d'ensemble

L'architecture modulaire Meeshy V2.0 a été conçue pour offrir une gestion flexible, traçable et maintenable des services. Cette architecture remplace le script monolithique `meeshy.sh` par un système modulaire composé de scripts spécialisés.

## 🏗️ Architecture

### Scripts Principaux

| Script | Description | Fonctionnalités |
|--------|-------------|-----------------|
| `meeshy.sh` | **Orchestrateur principal** | Point d'entrée unifié, routage vers les modules |
| `meeshy-config.sh` | **Configuration globale** | Variables partagées, traçabilité, logging |
| `meeshy-start.sh` | **Démarrage des services** | Démarrage séquentiel, téléchargement d'images |
| `meeshy-stop.sh` | **Arrêt des services** | Arrêt normal/forcé, nettoyage des volumes |
| `meeshy-status.sh` | **Surveillance** | Statut détaillé, santé des services, métriques |
| `meeshy-logs.sh` | **Gestion des logs** | Affichage, analyse, export des logs |
| `meeshy-maintenance.sh` | **Maintenance** | Nettoyage, sauvegarde, optimisation, sécurité |

### Scripts de Support

| Script | Description |
|--------|-------------|
| `meeshy-deploy.sh` | Déploiement en production (inchangé) |
| `simple-deploy-passwords.sh` | Déploiement des mots de passe Traefik |
| `test-modular-architecture.sh` | Tests de l'architecture modulaire |

## 🔧 Configuration et Traçabilité

### Variables de Traçabilité

```bash
MEESHY_VERSION="1.0.0"
MEESHY_DEPLOYMENT_ID="20250909_171213_Host-003.lan"
MEESHY_SCRIPT_VERSION="2.0.0-modular"
MEESHY_ENVIRONMENT="production"
MEESHY_BUILD_DATE="2025-09-09T15:12:13Z"
```

### Répertoires de Traçabilité

- **Logs** : `/var/log/meeshy` (production) ou `/tmp/meeshy/logs` (local)
- **Traces** : `/opt/meeshy/traces` (production) ou `/tmp/meeshy/traces` (local)
- **Sauvegardes** : `/opt/backups/meeshy` (production) ou `/tmp/meeshy/backups` (local)

### Système de Traçabilité

Chaque opération est tracée avec :
- Timestamp UTC
- ID de déploiement
- Nom de l'opération
- Statut (SUCCESS/FAILED/WARNING)
- Détails de l'opération

## 📋 Utilisation

### Commandes Principales

```bash
# Gestion des services
./meeshy.sh start [--no-pull] [--logs]
./meeshy.sh stop [--force] [--clean]
./meeshy.sh restart [--force]
./meeshy.sh status [--detailed] [--health] [--watch]
./meeshy.sh logs [service] [--follow] [--tail N]

# Maintenance
./meeshy.sh clean [--force]
./meeshy.sh backup [--force]
./meeshy.sh restore [--force]
./meeshy.sh update [--force]
./meeshy.sh health
./meeshy.sh optimize [--force]
./meeshy.sh security

# Utilitaires
./meeshy.sh info
./meeshy.sh version
./meeshy.sh trace [lines]
./meeshy.sh --help
```

### Exemples d'Utilisation

```bash
# Démarrage avec logs
./meeshy.sh start --logs

# Statut détaillé avec surveillance
./meeshy.sh status --detailed --watch

# Logs en temps réel du gateway
./meeshy.sh logs gateway --follow

# Sauvegarde forcée
./meeshy.sh backup --force

# Nettoyage complet
./meeshy.sh clean --force

# Vérification de santé
./meeshy.sh health
```

## 🔍 Fonctionnalités Avancées

### Surveillance Continue

```bash
# Surveillance en temps réel
./meeshy.sh status --watch

# Export du statut en JSON
./meeshy.sh status --export
```

### Analyse des Logs

```bash
# Analyse des erreurs des dernières 24h
./meeshy.sh logs gateway --analyze

# Export des logs
./meeshy.sh logs all --export /path/to/logs.txt
```

### Maintenance Avancée

```bash
# Mode simulation (dry-run)
./meeshy.sh clean --dry-run
./meeshy.sh backup --dry-run

# Optimisation des performances
./meeshy.sh optimize --force
```

## 🧪 Tests

### Test de l'Architecture

```bash
# Tester tous les modules
./test-modular-architecture.sh
```

### Tests Individuels

```bash
# Test d'un module spécifique
./meeshy-start.sh --help
./meeshy-status.sh --detailed
./meeshy-logs.sh --list
```

## 📊 Avantages de l'Architecture Modulaire

### 1. **Maintenabilité**
- Code organisé par fonctionnalité
- Scripts spécialisés et focalisés
- Réutilisation des composants

### 2. **Traçabilité**
- Traçage complet des opérations
- Logs structurés et horodatés
- Historique des déploiements

### 3. **Flexibilité**
- Modules indépendants
- Options spécialisées par module
- Extensibilité facile

### 4. **Robustesse**
- Gestion d'erreurs améliorée
- Vérifications préliminaires
- Mode simulation (dry-run)

### 5. **Performance**
- Chargement conditionnel des vérifications
- Optimisations par module
- Surveillance en temps réel

## 🔄 Migration depuis V1.0

### Commandes Compatibles

Toutes les commandes de l'ancien `meeshy.sh` sont compatibles :

```bash
# Ancien usage (toujours fonctionnel)
./meeshy.sh start
./meeshy.sh stop
./meeshy.sh status
./meeshy.sh logs

# Nouveaux usages
./meeshy.sh start --logs
./meeshy.sh status --detailed --watch
./meeshy.sh logs gateway --follow
```

### Nouvelles Fonctionnalités

- Traçabilité complète des opérations
- Surveillance en temps réel
- Analyse des logs
- Mode simulation
- Export des données
- Optimisations de performance

## 🚀 Déploiement

### Production

```bash
# Déploiement complet
./meeshy-deploy.sh deploy <IP_SERVEUR>

# Gestion des services
./meeshy.sh start
./meeshy.sh status --detailed
```

### Développement

```bash
# Test local
./test-modular-architecture.sh

# Utilisation des modules
./meeshy.sh info
./meeshy.sh version
```

## 📝 Logs et Traces

### Structure des Logs

```
/var/log/meeshy/
├── meeshy.log              # Log principal
└── session_*.log           # Logs de session

/opt/meeshy/traces/
├── operations.log          # Traces des opérations
└── session_*.log           # Traces de session
```

### Format des Traces

```
[2025-09-09T15:12:13Z] [20250909_171213_Host-003.lan] [start_services] [SUCCESS] Services started successfully
[2025-09-09T15:12:14Z] [20250909_171213_Host-003.lan] [status_check] [SUCCESS] Status check completed
```

## 🔧 Configuration

### Variables d'Environnement

```bash
# Configuration de base
PROJECT_DIR="/opt/meeshy"
COMPOSE_FILE="docker-compose.traefik.yml"
ENV_FILE="secrets/production-secrets.env"
DOMAIN="meeshy.me"

# Traçabilité
MEESHY_VERSION="1.0.0"
MEESHY_ENVIRONMENT="production"
MEESHY_DEPLOYMENT_ID="auto-generated"
```

### Personnalisation

Chaque module peut être personnalisé en modifiant les variables dans `meeshy-config.sh`.

## 🆘 Support

### Dépannage

```bash
# Vérifier l'état des modules
./meeshy.sh info

# Consulter les traces
./meeshy.sh trace 100

# Test de l'architecture
./test-modular-architecture.sh
```

### Logs de Debug

```bash
# Logs détaillés
./meeshy.sh logs all --tail 1000

# Analyse des erreurs
./meeshy.sh logs gateway --analyze --since 1h
```

---

## 📈 Roadmap

- [ ] Interface web de surveillance
- [ ] Alertes automatiques
- [ ] Métriques de performance
- [ ] Intégration avec des outils de monitoring
- [ ] API REST pour la gestion des services

---

**Version** : 2.0.0-modular  
**Date** : 2025-09-09  
**Architecture** : Modulaire avec traçabilité complète
