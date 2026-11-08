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

---

## Le cycle a dû ouvrir son PROPRE périmètre, et ça a changé sa forme

Quatre des sept suivis cédés, le cycle était à deux lots. Deux auditeurs
adversariaux sont partis sur des périmètres **explicitement disjoints de
`socketio/`** — l'un sur `routes/conversations/` + `services/conversations/`,
l'autre sur `services/notifications/` + `services/messaging/` — avec l'interdit
écrit dans leur consigne plutôt que laissé à leur jugement.

**Onze constats, tous vrais contre l'arbre vivant** (vérifiés ligne à ligne
avant d'être repris, deux en primaire par moi). Trois sont devenus des lots,
huit des issues (#17075 à #17082, plus #17076 et #17077 sans milestone car
elles demandent chacune un lot à elles).

## Lot D — rentrer dans une conversation supprimée POUR SOI (#17072)

Le constat le plus grave du cycle, et le correctif d'une ligne.

`Participant` porte TROIS colonnes de départ, et le dépôt les lit ENSEMBLE là
où il en dépend : le flux de tombstones interroge
`OR: [{leftAt:{gt}}, {bannedAt:{gt}}, {deletedForMe:{gt}}]`.
`REJOIN_PARTICIPANT_STATE` en effaçait DEUX sur trois — `leftAt` y figurait,
`deletedForMe` non — et le doc-comment de la constante justifiait nommément
`historyVisibleFrom`, les trois `messageRequest*` et l'OMISSION de `joinedAt`
sans la mentionner une fois.

`delete-for-me` écrit pourtant `{ deletedForMe: now, isActive: false }` d'un
seul geste, et `resolveConversationEntry` ne lit que la seconde. Rentrer après
avoir supprimé « pour soi » rendait donc `'rejoin'`, rallumait la ligne, et
laissait la première posée : **appartenance vivante pour tout le service,
absente de `GET /conversations` pour toujours.** Messages reçus, écriture
permise, présence au trombinoscope des autres — et la conversation toujours
dans la corbeille, avec son tombstone servi par `/sync`.

> **Le cliquet qui aurait dû le voir était VERT, et sa langue est la raison.**
> `participant-reactivation-writers-sweep` est l'inventaire des écritures qui
> RALLUMENT une participation, et il ne posait qu'une question : « celle-ci
> peut-elle rallumer un BANNI ? ». La langue de l'inventaire est *banni* ;
> `deletedForMe` n'y est pas un mot. C'est « un lot ferme une classe dans SA
> langue », mesuré sur un cliquet plutôt que sur un correctif.

Les deux témoins sont RELATIONNELS : l'un relève les colonnes de départ DANS le
source du flux plutôt que de les recopier et porte un verdict écrit pour
chacune (effacée, effacée, **jamais** — une rentrée ne débannit personne) ;
l'autre est au niveau de la PORTE.

**Et le premier a attrapé sa propre première version.** Mon relevé cherchait
`{ gt }` en forme abrégée quand le flux écrit `{ gt: floor }` : le balayage
rendait `[]`, et le témoin de verdict passait À VIDE. C'est le premier `it` du
fichier — « un balayage à vide resterait vert » — qui l'a dit, dans le lot même
qui l'écrivait.

## Lot E — le budget de mention valait 2, pas 5 (#17073)

`shouldCreateMentionNotification` est un prédicat MUTANT : il pousse un
horodatage quand il autorise. Il était appelé DEUX FOIS sur le même chemin pour
la même paire — filtre d'éligibilité du lot, puis tête de
`createMentionNotification` que ce lot appelle. Chaque notification consommait
deux jetons : la troisième mention de quelqu'un dans la minute ne lui arrivait
jamais.

Le second appel était justifié par « la garde par destinataire reste, pour
l'appelant qui l'atteint en solo ». **Cet appelant n'existe pas** — mesuré.

> **Un prédicat qui répond « peut-on ? » ne doit pas écrire.** Sa signature ne
> dit rien de sa mutation, donc rien n'empêche un second appelant de
> l'interroger, et le coût d'une question devient une réponse fausse.

**Le piège s'est refermé pendant le correctif, et c'est le plus instructif du
lot.** La même méthode était exposée aux éventails de PUBLICATION et de
COMMENTAIRE par la surface `fanoutDependencies` — et pour eux, c'est le SEUL
gate de leur chemin : les lier à la question pure aurait rendu ces mentions
illimitées. Le nom a donc été corrigé plutôt que la liaison
(`consumeMentionBudget`), ce qui est exactement la leçon du lot appliquée à
elle-même.

Seconde moitié : la liste explicite n'était dédoublonnée nulle part, si bien
que `slice(0, MAX_MENTIONS_PER_MESSAGE)` bornait cinquante **COPIES**. Une
charge `[victime ×50]` produisait plusieurs bannières identiques et épuisait le
budget de la paire. Dédoublonnée à la frontière (le plafond compte des
PERSONNES) **et** au site qui notifie (c'est là que « ne pas notifier deux
fois » est une propriété, pas une espérance sur ses appelants).

Le témoin de performance existant appelait le lot avec cinquante destinataires
**distincts** : cinquante clés de paire, aucun budget épuisé, vert. **La
propriété ne se voit qu'en RÉPÉTANT sur la MÊME paire.**

## Lot F — une demande en attente ne sonne pas, sauf si on ÉDITE (#17074)

La garde #14107 était posée sur l'éventail d'ENVOI et sur l'événement socket
`mention:created` de l'ÉDITION — **et absente de la NOTIFICATION de cette même
édition**, c'est-à-dire du seul des trois canaux qui perce la sourdine, pousse
un e-mail immédiat et fait pré-enregistrer le texte dans la base locale de
l'appareil.

Un inconnu dont la demande n'est pas acceptée obtenait donc, en éditant son
message pour y ajouter `@cible`, exactement ce que le chemin d'envoi venait de
lui refuser. **L'asymétrie vivait dans la même fonction** : le handler socket
pose la garde dix lignes au-dessus de l'appel qui laissait partir la
notification sans elle.

Et la garde était GRATUITE : les deux sites lisent DÉJÀ les participants de la
conversation — il ne manquait qu'une colonne au `select`, et un NOM partagé
pour que la règle cesse d'être une formulation locale (`pendingRequestUserIds`,
désormais le site unique du prédicat, employé par les deux éventails).

> Avant de conclure qu'une garde coûterait une requête, regarder ce que le site
> lit déjà. C'était écrit dans le dépôt depuis le cycle 127 ; ce lot est le
> troisième à le vérifier.
