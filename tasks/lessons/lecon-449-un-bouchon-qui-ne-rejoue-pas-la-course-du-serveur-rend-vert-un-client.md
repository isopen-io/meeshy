## Leçon 449 — Un bouchon qui ne rejoue pas la COURSE du serveur rend vert un client qui la perd

Trois des seize défauts de la revue croisée du fil temps réel (#4524) avaient la
même forme : le témoin était vert contre `e2e/visual/lib/*` et faux contre la
passerelle, parce que le bouchon avait copié la RÉPONSE de la route sans copier
sa LOI.

| ce que le bouchon faisait | ce que la passerelle fait | ce qui passait vert |
|---|---|---|
| posait l'identité du socket SYNCHRONEMENT dans `connection` | `handleTokenAuthentication(socket)` lancé SANS être attendu (`MeeshySocketIOManager.ts:1740`) — un `conversation:join` émis sur `connect` reçoit `not_authenticated` (`ConversationHandler.ts:129-134`) | un module qui rejoignait la room sur `connect` et n'y entrait jamais |
| `hasGap: sync.trou`, inconditionnel | `hasGap = seq !== undefined && seq < checkpointSeq - GAP_THRESHOLD` (`routes/sync/index.ts:279`), et `checkpointSeq = 0` pour une session anonyme (`:274-278`) | un client qui n'envoyait jamais `seq`, et un cas de recette qui promettait à l'INVITÉ un séparateur que la passerelle ne sait pas lui servir |
| servait `POST /anonymous/refresh` comme une route vivante | `depreciee({ depuis: '2026-08-30', successeur: '/guest-sessions/me' })` (`anonymous.ts:341`) | un battement de bail bâti sur un alias condamné au Sunset |

> **Un bouchon copie une LOI, pas une réponse.** La question à poser à chaque
> route ou événement bouchonné : « à quelle condition la passerelle répond-elle
> AUTRE chose ? » — l'asynchronie, la garde sur un paramètre absent, la
> dépréciation. Si le bouchon ne peut pas produire cette autre réponse, le
> témoin ne peut pas tomber, et son vert est celui de la vacuité.

Le remède a eu deux faces, et la seconde est la plus facile à oublier : rendre
au bouchon la course (un `setTimeout` avant `authenticated`, `hasGap` calculé
par la formule du serveur, l'alias déprécié gardé mais JAMAIS attendu par un
spec), PUIS faire tomber le témoin AVANT le correctif — c'est le seul moment où
l'on sait que le bouchon voit vraiment.

Corollaire de recette : **une capacité que la passerelle n'expose pas à un
lecteur ne s'affiche pas (régime 3), même si la conception l'énonce pour
lui.** Le cas D du § 6.5 promettait `hasGap` à l'invité ; la loi du serveur dit
qu'un `Participant.id` n'a pas de curseur. Le cas est resté — il gage l'ordre
d'envoi et le rattrapage —, le séparateur est gagé côté membre, et la
conception le DIT au lieu de le laisser croire.
