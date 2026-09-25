## Leçon 169 — Un arbitre de concurrence ne vaut que s'il garde TOUTES les portes d'écriture (2026-08-14, routine temps réel, cycle 19)

Le cycle 17 avait doté les préférences de conversation d'un compteur monotone `version`, l'avait
fait traverser le sérialiseur REST, et avait posé `applyRemotePreferences()` comme portillon des
diffusions socket : `incoming.version <= local -> drop`. Correct, testé, documenté. Et pourtant
l'état pouvait toujours rembobiner — parce que la ligne du store web a **deux** écrivains, et que
l'arbitre n'en gardait qu'un. Les quatre bascules optimistes (`togglePin`, `toggleMute`,
`toggleArchive`, `setReaction`) posaient la réponse de leur `PUT` **sans condition**, juste à côté
du portillon qu'elles ne franchissaient pas.

**Le signal de reconnaissance** : dès qu'on introduit un arbitre (`version`, `updatedAt`, un LWW,
un numéro de séquence), la question à se poser n'est pas « mon écrivain passe-t-il par l'arbitre ? »
mais « **combien d'écrivains cette case a-t-elle, et lesquels ne le franchissent pas ?** ». Un
arbitre partiel est plus dangereux qu'aucun arbitre : il donne l'impression que la course est
traitée, et concentre l'attention sur le chemin gardé. Ici la porte non gardée était la plus
fréquente des deux — chaque action de l'utilisateur y passait.

**Le corollaire de la rétractation.** Le même raisonnement vaut pour le `catch` d'une écriture
optimiste. Rétracter en restaurant l'instantané capturé AVANT la requête suppose que rien n'a écrit
entre-temps — supposition fausse exactement dans les cas que l'arbitre existe pour traiter. Sur un
état immuable, l'identité référentielle tranche sans coût : ne rétracter que si l'entrée locale est
TOUJOURS l'objet que cette écriture a posé. Un échec réseau ne doit jamais annuler une action sans
rapport avec lui.

**La réserve qui évite la sur-correction** : l'arbitrage ne s'applique QUE si la valeur entrante
porte effectivement l'arbitre. Une réponse antérieure à l'ajout du champ n'a pas de version, et la
jeter au motif que `undefined ?? 0 <= 0` perdrait l'écriture — un déploiement mixte cassé par la
correction elle-même. « Absent = version 0 » est la bonne convention côté LOCAL (une ligne jamais
diffusée est sous toute version que le serveur peut émettre) et la mauvaise côté ENTRANT.

**Corollaire de refactor** : les quatre bascules étaient quasi identiques sur ~40 lignes chacune.
Le cycle 17 l'avait noté et repoussé. Tant que la duplication tient, une correction de course doit
être appliquée quatre fois — et une cinquième bascule naîtra sans elle. Factoriser d'abord
(`writeOptimistic(conversationId, patch, request)`), corriger ensuite, à un seul endroit.
