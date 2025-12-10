# Makefile pour Meeshy - Développement Local avec Docker
# Utilise les dernières images Docker pour un déploiement local complet

.PHONY: help start stop restart logs status pull clean reset health test

# Couleurs
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m # No Color

# Variables
COMPOSE_FILE := docker-compose.dev.yml
ENV_FILE := .env.dev
HEALTH_SCRIPT := ./health-check.sh

help: ## Afficher cette aide
	@echo "$(BLUE)╔══════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(BLUE)║        MEESHY - Commandes de Développement             ║$(NC)"
	@echo "$(BLUE)╚══════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-15s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BLUE)Services disponibles pour les logs:$(NC)"
	@echo "  - database, redis, translator, gateway, frontend"
	@echo "  - nosqlclient, p3x-redis-ui"
	@echo ""
	@echo "$(GREEN)Exemple: make logs SERVICE=gateway$(NC)"
	@echo ""

start: ## Démarrer tous les services
	@echo "$(BLUE)🚀 Démarrage de tous les services Meeshy...$(NC)"
	@docker-compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) up -d
	@echo ""
	@echo "$(GREEN)✨ Services démarrés avec succès!$(NC)"
	@echo ""
	@$(MAKE) urls

stop: ## Arrêter tous les services
	@echo "$(YELLOW)⏹️  Arrêt des services...$(NC)"
	@docker-compose -f $(COMPOSE_FILE) down
	@echo "$(GREEN)✓ Services arrêtés$(NC)"

restart: ## Redémarrer tous les services
	@echo "$(YELLOW)🔄 Redémarrage des services...$(NC)"
	@docker-compose -f $(COMPOSE_FILE) restart
	@echo "$(GREEN)✓ Services redémarrés$(NC)"

logs: ## Afficher les logs (optionnel: SERVICE=nom_service)
	@if [ -z "$(SERVICE)" ]; then \
		echo "$(BLUE)📋 Logs de tous les services (Ctrl+C pour quitter)...$(NC)"; \
		docker-compose -f $(COMPOSE_FILE) logs -f; \
	else \
		echo "$(BLUE)📋 Logs de $(SERVICE) (Ctrl+C pour quitter)...$(NC)"; \
		docker-compose -f $(COMPOSE_FILE) logs -f $(SERVICE); \
	fi

status: ## Afficher le statut des services
	@echo "$(BLUE)📊 Statut des services Meeshy:$(NC)"
	@echo ""
	@docker-compose -f $(COMPOSE_FILE) ps
	@echo ""

pull: ## Télécharger les dernières images Docker
	@echo "$(BLUE)📥 Téléchargement des dernières images...$(NC)"
	@docker-compose -f $(COMPOSE_FILE) pull
	@echo "$(GREEN)✓ Images mises à jour$(NC)"

clean: ## Supprimer tous les conteneurs et volumes
	@echo "$(RED)⚠️  ATTENTION: Cette action va supprimer tous les conteneurs et volumes!$(NC)"
	@read -p "Êtes-vous sûr ? (oui/non): " confirm && [ "$$confirm" = "oui" ] || (echo "Annulé" && exit 1)
	@echo "$(YELLOW)🧹 Nettoyage en cours...$(NC)"
	@docker-compose -f $(COMPOSE_FILE) down -v
	@echo "$(GREEN)✓ Nettoyage terminé$(NC)"

reset: ## Réinitialiser la base de données
	@echo "$(YELLOW)⚠️  Réinitialisation de la base de données...$(NC)"
	@read -p "Êtes-vous sûr ? (oui/non): " confirm && [ "$$confirm" = "oui" ] || (echo "Annulé" && exit 1)
	@FORCE_DB_RESET=true docker-compose -f $(COMPOSE_FILE) restart gateway
	@echo "$(GREEN)✓ Base de données réinitialisée$(NC)"

init-replica: ## Initialiser le replica set MongoDB
	@echo "$(BLUE)🔧 Initialisation du replica set MongoDB...$(NC)"
	@./check-replica-set.sh
	@echo "$(GREEN)✓ Replica set vérifié$(NC)"
	@echo "$(GREEN)✓ Base de données réinitialisée$(NC)"

health: ## Vérifier la santé de tous les services
	@echo "$(BLUE)🏥 Vérification de la santé des services...$(NC)"
	@$(HEALTH_SCRIPT)

test: health ## Alias pour health

urls: ## Afficher les URLs d'accès
	@echo "$(BLUE)📍 URLs d'accès:$(NC)"
	@echo "   - Frontend:        $(GREEN)http://localhost:3100$(NC)"
	@echo "   - Gateway API:     $(GREEN)http://localhost:3000$(NC)"
	@echo "   - Translator API:  $(GREEN)http://localhost:8000$(NC)"
	@echo "   - MongoDB UI:      $(GREEN)http://localhost:3001$(NC)"
	@echo "   - Redis UI:        $(GREEN)http://localhost:7843$(NC)"
	@echo ""
	@echo "$(BLUE)🔐 Utilisateurs par défaut:$(NC)"
	@echo "   - Admin:    admin@meeshy.local / admin123"
	@echo "   - Meeshy:   meeshy@meeshy.local / meeshy123"
	@echo "   - Atabeth:  atabeth@meeshy.local / atabeth123"
	@echo ""

dev: start health urls ## Démarrer et vérifier tous les services

quick: ## Démarrage rapide (pull + start + health)
	@$(MAKE) pull
	@$(MAKE) start
	@sleep 5
	@$(MAKE) health

build-gateway: ## Builder l'image Gateway localement
	@echo "$(BLUE)🔨 Build de l'image Gateway...$(NC)"
	@cd gateway && docker build -t isopen/meeshy-gateway:latest .
	@echo "$(GREEN)✓ Image Gateway buildée$(NC)"

build-translator: ## Builder l'image Translator localement
	@echo "$(BLUE)🔨 Build de l'image Translator...$(NC)"
	@cd translator && docker build -t isopen/meeshy-translator:latest .
	@echo "$(GREEN)✓ Image Translator buildée$(NC)"

build-frontend: ## Builder l'image Frontend localement
	@echo "$(BLUE)🔨 Build de l'image Frontend...$(NC)"
	@cd frontend && docker build -t isopen/meeshy-frontend:latest .
	@echo "$(GREEN)✓ Image Frontend buildée$(NC)"

build-all: build-gateway build-translator build-frontend ## Builder toutes les images localement
	@echo "$(GREEN)✨ Toutes les images ont été buildées avec succès!$(NC)"

ps: status ## Alias pour status

up: start ## Alias pour start

down: stop ## Alias pour stop

.DEFAULT_GOAL := help
