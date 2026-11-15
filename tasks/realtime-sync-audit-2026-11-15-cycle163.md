# Cycle 163 — la règle était écrite, mesurée nulle part, et fausse sur une plateforme sur trois

*2026-11-15. Branche `claude/exciting-planck-kfor5u`, partie de la tête de `dev`
(`134848579`).*

**Livré** : #18602 — le cliquet du lockstep `_seq`, et les quatre doc-comments
qui nommaient un consommateur sorti du dépôt. **Ouvert** : #18601, la lacune de
produit que la mesure a rendue, et #18605, deux prémisses fausses sous le gap
detector de `/sync` — la même classe, dans les fichiers voisins.

---

## Le relevé qui a ouvert le cycle

Six cliquets gardent le contrat socket après #18499. En cherchant ce qu'ils ne
peuvent pas voir, une propriété se détache : **ils répondent tous à la question
« ce NOM existe-t-il de part et d'autre ? »**.

| cliquet | sa question |
|---|---|
| `socket-event-name-gate` | un nom épelé par un client existe-t-il au contrat ? |
| `socket-event-emitter-gate` | tout `SERVER_EVENTS` a-t-il un émetteur ? |
| `socket-event-orphan-gate` | … au moins un lecteur client ? |
| `socket-event-platform-parity-gate` | lequel des trois ne le lit pas ? |
| `socket-payload-dead-field-gate` | un champ déclaré que le miroir ne lit pas |
| `socket-event-handler-gate` | tout `CLIENT_EVENTS` a-t-il un `socket.on` ? |

Le `_seq` échappe aux six **par construction** : ce n'est pas un champ déclaré
par événement, c'est une propriété TRANSVERSE du transport, estampillée par une
fonction (`emitWithSeq`) et non par un contrat. Aucun des six n'a de place pour
la question « ce nom porte-t-il un curseur, et qui le lit ? ».

Et cette question-là a une réponse écrite, dans le doc-comment d'`emitWithSeq` :

> **LOCKSTEP avec les clients** : le `_seq` est per-user GLOBAL, pas per-event.
> Un client qui n'observe qu'un SOUS-ENSEMBLE des events estampillés **voit un
> trou à chaque event non observé.** Étendre la liste des appelants ci-dessous
> oblige donc à étendre l'observation dans le MÊME train de release, sur les
> TROIS clients qui la portent.

## Pourquoi c'est une classe de défaut, pas une coquetterie

**Un curseur GLOBAL observé partiellement est pire que pas de curseur.** Il ne
perd rien ; il FABRIQUE des trous là où rien n'a été perdu, et chaque faux trou
coûte au client qui le croit une resynchronisation complète. Le défaut est donc
à la fois un coût de réseau et de batterie (dimensions 2 et 3) et un signal
corrompu — un client qui apprend que son détecteur de trou se trompe cesse d'y
donner suite, et la détection exacte meurt sans que rien ne tombe.

La règle n'est pas décorative non plus : elle MOTIVE une décision portante.
`announceReadBulk` et `announceDeletedBulk` émettent PLAIN, délibérément,
« tant qu'aucun client n'observe `_seq` sur cet événement ».

## La mesure

**Estampillé : UN événement.** Deux sites d'appel, les deux dans
`NotificationService` (`:1095`, `:3454`), les deux sur
`SERVER_EVENTS.NOTIFICATION_NEW`. `emitEnriched` est le site unique de
l'enrichissement — aucun autre producteur de `_seq` dans le dépôt.

**Observé :**

| plateforme | observateur | suite donnée au trou |
|---|---|---|
| iOS | `SyncSeqTracker.shared.observe(event.seq)` — `MessageSocketRoutes+Notifications.swift:17` | `NotificationGapResyncCoordinator` |
| Android | `syncSeqTracker.observe(raw.opt(SEQ_KEY))` — `MessageSocketManager.kt:262` | `ChatResyncController` |
| **web** | **aucun** | **aucune** |

Sous `apps/web/src` : zéro `_seq`, zéro `observeSyncSeq`, zéro `checkpointSeq`.
La seule `lastSeq` du répertoire appartient au talkie et compte des morceaux
audio.

## Les quatre affirmations, et la plus retorse

**Quatre** doc-comments affirmaient que le web observe, en nommant
`notification-socketio.singleton.ts` — un fichier de l'application web LEGACY,
sortie du dépôt au **#7668** (2026-09-24) :

1. `emitWithSeq.ts` — « sur les TROIS clients qui la portent : iOS …, web
   (`observeSyncSeq`, `notification-socketio.singleton`) et Android … » ;
2. `MessageSocketManager.kt:261` — « observer le `_seq` AVANT de livrer l'event,
   **comme le web** » — l'affirmation recopiée sur une AUTRE plateforme, celle
   qu'on ne va pas vérifier parce qu'elle n'est pas chez elle ;
3. `MessageSocketManager.kt:193` — la famille notification, même citation ;
4. `packages/shared/types/socketio-events/notification.ts` — le CONTRAT, et
   c'est celui qu'il faut lire en entier.

Le quatrième **racontait sa propre erreur passée** : « Ce paragraphe a dit *les
trois le lisent* pendant que **Android le jetait** […] Une citation n'est pas
une mesure. » Il avait raison sur le mécanisme, il l'avait daté, et il était
faux au même instant sur une autre plateforme. Le cycle 108 avait corrigé la
LIGNE sans rien donner au paragraphe pour rester vrai.

> **Corriger une énumération ne lui donne aucun moyen de le rester — et le récit
> de sa faute passée la rend PLUS crédible, pas moins.** Elle porte alors une
> troisième affirmation, implicite et fausse : *celle-ci a été instruite, tu peux
> t'y fier.* C'est la leçon 261 d'un cran plus haut. Détail :
> `tasks/lessons/2026-11-15-une-enumeration-corrigee-reste-une-enumeration.md`.

Le correctif n'est donc PAS de remettre la liste à jour. Les quatre sites gardent
la RÈGLE et renvoient au cliquet pour l'ÉTAT ; le cliquet le dérive des sources.

## Le cliquet

`packages/shared/__tests__/ci/socket-seq-lockstep-gate.test.ts`, sur
`socket-payload-shape/seq-lockstep.ts`. Trois choix méritent d'être dits.

**Le relevé est UNIQUE.** Les trois questions — quels événements sont observés ?
cette plateforme en observe-t-elle un ? un site échappe-t-il au liage ? — sont
trois lectures du même relevé, jamais trois balayages. Deux relevés du même fait
gardés séparément sont la forme que les cycles 161 et 162 ont déjà payée.

**Les deux côtés ne sont PAS symétriques, et c'est motivé.** Côté passerelle,
fail-CLOSED : un site `emitWithSeq(` dont l'événement n'est pas résoluble se
nomme en rouge — le compter comme « site sans événement » amnistierait le seul
site qu'on n'a pas su lire. Côté client, une occurrence du curseur non liée est
ignorée **sur une plateforme inventoriée** et ROUGE sur une plateforme qui
observe : un client cite son tracker aussi pour le construire ou le remettre à
zéro (iOS le fait, `AuthManager+Accounts.swift:251`), et aucune de ces citations
n'observe quoi que ce soit.

**Les arguments sont bornés par la PARENTHÈSE, pas par un nombre de caractères.**
Le second site d'appel s'étend sur sept lignes : une fenêtre fixe l'aurait
tronqué, et une fenêtre large aurait attribué à un appel l'événement de
l'instruction suivante. Le liage client prend, lui, le **dernier** nom résoluble
en AMONT — celui de la route englobante : les familles d'événements sont
déclarées en listes contiguës sur les trois plateformes, donc balayer en aval
créditerait les routes voisines.

## Ce que l'exécution des mutations a corrigé dans ma propre garde

Quatre mutations étaient prévues. La troisième — **le web gagne un
observateur** — est passée **VERTE**.

Cause : l'inventaire se mesurait sur le relevé LIÉ. L'occurrence neuve n'était
rattachée à aucune route, donc invisible, donc « le web n'observe rien » restait
vrai pour le cliquet. **Le second sens du cliquet ne pouvait pas tomber dans le
sens qu'il nommait** — un `expect` décoratif sous un intitulé juste.

> **Une affirmation d'ABSENCE se mesure sur les OCCURRENCES, jamais sur le relevé
> enrichi** : l'enrichissement a le droit d'échouer, et chaque échec se lit comme
> une absence. L'inventaire compte désormais les sites ; une assertion de plus
> garde la contrepartie (sur une plateforme qui observe, un site non lié est un
> liage à relire).

Et une fragilité de la première rédaction, trouvée en relisant : comparer
`nombre de sites` à `nombre d'événements distincts` rougissait faussement dès
que deux sites observent le MÊME événement. Le relevé unique porte l'événement
par site, donc la question se pose site par site.

## Preuves

| preuve | résultat |
|---|---|
| `socket-seq-lockstep-gate` | 6/6 |
| mesure rendue | estampillé `{notification:new}` · observé iOS `{notification:new}`, Android `{notification:new}`, web `{}` |
| ROUGE 1 — web retiré de l'inventaire | « web n'observe pas le `_seq` de notification:new » |
| ROUGE 2 — site `emitWithSeq` non résoluble | le site se nomme (fail-closed) |
| ROUGE 3 — second événement estampillé (`notification:counts`) | DEUX trous : iOS et Android |
| ROUGE 4a — le web gagne un observateur NON liable | `['web']` — *le cas qui ne tombait pas* |
| ROUGE 4b — le web gagne un observateur LIÉ | `['web']` |
| ROUGE 5 — balayage passerelle vidé | « expected 0 to be greater than 0 » |
| ROUGE 6 — iOS déplace son observation hors du liage | le site non lié se nomme |
| `packages/shared/__tests__/ci/` | 24 fichiers, 204 témoins (23 / 198 avant) |
| `packages/shared` suite complète | 410 fichiers, 9 733 témoins |
| `tsc --noEmit` shared · gateway | EXIT=0 · EXIT=0 |

## Suivi ouvert

| # | ce que c'est | état |
|---|---|---|
| #18601 | le web n'observe aucun curseur — seule plateforme sans détection de trou exacte | **ouverte** ; le verdict de produit reste à rendre, et l'inventaire du cliquet la cite |
| #18605 | deux prémisses fausses sous le gap detector de `/sync` — trouvées en relisant les voisins de la mesure | **ouverte** (lead du cycle 164) |
| #18499 | les 5 canaux montants sourds + les 3 noms hors contrat | inventoriés ; verdict de produit à rendre |
| #18342 | la jumelle descendante (6 événements qu'aucun client ne déclare) | ouverte |
| #18115 | les trois champs morts de `AttachmentUpdatedEvent` | ouverte |
| #18456 | le consommateur iOS de `AttachmentReactionUpdateEvent.userId` | ouverte — demande Xcode |

## Ce que ce cycle n'a PAS fait, et pourquoi

**Câbler l'observation du web.** C'est #18601, et c'est un lot de produit, pas
une suite mécanique : il demande de décider où le curseur vit dans l'état du web
et quoi déclencher sur un trou (les deux autres plateformes ont chacune un
coordinateur dédié). Le livrer dans ce lot substituerait mon verdict à celui du
produit sur l'architecture de resynchronisation du web — même partage qu'au
cycle 161 et qu'au cycle 162.

## La classe ne s'arrête pas à `_seq` (#18605)

Une fois la mesure faite, relire ses VOISINS a rendu deux prémisses de plus, du
même genre et toutes deux portantes :

- `routes/sync/index.ts:352` — « `_seq` est un curseur GLOBAL par compte
  (`emitWithSeq`, **toutes familles d'évènements confondues**) » : une seule
  famille l'avance, et c'est cette clause-là qui porte la conclusion « le gap
  gouverne donc les QUATRE collections » ;
- `routes/sync/budget.ts` — « `collections=messages` seul est le SEUL usage qui
  existe aujourd'hui dans ce dépôt (**aucun appelant**) […] la SEULE collection
  qui a un contrat aujourd'hui » : il y a un appelant, et il demande
  `conversations` (iOS, deux sites). L'argument de rétrocompatibilité protège
  donc la collection qui n'en a pas, en se croyant sans appelant du tout.

Le SyncEngine est dense en énumérations de consommateurs parce que chacune y est
portante : un budget, un seuil, le périmètre d'un gap. **Le lead du cycle 164
n'est donc pas « corriger deux phrases » mais ré-instruire les conclusions
qu'elles portaient** — si une décision reste la bonne, sa raison change.

Et ce qui n'est PAS affirmé, faute de mesure : `GAP_THRESHOLD = 10 000` s'exprime
en notifications manquées, pas en évènements. Savoir si le signal ainsi calibré
voit encore un client réellement en retard demande une mesure, pas un
raisonnement — annoncer une panne qu'on n'a pas mesurée coûte la confiance dans
les cycles où il y en a une (cycle 103).