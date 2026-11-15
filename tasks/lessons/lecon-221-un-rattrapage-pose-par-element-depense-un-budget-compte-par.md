## Leçon 221 — un rattrapage posé par ÉLÉMENT dépense un budget compté par UTILISATEUR (2026-08-17, routine messagerie, cycle 57)

**Le constat.** Le cycle 56 a mis en service la réconciliation des réactions au
retour de la connexion. Elle est posée dans `useReactionsQuery`, donc **par
bulle** ; le franchissement injoignable → joignable réveille toutes les bulles
montées **dans le même tick**, et le serveur compte ces demandes **par
utilisateur** (`REACTION_SYNC`, 120/60 s). Un fil de 40 bulles dépense 40
demandes par battement de connexion — sur une connexion qui bat, c'est-à-dire
exactement le scénario pour lequel la réconciliation existe. Au-delà du plafond
le serveur refuse, et le refus était traité comme une panne : chaque bulle
refusée repartait une seconde fois, dans la fenêtre qui venait de la refuser.

Le cycle 56 avait écrit le chiffre — « une demande par bulle montée au
franchissement, sous la même limite (120 req/60 s) » — et l'avait assimilé au
volume de l'ouverture d'un fil. L'assimilation est fausse sur un point : **une
ouverture de fil est rare, un franchissement de connexion se répète.** Le
volume n'était pas faux à l'instant, il était faux dans le temps.

**Trois règles.**

1. **Quand on livre un rattrapage, écrire son volume ET sa FRÉQUENCE.** « N
   demandes » ne dit rien : « N demandes × F franchissements par minute, contre
   un budget de B par minute » se compare. Le cycle 56 avait le N et le B, et le
   défaut tient entièrement dans le F qui manquait.

2. **Un déclencheur PARTAGÉ (socket, focus, réseau) réveille tous ses abonnés
   dans le même tick.** Si chaque abonné émet, la rafale vaut le nombre
   d'abonnés — qu'aucun d'eux ne connaît. Aucun ne peut décider seul d'attendre :
   il faut un tour d'émission au niveau du MODULE, pas une temporisation par
   abonné (qui ne fait que déplacer la rafale).

3. **Un REFUS n'est pas une PANNE, et se réessaie encore moins.** Un budget
   épuisé est une réponse du serveur : la fenêtre n'a pas bougé entre deux
   tentatives immédiates, donc la seconde est refusée comme la première — en
   ayant coûté une demande de plus. La distinction doit voyager dans un littéral
   PARTAGÉ (`RATE_LIMIT_REFUSAL_MESSAGE`), jamais dans une prose que chaque
   client re-devine.

**Corollaire, sur le nombre lui-même.** Dès qu'un client se cadence sur un
plafond serveur, ce plafond a traversé la frontière : il devient une donnée
partagée (`REACTION_SYNC_BUDGET` dans `@meeshy/shared`), pas un nombre recopié
des deux côtés. Un client qui devine le plafond le devine faux au premier
ajustement — et il le devinera faux SILENCIEUSEMENT, puisque le symptôme est un
rattrapage qui se refuse tout seul.

**Corollaire de méthode.** Le meilleur terrain de chasse d'un cycle est la
livraison du cycle PRÉCÉDENT : elle est récente, son intention est écrite, et
ses propres notes contiennent les chiffres qu'il faut confronter. Ce cycle n'a
rien trouvé en balayant le contrat ; il a trouvé en relisant le §3.1 du cycle 56.
