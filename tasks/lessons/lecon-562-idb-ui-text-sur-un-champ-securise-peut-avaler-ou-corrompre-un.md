## Leçon 562 — `idb ui text` sur un champ SÉCURISÉ peut avaler ou corrompre un caractère à SHIFT, sans jamais lever d'erreur — vérifier par la LONGUEUR ne suffit pas

En posant la cible iOS de la v3.1 (simulateur « Meeshy Ref-Native »), taper un
mot de passe (`CibleWebV31Tour!`) dans le champ sécurisé de connexion via
`idb ui text` a donné, selon les tentatives, 16 ou 17 points — jamais de façon
prévisible. Sur un champ EN CLAIR (« Nom affiché »), la même chaîne, dans le
même appel, ressort caractère pour caractère IDENTIQUE. Trois causes
distinctes, empilées, ont produit la confusion :

1. **Une suggestion « QuickType » iOS pré-remplit le champ sécurisé au focus**
   (observé : longueur 12 avant toute frappe) ; la première frappe RÉELLE la
   dissout — mesurer la longueur AVANT de taper est donc nécessaire pour ne
   pas la prendre pour du contenu déjà saisi.
2. **Un appel `idb ui text` unique avec un caractère à SHIFT (majuscule, `!`)
   en fin de chaîne le perd silencieusement** — aucune exception, juste une
   longueur inférieure de 1. Le same texte tapé dans un champ EN CLAIR ne
   perd rien : le défaut est spécifique au champ SÉCURISÉ.
3. **Même en tapant caractère par caractère avec vérification de longueur
   après CHAQUE frappe (`avant + 1 == après`), le contenu final peut rester
   FAUX** — la longueur est correcte, la connexion échoue («Identifiants
   invalides ») alors que les MÊMES identifiants réussissent en une requête
   `curl` directe. La longueur ne garantit pas le CONTENU sur ce champ.

> **Sur un champ sécurisé, la longueur après frappe est une preuve
> INSUFFISANTE — elle ne peut PAS distinguer un caractère bien tapé d'un
> caractère substitué par un mauvais état de la touche Majuscule.** La seule
> preuve qui vaille est une connexion RÉUSSIE (ou un champ EN CLAIR témoin,
> tapé avec la même séquence de frappe, dont on relit `AXValue`).

Effet de bord découvert au passage : des tentatives répétées avec un mauvais
contenu déclenchent le rate-limit du gateway (`RATE_LIMIT_EXCEEDED`, HTTP
429) — l'app affiche alors « Requete echouee apres 3 tentatives (status
429) », un message qui ressemble à un blocage réseau et fait perdre du temps
à chercher du côté de la connectivité. Sur staging, la clé se lève par SSH :
`ssh root@meeshy.me "docker exec meeshy-redis-staging redis-cli DEL
'ratelimit:auth:login:ip:<ip>:<préfixe-username>'"` (lister d'abord avec
`KEYS 'ratelimit:auth*'`).

Prochaine fois : taper le mot de passe dans un champ EN CLAIR témoin d'abord
(ex. « Nom affiché » d'un formulaire d'inscription), vérifier `AXValue` au
caractère près, PUIS reproduire exactement la même séquence de frappe sur le
champ sécurisé — ou, plus sûr, créer un compte de capture jetable avec un mot
de passe sans caractère à SHIFT en fin de chaîne pour éliminer la variable.
