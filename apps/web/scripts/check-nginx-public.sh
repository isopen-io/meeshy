#!/bin/sh
# LES ADRESSES PUBLIQUES DU DOMAINE (#6713) — prouvées sur le serveur CONSTRUIT.
#
# Le legacy est décommissionné (#6702) : ce que meeshy.me servait et que des
# artefacts extérieurs visent — liens universels iOS et Android, e-mails,
# anciens formats de lien partagés, moteurs de recherche — doit être servi ou
# redirigé par CE nginx. Sur staging, avant ce lot, chacune de ces adresses
# rendait `index.html` en 200 `text/html` : une réponse qui a l'air vivante et
# qui casse en silence l'ouverture de l'app par un lien universel.
#
# Joué dans l'étape `runner` du Dockerfile : une image dont une ligne est fausse
# ne se construit pas. Chaque vérification lit le statut ET le type (ou la
# cible de la redirection), jamais le seul code.

set -eu

nginx
trap 'nginx -s stop' EXIT
sleep 1

base=http://127.0.0.1:3400
fail=0

expect_type() {
  got=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "$base$1")
  case "$got" in
    "200 $2"*) echo "ok    $1 -> $got" ;;
    *) echo "FAUX  $1 -> $got (attendu 200 $2)"; fail=1 ;;
  esac
}

expect_redirect() {
  got=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$base$1")
  case "$got" in
    "$2 $base$3") echo "ok    $1 -> $got" ;;
    *) echo "FAUX  $1 -> $got (attendu $2 $base$3)"; fail=1 ;;
  esac
}

expect_relative_location() {
  location=$(curl -s -o /dev/null -D - "$base$1" | tr -d '\r' | sed -n 's/^[Ll]ocation: //p')
  case "$location" in
    /*) echo "ok    $1 -> Location relative $location" ;;
    *) echo "FAUX  $1 -> Location « $location » : derrière Traefik, une adresse absolue viserait http://…:3400"; fail=1 ;;
  esac
}

expect_type /.well-known/apple-app-site-association application/json
expect_type /.well-known/assetlinks.json application/json
expect_type /robots.txt text/plain
expect_type /sitemap.xml text/xml
expect_type /android-chrome-512x512.png image/png
expect_type /og/invitation-v1.png image/png
expect_type /manifest.json application/manifest+json
expect_type /conversations/new text/html

expect_redirect /join/mshy_abc 308 /chat/mshy_abc
expect_redirect /conversations/64f0c0ffee0000000000abcd 308 /c/64f0c0ffee0000000000abcd
expect_redirect /conversation/64f0c0ffee0000000000abcd 308 /c/64f0c0ffee0000000000abcd
expect_redirect /p/abc 308 /feeds/post/abc
expect_redirect /s/abc 308 /story/abc
expect_redirect /users/zoe 308 /u/zoe
expect_redirect /policy 308 /terms
expect_redirect '/?affiliate=aff_123' 308 /signup/affiliate/aff_123

expect_relative_location /join/mshy_abc

# UNE ADRESSE INCONNUE RÉPOND 404 (#10123) — avec la coquille, qui dit
# « introuvable » à un humain ; une adresse de l'application reste en 200.
expect_status() {
  got=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "$base$1")
  case "$got" in
    "$2"*) echo "ok    $1 -> $got" ;;
    *) echo "FAUX  $1 -> $got (attendu $2)"; fail=1 ;;
  esac
}
expect_status /n-existe-pas-recette '404 text/html'
expect_status /chats '200 text/html'
expect_status /c/64f0c0ffee0000000000abcd '200 text/html'
expect_status /chat/mshy_world '200 text/html'
expect_status /world '200 text/html'

# L'APERÇU DE CHAQUE ADRESSE (#10192) — ce qu'un robot d'aperçu lit : le
# titre de la famille dans la langue demandée, la grande carte, et RIEN de
# l'adresse elle-même (identifiant, jeton) dans le document servi.
expect_og() {
  body=$(curl -s -A 'facebookexternalhit/1.1' -H "Accept-Language: $2" "$base$1")
  case "$body" in
    *"<meta property=\"og:title\" content=\"$3\">"*'<meta name="twitter:card" content="summary_large_image">'*) echo "ok    $1 [$2] -> og:title « $3 »" ;;
    *) echo "FAUX  $1 [$2] sans og:title « $3 » ni grande carte"; fail=1 ;;
  esac
  if [ -n "${4:-}" ] && printf '%s' "$body" | grep -qF "$4"; then
    echo "FAUX  $1 divulgue « $4 » dans le document servi"; fail=1
  fi
}
expect_og /world fr 'World Wide — la conversation du monde entier, sur Meeshy'
expect_og /login en-US,en 'Sign in to Meeshy'
expect_og /signup/affiliate/aff_123 de-DE 'Ein Meeshy-Konto erstellen' aff_123
expect_og /chats pt-BR 'Meeshy — o mensageiro que traduz'
expect_og /c/64f0c0ffee0000000000abcd ar 'محادثة على Meeshy' 64f0c0ffee0000000000abcd
expect_og /chat/mshy_world es 'Una invitación en Meeshy' mshy_world
expect_og /l/Ab3xYz it 'Un link condiviso su Meeshy' Ab3xYz
expect_og /about fr 'À propos de Meeshy'
expect_status /shell-og/app/fr.html '404 text/html'
# Un NAVIGATEUR reçoit la coquille d'avant, octet pour octet.
if [ "$(curl -s -A 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1' "$base/c/64f0c0ffee0000000000abcd")" = "$(cat /usr/share/nginx/html/index.html)" ]; then
  echo "ok    navigateur /c/… -> index.html inchangée"
else
  echo "FAUX  navigateur /c/… ne reçoit pas index.html"; fail=1
fi

# LE STAGING NE S'INDEXE PAS (#10123) — l'hôte seul le distingue.
staging_robots=$(curl -s -H 'Host: staging.meeshy.me' "$base/robots.txt")
case "$staging_robots" in
  *"Disallow: /"*) echo "ok    staging /robots.txt ferme tout" ;;
  *) echo "FAUX  staging /robots.txt : $staging_robots"; fail=1 ;;
esac
if curl -s -o /dev/null -D - -H 'Host: staging.meeshy.me' "$base/chats" | grep -qi '^x-robots-tag: noindex'; then
  echo "ok    staging /chats -> X-Robots-Tag noindex"
else
  echo "FAUX  staging /chats sans X-Robots-Tag noindex"; fail=1
fi
if curl -s -o /dev/null -D - -H 'Host: meeshy.me' "$base/chats" | grep -qi '^x-robots-tag'; then
  echo "FAUX  production /chats porte un X-Robots-Tag"; fail=1
else
  echo "ok    production /chats sans X-Robots-Tag"
fi

[ "$fail" -eq 0 ] || { echo "des adresses publiques du domaine sont FAUSSES"; exit 1; }
echo "les adresses publiques du domaine sont servies"
