## Une coupe de charge utile et une exclusion d'audience ne répondent pas à la même question

Mesuré le 2026-11-22 en livrant #20337 (cycle 219), sur le roster nominatif que
`comment:reaction-added` / `-removed` transportent.

Devant une charge qui nomme des gens qu'un lecteur n'a pas le droit de
connaître, deux réparations se présentent, et l'issue les posait à ÉGALITÉ :

| réparation | ce qu'elle change | qui la paie |
|---|---|---|
| **couper** le champ de la charge | le CONTRAT du fil | **tous les clients déjà déployés** |
| **exclure** de l'audience ceux que la charge nomme | l'AUDIENCE | seulement ceux que la règle visait déjà |

Elles ne sont pas interchangeables, et le discriminant n'est pas le goût : c'est
**qui LIT le champ**. `PostReactionAggregation` avait reçu la coupe (« NO
userIds, count only ») ; la transposer au commentaire paraissait être une mise à
parité gratuite. Mesuré sur les trois clients : le web n'en a aucune occurrence,
Android non plus, et **iOS le consomme** — `CommentHeartLedger.reconcile` dérive
« mon cœur » de `reactorUserIds.contains(myUserId)`, et non de
`hasCurrentUser`, que son propre doc-comment déclare faux pour les destinataires
d'un broadcast.

Sous un roster coupé, un lecteur qui avait réagi voit un cœur de trop à chaque
événement d'un tiers — sur les versions **déjà en production**, que rien ne met
à jour. La coupe n'était donc pas un correctif de confidentialité, mais une
décision de contrat avec un train de release (rétrocompatibilité, #9223).

La réparation retenue nomme chaque id de la charge comme SUJET de l'exclusion de
rooms — la lecture honnête de la leçon 275 (« une protection se mesure sur tout
ce que la charge TRANSPORTE ») pour une charge UNIQUE servie à N lecteurs, où
aucun filtrage par lecteur n'est possible. Là où la charge est NOMINATIVE (un
ack), elle se filtre au contraire par lecteur : filtrer vaut mieux que refuser,
et le lecteur ne perd jamais son propre id.

> **La forme de la charge décide du mécanisme, et la mesure des consommateurs
> décide du périmètre.** Une charge unique pour N lecteurs ne se filtre pas :
> elle se tait chez qui n'a pas droit à tout ce qu'elle nomme. Une charge d'un
> seul lecteur se filtre. Et avant de transposer la coupe d'une jumelle, relever
> qui lit le champ — c'est la règle « relever les consommateurs sert à décider
> s'il faut changer la forme DU TOUT » (cycle 128), et elle a rendu ici un
> verdict OPPOSÉ à celui de la jumelle.

Corollaire de méthode, payé dans le même lot : nommer un sujet que seule la
mutation produit force à lire la séparation APRÈS elle. Le doc-comment de #20236
affirmait qu'elle était lue AVANT « pour que l'émission reste synchrone après la
mutation » — déjà inexact sur ce chemin, où `createUpdateEvent` est une lecture
en base. Une contrainte qu'un lot doit déplacer se **corrige** dans son
doc-comment, jamais ne se contredit en silence : la phrase laissée en place
aurait envoyé le prochain lecteur défendre un ordre que le code ne tenait plus.
