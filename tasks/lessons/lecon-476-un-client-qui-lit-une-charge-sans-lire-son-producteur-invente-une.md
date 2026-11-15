## Leçon 476 — Un client qui LIT une charge sans lire son PRODUCTEUR invente une forme, et le défaut qu'il crée est un compteur mort

**Contexte.** Écran `notifs` de la v3 web (#4898). Le module d'API projette ce
que sert `GET /api/v1/notifications`. Deux champs, deux erreurs — et j'avais
écrit les deux avant d'ouvrir le code de la passerelle.

1. **L'état vit sous `state`, pas à la racine.** `NotificationFormatter`
   (`services/gateway/src/services/notifications/NotificationFormatter.ts:85-91`)
   range `isRead`, `readAt`, `createdAt` et `expiresAt` dans un objet `state`.
   Lire `brut.isRead` rend `undefined` — donc « non lue » — pour TOUTES les
   lignes.
2. **`unreadCount` est à la RACINE de l'enveloppe, pas sous `meta`.** Le
   handler le pose à côté de `data` et de `pagination`, sur ses DEUX formes de
   page (`routes/notifications.ts:207` et `:215`). Le lire sous `meta` rend
   `undefined`, donc ZÉRO.

**Ce que ces deux défauts ont en commun, et c'est le fond.** Aucun ne casse
rien. Aucun ne lève d'exception, ne rougit un type, ne vide un écran. Ils
rendent un COMPTEUR MORT : une boîte entièrement « non lue » dont le nombre ne
descend jamais, une pastille éteinte en permanence. Un défaut qui *plante* se
voit à la première exécution ; un défaut qui rend une valeur PLAUSIBLE survit à
la recette, au type-check, et à tout témoin écrit contre la même supposition
que le code.

**La règle.** Avant d'écrire la lecture d'une charge, ouvrir le site qui la
COMPOSE — pas sa documentation, pas son schéma de réponse, pas un exemple :
le formateur, et le handler qui l'enveloppe. Un schéma OpenAPI dit ce qui PEUT
être là ; seul le producteur dit OÙ.

**Le corollaire sur les témoins.** Un bouchon écrit de mémoire reproduit
l'erreur du code qu'il éprouve — les deux partagent la même supposition, et le
vert ne prouve alors que leur accord. La charge de bouchon se COPIE du
formateur, avec sa citation `fichier:ligne` ; c'est ce qui rend le témoin
capable de tomber. Vérifié par mutation : les deux pièges remis en place font
tomber 3 témoins sur 9.

**Le cas jumeau, trouvé dans le même lot.** Un témoin de cet écran figeait
`gate.meeshy.me` dans l'URL attendue : il assertait la CONFIGURATION, pas le
comportement, et aurait rougi au premier changement de domaine sans qu'aucun
comportement n'ait bougé. Un témoin d'appel éprouve le CHEMIN ; l'hôte vient de
l'environnement, et l'environnement n'est pas ce qu'on garde.
