## Leçon 331

**Vérifier ce qu'une fonction REND ne dit pas ce qu'elle REÇOIT — et j'ai fermé deux issues sur cette confusion.**

`@fastify/rate-limit` applique `config.rateLimit` au hook `onRequest`, qui court **avant**
`preValidation` — donc avant que l'authentification ne pose `authContext` sur la requête. Un
`keyGenerator` qui lit `authContext?.userId` y reçoit `undefined` et retombe sur son repli,
`ip:${request.ip}`. Le gateway tournant sans `trustProxy` derrière Traefik, cette adresse est celle
du conteneur proxy : **la même pour tout le monde**.

Une limite annoncée « par compte » compte alors par ADRESSE, et se trompe dans les **deux** sens :
plusieurs comptes derrière une même sortie (opérateur mobile, bureau, NAT) se partagent un crédit
prévu pour un seul, et un même compte disposant de plusieurs adresses en obtient autant de crédits.
Silencieusement, de surcroît — le limiteur fonctionne, rend des 429 au bon rang, et rien ne signale
que le seau n'est pas celui qu'on croit.

> **CORRECTION, écrite le lendemain de la leçon et par la leçon elle-même.** La première version de
> ce paragraphe disait « 3/h pour la PLATEFORME, le premier appelant prive tous les autres, déni de
> service ». C'était faux : `trustProxy` EST posé depuis #4137, donc `request.ip` est l'adresse
> réelle de l'appelant, pas celle du conteneur Traefik. J'avais repris l'affirmation des
> doc-comments de `middleware/rate-limiter.ts`, antérieurs à #4137 et jamais mis à jour — dans le
> lot même où j'écrivais qu'il faut prouver plutôt que croire. **J'ai prouvé le mécanisme et cru la
> conséquence.** Une vérification n'est pas transitive : elle ne couvre que la proposition qu'elle
> exerce. Sites périmés restants et garde contre leur propagation : issue #4357.

**Comment je m'y suis pris pour ne pas le voir.** J'ai validé la clé en appelant le `keyGenerator`
à la main et en lisant ce qu'il rendait. Cet appel-là ne peut PAS voir le défaut : il fournit
lui-même l'`authContext` que le plugin, lui, n'a pas encore. J'ai ensuite écrit « clé par compte »
dans deux commentaires de clôture (#4184, #4178).

> **Un témoin d'intégration monte la vraie route sur le vrai plugin et lit la valeur RÉELLEMENT
> calculée.** Dès qu'une valeur dépend d'un ORDRE (un hook, une phase, un middleware posé avant un
> autre), l'appeler directement teste la fonction et pas le système — et c'est l'ordre qui était en
> cause.

Corollaire de garde : tenir la **cause** en plus du symptôme. Le témoin assère `hook === 'preHandler'`
à côté de « la clé porte le userId », pour tomber même si quelqu'un fabrique la clé autrement.

Corollaire de lot : un défaut hérité voyage avec celui qu'on corrige. `skipOnError: true`, posé
globalement et fusionné par `Object.assign` dans toute config qui ne le redéclare pas, faisait
échouer ces limiteurs dans le sens OUVERT — rouvrant une couche plus bas exactement ce que #4184
venait de fermer sur son limiteur de renvoi.

La découverte revient au lot #4147, dont le doc-comment l'énonce. **Je l'ai prouvée au lieu de la
croire, et elle m'a rendu mes propres plafonds.** Détail et dette restante : issue #4347.
