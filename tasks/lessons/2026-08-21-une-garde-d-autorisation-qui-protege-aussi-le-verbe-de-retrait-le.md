## 2026-08-21 — Une garde d'autorisation qui protège aussi le verbe de RETRAIT : le motif s'est répété TROIS fois

Cycle 75. Le défaut trouvé est le troisième exemplaire d'un même motif, et
c'est cette répétition qui est la leçon — pas le défaut.

| cycle | verbe muselé | ce qui survivait |
|---|---|---|
| 74 | `handleLiveLocationStop` | une épingle de position figée, ≤ 8 h |
| 75 | `call:force-leave` (sens client) | un micro ouvert dans un appel en cours |

Les deux commencent par résoudre l'appartenance avec `isActive: true`. Les deux
sont le SEUL verbe capable de retirer l'état qu'ils gardent. Conséquence
mécanique : **au moment précis où quelqu'un perd le droit d'être là, il perd
aussi le pouvoir de retirer ce qu'il y a laissé.** L'état ne se fige pas par
accident — il se fige PARCE QUE la garde a fait son travail.

La règle à appliquer devant toute garde d'autorisation :

> Lister les verbes qu'elle protège, et les séparer en deux colonnes : ceux qui
> AJOUTENT ou MODIFIENT un état, et ceux qui le RETIRENT. La garde n'a de sens
> que sur la première colonne. Sur la seconde, elle transforme une révocation de
> droit en fuite d'état.

Corollaire opérationnel : quand la garde doit rester (le sortant ne doit pas non
plus pouvoir agir), **c'est au SERVEUR de faire le retrait à sa place**, au
moment où il révoque le droit — jamais de laisser l'état pendre en espérant un
verbe qu'on vient de rendre inaccessible.

### Deux corollaires trouvés en chemin

**1. Deux rooms ne se rejoignent pas toutes seules.** Sortir quelqu'un de
`ROOMS.conversation(id)` ne le sortait pas de `ROOMS.call(callId)`. Avant
d'écrire « untel est sorti », énumérer TOUTES les rooms où il se trouve, et
vérifier ce que chaque canal aval lit RÉELLEMENT pour autoriser : le relais
`call:signal` s'autorise sur `CallParticipant.leftAt`, jamais sur
l'appartenance au fil. **Une éviction de room n'est une autorisation que si
quelqu'un en aval lit la room.**

**2. Un contrat écrit + un récepteur complet ≠ une fonction qui existe.**
`SERVER_EVENTS.CALL_FORCE_LEAVE` était déclaré, documenté, et iOS
l'implémentait ENTIÈREMENT — démontage WebRTC, clôture CallKit, quatre tests
verts. Le gateway ne l'émettait jamais. Les tests iOS passaient parce qu'ils
injectaient l'événement eux-mêmes ; rien dans aucune suite ne pouvait
s'apercevoir qu'aucun producteur n'existait.

Android l'avait pourtant CONSTATÉ, en toutes lettres : « `call:force-leave` is
deliberately ABSENT: the gateway never emits it (verified dead) ». La preuve
était écrite dans le dépôt depuis un mois, dans un commentaire que personne ne
relierait jamais à la fonctionnalité manquante côté serveur.

À retenir : **pour tout événement serveur→client du contrat partagé, la
question « qui l'ÉMET ? » se pose séparément de « qui l'écoute ? », et un
`grep` du nom d'événement dans les services répond en dix secondes.** Un
récepteur soigné est un indice trompeur : il donne toutes les apparences d'une
fonction livrée. Et quand un client note « verified dead », ce n'est pas un
constat à archiver — c'est un défaut serveur non déposé.

---
