## Une sélection écrite en `-skip-testing` se lit à l'ENVERS, et compter dessus inverse la réponse (cycle 143)

Pour savoir si mon correctif était ATTEIGNABLE dans la tranche iOS qui échouait,
j'ai demandé sa composition à `scripts/ci/ios-test-shards.mjs --args --shard 4`,
puis listé les classes rendues et cherché celles qui touchent `OfflineQueue.shared`.
Cinq classes sont sorties, dont `ConversationViewModelOfflineQueueTests`, qui
appelle précisément le chemin que le lot modifie. J'en ai conclu que mon code
tournait dans cette tranche.

La sortie disait l'inverse. La DERNIÈRE tranche est le **reste** : ses arguments
sont `-only-testing:MeeshyTests` suivi de 1 681 lignes `-skip-testing:…`, c'est-à-dire
la liste de ce qu'elle **ne joue pas**. Les cinq classes que j'avais relevées
étaient donc exactement celles qui ne tournent PAS là. La vraie composition est
le complément — 563 classes — et aucune n'appelle `retryItem`.

> **Un filtre peut exprimer une sélection par son complément, et rien dans la
> forme d'une ligne ne dit lequel des deux on lit.** Avant de compter sur la
> sortie d'un répartiteur, lire le PREMIER argument : `-only-testing` nu
> annonce un reste, et tout ce qui suit est une soustraction. Le complément se
> prend avec `comm -23 <tout> <sauté>`, jamais à l'œil.

Ce qui rend la famille coûteuse, c'est que les deux lectures donnent une réponse
PLAUSIBLE et OPPOSÉE à la même question. Une liste de noms de classes n'a pas
d'orientation visible : elle ressemble à un inventaire dans les deux sens. Le
verdict s'est donc inversé sans qu'aucune commande ne rende d'erreur — et il
portait sur la seule question qui comptait, « ce rouge est-il le mien ? ».

Le contrôle qui l'attrape est une question de cardinalité, pas de lecture :
**une tranche sur quatre doit porter environ un quart des classes.** 1 681 sur
2 244 n'est pas un quart ; 563 l'est. Le compte dément l'interprétation avant
qu'on ait besoin de relire le script.

