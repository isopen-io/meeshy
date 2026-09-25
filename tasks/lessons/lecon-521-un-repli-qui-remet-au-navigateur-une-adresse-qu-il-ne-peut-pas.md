## Leçon 521 — Un repli qui remet au navigateur une adresse qu'il ne peut pas résoudre n'est pas un repli : c'est une panne silencieuse

**Le constat.** Sur staging (2026-09-05), la page `/chats/:id` de la v3, servie en HTTPS, portait
`data-passerelle="http://gateway-staging:3000"` — le nom INTERNE du conteneur de la passerelle. Le
navigateur bloquait le socket (`ws://`) et la relecture des messages (`http://`) en contenu mixte :
le fil restait un formulaire, sans temps réel ni médias. Le document s'était composé sans erreur,
`/healthz` répondait `{ ok: true }`, aucun témoin n'avait rougi. Le conteneur tournait simplement sans
`NEXT_PUBLIC_API_URL` dans son environnement, alors que le compose du dépôt la déclarait depuis le
commit qui avait créé le service.

**La cause.** `baseDeLaPasserellePublique()` s'écrivait `NEXT_PUBLIC_API_URL ?? MEESHY_GATEWAY_URL ??
'http://localhost:3000'` — un repli pensé sur un poste de développement, où les deux adresses sont la
boucle locale et où le navigateur les atteint. Dans un conteneur, l'adresse interne n'est PAS
joignable par le navigateur : le repli ne pouvait pas marcher, par construction, et il s'appliquait
en silence. Le garde voisin du pipeline (« le service déclare ce que son code lit ») était vert : il
vérifie qu'une variable de la chaîne est DÉCLARÉE, pas que la VALEUR déclarée est une origine qu'un
navigateur atteint — deux questions, un seul garde.

**La règle.**
1. Un repli n'en est un que s'il peut MARCHER dans l'environnement où il s'applique. La seule adresse
   interne qu'un navigateur résout est la boucle locale ; hors d'elle, la configuration MANQUE, et
   lever est ce qui la rend visible. Un document qui refuse de se composer vaut mieux qu'un document
   qui ment.
2. La santé d'un conteneur dit sa CONFIGURATION, pas seulement son démarrage : `/healthz` lit la même
   règle à l'exécution (`force-dynamic`) et répond 503 avec la cause — un conteneur mal configuré ne
   devient pas sain, donc Traefik ne lui envoie personne.
3. Un garde qui vérifie une DÉCLARATION ne vérifie pas une VALEUR. Le pipeline lit désormais la
   valeur : https, et distincte de l'adresse interne (`lOriginePubliqueEstJoignableParUnNavigateur`),
   et il interdit à l'image de la v3 de figer une variable `NEXT_PUBLIC_*` au build — Next inline
   toute variable présente au `next build`, jusque dans le code serveur, et la valeur du compose
   serait alors ignorée sans qu'aucun témoin ne rougisse.
4. « Le dépôt dit X » n'est pas « le conteneur qui tourne a X ». Quand le symptôme contredit le
   compose, soupçonner l'environnement DÉPLOYÉ — et rendre le CODE incapable de cacher l'écart.
