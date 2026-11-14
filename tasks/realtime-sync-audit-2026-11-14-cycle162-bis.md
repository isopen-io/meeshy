# Cycle 162 bis — un état DESSINÉ que personne n'alimentait, et une jumelle que personne ne lisait

*2026-11-14. Branche `claude/exciting-planck-makf15`, partie de `dev` à
`e217ec868` (identique, 0/0).*

> **« bis » parce que le numéro a COLLISIONNÉ, pas parce que ce lot prolonge le
> précédent.** Une autre session a écrit son `cycle162` en parallèle (#18499, le
> cliquet de la direction MONTANTE du contrat socket) et l'a fusionnée dans `dev`
> la première ; les deux journaux se sont rencontrés en `add/add` sur le même nom
> de fichier. La règle d'asymétrie tranche sans négociation — celui qui n'a pas
> encore écrit cède —, et ici c'est le NOM qui cède, pas le travail : rien n'a été
> perdu des deux côtés. C'est la leçon #5102 une fois de plus : **un identifiant
> qui ne s'alloue pas collisionne**, et un numéro de cycle n'est pas alloué.

**Livré** : #18537 (neuf — le lecteur audio web apprend enfin par le temps réel
qu'un travail mis en file a échoué) et #18115 (le dernier suivi ouvert du
cycle 161 — la jumelle Kotlin morte de `message:attachment-updated`).

---

## Lot A — la passerelle disait la panne en une seconde, le lecteur l'attendait 90 (#18537)

### Où la piste a été prise

Dans l'inventaire d'asymétries que le cycle 161 venait de poser
(`socket-event-platform-parity-gate`, #18342). Il range 29 événements sous
« non portés par le web », avec la bonne raison de famille : `apps/web` est le
chantier 2.0 et « iOS et Android le lisent, le web pas encore » y est l'état
NORMAL d'une feature non portée.

Deux de ces 29 n'étaient pas dans ce cas, et c'est exactement ce que le cliquet
est fait pour permettre de découvrir : **`audio:transcription-failed` et
`audio:translation-failed` ne manquaient pas à une feature non portée — ils
manquaient à une feature DÉJÀ PORTÉE, dont l'état d'échec était dessiné et
jamais alimenté.**

> **Un inventaire d'asymétries ne dit pas « voici 29 portages à faire ». Il dit
> « voici 29 questions à poser », et elles n'ont pas la même réponse.** Le
> cycle 161 l'avait écrit en refusant d'ouvrir 32 issues de portage ; ce lot est
> la première fois que l'inventaire sert à ce pour quoi il a été fait.

### Le défaut

Le lecteur audio plein écran avait les TROIS pièces, et l'une n'était jamais
servie :

| pièce | site | ce qu'elle fait |
|---|---|---|
| l'attente VISIBLE | `TranscribeAction busy` / `TranslateOffers pending` | « Transcription… » / « Traduction… » |
| le plafond de SILENCE | `ON_DEMAND_STALL_MS = 90_000` | au bout de 90 s l'attente se lève |
| la phrase du REFUS | `AudioOnDemandNotice` → `OnDemandNotice` | « Transcription impossible » |

Le `notice` n'était servi que par un refus de la REQUÊTE (`!result.ok`). Un
travail MIS EN FILE qui échoue ensuite n'avait aucun chemin — alors que la
passerelle le diffuse sur la room de la conversation en ~1 s
(`_handleTranscriptionFailed` / `_handleAudioTranslationFailed`), et qu'iOS
(`MessageSocketRoutes+Media`) comme Android (`TranslationFailureApplier` +
`TranscriptionRequestTracker`) le lisent depuis toujours.

Donc, sur le chemin nominal d'un Whisper qui tombe : la puce figée **90
secondes**, puis rendue à « Transcrire » **sans un mot**, le `notice` dessiné
pour cette phrase exacte restant nul.

### Les deux faits sont DISJOINTS, et c'est la moitié du lot la plus fragile

Il est tentant de lire « le temps réel dit la panne » comme « le plafond de 90 s
ne sert plus ». C'est l'inverse : le plafond garde le cas où **RIEN** n'arrive
(socket coupée, traducteur muet), c'est-à-dire précisément le cas où le signal
ne peut pas venir. Les retirer l'un pour l'autre figerait le bouton pour
toujours là où il l'était déjà.

L'attente se lève donc sur **une PREUVE de panne** ou sur **son ABSENCE
prolongée**, et un témoin garde la seconde moitié en tombant sous la mutation
qui la retire « puisque le temps réel existe ».

### Ce que le contrat a imposé, et qu'il ne faut pas deviner

`audio:translation-failed` **ne nomme aucune langue cible**, et ce n'est pas un
oubli de déclaration : son producteur n'en reçoit pas
(`MessageTranslationService` § `audioTranslationError` — la tâche audio traite
toutes les cibles d'un bloc, l'échec porte sur la PIÈCE). La panne s'écrit donc
par ÉTAGE (`transcription`, `translations` au PLURIEL), jamais par langue, et une
panne de traduction lève **toutes** les langues en attente de cette pièce.

Élargir le contrat pour nommer la langue aurait été la forme « naturelle ». Elle
n'a pas été prise : la valeur n'existe pas en amont, et la fabriquer à l'émetteur
serait inventer une attribution que le pipeline ne possède pas. Même arbitrage
que le cycle 128 — on ne fait pas porter à un événement une précision que son
producteur n'a jamais eue.

### La garde de forme n'exige PAS `error`, et le témoin le dit

`error` est déclaré requis au contrat. La garde ne le réclame pas, parce que le
lecteur rend **sa propre phrase, traduite** — refuser la trame pour un champ
qu'on n'affiche pas ferait perdre la seule preuve de panne dont le lecteur
dispose. Fail-closed sur ce qui ADRESSE (conversation, message, pièce),
fail-open sur ce qui DÉCORE : c'est l'arbitrage du dépôt sur une LIVRAISON de
signal, et il est écrit sur place pour qu'il se lise comme une décision.

### Preuves

| preuve | résultat |
|---|---|
| magasin + puits, 19 témoins | verts ; charge recopiée clé par clé depuis `MeeshySocketIOManager` |
| **surface** (« ces deux noms sont-ils ÉCOUTÉS ? »), 3 témoins | verts ; **2 tombent** quand on retire les `socket.on` |
| lecteur, 5 témoins | verts ; **3 tombent** en figeant le verdict du temps réel |
| la disjonction (le plafond survit au puits) | **tombe** sous SA mutation, celle qui retire le plafond |
| `src/lib/api` + `src/lib/view` | 643 fichiers, **8 482 témoins** verts |
| `packages/shared/__tests__/ci/` | 22 fichiers, 189 témoins |
| `tsc --noEmit` web et shared | EXIT=0 |

**Le témoin de surface n'est pas décoratif, et il faut dire pourquoi** : le
magasin et le puits resteraient verts si personne ne les branchait — soit
exactement la panne qu'on répare, une couche plus bas. C'est la forme du
cycle 104 (une émission sous un nom `undefined` dont le témoin n'assertait que la
room), et la réponse est la même : partir de la CONSTANTE de contrat, et
traverser le site d'abonnement réel.

### Une mesure à dire, parce qu'elle limite la portée du cliquet

**`socket-event-platform-parity-gate` reste VERT si l'on retire le câblage de
production.** Son balayage compte les CITATIONS, et les témoins neufs citent les
deux constantes — un fichier de test est une source comme une autre sous la
racine web. C'est la limite ÉCRITE de son doc-comment (« *cite* et non
*écoute* ; un nom cité sans être branché resterait invisible ici — c'est une
limite, pas un silence »), donc pas une découverte de ce lot ; mais elle devient
PORTANTE dès qu'on se sert du cliquet pour arbitrer un portage. Ce qui prouve le
branchement est le témoin de surface, pas le cliquet.

---

## Lot B — la jumelle que personne ne collectait (#18115)

Dernier suivi ouvert du cycle 161, et le dernier des quatre pièges du cliquet des
champs morts.

Deux classes Kotlin décodaient le MÊME `message:attachment-updated`, par deux
routes installées en parallèle :

| miroir | forme | consommateur |
|---|---|---|
| `MessageAttachmentUpdatedEvent` | indulgente — la pièce entière, sérialiseur tolérant | **vivant** (`MessageDeltaApplier`) |
| `AttachmentUpdatedEvent` | plate — `status` / `url` / `thumbnailUrl` | **aucun** |

La plate exposait un `SharedFlow` **public et nommé** — tous les signes d'un
chemin vivant — que rien ne collectait. Un décodage par trame, pour personne, et
une jumelle divergente que le dépôt interdit (dimension 11). **Les deux moitiés
avaient déjà divergé** : c'est la plate qui portait le piège `attachmentId`
requis réparé par #18070, pendant que l'autre le déclarait correctement nullable
depuis #11264.

### Ce qui aurait été perdu avec le code mort

Le témoin de #18070 — « une trame qui ne nomme AUCUNE pièce décode » — ne vivait
que sur la jumelle morte. Le miroir vivant couvrait « pas d'`attachmentId` mais
une pièce jointe » (repli sur `attachment.id`), **pas** « ni l'un ni l'autre ».
La garde est donc PORTÉE avant le retrait, avec sa raison écrite sur place.

> **Retirer du code mort retire aussi les gardes qui ne vivaient que là.** La
> question à poser n'est pas « qui lit ce code ? » mais « qu'est-ce que ses
> TÉMOINS sont les seuls à tenir ? ».

### Et le contrat partagé nommait ce consommateur

`AttachmentUpdatedEventData.attachmentId` portait, comme raison d'être :
« le décodeur Android natif (`AttachmentUpdatedEvent`) l'exige et rejetait
l'événement entier sans lui ». Vrai quand c'était écrit ; faux depuis #18070, et
sans objet depuis ce lot.

> **Un commentaire qui nomme un CONSOMMATEUR est une affirmation** (règle du
> cycle 114), et celle-ci a survécu à la disparition de ce qu'elle décrivait —
> deux fois : d'abord à la levée de l'exigence, puis au retrait du décodeur.
> C'est la forme la plus discrète du genre, parce qu'elle justifie un champ qui
> reste parfaitement légitime : il n'y a aucun symptôme à chercher.

### Preuves

| preuve | résultat |
|---|---|
| `DIVERGENCES_CONNUES` | **VIDE**, et son doc-comment dit que c'est un état à DÉFENDRE |
| `socket-payload-shape-gate` | vert, ≥ 100 routes balayées |
| `socket-payload-dead-field-gate` · `orphan-gate` · `platform-parity-gate` | verts |
| `packages/shared/__tests__/ci/` | 22 fichiers, 189 témoins |
| `jvm-check` / `assembleDebug` | **injoignables depuis ce conteneur** — Maven Central `429`, `build-artifacts.signal.org` `403` (deux tentatives). Prouvé par la CI `android.yml`. |

---

## Suivi ouvert

| # | ce que c'est | état |
|---|---|---|
| #18537 | la panne d'un traitement média, dite au lecteur web | **fermé** par le lot A |
| #18115 | la jumelle Kotlin morte de `message:attachment-updated` | **fermé** par le lot B |
| #18456 | le consommateur **iOS** du `userId` d'`AttachmentReactionUpdateEvent` | ouvert — demande Xcode |
| — | les 27 asymétries `absents: ['web']` restantes | l'inventaire tient ; chacune est une question, pas un portage dû |

**Les deux cliquets d'inventaire du dépôt sont désormais VIDES en même temps**
(`DIVERGENCES_CONNUES` et, depuis le cycle 94, `FROZEN_INVENTORY`). C'est un état
à défendre : quand l'un tombe, la réparation est le correctif, jamais une ligne
d'inventaire.
