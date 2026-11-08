# Audit de synchronisation temps réel — cycle 148 (2026-11-08)

Branche `claude/exciting-planck-lnj0k7`, partie de `origin/dev` à `341b14db2`.

Le cycle a commencé par les **suivis déclarés du cycle 147** — sept issues et
deux décisions produit — et la première mesure a changé son périmètre : la
branche du cycle 147 (`claude/exciting-planck-qj0mxr`, PR #17057) est
**VIVANTE**, et elle écrit `services/gateway/src/socketio/`.

## Ce que la première mesure a coûté, et ce qu'elle a évité

J'ai lu la PR #17057 verte et propre, relancé sa CI deux fois en voyant ses
runs annulés, puis demandé sa fusion. GitHub a refusé :
`409 Head branch was modified`. La branche avait reçu un commit une minute
plus tôt — *« l'audit adversarial trouve un 8e site, et que mon cliquet voyait
3 sites sur 7 »*. **C'est cette poussée qui annulait les runs** : `ci.yml`
porte `concurrency: ci-${{ github.ref }}` avec `cancel-in-progress` hors `dev`
et `main`, donc chaque poussée tue le run de dispatch en cours.

> **Une annulation de CI répétée n'est pas une panne d'infrastructure : c'est
> une AUTRE session qui pousse.** Les deux hypothèses rendent le même symptôme
> — des jobs `cancelled` sans un seul `failure` — et seule la seconde se vérifie
> en une commande (`gh api repos/.../commits?sha=<branche>`). J'ai relancé la CI
> avant de la poser, ce qui a coûté un run entier et m'a conduit à demander une
> fusion que le dépôt avait raison de refuser.

Conséquence appliquée sans négocier, c'est la règle d'asymétrie du dépôt
(« quand deux lots se disputent un fichier, celui qui n'a rien écrit cède ») :

| suivi du cycle 147 | fichier du constat | verdict |
|---|---|---|
| #17025 — le plancher d'historique manque à `message:attachment-updated` | `socketio/emitAttachmentUpdated.ts` | **CÉDÉ** — la branche vivante le réécrit |
| #17027 — l'accusé de remise du drain | `socketio/MeeshySocketIOManager.ts` | **CÉDÉ** |
| #17028 — le rejeu hors ligne porte les adresses nues | `socketio/handlers/MessageHandler.ts`, `emitAttachmentUpdated.ts`, `postMessageSyncFanOut.ts` | **CÉDÉ** |
| #17024 — le dédup avale le second de deux messages identiques | le drain d'outbox | **CÉDÉ** |
| #17031 — épingler deux fois remonte la conversation de tous | `routes/conversations/messages-pin.ts` | **PRIS** (lot A) |
| #17032 — l'invitation n'annonce pas l'arrivée | `routes/conversations/sharing-invite.ts` | **PRIS** (lot B) |

Les quatre lots cédés sont les plus graves du cycle 147. Les céder n'est pas
une perte : **deux sessions sur les mêmes fichiers produisent deux couches,
pas deux correctifs**, et la seconde arrive après que la première a mesuré. Le
cycle 148 a donc pris les deux suivis dont les chemins étaient libres, puis
ouvert son propre périmètre d'audit — `routes/conversations/` et
`services/notifications/` — explicitement disjoint de `socketio/`.

## Lot A — un rejeu de pin/unpin n'est pas un geste (#17031)

Épingler un message DÉJÀ épinglé, ou dépingler un message qui ne l'est pas,
était une écriture SANS EFFET qui annonçait quand même une activité :
`announceConversationActivity` avance `lastActivityAt` — jamais réversible,
`at = new Date()` à chaque appel donc la condition `lastActivityAt < at`
toujours vraie — et émet un `conversation:updated` porteur d'un `listRankAt`
neuf **à chaque participant**. La conversation remontait en tête de liste de
tout le monde, autant de fois qu'on rejoue, et `pinnedBy` changeait de main,
ce qui réordonne en prime la liste des épinglés (triée `pinnedAt: 'desc'`).

**Le code SAVAIT que ré-épingler n'est pas un geste neuf** — « seul un message
qui DEVIENT épinglé rapporte `tool.pin` (#8959) » — et n'en tirait la
conséquence que pour le crédit d'engagement. Le jumeau qui dépingle ne pouvait
même pas s'en apercevoir : son `select` ne lisait pas `pinnedAt`.

Le court-circuit est posé APRÈS les refus (une conversation chiffrée répond
toujours 409, un non-membre 403) et le `PUT` sert l'épingle EXISTANTE plutôt
que `now` — idempotent jusqu'à son corps, et sans voler l'attribution. La
condition `!message.pinnedAt` du crédit d'engagement est RETIRÉE : le
court-circuit EST désormais cette garde, et la laisser en double la plaçait là
où la retirer un jour n'aurait fait tomber que le crédit, alors que c'est
l'annonce qui coûte un éventail par participant.

### La leçon du lot : la pré-condition d'un geste est l'état OPPOSÉ

**Trois fixtures existantes portaient `pinnedAt: null` pour les DEUX
méthodes**, par des `it.each(['PUT', 'DELETE'])` qui passaient le même
littéral aux deux. Leur `DELETE` décrivait donc un REJEU — exactement l'état
où la route ne fait plus rien — et un témoin d'EFFET posé là ne peut plus
tomber : c'est l'absence d'effet qui le satisferait.

Elles ont été COMPLÉTÉES, jamais affaiblies, par un helper nommé
(`precondition(method)`). Détail : `tasks/lessons/2026-11-08-la-precondition-d-un-geste-est-l-etat-oppose-de-celui-qu-il-produit.md`.

## Lot B — les trois diffusions d'adhésion ont un site unique (#17032)

`POST /conversations/:id/invite` émettait UNE des trois diffusions d'adhésion
quand sa jumelle `POST /conversations/:id/participants` les émettait toutes.
Celle qui manquait le plus cher est `conversation:new` : **c'est la seule qui
CRÉE la ligne de liste**. `conversation:updated` et la pastille, que le message
système d'arrivée pousse déjà, **PATCHENT** une ligne existante — le web sort
si la conversation n'est pas en cache (`patchConversation`). Un invité connecté
voyait donc ses sockets jointes à la room, recevait les `message:new`, et sa
liste ne connaissait pas la conversation ; une notification n'étant créée que
pour un tête-à-tête, **une invitation de GROUPE n'avait aucun canal de
découverte.**

PIÈGE ARMÉ, traité comme tel : aucun client livré n'appelle cette route
aujourd'hui (Android la déclare sans appelant hors tests ; rien dans
`apps/web/src` ni `packages/MeeshySDK`).

Le correctif n'est pas « ajouter deux appels à l'invitation » :
`routes/conversations/membershipAdmissionFanOut.ts` porte les trois, et les
deux portes dont l'arrivant est un TIERS l'appellent. Les deux portes de LIEN
sont EXEMPTÉES avec leur raison, et le discriminant n'est pas la porte mais
**qui agit** : l'arrivant d'un lien est l'auteur du geste et reçoit la
conversation dans la réponse qu'il attend — `conversation:new` lui apprendrait
ce qu'il vient de lire.

Deux cliquets, parce qu'un témoin par événement ne voit pas une porte qui n'en
émet AUCUN :

- `membership-admission-sites.test.ts` — inventaire des portes, discriminé par
  `postJoinSystemMessage` (le marqueur que les QUATRE portes partagent déjà),
  avec l'inventaire GELÉ des exemptions et leur raison ;
- `__tests__/membershipAdmissionFanOut.test.ts` — la LISTE des familles émises,
  et **aucune des trois n'emporte les suivantes** : une levée sur chacune laisse
  partir les deux autres.

### Ce que le lot a trouvé en se faisant

**Le cliquet du cycle précédent a rougi sur l'extraction, et c'était son
rôle.** `member-arrival-door-sweep.test.ts` (#16837) énumère ses sites par le
NOM de l'appel ; le noyau du geste venait de déménager derrière le composite.
Il exige désormais la déclaration du nouveau chemin **et** la vérification que
l'unité déléguée appelle bien le verbe — sans quoi une délégation déclarée vers
un module qui n'annonce rien serait une exemption déguisée. C'est le troisième
exemplaire documenté de cette forme, après les deux balayages de réintégration
du cycle 147.

**Et un double de test mentait par OMISSION.** Le manager du harnais de
`participants.test.ts` ne portait pas `joinUserToConversationRoom` ; l'appel
levait un `TypeError` synchrone attrapé par le `catch` de fin de route, qui
répondait **500**. Le témoin était VERT parce qu'il n'assertait que `io.to` et
`io._emit`, et que les émissions avaient lieu une ligne PLUS HAUT. En remontant
l'admission dans la room AVANT les diffusions — la règle qu'écrit déjà la porte
de lien : « c'est la première qui décide s'il recevra quoi que ce soit du fil »
— le `TypeError` est passé devant les émissions et quatre témoins sont tombés
d'un coup.

> **La règle connue — « un double mente aussi par ce qu'il ACCEPTE » — a une
> variante par OMISSION, plus discrète.** Une méthode absente ne refuse rien et
> ne rend rien de faux : elle fait TOMBER la suite du gestionnaire. Tout ce qui
> précède l'appel manquant reste observable ; un témoin qui n'assert que cela
> atteste un gestionnaire qui lève. Le double est complété, et le témoin assert
> désormais la RÉPONSE. Détail :
> `tasks/lessons/2026-11-08-un-double-mente-aussi-par-ce-qu-il-omet.md`.
