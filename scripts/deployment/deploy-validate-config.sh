#!/bin/bash

# ===== MEESHY - VALIDATION DE CONFIGURATION PRÉ-DÉPLOIEMENT =====
# Script de validation des variables d'environnement avant déploiement en production
# Usage: ./deploy-validate-config.sh [ENV_FILE]
#        ./deploy-validate-config.sh --self-test
#
# CE SCRIPT NE TIENT AUCUNE LISTE [#4544]
#
# Il en tenait une, et elle divergeait des deux autres. Mesuré : elle exigeait
# MEESHY_BIGBOSS_PASSWORD — un nom qu'AUCUN service ne lit (le seul lecteur du
# dépôt est scripts/publish-announcements.sh, qui le RECOPIE dans MEESHY_PASSWORD
# comme alias hérité) — ignorait ATABETH_PASSWORD, et ne vérifiait aucune liste
# d'origines. Un validateur qui peut PASSER là où le vrai nom manque et ÉCHOUER
# sur un hôte correctement provisionné ne valide rien : il fabrique de la
# confiance. Sa liste de mots de passe « par défaut » avait la même maladie —
# elle ignorait bigboss123, le repli exact de InitService.ts:147.
#
# La liste des variables exigées, leur nature (secret ou non) et les valeurs de
# repli à refuser sont donc DÉRIVÉES de la garde des compositions :
#   node scripts/check-compose-required-vars.mjs --required-vars
# Une seule déclaration existe, celle de la table SUBSTITUTIONS de la garde.
# Ajouter une bloquante là-bas la rend exigible ici sans écrire une ligne de ce
# fichier — c'est ce que prouve --self-test, en injectant dans une COPIE de la
# garde un nom tiré au hasard et en vérifiant que ce script l'exige.
#
# FAIL-CLOSED : garde absente, node absent, ou dérivation vide ⇒ le validateur
# ÉCHOUE. Aucun repli sur une liste locale — un repli local serait la quatrième
# copie, et elle divergerait à son tour.
#
# NOTE SUR set -e ET LES COMPTEURS
#
# Les compteurs s'incrémentaient par ((CHECKS++)). Avec CHECKS=0, la
# post-incrémentation vaut 0, l'expression arithmétique rend le statut 1, et
# set -e TUAIT le script sur le tout premier log_check. Mesuré : le validateur
# sortait en rc=1 après avoir affiché sa première ligne, sans jamais exécuter
# le corps d'une seule validation — et deploy-orchestrator.sh (lignes 87 et 149)
# annulait donc TOUT déploiement à l'étape 0. Un contrôle inerte, qui échouait
# fermé pour la mauvaise raison. Les incréments s'écrivent X=$((X + 1)).

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELF="$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GUARD_REEL="$REPO_ROOT/scripts/check-compose-required-vars.mjs"

# Seule couture du script : --self-test la détourne vers une COPIE de la garde
# pour prouver la dérivation. Elle est ANNONCÉE dans la sortie, jamais muette.
COMPOSE_GUARD="${MEESHY_COMPOSE_GUARD:-$GUARD_REEL}"

# La déclaration servie par la garde, une ligne par variable.
REQUIRED_SPEC=""

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Compteurs de validation
ERRORS=0
WARNINGS=0
CHECKS=0

# Fonctions utilitaires
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    WARNINGS=$((WARNINGS + 1))
}
log_error() {
    echo -e "${RED}❌ $1${NC}"
    ERRORS=$((ERRORS + 1))
}
log_check() {
    echo -e "${CYAN}🔍 $1${NC}"
    CHECKS=$((CHECKS + 1))
}

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🛡️ MEESHY - VALIDATION DE CONFIGURATION PRÉ-DÉPLOIEMENT${NC}"
    echo "============================================================"
    echo ""
    echo "Usage: $0 [ENV_FILE]"
    echo ""
    echo "Description:"
    echo "  Valide les variables d'environnement avant déploiement en production"
    echo "  Vérifie les configurations critiques pour éviter les erreurs de déploiement"
    echo ""
    echo "Arguments:"
    echo "  ENV_FILE     Chemin vers le fichier .env (défaut: env.production)"
    echo "  --self-test  Prouve que la liste des variables exigées est DÉRIVÉE"
    echo "               de la garde des compositions, et non recopiée ici"
    echo ""
    echo "Validations effectuées:"
    echo "  • FORCE_DB_RESET doit être false en production"
    echo "  • URLs doivent correspondre à l'environnement (https pour production)"
    echo "  • Toute variable BLOQUANTE des compositions est posée et non vide"
    echo "  • Aucune ne porte la valeur de repli que le code servirait sans elle"
    echo "  • Configuration SSL/TLS appropriée"
    echo "  • Configuration de base de données correcte"
    echo ""
    echo "Source des variables exigées:"
    echo "  node scripts/check-compose-required-vars.mjs --required-vars"
    echo "  Ce script n'en tient AUCUNE copie (voir #4544)."
    echo ""
}

# Charger le fichier d'environnement
load_env_file() {
    local env_file="$1"
    
    if [ ! -f "$env_file" ]; then
        log_error "Fichier $env_file non trouvé"
        exit 1
    fi
    
    log_info "Chargement du fichier: $env_file"
    
    # Charger les variables sans les exporter (pour éviter de polluer l'environnement actuel).
    #
    # Sans eval : `eval "ENV_$key=\"$value\""` faisait RÉINTERPRÉTER la valeur par
    # le shell. Un secret contenant $ ou ` était tronqué ou substitué, et un
    # secret contenant " cassait la commande — sous set -e, le validateur mourait
    # sur le mot de passe qu'il devait justement mesurer. `xargs` ajoutait sa
    # propre relecture des guillemets. Un validateur qui déforme la valeur qu'il
    # valide ne mesure rien : printf -v pose la chaîne EXACTE.
    local line key value
    while IFS= read -r line || [ -n "$line" ]; do
        line="${line%$'\r'}"
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
        key="${BASH_REMATCH[1]}"
        value="${BASH_REMATCH[2]}"
        # Espaces de bordure, puis UNE paire de guillemets englobants.
        value="${value#"${value%%[![:space:]]*}"}"
        value="${value%"${value##*[![:space:]]}"}"
        if [ ${#value} -ge 2 ] && [[ "$value" == \"*\" ]]; then
            value="${value:1:${#value}-2}"
        elif [ ${#value} -ge 2 ] && [[ "$value" == \'*\' ]]; then
            value="${value:1:${#value}-2}"
        fi
        printf -v "ENV_$key" '%s' "$value"
    done < "$env_file"
}

# Charger la déclaration des variables exigées — depuis la garde, jamais d'ici.
#
# Fail-closed sur les trois façons dont la source peut manquer. Un repli sur une
# liste écrite ici ressusciterait exactement le défaut de #4544 : une copie qui
# coïncide le jour où on l'écrit, et diverge ensuite en silence.
load_required_vars() {
    log_check "Chargement des variables exigées par les compositions"

    if ! command -v node >/dev/null 2>&1; then
        log_error "node est introuvable — la déclaration des variables exigées ne peut pas être lue"
        log_error "  Ce script ne tient aucune liste de secours (voir #4544). Installez node."
        return 1
    fi

    if [ ! -f "$COMPOSE_GUARD" ]; then
        log_error "Garde des compositions introuvable: $COMPOSE_GUARD"
        log_error "  C'est elle qui déclare les variables exigées. Sans elle, rien à valider."
        return 1
    fi

    if ! REQUIRED_SPEC="$(node "$COMPOSE_GUARD" --required-vars 2>&1)"; then
        log_error "La garde des compositions n'a pas pu dériver les variables exigées"
        log_error "  $COMPOSE_GUARD --required-vars"
        echo "$REQUIRED_SPEC"
        return 1
    fi

    if [ -z "$REQUIRED_SPEC" ]; then
        log_error "Dérivation vide: aucune variable exigée n'a été servie par la garde"
        log_error "  Un validateur qui n'exige rien passe toujours. Refus."
        return 1
    fi

    log_success "$(printf '%s\n' "$REQUIRED_SPEC" | wc -l | tr -d ' ') variable(s) exigée(s), dérivées de $COMPOSE_GUARD"
}

# Validation critique: FORCE_DB_RESET
validate_force_db_reset() {
    log_check "Validation de FORCE_DB_RESET"
    
    if [ "$ENV_NODE_ENV" == "production" ] || [ "$ENV_DEPLOYMENT_ENV" == "production" ] || [ "$ENV_DEPLOYMENT_ENV" == "digitalocean" ]; then
        if [ "$ENV_FORCE_DB_RESET" == "true" ]; then
            log_error "FORCE_DB_RESET=true détecté en PRODUCTION!"
            log_error "  Cette configuration SUPPRIMERA TOUTES les données de production!"
            log_error "  Changez FORCE_DB_RESET=false dans votre fichier .env"
            return 1
        else
            log_success "FORCE_DB_RESET=$ENV_FORCE_DB_RESET (OK pour production)"
        fi
    else
        if [ "$ENV_FORCE_DB_RESET" == "true" ]; then
            log_warning "FORCE_DB_RESET=true détecté en développement"
            log_warning "  Les données seront réinitialisées au démarrage"
        else
            log_success "FORCE_DB_RESET=$ENV_FORCE_DB_RESET"
        fi
    fi
}

# Validation des URLs
validate_urls() {
    log_check "Validation des URLs"
    
    local is_production=false
    if [ "$ENV_NODE_ENV" == "production" ] || [ "$ENV_DEPLOYMENT_ENV" == "production" ] || [ "$ENV_DEPLOYMENT_ENV" == "digitalocean" ]; then
        is_production=true
    fi
    
    # Vérifier INTERNAL_BACKEND_URL
    if [ -n "$ENV_INTERNAL_BACKEND_URL" ]; then
        if $is_production; then
            if [[ "$ENV_INTERNAL_BACKEND_URL" =~ ^http:// ]]; then
                log_error "INTERNAL_BACKEND_URL utilise HTTP en production: $ENV_INTERNAL_BACKEND_URL"
                log_error "  Utilisez HTTPS pour la production (ex: https://gate.meeshy.me)"
            elif [[ "$ENV_INTERNAL_BACKEND_URL" =~ gateway:3000 ]]; then
                log_error "INTERNAL_BACKEND_URL utilise l'URL interne Docker en production: $ENV_INTERNAL_BACKEND_URL"
                log_error "  Utilisez l'URL publique pour la production (ex: https://gate.meeshy.me)"
            elif [[ "$ENV_INTERNAL_BACKEND_URL" =~ ^https:// ]]; then
                log_success "INTERNAL_BACKEND_URL=$ENV_INTERNAL_BACKEND_URL (HTTPS OK)"
            else
                log_warning "INTERNAL_BACKEND_URL format inattendu: $ENV_INTERNAL_BACKEND_URL"
            fi
        else
            log_success "INTERNAL_BACKEND_URL=$ENV_INTERNAL_BACKEND_URL"
        fi
    else
        log_warning "INTERNAL_BACKEND_URL non définie"
    fi
    
    # Vérifier INTERNAL_WS_URL
    if [ -n "$ENV_INTERNAL_WS_URL" ]; then
        if $is_production; then
            if [[ "$ENV_INTERNAL_WS_URL" =~ ^ws:// ]]; then
                log_error "INTERNAL_WS_URL utilise WS en production: $ENV_INTERNAL_WS_URL"
                log_error "  Utilisez WSS pour la production (ex: wss://gate.meeshy.me)"
            elif [[ "$ENV_INTERNAL_WS_URL" =~ gateway:3000 ]]; then
                log_error "INTERNAL_WS_URL utilise l'URL interne Docker en production: $ENV_INTERNAL_WS_URL"
                log_error "  Utilisez l'URL publique pour la production (ex: wss://gate.meeshy.me)"
            elif [[ "$ENV_INTERNAL_WS_URL" =~ ^wss:// ]]; then
                log_success "INTERNAL_WS_URL=$ENV_INTERNAL_WS_URL (WSS OK)"
            else
                log_warning "INTERNAL_WS_URL format inattendu: $ENV_INTERNAL_WS_URL"
            fi
        else
            log_success "INTERNAL_WS_URL=$ENV_INTERNAL_WS_URL"
        fi
    else
        log_warning "INTERNAL_WS_URL non définie"
    fi
}

# Validation des variables exigées par les compositions
#
# Aucun nom n'est écrit ici. Chaque ligne de REQUIRED_SPEC porte, séparés par
# une tabulation : le NOM, « secret » ou « libre », puis les valeurs de repli
# que le code servirait si la variable manquait — celles qu'un hôte ne doit
# jamais poser à la main.
validate_required_vars() {
    log_check "Validation des variables exigées par les compositions"

    local ligne champs var nature nom_var valeur repli sur_repli
    while IFS= read -r ligne; do
        [ -n "$ligne" ] || continue
        champs=()
        IFS=$'\t' read -r -a champs <<< "$ligne" || true
        var="${champs[0]}"
        nature="${champs[1]:-libre}"
        local replis=("${champs[@]:2}")

        # Expansion INDIRECTE, pas eval : la valeur n'est jamais réinterprétée.
        nom_var="ENV_$var"
        valeur="${!nom_var}"

        if [ -z "$valeur" ]; then
            log_error "$var est absente ou vide"
            log_error "  Exigée parce qu'un fichier de composition qui DÉPLOIE la substitue en forme à refus."
            continue
        fi

        # Le repli MESURÉ du code, refusé nommément.
        sur_repli=false
        for repli in ${replis[@]+"${replis[@]}"}; do
            [ -n "$repli" ] || continue
            case "$valeur" in
                *"$repli"*)
                    log_error "$var porte le repli que le code servirait sans elle: $repli"
                    log_error "  Poser une vraie valeur — celle-ci est publiée dans le dépôt."
                    sur_repli=true
                    break
                    ;;
            esac
        done
        if $sur_repli; then
            continue
        fi

        # Convention de gabarit du dépôt (.env.staging.template, publish-announcements.sh) :
        # une valeur encore marquée CHANGE_ME n'a pas été provisionnée. Une RÈGLE, pas une liste.
        case "$valeur" in
            *CHANGE_ME*)
                log_error "$var porte encore un marqueur de gabarit: $valeur"
                continue
                ;;
        esac

        if [ "$nature" == "secret" ] && [ ${#valeur} -lt 8 ]; then
            log_warning "$var est trop court (${#valeur} caractères, minimum 8 recommandé)"
            continue
        fi

        if [ "$nature" == "secret" ]; then
            log_success "$var configurée (${#valeur} caractères)"
        else
            log_success "$var configurée"
        fi
    done <<< "$REQUIRED_SPEC"
}

# Validation de l'environnement
validate_environment() {
    log_check "Validation de l'environnement"
    
    if [ -z "$ENV_NODE_ENV" ]; then
        log_warning "NODE_ENV non défini"
    else
        log_success "NODE_ENV=$ENV_NODE_ENV"
    fi
    
    if [ -z "$ENV_DEPLOYMENT_ENV" ]; then
        log_warning "DEPLOYMENT_ENV non défini"
    else
        log_success "DEPLOYMENT_ENV=$ENV_DEPLOYMENT_ENV"
    fi
}

# Validation de la base de données
validate_database() {
    log_check "Validation de la configuration de base de données"
    
    if [ -z "$ENV_DATABASE_URL" ]; then
        log_error "DATABASE_URL non définie"
    else
        log_success "DATABASE_URL définie"
        
        # Vérifier le format pour MongoDB
        if [[ "$ENV_DATABASE_URL" =~ ^mongodb ]]; then
            log_success "Format MongoDB détecté"
            
            # Vérifier si c'est un replica set
            if [[ "$ENV_DATABASE_URL" =~ replicaSet ]]; then
                log_success "Configuration Replica Set détectée"
            else
                log_warning "Replica Set non configuré (recommandé pour production)"
            fi
        fi
    fi
}

# Validation du domaine
validate_domain() {
    log_check "Validation du domaine"
    
    if [ -z "$ENV_DOMAIN" ]; then
        log_error "DOMAIN non défini"
    else
        log_success "DOMAIN=$ENV_DOMAIN"
        
        # Vérifier si c'est un domaine valide (pas localhost ou IP)
        if [[ "$ENV_DOMAIN" == "localhost" ]] || [[ "$ENV_DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            log_warning "DOMAIN utilise localhost ou une IP: $ENV_DOMAIN"
            log_warning "  Utilisez un nom de domaine pour la production"
        fi
    fi
    
    if [ -z "$ENV_CERTBOT_EMAIL" ]; then
        log_warning "CERTBOT_EMAIL non défini (requis pour SSL)"
    else
        log_success "CERTBOT_EMAIL=$ENV_CERTBOT_EMAIL"
    fi
}

# Génération du rapport
generate_report() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}RAPPORT DE VALIDATION${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    echo "Total de vérifications: $CHECKS"
    echo "Avertissements: $WARNINGS"
    echo "Erreurs: $ERRORS"
    echo ""
    
    if [ $ERRORS -gt 0 ]; then
        log_error "❌ VALIDATION ÉCHOUÉE - $ERRORS erreur(s) critique(s)"
        log_error "Le déploiement en production est BLOQUÉ"
        log_error "Corrigez les erreurs ci-dessus avant de déployer"
        return 1
    elif [ $WARNINGS -gt 0 ]; then
        log_warning "⚠️ VALIDATION RÉUSSIE AVEC AVERTISSEMENTS - $WARNINGS avertissement(s)"
        log_warning "Le déploiement peut continuer mais vérifiez les avertissements"
        return 0
    else
        log_success "✅ VALIDATION RÉUSSIE - Configuration prête pour le déploiement"
        return 0
    fi
}

# Fonction principale
main() {
    local env_file="${1:-env.production}"
    
    echo -e "${CYAN}🛡️ MEESHY - VALIDATION DE CONFIGURATION PRÉ-DÉPLOIEMENT${NC}"
    echo "============================================================"
    echo ""
    
    if [ "$env_file" == "--help" ] || [ "$env_file" == "-h" ]; then
        show_help
        exit 0
    fi

    # Charger le fichier d'environnement
    load_env_file "$env_file"

    echo ""
    log_info "Début de la validation..."
    echo ""

    # La déclaration des variables exigées vient de la garde. Fail-closed : si
    # elle ne peut pas être lue, on s'arrête AVANT de rendre un verdict — un
    # rapport « réussi » sans avoir su quoi exiger serait un mensonge.
    if ! load_required_vars; then
        echo ""
        log_error "❌ VALIDATION IMPOSSIBLE - la source des variables exigées est illisible"
        log_error "Le déploiement en production est BLOQUÉ"
        return 1
    fi
    echo ""

    # Exécuter toutes les validations
    validate_environment
    echo ""
    validate_force_db_reset
    echo ""
    validate_urls
    echo ""
    validate_required_vars
    echo ""
    validate_database
    echo ""
    validate_domain
    echo ""
    
    # Générer le rapport final
    generate_report
    
    return $?
}

# ============================================================================
# TÉMOIN DE DÉRIVATION [#4544]
# ============================================================================
#
# Ce qu'il prouve, et pourquoi la forme compte.
#
# Un témoin qui comparerait la liste de ce script à celle de la garde ne
# prouverait RIEN : deux copies coïncident toujours le jour où on les écrit.
# C'est exactement ce qu'aurait dit un tel témoin la veille de #4544, pendant
# que le validateur exigeait un nom mort.
#
# Celui-ci fait l'inverse. Il fabrique un dépôt jouet, injecte dans une COPIE de
# la table de la garde une variable dont le nom est TIRÉ AU HASARD à chaque
# exécution — donc impossible à écrire en dur ici ou ailleurs — et relance CE
# script, octet pour octet identique, sur ce monde. Si le script l'exige, c'est
# qu'il l'a DÉRIVÉE. Une copie ne peut pas passer ce test.
#
# Les six autres assertions ferment les portes de sortie : le repli refusé
# vient lui aussi de la table, une garde absente ou une dérivation vide font
# ÉCHOUER plutôt que replier sur une liste locale, un hôte correct atteint bien
# son rapport, et un hôte qui ne déclenche QU'UN avertissement l'atteint aussi —
# c'est le seul chemin par lequel la régression du compteur sous set -e pourrait
# revenir, WARNINGS valant encore 0 au premier log_warning.

TEMOIN_RACINE=""

temoin_nettoyer() {
    [ -n "$TEMOIN_RACINE" ] && rm -rf "$TEMOIN_RACINE"
    return 0
}

# Fabrique une racine de dépôt jouet : une COPIE de la garde, une composition
# qui déploie, un modèle d'environnement.
temoin_monde() {
    local racine="$1" temoin="$2" repli="$3" mode="$4"
    mkdir -p "$racine/scripts" "$racine/infrastructure/docker/compose" "$racine/infrastructure/envs"

    if [ "$mode" == "sans-bloquante" ]; then
        sed 's/classe: BLOQUANTE,/classe: DEFAUT_ACCEPTABLE,/' "$GUARD_REEL" \
            > "$racine/scripts/check-compose-required-vars.mjs"
    else
        awk -v ligne="  $temoin: { classe: BLOQUANTE, secret: true, replis: ['$repli'], raison: 'Entree injectee par le self-test du validateur.' }," \
            '{ print } /^const SUBSTITUTIONS = Object.freeze\(\{$/ { print ligne }' \
            "$GUARD_REEL" > "$racine/scripts/check-compose-required-vars.mjs"
    fi

    cat > "$racine/infrastructure/docker/compose/docker-compose.prod.yml" <<YAML
services:
  passerelle:
    environment:
      - JWT_SECRET=\${JWT_SECRET:?poser JWT_SECRET sur l hote}
      - $temoin=\${$temoin:?poser la variable temoin sur l hote}
YAML

    printf 'JWT_SECRET=x\n%s=x\n' "$temoin" > "$racine/infrastructure/envs/.env.example"
}

# Un fichier d'environnement d'hôte, valide partout ailleurs que sur le témoin.
temoin_env() {
    local chemin="$1" temoin="$2" valeur="$3"
    cat > "$chemin" <<'ENVEOF'
NODE_ENV=production
DEPLOYMENT_ENV=production
FORCE_DB_RESET=false
DOMAIN=meeshy.me
CERTBOT_EMAIL=admin@meeshy.me
DATABASE_URL=mongodb://u:p@database:27017/meeshy?replicaSet=rs0
INTERNAL_BACKEND_URL=https://gate.meeshy.me
INTERNAL_WS_URL=wss://gate.meeshy.me
JWT_SECRET=Xq7vN2pLm9RtYw4Zb8Hs
ENVEOF
    if [ -n "$valeur" ]; then
        printf '%s=%s\n' "$temoin" "$valeur" >> "$chemin"
    fi
}

TEMOIN_ECHECS=0

# $1 titre · $2 garde · $3 env · $4 rc attendu (0 | non-zero) · $5 motif exigé · $6 motif interdit
temoin_attendre() {
    local titre="$1" garde="$2" envfile="$3" rc_attendu="$4" motif="$5" interdit="${6:-}"
    local sortie rc

    set +e
    sortie="$(MEESHY_COMPOSE_GUARD="$garde" bash "$SELF" "$envfile" 2>&1)"
    rc=$?
    set -e

    local souci=""
    if [ "$rc_attendu" == "0" ] && [ $rc -ne 0 ]; then
        souci="rc=$rc alors que 0 était attendu"
    elif [ "$rc_attendu" != "0" ] && [ $rc -eq 0 ]; then
        souci="rc=0 alors qu'un échec était attendu"
    elif [ -n "$motif" ] && ! printf '%s' "$sortie" | grep -qF -- "$motif"; then
        souci="la sortie ne contient pas « $motif »"
    elif [ -n "$interdit" ] && printf '%s' "$sortie" | grep -qF -- "$interdit"; then
        souci="la sortie contient « $interdit », qui ne devrait pas y être"
    fi

    if [ -n "$souci" ]; then
        echo -e "${RED}AVEUGLE : « $titre » — $souci${NC}"
        printf '%s\n' "$sortie" | sed 's/^/    | /'
        TEMOIN_ECHECS=$((TEMOIN_ECHECS + 1))
        return 0
    fi
    echo -e "${GREEN}  ✓ $titre${NC}"
}

self_test() {
    echo -e "${CYAN}🛡️ TÉMOIN DE DÉRIVATION — la liste des variables exigées n'est pas d'ici${NC}"
    echo "============================================================"
    echo ""

    if [ ! -f "$GUARD_REEL" ]; then
        echo -e "${RED}Garde des compositions introuvable: $GUARD_REEL${NC}"
        return 1
    fi

    TEMOIN_RACINE="$(mktemp -d)"
    trap temoin_nettoyer EXIT

    # Un nom que PERSONNE ne peut avoir écrit en dur : il naît à l'exécution.
    local temoin="MEESHY_TEMOIN_$$_${RANDOM}${RANDOM}"
    local repli="repli-temoin-a-refuser"

    temoin_monde "$TEMOIN_RACINE/derive" "$temoin" "$repli" "injecte"
    temoin_monde "$TEMOIN_RACINE/vide" "$temoin" "$repli" "sans-bloquante"

    local garde_derive="$TEMOIN_RACINE/derive/scripts/check-compose-required-vars.mjs"
    local garde_vide="$TEMOIN_RACINE/vide/scripts/check-compose-required-vars.mjs"

    temoin_env "$TEMOIN_RACINE/sans.env" "$temoin" ""
    temoin_env "$TEMOIN_RACINE/repli.env" "$temoin" "$repli"
    temoin_env "$TEMOIN_RACINE/complet.env" "$temoin" "Zt9Lq4Xn7Rm2Vk8Hy3Ps"
    # Un hôte qui déclenche un AVERTISSEMENT et rien d'autre : c'est le seul
    # chemin où l'ancien ((WARNINGS++)) tuait le script, WARNINGS valant encore 0.
    grep -v '^INTERNAL_BACKEND_URL=' "$TEMOIN_RACINE/complet.env" > "$TEMOIN_RACINE/avertissement.env"

    temoin_attendre \
        "une bloquante ajoutée à la SEULE table de la garde devient exigible ici" \
        "$garde_derive" "$TEMOIN_RACINE/sans.env" "non-zero" "$temoin"

    # Même monde, même fichier d'hôte, autre question : le RAPPORT est-il atteint ?
    # Sans elle, un ((ERRORS++)) restauré tuerait le script sur la PREMIÈRE erreur
    # et masquerait toutes les suivantes, en rendant le même rc=1 qu'un rapport complet.
    temoin_attendre \
        "une variable manquante n'interrompt pas le rapport (les autres sont dites aussi)" \
        "$garde_derive" "$TEMOIN_RACINE/sans.env" "non-zero" "RAPPORT DE VALIDATION"

    temoin_attendre \
        "le repli déclaré par la garde est refusé ici, sans être écrit ici" \
        "$garde_derive" "$TEMOIN_RACINE/repli.env" "non-zero" "$repli"

    temoin_attendre \
        "un hôte qui pose la variable dérivée atteint son rapport" \
        "$garde_derive" "$TEMOIN_RACINE/complet.env" "0" "RAPPORT DE VALIDATION"

    temoin_attendre \
        "garde introuvable : refus, jamais de repli sur une liste locale" \
        "$TEMOIN_RACINE/aucune-garde.mjs" "$TEMOIN_RACINE/complet.env" "non-zero" \
        "Garde des compositions introuvable" "VALIDATION RÉUSSIE"

    temoin_attendre \
        "dérivation vide : refus, jamais un « rien à exiger » silencieux" \
        "$garde_vide" "$TEMOIN_RACINE/complet.env" "non-zero" \
        "n'a pas pu dériver" "VALIDATION RÉUSSIE"

    temoin_attendre \
        "un avertissement n'interrompt plus la validation (compteurs sous set -e)" \
        "$garde_derive" "$TEMOIN_RACINE/avertissement.env" "0" \
        "VALIDATION RÉUSSIE AVEC AVERTISSEMENTS"

    echo ""
    if [ $TEMOIN_ECHECS -gt 0 ]; then
        echo -e "${RED}$TEMOIN_ECHECS/7 assertions du témoin ont échoué.${NC}"
        return 1
    fi
    echo -e "${GREEN}témoin de dérivation : 7/7 assertions tenues.${NC}"
    echo "La liste des variables exigées vient de $GUARD_REEL — ce fichier n'en tient aucune copie."
    return 0
}

# Exécuter la fonction principale
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    if [ "${1:-}" == "--self-test" ]; then
        self_test
        exit $?
    fi
    main "$@"
fi
