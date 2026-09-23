#!/usr/bin/env bash
# PREUVE D'EXÉCUTION DU FLUX #6424, SUR STAGING.
#
# Corrigé après un premier passage qui a rendu DEUX FAUX VERTS : le helper
# `mongo` avait des guillemets cassés, rendait une chaîne VIDE, et
# `grep -q '"password"'` sur du vide est faux — donc « la colonne est absente »
# passait sans avoir rien lu. Une absence lue depuis une commande muette n'est
# pas une absence.
#
# Deux règles en découlent, appliquées partout ci-dessous :
#   1. une réponse VIDE de la base est un ÉCHEC, jamais un verdict ;
#   2. on assère sur la VALEUR lue (`password: null`), pas sur l'absence d'une
#      sous-chaîne dans un texte qu'on n'a peut-être pas reçu.
set -uo pipefail

API="https://gate.staging.meeshy.me/api/v1"

# LE PRÉFIXE DE L'ADRESSE CHANGE À CHAQUE PASSAGE, et ce n'est pas cosmétique.
#
# La clé du limiteur de connexion est `ip:<ip>:<3 premiers caractères de
# l'identifiant>` (`utils/rate-limiter.ts`, max 5 / 15 min). Un harnais dont
# toutes les adresses commencent par les MÊMES trois lettres partage donc un
# seul seau : le deuxième passage se fait étrangler par le premier, et l'échec
# ressemble à un défaut du produit. Trois lettres tirées à chaque passage
# donnent un seau neuf — exactement ce que feraient trois personnes
# différentes, ce que ce test simule.
PREFIXE=$(LC_ALL=C tr -dc 'a-z' < /dev/urandom | head -c 3)
ADRESSE="${PREFIXE}-preuve-6424-$(date +%s)@example.test"
ROUGE=0

dire()    { printf '\n\033[1m%s\033[0m\n' "$*"; }
verdict() { if [ "$2" = ok ]; then printf '  ✅ %s\n' "$1"; else printf '  ❌ %s\n' "$1"; ROUGE=1; fi; }

# `mongo <script js>` — le script part en base64 pour traverser ssh + docker
# sans qu'aucune couche ne mange un guillemet.
mongo() {
  local encode
  encode=$(printf '%s' "$1" | base64 | tr -d '\n')
  ssh -o BatchMode=yes root@meeshy.me \
    "docker exec meeshy-database-staging sh -c 'echo $encode | base64 -d > /tmp/q.js && mongosh --quiet --file /tmp/q.js'" 2>/dev/null
}

# Rend l'échec quand la base n'a rien dit — le piège du premier passage.
lu() {
  if [ -z "$(printf '%s' "$2" | tr -d '[:space:]')" ]; then
    verdict "$1 — LA BASE N'A RIEN RENDU, la preuve n'est pas faite" ko
    return 1
  fi
  return 0
}

dire "1. POST /auth/register — l'adresse seule ($ADRESSE)"
REP=$(curl -sS -w '\n%{http_code}' -X POST "$API/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"$ADRESSE\"}")
CODE=$(printf '%s' "$REP" | tail -1); CORPS=$(printf '%s' "$REP" | sed '$d')
[ "$CODE" = 200 ] && verdict "un compte est créé sans mot de passe (HTTP 200)" ok || { verdict "HTTP $CODE au lieu de 200" ko; printf '  %s\n' "$CORPS"; }

PSEUDO=$(printf '%s' "$CORPS" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["user"]["username"])' 2>/dev/null)
NOM=$(printf '%s' "$CORPS" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["user"]["displayName"])' 2>/dev/null)
printf '  pseudo : %s\n  nom    : %s\n' "$PSEUDO" "$NOM"

# La partie locale slugifiée comme le fait `pseudoSlug` : tronquée à 16 (la
# borne du contrat), PUIS débarrassée d'un séparateur de bord. L'ordre compte —
# tronquer « zmy-preuve-6424- » à 16 laisse un tiret final que la loi retire,
# et une attente qui ne modélise pas ce retrait accuse la loi d'avoir tort.
LOCALE=$(printf '%s' "$ADRESSE" | cut -d@ -f1)
ATTENDU=$(printf '%s' "$LOCALE" | cut -c1-16 | sed 's/[-_]*$//')
[ "$PSEUDO" = "$ATTENDU" ] && verdict "le pseudo est la partie locale bornée à 16 ($ATTENDU)" ok \
                           || verdict "pseudo « $PSEUDO », attendu « $ATTENDU »" ko
[ "${#PSEUDO}" -le 16 ] && verdict "le pseudo tient dans la borne du contrat" ok || verdict "le pseudo dépasse 16" ko
printf '%s' "$NOM" | grep -qE '^[A-ZÀ-Þ]' && verdict "le nom affiché se LIT (capitale initiale)" ok || verdict "le nom affiché n'est pas capitalisé" ko

dire "2. La LIGNE en base — le mot de passe vaut NULL"
JS="d=db.getSiblingDB('meeshy'); u=d.User.findOne({email:'$ADRESSE'},{username:1,displayName:1,firstName:1,lastName:1,password:1,failedLoginAttempts:1,lockedUntil:1}); print(JSON.stringify(u));"
LIGNE=$(mongo "$JS"); printf '  %s\n' "$LIGNE"
if lu "la ligne existe" "$LIGNE"; then
  printf '%s' "$LIGNE" | grep -q '"password":null' && verdict "password vaut NULL — ni chaîne vide, ni hash" ok \
                                                   || verdict "password ne vaut pas null" ko
fi

dire "3. POST /auth/login — le mot de passe n'existe pas"
REP=$(curl -sS -w '\n%{http_code}' -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$ADRESSE\",\"password\":\"nimporte-quoi\"}")
CODE=$(printf '%s' "$REP" | tail -1); CORPS=$(printf '%s' "$REP" | sed '$d')
printf '  HTTP %s — %s\n' "$CODE" "$CORPS"
[ "$CODE" = 401 ] && verdict "refus en 401" ok || verdict "HTTP $CODE au lieu de 401" ko
printf '%s' "$CORPS" | grep -q PASSWORD_NOT_SET && verdict "le code DIT la porte à prendre" ok || verdict "le code ne nomme pas la porte" ko
# Cet essai-ci en est un : il compte dans le total de l'étape suivante.
PARVENUS=0; [ "$CODE" = 401 ] && PARVENUS=1

dire "4. Le verrou n'a RIEN compté — six essais au total"
# Les essais doivent ATTEINDRE la branche d'authentification. Un 429 du
# limiteur laisserait le compteur à zéro pour une raison qui n'a rien à voir
# avec ce qu'on prouve : le témoin serait vert et vide, exactement le défaut
# que la version précédente de ce script avait deux étapes plus haut.
# `MAX_FAILED_LOGIN_ATTEMPTS = 5` (services/gateway/src/services/LoginAttemptService.ts).
# Il faut donc que CINQ essais AU MOINS parviennent à la branche : c'est le
# seuil qui, sur un compte ordinaire, poserait le verrou. En dessous, un
# compteur à zéro ne prouve pas que le verrou s'abstient — seulement qu'on ne
# l'a pas atteint.
SEUIL=5
BLOQUES=0
for _ in 1 2 3 4 5 6; do
  [ "$PARVENUS" -ge "$SEUIL" ] && break
  c=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$ADRESSE\",\"password\":\"encore-faux\"}")
  if [ "$c" = 401 ]; then PARVENUS=$((PARVENUS+1)); else BLOQUES=$((BLOQUES+1)); sleep 3; fi
done
printf '  essais parvenus à l'"'"'authentification : %s (seuil de verrou : %s) — refusés par le limiteur : %s\n' "$PARVENUS" "$SEUIL" "$BLOQUES"
[ "$PARVENUS" -ge "$SEUIL" ] && verdict "le seuil de verrou a été ATTEINT sans être franchi" ok \
                             || verdict "seulement $PARVENUS essai(s) parvenus — le seuil n'est pas atteint, la preuve n'est pas faite" ko
JS="d=db.getSiblingDB('meeshy'); u=d.User.findOne({email:'$ADRESSE'},{failedLoginAttempts:1,lockedUntil:1}); print(JSON.stringify({essais: (u.failedLoginAttempts===undefined?'absent':Number(u.failedLoginAttempts)), verrou: (u.lockedUntil===undefined?'absent':u.lockedUntil)}));"
APRES=$(mongo "$JS"); printf '  %s\n' "$APRES"
# Les deux assertions ci-dessous ne SIGNIFIENT quelque chose que si le seuil a
# été atteint. Les rendre inconditionnelles les ferait verdir sur zéro essai —
# « le compteur est resté à zéro après 0 échecs » est vrai, et ne prouve rien.
if [ "$PARVENUS" -lt "$SEUIL" ]; then
  printf '  ⏭  compteur et verrou : non mesurables, le seuil n'"'"'a pas été atteint\n'
elif lu "le compteur est lisible" "$APRES"; then
  printf '%s' "$APRES" | grep -qE '"essais":(0|"absent")' && verdict "le compteur est resté à zéro après $PARVENUS échecs parvenus" ok \
                                                          || verdict "le compteur a bougé" ko
  printf '%s' "$APRES" | grep -q '"verrou":"absent"' && verdict "aucun verrou posé alors que le seuil est atteint" ok || verdict "un verrou a été posé" ko
fi

dire "5. POST /auth/magic-link/request — la porte existe vraiment"
REP=$(curl -sS -w '\n%{http_code}' -X POST "$API/auth/magic-link/request" -H 'Content-Type: application/json' -d "{\"email\":\"$ADRESSE\"}")
printf '  HTTP %s\n' "$(printf '%s' "$REP" | tail -1)"
[ "$(printf '%s' "$REP" | tail -1)" = 200 ] && verdict "la requête est acceptée" ok || verdict "la requête est refusée" ko
JS="d=db.getSiblingDB('meeshy'); u=d.User.findOne({email:'$ADRESSE'},{_id:1}); print(JSON.stringify({jetons: d.MagicLinkToken.countDocuments({userId:u._id})}));"
JETONS=$(mongo "$JS"); printf '  %s\n' "$JETONS"
if lu "le décompte de jetons est lisible" "$JETONS"; then
  printf '%s' "$JETONS" | grep -q '"jetons":0' && verdict "un jeton a bien été émis" ko || verdict "un jeton a bien été émis" ok
fi

dire "6. Nettoyage — le compte de preuve et la sonde de contrat"
# Les MESSAGES des participants retirés partent AVANT eux (#6501). L'inscription
# pose un avis d'arrivée dans la conversation globale, signé du Participant que
# ce nettoyage retire ; `Message.sender` est une relation REQUISE, et UN avis
# orphelin suffisait à rendre « Meeshy Global » illisible pour tout le monde.
# mongosh n'émule pas les `onDelete: Cascade` de Prisma : les enfants du message
# partent avec lui, nommés un par un (garde :
# services/gateway/src/__tests__/security/proof-scripts-orphan-sender-guard.test.ts).
JS="d=db.getSiblingDB('meeshy'); n=0; d.User.find({email:{\$in:['$ADRESSE','sonde-contrat@example.invalid']}},{_id:1}).forEach(function(u){ var ps=d.Participant.find({userId:u._id},{_id:1}).toArray().map(function(p){ return p._id; }); var ms=d.Message.find({senderId:{\$in:ps}},{_id:1}).toArray().map(function(m){ return m._id; }); ['MessageAttachment','MessageStatusEntry','AttachmentStatusEntry','AttachmentReaction','Reaction','Mention','UserMessageDeletion','MessageStar'].forEach(function(c){ n+=d.getCollection(c).deleteMany({messageId:{\$in:ms}}).deletedCount; }); d.Notification.updateMany({messageId:{\$in:ms}},{\$set:{messageId:null}}); n+=d.Message.deleteMany({_id:{\$in:ms}}).deletedCount; n+=d.MessageStar.deleteMany({userId:u._id}).deletedCount; n+=d.MagicLinkToken.deleteMany({userId:u._id}).deletedCount; n+=d.Participant.deleteMany({userId:u._id}).deletedCount; n+=d.UserSession.deleteMany({userId:u._id}).deletedCount; n+=d.User.deleteOne({_id:u._id}).deletedCount; }); print(JSON.stringify({supprimes:n, restants: d.User.countDocuments({email:{\$in:['$ADRESSE','sonde-contrat@example.invalid']}})}));"
NET=$(mongo "$JS"); printf '  %s\n' "$NET"
if lu "le nettoyage est lisible" "$NET"; then
  printf '%s' "$NET" | grep -q '"restants":0' && verdict "aucun compte de test ne subsiste" ok || verdict "un compte de test subsiste" ko
fi

dire "VERDICT"
[ "$ROUGE" -eq 0 ] && echo "  TOUTES LES PREUVES SONT PASSÉES" || echo "  AU MOINS UNE PREUVE A ÉCHOUÉ"
exit "$ROUGE"
