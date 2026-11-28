#!/bin/bash
# Témoin des deux hooks de garde : chaque ligne dit ce qui doit être refusé (2)
# et ce qui doit passer (0). Les jetons factices sont assemblés à l'exécution
# pour que ce fichier ne contienne lui-même rien qui ressemble à un secret.
# Usage : bash .amsf/scripts/test-hooks.sh
set -u
racine=$(cd "$(dirname "$0")/../.." && pwd)
commandes="$racine/.claude/hooks/garde-commandes.sh"
ecritures="$racine/.claude/hooks/garde-ecritures.sh"
echecs=0

attend() {
  local attendu=$1 hook=$2 json=$3 libelle=$4
  printf '%s' "$json" | "$hook" >/dev/null 2>&1
  local rendu=$?
  if [ "$rendu" -ne "$attendu" ]; then
    echo "ROUGE  attendu $attendu, rendu $rendu — $libelle"
    echecs=$((echecs + 1))
  else
    echo "vert   $libelle"
  fi
}

bash_cmd() { jq -nc --arg c "$1" '{tool_name:"Bash",tool_input:{command:$c}}'; }
ecrit() { jq -nc --arg p "$1" --arg c "$2" '{tool_name:"Write",tool_input:{file_path:$p,content:$c}}'; }
edite() { jq -nc --arg p "$1" --arg c "$2" '{tool_name:"Edit",tool_input:{file_path:$p,old_string:"x",new_string:$c}}'; }

attend 2 "$commandes" "$(bash_cmd 'git push --force origin dev')" "push forcé sur dev"
attend 2 "$commandes" "$(bash_cmd 'git push -f origin main')" "push -f sur main"
attend 2 "$commandes" "$(bash_cmd 'cd x && git push --force-with-lease origin HEAD:dev')" "force-with-lease vers dev"
attend 2 "$commandes" "$(bash_cmd 'git push origin +abc123:main')" "refspec forcé vers main"
attend 2 "$commandes" "$(bash_cmd 'git push origin --delete dev')" "suppression de dev"
attend 2 "$commandes" "$(bash_cmd 'git push origin :main')" "suppression de main par refspec vide"
attend 2 "$commandes" "$(bash_cmd 'rm -rf /')" "rm -rf /"
attend 2 "$commandes" "$(bash_cmd 'rm -rf ~')" "rm -rf ~"
attend 2 "$commandes" "$(bash_cmd 'cd repo && rm -fr .git')" "rm -fr .git"
attend 2 "$commandes" "$(bash_cmd 'git commit --no-verify -m x')" "commit --no-verify"
attend 2 "$commandes" "$(bash_cmd 'ssh root@meeshy.me "docker exec meeshy-database mongosh --eval \"db.dropDatabase()\""')" "purge de la base de production"
attend 0 "$commandes" "$(bash_cmd 'git push -u origin claude/ma-branche')" "push ordinaire d'une branche de lot"
attend 0 "$commandes" "$(bash_cmd 'git push --force-with-lease origin claude/ma-branche')" "force-with-lease sur sa propre branche"
attend 0 "$commandes" "$(bash_cmd 'git push origin claude/dev-vert-android')" "branche dont le nom contient dev"
attend 0 "$commandes" "$(bash_cmd 'rm -rf node_modules dist .turbo')" "nettoyage ordinaire"
attend 0 "$commandes" "$(bash_cmd 'rm -rf ./build/.git-cache')" "chemin qui contient .git sans l'être"
attend 0 "$commandes" "$(bash_cmd 'echo "ne jamais lancer git push --force origin dev"')" "texte qui cite la commande"
attend 0 "$commandes" "$(bash_cmd 'docker exec meeshy-staging-database mongosh --eval "db.tmp.deleteMany({})"')" "purge sur staging"
attend 0 "$commandes" "$(jq -nc '{tool_name:"Read",tool_input:{file_path:"x"}}')" "autre outil"
attend 0 "$commandes" "pas du json" "entrée illisible (fail-open)"

aws="AKIA$(printf 'ABCDEFGHIJKLMNOP')"
gh="ghp_$(printf 'a%.0s' $(seq 1 36))"
pem="-----BEGIN PRIVATE KEY----- $(printf 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASC%.0s' $(seq 1 8)) -----END PRIVATE KEY-----"
attend 2 "$ecritures" "$(ecrit "$racine/services/gateway/.env" 'A=1')" "écriture d'un .env"
attend 2 "$ecritures" "$(ecrit "$racine/.andp/secrets.yml" 'a: b')" "écriture d'un secrets.yml"
attend 2 "$ecritures" "$(ecrit "$racine/bun.lock" '{}')" "écriture manuelle de bun.lock"
attend 2 "$ecritures" "$(ecrit "$racine/services/gateway/src/config.ts" "const k = '$aws'")" "clé AWS dans une source"
attend 2 "$ecritures" "$(edite "$racine/docs/note.md" "jeton : $gh")" "jeton GitHub dans un document"
attend 2 "$ecritures" "$(ecrit "$racine/infrastructure/cle.txt" "$pem")" "clé privée complète"
attend 0 "$ecritures" "$(ecrit "$racine/infrastructure/envs/.env.staging.template" 'JWT_SECRET=')" "modèle d'environnement"
attend 0 "$ecritures" "$(ecrit "$racine/services/gateway/src/__tests__/x.test.ts" "const k = '$aws'")" "clé factice dans un témoin"
attend 0 "$ecritures" "$(ecrit "$racine/docs/note.md" '-----BEGIN PRIVATE KEY----- (exemple) -----END PRIVATE KEY-----')" "gabarit de clé sans matière"
attend 0 "$ecritures" "$(ecrit "$racine/services/gateway/src/a.ts" 'export const a = 1')" "source ordinaire"
attend 0 "$ecritures" "pas du json" "entrée illisible (fail-open)"

if [ "$echecs" -gt 0 ]; then
  echo "$echecs témoin(s) rouge(s)"
  exit 1
fi
echo "tous les témoins sont verts"
