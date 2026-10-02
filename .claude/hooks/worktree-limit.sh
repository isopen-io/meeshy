#!/bin/bash
# Pas plus de 4 worktrees à la fois (directive porteur 2026-10-02).
# Chaque worktree iOS pèse 5 à 11 Go (Build, SourcePackages, node_modules) :
# au-delà, le disque sature et les sessions s'arrêtent. Ce hook refuse la
# création d'un 5e worktree — `git worktree add`, EnterWorktree, ou un agent
# isolé en worktree — et dit quoi faire avant d'en ouvrir un autre.
LIMIT=4
input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')

case "$tool" in
  Bash)
    # Une COMMANDE, pas un texte : en tête de ligne ou après ; & | ( — une
    # chaîne qui cite « git worktree add » (doc, heredoc) ne déclenche rien.
    printf '%s' "$input" | jq -r '.tool_input.command // empty' | grep -Eq '(^|[;&|(])[[:space:]]*git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+worktree[[:space:]]+add' || exit 0
    ;;
  EnterWorktree) ;;
  Agent)
    [ "$(printf '%s' "$input" | jq -r '.tool_input.isolation // empty')" = "worktree" ] || exit 0
    ;;
  *) exit 0 ;;
esac

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
count=$(git -C "$root" worktree list --porcelain 2>/dev/null | grep -c '^worktree ')
extra=$((count - 1))
[ "$extra" -lt "$LIMIT" ] && exit 0

list=$(git -C "$root" worktree list | awk 'NR>1{print $1" "$3}' | tr '\n' ';')
reason="Limite de $LIMIT worktrees atteinte ($extra ouverts : $list). Avant d'en ouvrir un autre : rapatrier dev dans un worktree inactif, fusionner dans dev ce qui doit l'être, puis le retirer (git worktree remove). Directive porteur 2026-10-02."
jq -n --arg r "$reason" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
