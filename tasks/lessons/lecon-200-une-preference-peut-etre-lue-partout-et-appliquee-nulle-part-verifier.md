## Leçon 200 — une préférence peut être lue partout et appliquée nulle part : vérifier l'ADRESSE avant la logique (2026-08-16, routine temps réel, cycle 46)

**Le fait.** Le cycle 45 s'était clos sur une règle : « devant une préférence de
confidentialité consultée à plus d'un endroit, établir d'abord **où elle est
réellement appliquée** ». Appliquée au cycle suivant, cette règle a rendu une
réponse que personne n'attendait : **nulle part**. `showReadReceipts`,
`showOnlineStatus`, `showLastSeen` et `showTypingIndicator` étaient lues par six
portes de diffusion, avec soin, avec cache, avec repli — dans une table que
l'application n'écrit pas. L'écran Confidentialité écrivait un document JSON ;
les portes lisaient des lignes clé/valeur ; le seul code qui écrivait ces lignes
n'avait aucun appelant depuis janvier.

**Ce que trois cycles avaient raffiné sans le voir.** Les cycles 43, 44 et 45 ont
tous travaillé `showReadReceipts` : où poser le gate, écriture ou diffusion ; qui
nommer dans le payload ; quelles portes tiennent le contrat. Trois cycles de
raisonnement juste **sur une valeur qui valait toujours son défaut**. Aucun n'a
échoué : chacun a amélioré une logique réelle, qui servira dès que la valeur
arrivera. Mais aucun n'a posé la question d'un cran en dessous. *Quand plusieurs
passages successifs affinent le TRAITEMENT d'une donnée sans jamais interroger sa
PROVENANCE, la profondeur du raisonnement devient elle-même un camouflage : plus
la logique en aval est soignée, moins on soupçonne que son entrée est constante.*

**Le motif à reconnaître : le circuit fermé qui a l'air complet.** Ici l'écriture
et la lecture de l'UI formaient une boucle parfaite — `PUT` puis `GET` sur la
même route, même table, même forme. Le réglage tenait entre deux lancements, se
synchronisait entre appareils, survivait à une réinstallation. Tout ce qu'un
utilisateur peut observer disait « c'est enregistré », et ça l'était. *Un
aller-retour UI cohérent ne prouve RIEN sur l'application de la préférence : il
prouve que deux extrémités du même tronçon s'accordent. La question est toujours
« qui d'autre lit, et au même endroit ? », jamais « est-ce bien sauvegardé ? ».*

**Pourquoi le défaut `true` achève de masquer.** Une préférence dont le défaut est
« ne rien cacher » se dégrade silencieusement vers le comportement normal : pas
d'erreur, pas de log, pas d'anomalie — le comportement exact d'un utilisateur qui
n'aurait rien réglé. *Une panne d'adressage sur une valeur booléenne à défaut
permissif n'a aucun symptôme propre. Le seul témoin possible est un test qui
écrit par le CHEMIN RÉEL et lit par la PORTE RÉELLE ; tout ce qui court-circuite
l'un des deux confirme la logique sans jamais toucher l'adresse.*

**Le double, encore, et pour la troisième fois de suite.** Les fixtures
déclaraient `userPreference` et pas `userPreferences`. Un double qui ne modélise
qu'un rangement ne peut pas voir que la porte consulte l'autre — il valide la
lecture, jamais son adressage. Cycle 43 : un Fastify sans sérialiseur ne pouvait
pas voir la troncature. Cycle 44 : idem. Cycle 46 : un prisma sans la seconde
table ne peut pas voir la mauvaise adresse. *Le point commun n'est pas « les
doubles mentent » mais « un double n'observe que les dimensions qu'il modélise » :
avant d'écrire un témoin de confidentialité, énumérer les rangements que le
défaut pourrait concerner, et les modéliser TOUS — un tiroir absent du double est
un tiroir que le témoin déclare inexistant.*

**Règle pour la suite.** Avant de raisonner sur une préférence — sa priorité, son
gate, son moment d'application — établir en UNE passe le triplet
`(qui écrit, où, qui lit)`. `grep` du nom de la préférence dans les clients pour
trouver la route appelée ; `grep` du modèle Prisma pour trouver qui l'écrit et qui
le lit. Si l'ensemble des écrivains et l'ensemble des lecteurs sont disjoints, il
n'y a pas de bug de logique à chercher : il y a une adresse à corriger. *Et quand
deux rangements coexistent pour la même donnée, la LECTURE rejoint l'écriture —
jamais l'inverse : faire écrire les deux installe durablement la divergence qu'on
prétend réparer.*
