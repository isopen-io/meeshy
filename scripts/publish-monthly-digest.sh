#!/usr/bin/env bash

#########################################
# Meeshy Monthly Digest Publisher
# Publie une série d'annonces, une publication toutes les 2 heures.
#
# S'appuie sur mmp.sh (Meeshy Message Publisher) pour l'envoi réel.
#
# REPRISE ROBUSTE : chaque annonce publiée avec succès est enregistrée par
# nom de fichier dans un journal `.published.log`. À chaque démarrage, le
# script ne publie QUE les fichiers absents de ce journal. Une coupure
# (Ctrl-C, kill, veille, reboot, perte réseau) ne fait donc jamais perdre la
# place ni republier ce qui l'a déjà été — il suffit de relancer.
#
# RÉSILIENCE RÉSEAU : si une publication échoue, le script NE consomme PAS
# l'annonce. En mode boucle il réessaie après RETRY_DELAY ; en mode --once il
# sort en erreur (le cron relancera) — dans les deux cas l'annonce reste « à
# publier ».
#
# Modes :
#   - boucle (défaut)  : reste actif, publie la suivante toutes les 2 h
#   - cron   (--once)  : publie la prochaine non-publiée puis sort
#
# Aucune donnée sensible codée en dur : MEESHY_PASSWORD requis (chargé depuis
# .env.local racine s'il n'est pas déjà dans l'environnement).
#########################################

set -euo pipefail
IFS=$'\n\t'

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly MMP="${SCRIPT_DIR}/mmp.sh"

# Charge les identifiants depuis .env.local (racine, gitignoré) si présent
# et si MEESHY_PASSWORD n'est pas déjà défini dans l'environnement.
if [[ -z "${MEESHY_PASSWORD:-}" && -f "${REPO_ROOT}/.env.local" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "${REPO_ROOT}/.env.local"
    set +a
fi

# Couleurs
if [[ -t 1 ]] && command -v tput &>/dev/null; then
    readonly GREEN=$(tput setaf 2) BLUE=$(tput setaf 4) CYAN=$(tput setaf 6)
    readonly YELLOW=$(tput setaf 3) RED=$(tput setaf 1) NC=$(tput sgr0)
else
    readonly GREEN='' BLUE='' CYAN='' YELLOW='' RED='' NC=''
fi

# Configuration (surchargée par l'environnement / les options)
POSTS_DIR="${POSTS_DIR:-${SCRIPT_DIR}/announcements/2026-06}"
INTERVAL="${PUBLISH_INTERVAL:-7200}"          # 2 heures, en secondes
RETRY_DELAY="${PUBLISH_RETRY_DELAY:-300}"     # attente avant nouvel essai après échec
LANGUAGE="${MEESHY_LANGUAGE:-fr}"             # langue d'origine des annonces
CONVERSATION_ID="${MEESHY_CONVERSATION_ID:-meeshy}"
ONCE=false
DRY_RUN=false
DO_LIST=false
DO_RESET=false
PUBLISHED_LOG=""   # défini une fois POSTS_DIR connu

log()     { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*" >&2; }
die()     { echo -e "${RED}[ERREUR]${NC} $*" >&2; exit 1; }

show_help() {
    cat << EOF
${CYAN}Meeshy Monthly Digest Publisher${NC}
Publie une série d'annonces, une par intervalle (2 h par défaut), avec reprise
robuste sur les messages non publiés en cas de coupure.

${BLUE}USAGE${NC}
    MEESHY_PASSWORD=... $(basename "$0") [OPTIONS]

${BLUE}OPTIONS${NC}
    -h, --help              Affiche cette aide
        --once              Publie UNIQUEMENT la prochaine annonce non publiée
                            puis sort (idéal pour un cron toutes les 2 h)
        --dry-run           Simule sans rien publier (n'écrit pas le journal)
        --list              Affiche la file et l'état (publié / à publier)
        --reset             Vide le journal des publiés (repart de zéro)
    -i, --interval SEC      Intervalle entre deux publications (défaut: ${INTERVAL})
        --retry-delay SEC   Attente avant réessai après échec (défaut: ${RETRY_DELAY})
    -d, --dir PATH          Dossier des annonces (défaut: ${POSTS_DIR})
    -c, --conversation ID   Conversation cible (défaut: ${CONVERSATION_ID})
    -l, --language LANG     Langue d'origine des annonces (défaut: ${LANGUAGE})

${BLUE}REPRISE APRÈS COUPURE${NC}
    Les fichiers publiés sont notés dans  <dossier>/.published.log
    Relancer le script (même commande) reprend automatiquement sur les
    annonces restantes. Rien n'est republié.

${BLUE}ENVIRONNEMENT${NC}
    MEESHY_PASSWORD         Mot de passe (REQUIS) — chargé depuis .env.local si absent
    MEESHY_CONVERSATION_ID  Conversation cible
    PUBLISH_INTERVAL        Intervalle en secondes
    PUBLISH_RETRY_DELAY     Délai de réessai en secondes
    POSTS_DIR               Dossier des fichiers .txt à publier

${BLUE}EXEMPLES${NC}
    ${GREEN}# Voir la file et l'état${NC}
    $(basename "$0") --list

    ${GREEN}# Boucle résiliente : une annonce toutes les 2 h jusqu'à épuisement${NC}
    MEESHY_PASSWORD=xxx $(basename "$0")

    ${GREEN}# Mode cron (robuste aux reboots) : publier la prochaine puis sortir${NC}
    0 */2 * * * ${SCRIPT_DIR}/$(basename "$0") --once >> /tmp/meeshy-digest.log 2>&1
EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help) show_help; exit 0 ;;
            --once) ONCE=true; shift ;;
            --dry-run) DRY_RUN=true; shift ;;
            --list) DO_LIST=true; shift ;;
            --reset) DO_RESET=true; shift ;;
            -i|--interval) [[ -z "${2:-}" ]] && die "--interval requiert une valeur"; INTERVAL="$2"; shift 2 ;;
            --retry-delay) [[ -z "${2:-}" ]] && die "--retry-delay requiert une valeur"; RETRY_DELAY="$2"; shift 2 ;;
            -d|--dir) [[ -z "${2:-}" ]] && die "--dir requiert une valeur"; POSTS_DIR="$2"; shift 2 ;;
            -c|--conversation) [[ -z "${2:-}" ]] && die "--conversation requiert une valeur"; CONVERSATION_ID="$2"; shift 2 ;;
            -l|--language) [[ -z "${2:-}" ]] && die "--language requiert une valeur"; LANGUAGE="$2"; shift 2 ;;
            *) die "Option inconnue: $1 (voir --help)" ;;
        esac
    done
}

# Liste triée des fichiers d'annonce
collect_posts() {
    [[ -d "$POSTS_DIR" ]] || die "Dossier introuvable: $POSTS_DIR"
    local files=()
    while IFS= read -r f; do files+=("$f"); done < <(find "$POSTS_DIR" -maxdepth 1 -name '*.txt' -type f | sort)
    [[ ${#files[@]} -gt 0 ]] || die "Aucune annonce (.txt) dans $POSTS_DIR"
    printf '%s\n' "${files[@]}"
}

is_published()   { [[ -f "$PUBLISHED_LOG" ]] && grep -qxF "$1" "$PUBLISHED_LOG"; }
mark_published() { printf '%s\n' "$1" >> "$PUBLISHED_LOG"; }
count_published(){
    if [[ -f "$PUBLISHED_LOG" ]]; then
        grep -cve '^$' "$PUBLISHED_LOG" || true
    else
        echo 0
    fi
}

# Migration depuis l'ancien curseur entier .publish-state (versions précédentes)
migrate_legacy_state() {
    local state="${POSTS_DIR}/.publish-state"
    [[ -f "$state" ]] || return 0
    local cursor; cursor=$(cat "$state" 2>/dev/null || echo 0)
    [[ "$cursor" =~ ^[0-9]+$ ]] || cursor=0
    local i=0
    for p in "$@"; do
        [[ $i -lt $cursor ]] || break
        is_published "$(basename "$p")" || mark_published "$(basename "$p")"
        i=$((i+1))
    done
    rm -f "$state"
    [[ $cursor -gt 0 ]] && log "Migration: ${cursor} annonce(s) déjà publiée(s) reportée(s) dans .published.log."
    return 0
}

list_queue() {
    local posts=("$@")
    local done_n; done_n=$(count_published)
    echo -e "${CYAN}File de publication${NC} — ${#posts[@]} annonces, dossier: ${POSTS_DIR}"
    echo -e "${CYAN}État${NC} : ${done_n}/${#posts[@]} publiées (intervalle ${INTERVAL}s, journal: .published.log)"
    echo ""
    local i=0
    for p in "${posts[@]}"; do
        local base title marker
        base=$(basename "$p")
        title=$(head -n1 "$p")
        if is_published "$base"; then marker="${GREEN}✓ publiée${NC}  "
        else marker="${YELLOW}○ à publier${NC}"; fi
        printf "  %s %2d. %s\n" "$marker" "$((i+1))" "$title"
        i=$((i+1))
    done
}

# Publie un fichier via mmp.sh. Retourne 0 si succès, 1 sinon (sans faire
# planter le script grâce au `if`).
publish_one() {
    local file="$1" position="$2" total="$3"
    local title; title=$(head -n1 "$file")
    log "Publication ${position}/${total} : ${title}"

    if [[ "$DRY_RUN" == "true" ]]; then
        warn "[dry-run] mmp.sh -f \"$file\" -c $CONVERSATION_ID -l $LANGUAGE -y → non envoyé"
        return 0
    fi

    if "$MMP" -f "$file" -c "$CONVERSATION_ID" -l "$LANGUAGE" -y --no-backup --no-cleanup; then
        success "Annonce ${position}/${total} publiée."
        return 0
    fi
    return 1
}

# Renvoie (par echo) le chemin de la prochaine annonce non publiée, ou rien.
next_pending() {
    local p
    for p in "$@"; do
        is_published "$(basename "$p")" || { printf '%s' "$p"; return 0; }
    done
    return 1
}

main() {
    parse_args "$@"

    [[ -x "$MMP" ]] || { chmod +x "$MMP" 2>/dev/null || die "mmp.sh introuvable/non exécutable: $MMP"; }

    local posts=()
    while IFS= read -r f; do posts+=("$f"); done < <(collect_posts)
    local total=${#posts[@]}
    PUBLISHED_LOG="${POSTS_DIR}/.published.log"

    if [[ "$DO_RESET" == "true" ]]; then
        rm -f "$PUBLISHED_LOG" "${POSTS_DIR}/.publish-state"
        success "Journal réinitialisé : la prochaine exécution repart de la 1re annonce."
        exit 0
    fi

    migrate_legacy_state "${posts[@]}"

    if [[ "$DO_LIST" == "true" ]]; then
        list_queue "${posts[@]}"
        exit 0
    fi

    if [[ "$DRY_RUN" != "true" ]]; then
        [[ -n "${MEESHY_PASSWORD:-}" ]] || die "MEESHY_PASSWORD non défini.\nDéfinissez-le dans ${REPO_ROOT}/.env.local ou exportez-le."
    fi

    # Dry-run : on liste simplement ce qui SERAIT publié, sans muter le journal.
    if [[ "$DRY_RUN" == "true" ]]; then
        local i=0 shown=0
        for p in "${posts[@]}"; do
            i=$((i+1))
            is_published "$(basename "$p")" && continue
            publish_one "$p" "$i" "$total"
            shown=$((shown+1))
            [[ "$ONCE" == "true" ]] && break
        done
        [[ $shown -eq 0 ]] && success "Rien à publier (tout est déjà dans .published.log)."
        exit 0
    fi

    local done_n; done_n=$(count_published)
    if [[ "$done_n" -ge "$total" ]]; then
        success "Toutes les annonces ont déjà été publiées (${done_n}/${total}). Rien à faire."
        echo -e "Pour recommencer : ${CYAN}$(basename "$0") --reset${NC}"
        exit 0
    fi

    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║   Meeshy — diffusion des nouveautés (1 publication / 2 h)     ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    log "Conversation: ${CONVERSATION_ID} | langue: ${LANGUAGE} | intervalle: ${INTERVAL}s"
    log "Déjà publiées: ${done_n}/${total}. Reprise sur les annonces restantes."
    echo ""

    while true; do
        local next; next=$(next_pending "${posts[@]}") || next=""
        if [[ -z "$next" ]]; then
            success "Diffusion terminée : ${total}/${total} annonces publiées 🎉"
            break
        fi

        # Position 1-based de cette annonce dans la liste complète
        local position=1; local p
        for p in "${posts[@]}"; do [[ "$p" == "$next" ]] && break; position=$((position+1)); done

        if publish_one "$next" "$position" "$total"; then
            mark_published "$(basename "$next")"
        else
            warn "Échec de publication (réseau/serveur ?). L'annonce reste à publier."
            if [[ "$ONCE" == "true" ]]; then
                die "Mode --once : échec — le prochain passage (cron) réessaiera."
            fi
            log "Nouvelle tentative dans ${RETRY_DELAY}s…"
            sleep "$RETRY_DELAY"
            continue   # on réessaie la MÊME annonce
        fi

        # Mode cron : une seule publication réussie par passage
        if [[ "$ONCE" == "true" ]]; then
            local left; left=$((total - $(count_published)))
            [[ $left -gt 0 ]] && log "Mode --once : ${left} restante(s) au prochain passage." \
                              || success "Mode --once : dernière annonce publiée. File terminée."
            exit 0
        fi

        # Reste-t-il des annonces ? Si oui, on attend l'intervalle.
        if next_pending "${posts[@]}" >/dev/null; then
            local next_at; next_at=$(date -v +"${INTERVAL}"S '+%H:%M:%S' 2>/dev/null || date -d "+${INTERVAL} seconds" '+%H:%M:%S' 2>/dev/null || echo "+${INTERVAL}s")
            log "Prochaine publication vers ${next_at} (dans ${INTERVAL}s). Ctrl-C pour arrêter."
            sleep "$INTERVAL"
            echo ""
        fi
    done
}

main "$@"
