#!/usr/bin/env bash
# #10855 — compresseur du journal d'accès Traefik, appelé par logrotate
# (compresscmd) : lit le journal sur l'entrée standard, écrit le .gz sur la
# sortie. Avant de compresser, il masque la VALEUR des paramètres de requête
# qui portent un secret (lien magique, réinitialisation, vérification d'e-mail,
# désabonnement…) : ils voyagent en ?token=… et Traefik journalise le chemin
# avec sa chaîne de requête. L'adresse e-mail qui accompagnait le jeton des
# liens de vérification (`?token=…&email=…`, e-mails envoyés avant #10859) est
# masquée aussi. Les liens neufs portent le secret dans le fragment, que le
# navigateur n'envoie jamais (#10859) : ce masquage reste la défense de
# l'ancien format. Le séparateur est « & » ou « & » (Traefik
# échappe « & » en JSON). Les arguments de logrotate (-6…) sont ignorés.
set -euo pipefail
LC_ALL=C sed -E 's/((\?|&|\\u0026)[A-Za-z_]*([Tt]oken|[Cc]ode|[Pp]assword|[Ss]ecret|[Ss]ig|[Ss]ignature|[Kk]ey|[Ss]ession|[Oo]tp|[Ee]mail)=)[^&"\\ ]*/\1REDACTED/g' | gzip -9
