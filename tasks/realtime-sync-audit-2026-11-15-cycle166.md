# Cycle 166 — la règle était écrite, mesurée nulle part, et fausse sur une plateforme sur trois

*2026-11-15. Branche `claude/exciting-planck-kfor5u`, partie de la tête de `dev`
(`134848579`).*

> **Note de numérotation.** Ce journal s'est d'abord appelé « cycle 163 », et ce
> numéro était déjà pris : `claude/exciting-planck-ksw6yk` a publié SON cycle 163
> le 2026-11-14, et il est dans `dev`. Une branche sœur
> (`claude/exciting-planck-kexumt`) a constaté la double revendication et a cédé
> la première, en prenant 165. **Celui qui n'a rien écrit cède** : ici c'est moi
> qui cède, l'autre 163 ayant été publié avant le mien. 164 est laissé libre — la
> sœur passée à 165 l'a sauté, et une revendication en vol ne se voit pas. C'est
> le défaut d'espace de noms partagé de #5102 : *un identifiant qui ne s'alloue
> pas collisionne.*

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
# Cycle 166 — la porte était juste, et c'est l'argument qui la neutralisait

*2026-11-15. Branche `claude/exciting-planck-hg95mt`, repartie de la tête de
`dev` (`1348485794`).*

**Livré** : #18649 — le quatrième discriminant de la porte d'émission, et les
deux sites qui la contournaient par leurs arguments.

---

## Ce que le cycle a cherché d'abord, et pourquoi il l'a abandonné

Le relevé d'ouverture visait la direction que les six cliquets du contrat socket
ne gardent pas : **l'ÉMETTEUR contre le CONTRAT**. Les gardes de forme (#18070,
cycles 156–158) confrontent toutes le contrat au DÉCODEUR d'un miroir ; aucune
ne demande si la passerelle POSE ce qu'elle promet. Et le dépôt nomme lui-même
le trou restant :

> **Et le trou que le typage ne peut pas boucher** : un champ NOUVEAU, ajouté à
> un émetteur et à aucun contrat, redevient invisible au premier spread. Ce
> trou-là se ferme par un BALAYAGE, jamais par un type.

Un seul événement est gardé ainsi — `conversation-updated-declared-fields.ts`,
UN sur 176. La généralisation avait l'air d'être le lot.

**Mesure, par l'API du compilateur** (programme réel du gateway, 1 573 fichiers,
177 canaux déclarés résolus avec leurs propriétés) : 793 appels `.emit(`, dont
**531 sont le chokepoint générique de `serverEmit.ts`** — 3 × 177 par
construction, l'effacement que le dépôt a nommé et borné une fois. Restent
**262 sites réels, et ZÉRO champ non déclaré.**

Puis la question qui a tué la piste : *ce balayage aurait-il attrapé le cas
historique de sa propre classe ?* `_seq` — le curseur que trois clients lisent
et qu'aucun contrat ne déclarait (cycle 108) — a été retiré du contrat pour
voir. **Le balayage est resté vert** : `_seq` est estampillé par `emitWithSeq`,
donc à l'intérieur du chokepoint, précisément là où l'instrument ne voit rien.

> **Un cliquet qui ne peut pas attraper l'instance canonique de la classe qu'il
> annonce ne vaut pas mieux que pas de cliquet** — « une porte annoncée plus
> stricte qu'elle n'est vaut moins que pas de porte », et personne n'ira
> vérifier derrière. Le balayage a été JETÉ, pas gelé : c'est la décision du
> cycle 107, reprise pour la même raison.

Et une première rédaction, en expressions régulières, avait rendu **trois faux
positifs** sur `LocationHandler` avant d'être confrontée au fichier : elle
résolvait le PREMIER `const eventData` du fichier pour tous les sites, alors
qu'il y en a cinq, chacun ANNOTÉ — donc chacun déjà vérifié par le compilateur.
L'instrument a été refait sur l'API du compilateur avant toute conclusion.

## Ce que ce détour a mis sous les yeux

Parmi les 9 appels dont le NOM d'événement n'est pas un littéral, un seul ne
ressemblait à rien de connu :

```
src/services/together/togetherRelay.ts:89 | OTHER | never | arg=event as never
```

Un cast vers `never`. En ouvrant, la forme complète :

```ts
const emitTo = (io: TogetherIo | undefined, userIds: readonly string[], event: string, data: unknown): void => {
  io?.to(ROOMS.user(userId)).emit(event as never, data as never);
};
```

Et sa jumelle, trouvée par le même relevé :

```ts
// event is always SERVER_EVENTS.TYPING_STOP — cast bypasses union exhaustiveness check
emitter.emit(event as keyof ServerToClientEvents, data as any);
```

## Pourquoi aucun cliquet ne pouvait les voir

Les cycles 104, 105 et 108 ont fermé trois façons de contourner la porte
d'émission. **Les trois discriminants portent sur le RECEVEUR de `.emit(`** :

| forme fermée | ce que le balayage cherche | sur quoi |
|---|---|---|
| une interface qui RÉÉCRIT la signature | `emit(ev: string` / `emit: (ev: string` | le porteur |
| un CAST du porteur vers un type nu | idem | le porteur |
| le `Server` NU de socket.io | `import type { Server }` + `.emit(` | le porteur |

Les deux sites ci-dessus importent la **BONNE** porte — `ServerEmitIO`, dérivée
de `ServerToClientEvents`. `server-emit-door-sweep` était **vert**.

`as never` est assignable à tout : le couple `(événement, charge)` n'est
confronté ni sur le NOM ni sur la FORME. C'est exactement la liberté du `Server`
nu du cycle 108 — obtenue autrement, donc invisible. Les quatre émissions
d'« Ensemble » (`together:invited`, `together:started`, `together:synced`,
`together:ended`) voyageaient hors de tout contrat, **sur un canal qui n'a aucun
sérialiseur** pour rattraper un écart.

> La règle du cycle 105 — « chercher une forme fautive par son NOM de
> déclaration, c'est manquer tous les sites qui l'obtiennent autrement » —
> s'appliquait au porteur. Elle vaut identiquement de l'ARGUMENT. **Un cliquet
> qui garde un receveur ne dit rien de ce qu'on lui remet.**

## Le commentaire qui annulait sa propre contrainte

Le second site ÉNONÇAIT en prose ce que son cast empêchait de vérifier :
« event is always SERVER_EVENTS.TYPING_STOP ». C'est une AFFIRMATION, et le
dépôt exige qu'elle se mesure (cycle 94). Mesurée : **vraie** — `broadcastFn`
n'est appelé qu'une fois, avec `SERVER_EVENTS.TYPING_STOP` et un `typingEvent`
déjà annoté `TypingEvent`.

Une contrainte vraie n'a donc aucune raison de rester en prose : elle est
devenue le TYPE du paramètre, et le cast a disparu.

## Le discriminant, et le premier qu'il a fallu narrower

Premier relevé, sur « un `as` au premier niveau d'un argument de `.emit(` » :
**44 sites**, dont **40** de la forme `{ code, message } as CallError` — un
littéral casté vers le type que le canal DÉCLARE. Celui-là ne décorrèle rien :
`as` exige la comparabilité, et la porte vérifie le couple ensuite.

Les compter aurait mesuré la **popularité d'un idiome** au lieu d'une propriété.
Le discriminant ne retient donc que les cibles qui EFFACENT, ancrées en fin
d'argument de premier niveau :

| forme | compté ? | pourquoi |
|---|---|---|
| `event as never` / `data as any` | **oui** | plus aucune confrontation |
| `event as keyof ServerToClientEvents` | **oui** | corrélation effondrée (cycle 104) |
| `{ … } as CallError` | non | cast vers le type DÉCLARÉ |
| `{ id: id as any }` | non | cast de CHAMP, autre question |
| `as any` sur le 3e argument | non | ni canal ni charge |

**44 → 4** : deux sites, leurs deux arguments chacun.

## La réparation : narrower, jamais déplacer le cast

- `emitTo` prend `<E extends ServerEventName>(…, event: E, data: ServerEventPayload<E>)`
  et passe par `emitServerEvent` — la corrélation se vérifie au site d'appel, sur
  un nom CONCRET, et l'unique effacement sanctionné reste où le dépôt l'a borné.
- `broadcastFn` déclare `typeof SERVER_EVENTS.TYPING_STOP` et `TypingEvent`.

## Ce que la mesure dit, et ce qu'elle ne dit pas

**Les quatre charges d'« Ensemble » étaient JUSTES** contre leurs types déclarés :
`tsc --noEmit` rend `EXIT=0` une fois les casts retirés. La discipline tenait.

Ce lot ne répare donc **aucune panne** — et il faut le dire ainsi plutôt que de
laisser entendre une fuite : il rend VÉRIFIABLE ce qui ne l'était pas, et rien
n'aurait rougi le jour de la première divergence. C'est la famille
`conversation:join-error` (huit sites d'émission, deux consommateurs, jamais au
contrat), prise avant le défaut plutôt qu'après.

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
| `tsc --noEmit` gateway, casts retirés | **EXIT=0** |
| ROUGE 1 — champ inconnu dans la charge | `TS2561 … 'endedAtt' does not exist in type 'TogetherEndedEventData'` |
| ROUGE 2 — couple DÉCORRÉLÉ (`ended` sous `invited`) | `TS2353 … 'reason' does not exist in type 'TogetherInvitedEventData'` |
| ROUGE 3 — autre canal via le rappel narrowé | `TS2345 … '"typing:start"' is not assignable to '"typing:stop"'` |
| ROUGE 4 — cast réintroduit en production | le cliquet tombe en NOMMANT `services/together/togetherRelay.ts` |
| `server-emit-door-sweep.test.ts` | **9/9** (6 avant) |
| suites touchées (`together`, `status`, manager, `serverEmit`, `typing`) | **51 suites, 1 189 témoins** |

## Suivi ouvert

| # | ce que c'est | état |
|---|---|---|
| #18601 | le web n'observe aucun curseur — seule plateforme sans détection de trou exacte | **ouverte** ; le verdict de produit reste à rendre, et l'inventaire du cliquet la cite |
| #18605 | deux prémisses fausses sous le gap detector de `/sync` — trouvées en relisant les voisins de la mesure | **ouverte** (lead du cycle suivant) |
| #18607 | la garde des puces d'ambiance tranchait sur l'arrondi du rendu | **fermée** par ce lot |
| #18664 | la garde du studio comparait clair et sombre par égalité de CHAÎNE | **fermée** par ce lot |
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
**Mesuré MÛR ce cycle, et c'est un résultat** : la direction émetteur → contrat
sur les CHAMPS. 262 sites réels, zéro champ non déclaré. Elle n'est pas pour
autant GARDÉE — le seul instrument qui la verrait ne voit pas à travers le
chokepoint, et aucun cliquet n'a été posé pour cette raison. Y revenir
demanderait de gouverner `emitWithSeq` et `emitServerEvent` eux-mêmes, ce qui
est un lot distinct.

## Deux gardes qui mesuraient l'arrondi du moteur de rendu (#18607, #18664)

Le lot a traversé **deux** rouges de `dev` dans la même tranche de CI, et c'est
le même défaut deux fois :

| garde | comparaison fautive | bruit mesuré |
|---|---|---|
| `check-calls-effects.mjs` | `chip.height >= 44` sur `min-h-11` = 2,75 rem = **44 px exactement** | 44.000030517578125 / 43.999969482421875 |
| `check-story-studio.mjs` | `JSON.stringify(clair) === JSON.stringify(sombre)` sur des géométries | haut de `320.layoutMenu` : **52.58, 52.38, 52.23** selon la passe |

**Les deux fichiers portaient DÉJÀ la tolérance de sous-pixel** — trois fois
dans le premier, douze fois dans le second, dont trois lignes au-dessus du site
fautif. Il ne manquait qu'au site qui rougissait.

> **Un fichier qui applique une convention à trois sites sur onze ne documente
> pas une règle : il documente que trois personnes l'ont rencontrée.** Chercher
> l'idiome DANS le fichier avant de l'inventer est ce qui a rendu les deux
> correctifs d'une ligne, sans décision à prendre.

Et le diagnostic est le même dans les deux cas, posé en leçon le matin même :
**deux accusations DIFFÉRENTES pour un arbre IDENTIQUE accusent le seuil, pas le
diff.** La première garde accusait tantôt le clair tantôt le sombre ; la seconde
a accusé `320.layoutMenu` en CI, `390.layoutMenu` en local, puis les deux — sur
un code inchangé. Mesurer en local rend le NOMBRE là où un re-run ne rend qu'un
bit, et aucune des deux n'a coûté de re-run de CI pour être comprise.

Ce que le correctif NE relâche pas : l'invariant de produit. « Chaque puce fait
44 » et « clair et sombre rendent la même géométrie » restent gardés — le
comparateur du studio exige toujours les mêmes clés, les mêmes longueurs, les
mêmes valeurs non numériques, et chaque nombre à moins d'un demi-pixel. Prouvé :
il refuse un décalage d'1 px, une ligne de menu en moins, une clé manquante et
une tuile de 45 px.
