## Leçon 192 — une règle de confidentialité écrite dans un commentaire ne s'applique qu'aux branches où quelqu'un a pensé à la relire (2026-08-16, routine temps réel, cycle 41)

**Le fait.** `broadcastReadStatusUpdate` construit son payload en deux branches.
Sur `type: 'received'`, un commentaire de six lignes justifie l'ABSENCE de
`lastReadAt`/`unreadCount`, en partie parce qu'ils « would needlessly disclose
the actor's backlog to every peer in the room ». Sur `type: 'read'`, quinze
lignes plus bas, les deux champs partent dans l'éventail — vers toute la
conversation. La règle n'était ni absente, ni contestée, ni oubliée : elle était
**écrite, admise, et appliquée à une seule des deux branches**.

**Pourquoi ça survit.** Un commentaire qui justifie une absence est attaché au
CAS qui l'a motivé, jamais à la propriété qu'il énonce. Celui-ci décrivait
correctement pourquoi un `received` n'a pas ces champs ; personne n'a eu à
relire la phrase en se demandant de quoi d'autre elle était vraie. Le
raisonnement ne se propage pas tout seul d'une branche à sa sœur — et il se
propage d'autant moins que le fichier donne l'impression d'avoir déjà tranché la
question.

**La règle qui en sort.** Quand un commentaire justifie qu'un champ ne parte
PAS, le lire comme une propriété et non comme une note locale : *de quels autres
chemins cette phrase est-elle vraie ?* Si la réponse est « du chemin d'à côté »,
le commentaire ne documente pas une décision, il documente un défaut à moitié
corrigé.

**Le corollaire d'adressage, plus général que ce cycle.** Un champ scopé sur une
personne se vérifie à l'**ADRESSAGE**, pas seulement à la lecture. Ici les trois
clients étaient irréprochables — le seul qui lit ces champs les conditionne à
« l'acteur, c'est moi » — et c'est précisément ce qui a laissé la fuite vivre :
*puisque le client sait l'ignorer, personne ne s'est demandé pourquoi il le
recevait.* « Le consommateur filtre » répond à « est-ce que ça casse ? », jamais
à « est-ce que ça part ? ». Une donnée qui traverse le réseau vers quelqu'un qui
va la jeter n'est pas neutre : c'est une divulgation dont le seul effet est
d'être une divulgation.

**Le piège technique à ne pas rejouer.** Retirer le destinataire privilégié de
la liste de rooms ne le retire PAS de la diffusion : la room de conversation est
chaînée à côté et le tient dès qu'il regarde le fil. Sans `.except()`, servir
deux payloads à deux audiences en livre deux au même socket — et la garantie
« une copie par socket » tombe exactement sur l'événement où les deux copies
diffèrent, donc là où elle protégeait quelque chose. *Deux audiences pour un
événement, c'est une exclusion, pas deux emits.*

**Ce qui a été écarté, et pourquoi ça compte.** Un canal existait déjà pour
porter ces champs à la bonne room (`conversation:unread-updated`, qui va à
l'acteur seul et porte déjà `unreadCount`). Il a été écarté parce qu'il imposait
une migration iOS pendant laquelle la synchro multi-appareils aurait régressé.
*Une correction de confidentialité qui casse une fonctionnalité en attendant
trois releases clientes n'est pas une correction, c'est un échange* — et un
échange se propose, il ne se décide pas dans un cycle de routine.

**§ coordination — ce que la leçon 190 ne couvrait pas.** Elle prescrivait de
relire `main` sur les **fichiers visés** avant d'ouvrir la PR. Appliquée ici, elle
a fonctionné : aucune collision de code, les deux sessions simultanées touchaient
des fichiers disjoints. Elle a pourtant laissé passer une collision — sur les
**compteurs partagés** : numéro de cycle et numéro de leçon, qui n'appartiennent
à aucun fichier visé et que rien ne réserve. La session voisine avait elle-même
déjà renuméroté 39 → 40 pour cette raison exacte, une heure plus tôt. *Un
compteur global est un fichier visé par tout le monde* : la relecture d'avant-PR
doit inclure `tasks/lessons.md` et le glob des journaux d'audit, même quand le
correctif n'y touche pas — sinon le numéro est choisi au démarrage et défendu
jusqu'au conflit.
