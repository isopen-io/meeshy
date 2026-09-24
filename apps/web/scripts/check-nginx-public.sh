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

[ "$fail" -eq 0 ] || { echo "des adresses publiques du domaine sont FAUSSES"; exit 1; }
echo "les adresses publiques du domaine sont servies"
