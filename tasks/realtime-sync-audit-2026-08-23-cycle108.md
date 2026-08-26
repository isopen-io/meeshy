# Cycle 108 — le garde disait « RÉGRESSION » sur un arbre intact

## 0. Ce que le cycle cherchait, et ce qu'il a trouvé à la place

Le cycle 107 bis laissait deux suivis de la même famille : le cast d'émission
côté WEB (`(socket as unknown).emit(…)`) et trois services de la passerelle qui
prennent encore un `Server` NU. Le balayage d'ouverture a d'abord CORRIGÉ le
recensement de ces suivis — puis il a buté sur autre chose, et c'est cet
autre chose qui fait le lot.

**Recensement corrigé du suivi web.** Le cycle 107 bis annonçait « trois fois
dans `VideoCallInterface.tsx` ». Mesuré : **13 sites de production**, dans
quatre fichiers.

| Fichier | Sites |
|---|---|
| `components/video-call/CallManager.tsx` | 6 |
| `components/video-calls/VideoCallInterface.tsx` | 5 |
| `hooks/conversations/use-video-call.ts` | 1 |
| `services/socketio/messaging.service.ts` | 1 |

Le suivi sous-estimait d'un facteur quatre. Il reste ouvert, corrigé (§5).

## 1. Le défaut : un gate qui rend un verdict faux, en rouge, sur un arbre que
personne n'a touché

Sur un clone frais, aux commandes que le dépôt lui-même prescrit :

```
$ bun install --ignore-scripts        # la recette « Local Test Parity » du CLAUDE.md
$ bash scripts/check-type-debt.sh
✗ RÉGRESSION : 1242 erreurs de types, baseline 1239 (+3).

Fichiers les plus touchés :
     66 __tests__/components/admin/agent/AgentConfigDialog.test.tsx
     42 __tests__/hooks/use-audio-translation.test.ts
     ...
```

Rien n'avait régressé. `main` était vert — la CI l'a prouvé au même arbre
(run 32630361948, étape « Type-check (apps/web — debt ratchet) » : succès).
Et les dix fichiers nommés comme « les plus touchés » n'avaient AUCUN rapport
avec les trois erreurs en cause.

Le chiffre bougeait avec l'ENVIRONNEMENT, ce que l'en-tête du garde jure
explicitement qu'il ne fait pas.

## 2. La mesure, et le tiers exact

Compté sur le MÊME arbre, une seule variable changée :

| `packages/shared/dist` | compte | verdict du garde |
|---|---|---|
| absent (clone frais) | **1242** | ✗ RÉGRESSION +3 |
| présent (`bun run build`) | **1239** | ✓ la dette n'a pas bougé |

Le diff des deux listes ne contient QUE ceci — les trois seules erreurs de la
différence :

```
__tests__/lentille/shared-law-dist-parity.test.ts(65,28): error TS2307:
  Cannot find module '../../../../packages/shared/dist/utils/focus-curve.js'
__tests__/lentille/shared-law-dist-parity.test.ts(66,35): … scroll-activity.js
__tests__/lentille/shared-law-dist-parity.test.ts(67,35): … river-lanes.js
```

(Cinq autres lignes diffèrent entre les deux listes, mais ce sont les MÊMES
erreurs : TypeScript rend l'ordre des membres d'union différemment d'une passe
à l'autre — `"medium" | "low" | "high"` contre `"low" | "high" | "medium"`.
Elles s'annulent au compte. Un diff textuel montre huit lignes ; le delta réel
est trois.)

## 3. La cause : une affirmation vraie du mécanisme, aveugle au fichier bâti
pour le contourner

L'en-tête du garde énumère trois sources de dérive « vérifiées et absentes ».
La troisième :
# Cycle 108 — le garde avait raison, et il gardait plus qu'un chiffre

Suivi direct du cycle 107 bis, dont le premier suivi neuf était : « le même
cast, côté WEB ». Il en comptait trois. Il y en avait seize, sous deux formes.

Mais le cycle n'a pas commencé là. Il a commencé sur `main` en rouge.

---

## 1. `main` était rouge, et rien ne tournait

La CI de `main` échouait depuis le matin, sur les quatre dernières exécutions.
Un seul job en cause — `Quality (bun)` — mais il garde tous les autres : Build
et **toutes** les suites de tests (passerelle, translator, audio, voix) étaient
`skipped`. `main` n'avait donc plus aucun signal de test, pas seulement un lint
rouge. C'est la propriété désagréable d'un job-portier : son échec ne se lit pas
comme « une vérification a échoué » mais comme « les vérifications n'ont pas eu
lieu », et la seconde est bien plus grave que ce que la couleur suggère.

L'étape fautive : `Type-check (apps/web — debt ratchet)`, 1240 erreurs pour une
baseline de 1239. **+1.**

## 2. Le +1 n'était pas une coquille de typage — c'était le défaut produit

```
components/feed/PostsFeedScreen.tsx(596,85): error TS2339:
  Property 'type' does not exist on type '{ id: string; author?: string; content?: string; }'
```

Le commit précédent (`feat(web): le repost miroite le format de sa source`)
câblait `targetType` sur les quatre sites de story et de réel, puis laissait le
fil derrière avec cette justification, en commentaire dans le code :

> « Le fil ne sert que POST et REEL, donc rien d'observable ne change ici. »

C'est l'inverse. **Si le fil sert REEL, alors reposter un réel depuis le fil
produit un POST** — la perte de nature que la loi du miroir existe pour
empêcher, décrite mot pour mot dans la doc de `RepostRequest.targetType` :
« Un réel y perdait aussi sa nature et quittait le fil des réels ».

L'état `repostingPost` ne portait pas `type`. Donc :

| geste | ce qu'il envoyait | signalé ? |
|---|---|---|
| repost sec (l. 596) | `targetType: undefined` | oui — le TS2339 ci-dessus |
| citation (l. 611) | **rien du tout** | **non** |

Les deux retombaient sur le `?? POST` de la passerelle. Les sites frères
l'envoient pourtant sur leurs DEUX gestes (`reel/[postId]` 203 et 218,
`feeds/post/[postId]` 202 et 223). Le fil était le seul site où la loi était
ÉCRITE sans être CÂBLÉE — et c'est la surface de repost la plus fréquentée.

**Ce que le cliquet a démontré au passage.** Il n'a pas attrapé une erreur de
frappe : il a attrapé le défaut que le commit précédent croyait avoir corrigé.
Relever la baseline d'un cran — le geste qui « débloque la CI » — l'aurait
enterré. Un budget de dette n'est pas qu'un budget : c'est un filet sous les
corrections incomplètes.

La citation, elle, n'a été trouvée par aucun garde. Elle OMETTAIT le champ, et
omettre un champ optionnel est licite. Le compilateur voyait la moitié bruyante
du défaut ; la moitié silencieuse ne se lisait qu'en relisant les deux gestes
côte à côte. **Un garde qui attrape une occurrence n'a pas attrapé la famille.**

## 3. Le cliquet dérivait de 3 avec l'état du build

Son en-tête énumère trois sources de dérive et les déclare absentes, dont :

> `@meeshy/shared` is resolved by web's `paths` to the shared package's SOURCE,
> not to its `dist/`, so whether shared was built does not matter.

La première moitié est VRAIE. C'est précisément pourquoi la seconde est fausse :
`apps/web/__tests__/lentille/shared-law-dist-parity.test.ts` existe pour rejouer
les lois gelées **à travers la frontière `dist/`**, et son propre en-tête
explique longuement que le spécificateur `@meeshy/shared/...` ne peut PAS
atteindre le build. Il le contourne donc par chemin relatif :

```ts
import { focusCurve } from '../../../../packages/shared/dist/utils/focus-curve.js';
```

Trois imports. `packages/shared/dist/` est gitignoré. Le type-check de `apps/web`
dépend donc du build de `shared` — par le seul fichier construit pour échapper au
mécanisme que l'en-tête examinait.

> **Un invariant documenté peut être exact sur le mécanisme qu'il inspecte et
> faux sur le système.** La dérive n'était pas absente ; elle passait par la
> porte que le raisonnement venait lui-même de déclarer infranchissable.

C'est l'octave suivante de la leçon du cycle 107 bis (« un gate dont on silence
la sortie ne mesure plus ce qu'on croit ») : ici la sortie était lue, le code de
sortie honnête, le compteur self-testé — et le verdict faux quand même, parce que
la PRÉCONDITION de la mesure n'était ni vérifiée ni vérifiable.

## 4. Le coût réel, et pourquoi il n'est pas théorique

Ce cycle a passé sa première heure à instruire une urgence CI inexistante :
mesure de `main`, archéologie sur quatre commits, mesure de trois arbres
historiques, jusqu'à ce que la CI tranche en montrant 1239 là où le poste
montrait 1244. **Un rapport d'incident a failli partir.** Un garde qui crie au
loup sur un arbre intact coûte plus qu'il ne rapporte : il dépense la confiance
dont il a besoin les fois où il a raison.

## 5. Ce que le lot pose

- [x] `unresolved_dist_imports()` — le garde REFUSE DE MESURER tant que les
      artefacts dont le compte dépend manquent, au lieu de rendre un verdict
      faux. Il ne code en dur ni les trois chemins ni le fichier : il balaye
      `apps/web` pour les imports relatifs de `packages/shared/dist/**` et
      vérifie leur DÉCLARATION. Un import ajouté demain est couvert sans
      retouche.
- [x] Message actionnable à la place du faux verdict — il nomme les modules
      réellement non résolus et la commande qui y remédie, là où l'ancien
      nommait dix fichiers innocents.
- [x] C'est la DÉCLARATION `.d.ts` qui est consultée, pas le `.js` : c'est elle
      que TypeScript résout, donc elle seule qui décide du compte. Un build
      partiel (émission JS sans déclarations) reste détecté.
- [x] En-tête corrigé : la troisième puce ne prétend plus l'inverse de ce qui
      est mesurable. Elle dit ce qui est vrai (le spécificateur), ce qui le
      contourne (le fichier de parité, et pourquoi), et où la dérive est
      désormais gardée.
- [x] Trois cas de self-test neufs (4, 5, 6) — la doctrine du fichier est qu'un
      garde qui peut devenir silencieusement aveugle est pire que pas de garde ;
      le garde neuf s'y plie comme le compteur.
- [x] **RED prouvé sur 4 mutations**, chacune tombant sur le cas écrit pour
      elle : garde aveugle → cas 4 et 6 tombent ; garde qui signale tout →
      cas 5 tombe ; garde qui consulte le `.js` au lieu du `.d.ts` → cas 6
      tombe (c'est le cas ajouté exactement pour cette distinction).
- [x] RED prouvé sur l'ARBRE RÉEL : `dist/` mis de côté, le garde rend
      « MESURE IMPOSSIBLE » et nomme les trois modules, au lieu de
      « RÉGRESSION +3 ».
- [x] Gates : self-test 6/6, cliquet ✓ 1239 inchangé, `bash -n` propre. Codes de
      sortie lus DIRECTEMENT, jamais à travers un pipe (leçon du cycle 107 bis
      appliquée — un premier `| head` de ce cycle a rendu 141, SIGPIPE).

## 6. Lot 2 — les quatre acks que le contrat exigeait et que personne n'envoie

Suivi du §7 instruit dans le même cycle, et la mesure a tranché nettement.

### 6.1 Le recensement

`ClientToServerEvents` déclarait **4 acks REQUIS contre 18 optionnels**. Les
quatre sont exactement les quatre événements d'appel :

```
CALL_INITIATE, CALL_JOIN, CALL_SIGNAL, CALL_END
```

Les deux moitiés du fil contredisent les quatre :

| partie | ce qu'elle fait |
|---|---|
| passerelle, les 4 handlers | déclare `ack?` et appelle `ack?.(…)` — écrite pour fonctionner SANS |
| web, `call:end` ×3 | n'envoie AUCUN ack (`CallManager.tsx` 175/974, `use-video-call.ts` 199) |
| iOS, `call:join` / `call:signal` / `call:end` ×4 | `socket.emit(…)` nu (`MessageSocketManager.swift` 2898/3037/3077/3086) |
| iOS, les mêmes événements ailleurs | `emitWithAck` (2858/2942/3053/3101/3125) |

La dernière ligne est la preuve de conception : le MÊME fichier iOS émet
`call:end` avec et sans ack, délibérément. L'ack est optionnel PAR CONCEPTION —
`emitWithAck` là où la réponse sert, `emit` nu là où elle ne sert pas.

### 6.2 Ce que le mensonge coûtait, lisible dans le code appelant

Un contrat qu'aucun appelant ne peut honorer ne disparaît pas : il se paie en
contournements, et il y en avait deux formes.

**La cérémonie.** Les quatre émissions `call:signal` du web sont typées — elles
ne passent PAS par un cast — donc le compilateur exigeait le second argument.
Les quatre fabriquent la même fonction vide :

```ts
socket.emit(CLIENT_EVENTS.CALL_SIGNAL, { callId, signal } as CallSignalEvent, () => {});
```

`use-webrtc-p2p.ts` 290 / 329 / 674 / 761. Ces callbacks ne sont pas morts : le
handler acquitte bien en succès (`ack?.({ success: true })`,
`CallEventsHandler.ts:3809`), donc **chaque candidat ICE et chaque SDP paie un
paquet d'ACK de retour** pour une fonction qui ne fait rien. Vérifié plutôt que
supposé : l'hypothèse initiale d'une fuite dans la map `acks` du client était
FAUSSE, le serveur répond bien.

**Le cast.** Là où la cérémonie n'a pas été écrite, c'est
`(socket as unknown).emit(…)` qui soustrait le site à la vérification — les
trois `call:end` du web. Le suivi du §7 les compte parmi les 13.

> Un contrat que tout site d'appel doit contourner pour dire la vérité ne
> gouverne plus rien : il ne décrit plus le système, il décrit la forme des
> contournements qu'il impose.

### 6.3 Ce que le lot pose

- [x] Les quatre déclarations passent à `ack?`, alignées sur la passerelle
      (l'autorité d'exécution) et sur les émetteurs réels — et sur les 18 autres
      événements du contrat, qui déclaraient déjà `callback?`.
- [x] Le motif écrit AU-DESSUS des quatre lignes, avec les numéros de ligne des
      handlers et des émetteurs : la prochaine session qui voudra les
      re-durcir trouve la mesure, pas seulement la décision.
- [x] Cliquet de type `_CallAcksAreOptional` — la charge SEULE est assignable à
      `Parameters<…>` des quatre. Placé dans `socketio-events.ts` : les tests
      sont exclus du `tsconfig` et l'`ignoreCodes` de `ts-jest` couvre
      2322/2345, donc la production est le seul endroit d'où un cliquet mord —
      et `packages/shared` type-check en BLOQUANT dans la CI.
- [x] Témoin NÉGATIF `_RequiredAckWouldRefusePayloadAlone` : un ack requis
      refuse bien la charge seule. Sans lui, un `Parameters<…>` dégénéré
      laisserait le premier cliquet passer pour un garde.
- [x] **RED prouvé sur 2 mutations** : `call:end` rendu requis → TS2344 sur
      `_CallAcksAreOptional` ; témoin négatif inversé → TS2344 sur lui-même.
- [x] Gates : `tsc` shared **0**, `tsc` passerelle **0**, suites d'appel
      passerelle **36/36 (608 témoins)**, shared **2467**, suites d'appel web
      **46/46 (598 témoins)**, cliquet de dette web ✓ 1239 INCHANGÉ.

### 6.4 Ce que le lot NE fait PAS, et pourquoi

Les quatre `() => {}` de `use-webrtc-p2p.ts` sont désormais RETIRABLES — le
contrat ne les exige plus, et les retirer supprime un aller-retour d'ACK par
candidat ICE. Ils sont laissés en place : les retirer change le trafic réel de
la SIGNALISATION D'APPEL, le chemin le plus délicat du dépôt, et rien dans une
exécution de routine ne permet d'exercer un vrai appel pour le vérifier. La
correction du contrat est sûre (elle ÉLARGIT ce qui est accepté, elle ne peut
casser aucun site existant) ; le retrait est un changement de comportement qui
mérite sa propre mesure. Porté en suivi plutôt qu'embarqué.

## 7. Lot 3 — le témoin qui a viré au rouge tout seul, à 10:00:00Z

Découvert en réponse à un échec CI sur la PR de ce cycle, et il ne venait pas
d'elle.

### 7.1 Ce que la CI disait, et ce qui était vrai

`Test gateway` a échoué sur la PR : `MessageHandlerEditDelete.test.ts`, 2 témoins
sur 19 216. Le premier réflexe — « mon lot a cassé quelque chose » — était faux,
et le second — « c'est environnemental, mon poste diverge » — l'était aussi. Ce
que la mesure a établi :

| arbre | verdict |
|---|---|
| `main` @ `e87b7b0d`, run 32633238504 | **ÉCHEC — 2 failed / 19214 passed / 836 suites** |
| la PR @ `fead2d61` | ÉCHEC — **exactement les mêmes chiffres** |

**`main` était rouge, et la PR n'y ajoutait rien.** Personne ne le savait parce
qu'entre `f69cbd26` (dernier vert PROUVÉ, 09:12) et `e87b7b0d` (10:15), **tous
les runs de `main` ont été ANNULÉS par concurrence**. « `main` est-il vert ? »
n'était pas une question à laquelle le dépôt pouvait répondre.

### 7.2 La cause : une bombe à retardement, pas une régression

Aucun commit n'a rien cassé. Les deux témoins portaient

```ts
createdAt: new Date('2026-08-22T10:00:00Z'),
```

et `admitMessageEdit` refuse l'auteur au-delà de `MESSAGE_EDIT_WINDOW_MS`
(**24 h**, `services/messaging/messageEditAdmission`). Écrits le 2026-08-22 vers
10:00Z, ils ont été verts **exactement 24 heures**, puis rouges pour toujours.

L'horloge le prouve à la minute près :

| run | heure | verdict |
|---|---|---|
| `f69cbd26` | **09:12** | vert (fenêtre encore ouverte) |
| `e87b7b0d` | **10:15** | rouge |
| PR #3385 | **10:32** | rouge |

La bascule est à `2026-08-23T10:00:00Z`. Le troisième témoin du même bloc, qui
n'écrase PAS `createdAt` (la fabrique n'en pose aucun par défaut), passait et
passe toujours — c'est lui qui a localisé le tiers.

> **Un témoin dont le verdict dépend de l'horloge murale n'est pas un témoin, il
> est une bombe à retardement.** Il ne tombe pas quand la production casse ; il
> tombe quand l'heure tourne — donc sur TOUTE branche à la fois, et de façon
> parfaitement indiscernable d'une régression de la base.

### 7.3 Le correctif

`withinEditWindow()` — `new Date(Date.now() - 60_000)` — nommé, commenté, et
posé à côté de la fabrique. Ce que ces témoins exigent de `createdAt`, c'est
d'être PRÉSENT et défini (contrat `SocketIOMessage`, cycle 101) ; jamais d'être
une date particulière. Le commentaire porte l'horaire exact de la bascule et les
deux runs qui l'encadrent, pour que la prochaine session qui lira ce code trouve
la mesure et pas une convention.

Vérifié : **66/66** sur la suite, là où 64/66 passaient.

### 7.4 Balayage, et sa borne

Les autres dates absolues du sous-arbre (`2025-01-01`, `2026-01-01`, …) sont
INERTES : soit elles ne traversent aucune règle de fenêtre, soit elles sont déjà
expirées — et une date déjà vieille reste vieille. **La signature d'une bombe
n'est pas « une date en dur », c'est « une date en dur qui est ENCORE dans une
fenêtre »** : elle seule a un instant de bascule devant elle. Les deux sites
corrigés étaient les seuls du dépôt à porter cette signature, et la suite
complète (835/836 avant correctif) le confirme — aucune autre n'avait sauté.

### 7.5 Deux erreurs de diagnostic, dans le même cycle, et leur remède commun

Ce cycle a lu DEUX rouges de travers avant de les mesurer :

1. le `+3` du §1 — lu comme une régression de `main`, en fait un défaut du garde ;
2. ces 2 témoins — lus comme environnementaux (« ils échouent aussi au commit
   CI-vert `f69cbd26` »), en fait une bombe. Le raisonnement était juste et la
   conclusion fausse : ils échouaient à `f69cbd26` **parce que je les rejouais
   après 10:00Z**, pas parce que l'arbre différait. Comparer un arbre ancien avec
   une horloge d'aujourd'hui ne compare pas ce qu'on croit.

> **Rejouer un arbre historique ne rejoue pas son ENVIRONNEMENT.** L'heure fait
> partie de l'entrée. Une manœuvre de bissection qui change l'arbre en gardant
> l'horloge ne peut pas distinguer « le code a changé » de « le temps a passé ».

Le remède qui a tranché les deux : **remonter au dernier verdict que la CI a
PROUVÉ**, et comparer des runs CI entre eux plutôt que des exécutions locales.
C'est ce qui a nommé la minute de bascule.

## 8. Suivis

- [ ] **Corrigé et toujours ouvert — le cast d'émission côté WEB : 13 sites,
      pas 3** (tableau §0). Le contrat `TypedSocket = Socket<ServerToClientEvents,
      ClientToServerEvents>` existe (`apps/web/services/socketio/types.ts`) et
      chaque site le retire à l'appel. Ces casts ne sont pas seulement muets :
      `(socket as unknown).emit(…)` est lui-même une ERREUR de type (TS2571,
      « Object is of type 'unknown' »), comptée dans les 1239 et tolérée par le
      cliquet. Les fermer FAIT DESCENDRE la dette — le cliquet le capturera.
- [x] **RÉSOLU dans ce cycle (§6)** — `call:end` (et `call:initiate`,
      `call:join`, `call:signal`) déclaraient un ack REQUIS que ni la passerelle
      n'exige ni cinq émetteurs sur sept n'envoient. Les quatre passent à
      `ack?`, avec cliquet de type et témoin négatif.
- [ ] Suivi de §6.4 — les quatre `() => {}` vides de `use-webrtc-p2p.ts`
      (290/329/674/761) sont désormais retirables ; les retirer supprime un
      aller-retour d'ACK par candidat ICE et par SDP. Changement de
      COMPORTEMENT sur la signalisation d'appel : mérite sa propre mesure, avec
      un vrai appel exercé.
- [ ] **Neuf — `CallJoinAck` transcrit en ligne, deux fois, dans le MÊME
      fichier.** `CallManager.tsx:810` déclare
      `{ success?; data?: { iceServers? } }` et `:1005`
      `{ success?; error?: { code?; message?; endReason? } }` — deux vues
      partielles et divergentes d'un type qui EXISTE
      (`packages/shared/types/video-call.ts`), et dont les deux transcriptions
      rendent `success` optionnel là où le contrat le déclare requis. Même
      famille que `call:analytics` au cycle 107 bis.
- [ ] Hérité — la bivariance (`strictFunctionTypes: false`) reste la limite de
      toute porte typée du dépôt.
- [ ] Hérité — trois services (`CallCleanupService`,
      `StoryTextObjectTranslationService`, `NotificationService`) prennent un
      `Server` NU pour émettre.
- [ ] Hérité — lecture Redis non validée à l'exécution ; `_seq` déclaré sur le
      seul `NotificationEventData` ; `ReactionUpdateEvent`/`…EventData` en
      doublon ; signature d'index de `ConversationUpdatedEventData`.

- [x] **CORRIGÉ, et le diagnostic « environnemental » était FAUX (§7)** — les 2
      témoins de `MessageHandlerEditDelete` ne divergeaient pas selon la machine :
      c'étaient des BOMBES À RETARDEMENT (`createdAt` en dur, fenêtre d'édition de
      24 h, bascule à `2026-08-23T10:00:00Z`). Ils faisaient échouer `main` ET
      toute PR. Corrigés par `withinEditWindow()`. La raison pour laquelle ils
      échouaient aussi au commit CI-vert `f69cbd26` est que je les y rejouais
      APRÈS la bascule — l'arbre était le bon, c'est l'horloge qui ne l'était pas.
- [ ] **Méthode, pour la prochaine session** — deux fois dans ce cycle un rouge
      local s'est révélé environnemental (le +3 du §1, ces 2 témoins). La
      manœuvre qui tranche est la même et elle est bon marché : rejouer la
      mesure au dernier commit dont la CI a PROUVÉ le vert. Trois commits de
      `main` n'ont ici aucun run terminé — tous annulés par concurrence — donc
      « `main` est vert » n'était même pas une donnée disponible avant de
      remonter à `f69cbd26`.

# Cycle 108 — le contrat citait un test qui prouvait l'inverse

**Date** : 2026-08-23
**Branche** : `claude/keen-hamilton-lmraqx`
**PR** : #3381
**Prédécesseur** : cycle 107 (PR #3376, #3378) — le suivi porté trois cycles était faux

---

## Le point de départ

Le cycle 107 laissait un suivi hérité : « `_seq` déclaré sur le seul
`NotificationEventData` ». Instruit ici. La question posée n'était pas
« pourquoi un seul contrat ? » — la réponse est écrite dans `emitWithSeq.ts` et
elle est bonne — mais **« qui lit ce champ ? »**, parce que c'est la seule chose
dont dépend la validité du dispositif.

---

## Ce que le contrat affirmait

`packages/shared/types/socketio-events.ts`, sur `_seq` :

> C'est le signal de détection de TROU du SyncEngine (…). **Les trois clients le
> lisent** — web (`observeSyncSeq(this.syncSeq, data?._seq)`,
> `notification-socketio.singleton.ts`), iOS (`case seq = "_seq"`,
> `MeeshySDK/Sockets/MessageSocketManager.swift`), Android
> (`MessageSocketManagerNotificationTest`).

---

## Ce que la mesure dit

| affirmation | mesure |
|---|---|
| web lit `_seq` | **VRAI** — `observeSyncSeq` avant livraison, curseur préservé au reconnect, remis à zéro au `disconnect()` |
| iOS lit `_seq` | **VRAI** — `SyncSeqTracker.shared.observe(event.seq)`, `reset()` au logout dans `AuthManager` |
| Android lit `_seq` | **FAUX** — `MessageSocketManager.kt` le documentait lui-même comme un « toast-only field que `Json.ignoreUnknownKeys` **silently drops** » |
| `SyncSeq*` existe sur Android | **FAUX** — `grep -rln "SyncSeq\|syncSeq\|detectGap\|lastSeq" apps/android --include=*.kt` ⇒ **zéro fichier** |
| le test cité le prouve | **FAUX, et à l'envers** — il contient `"_seq":42` en fixture et n'asserte que `id`, `type`, `state.isRead` |

Et le second document qui gouverne le même champ, `emitWithSeq.ts`, disait la
vérité pendant tout ce temps :

> (…) sur les **DEUX** clients qui la portent : iOS (`SyncSeqTracker.observe`)
> et web (`observeSyncSeq`).

**Deux documents, un champ, deux comptes différents.** Celui qui comptait trois
était le contrat — celui qu'on lit en premier.

---

## La leçon : une CITATION n'est pas une MESURE

Le cycle 107 a établi qu'un suivi hérité est une affirmation, qui se mesure
avant d'être recopié. Ce cycle-ci trouve la variante la plus coûteuse de la même
erreur : **l'affirmation accompagnée d'une preuve qui n'en est pas une.**

`MessageSocketManagerNotificationTest` existe. Son nom est juste. Il touche bien
`notification:new`. Sa fixture contient bien `_seq`. Tout ce qui est vérifiable
d'un coup d'œil est exact — et il prouve la proposition **opposée** à celle qu'on
lui fait porter : que le décodage **survit** au champ, pas qu'il le lit. La
citation a la forme d'une preuve, donc personne (moi) n'a ouvert le fichier.

Un suivi non mesuré s'attrape en le mesurant. Une citation fausse résiste plus
longtemps, parce qu'elle a déjà l'air d'avoir été mesurée.

**Règle** : citer un test comme preuve d'une LECTURE exige de vérifier qu'il
**asserte** cette lecture. Une fixture qui contient le champ prouve la tolérance
au champ, jamais sa lecture. Les deux se ressemblent dans le fichier ; elles
sont opposées dans le contrat.

---

## La conséquence, qui n'est pas documentaire

Android n'avait **aucune détection de trou exacte**. Il ne disposait que du gap
recovery temporel (watermarks `updatedSince`/`after`), qui rate les events à
timestamp identique et sur-fetch — précisément le défaut que `_seq` existe pour
corriger.

Pire pour la suite : la règle LOCKSTEP de `emitWithSeq.ts` dit qu'étendre la
liste des appelants oblige à étendre l'observation **dans le même train de
release**, faute de quoi un client voit un trou à chaque event estampillé qu'il
n'observe pas. Sur la foi du contrat, cette extension aurait été jugée sûre pour
trois clients quand deux seulement observaient — et le troisième aurait vu un
faux trou à **chaque** event de la nouvelle famille.

---

## Ce que le lot fait

Fermer le trou, pas la phrase.

| fichier | rôle |
|---|---|
| `sdk-core/.../sync/SyncSeqState.kt` (nouveau) | valeur pure, **3ᵉ miroir** de la règle + `SyncSeqTracker` thread-safe non-suspendant |
| `sdk-core/.../socket/MessageSocketManager.kt` | lit `_seq` sur la charge **BRUTE** avant décodage (seul endroit où il existe encore) |
| `feature/notifications/.../NotificationsViewModel.kt` | trou ⇒ `refresh()` idempotent (décision **app-side**, miroir du coordinateur iOS) |
| `sdk-core/.../auth/AuthRepository.kt` | `reset()` au logout — `_seq` est alloué PAR USER |
| shared / gateway / web / iOS | les docs disent ce qui est mesuré, et gardent trace de ce qu'elles affirmaient à tort |

### Trois décisions qui méritent d'être écrites

1. **`observe` AVANT `decode`** — on suit le web, pas iOS (qui observe après
   décodage). Le curseur suit le flux **SERVEUR** : un décodage raté est notre
   bug, pas un trou d'émission. Et le curseur avance même si aucun écran
   n'écoute, parce qu'il décrit le transport, pas l'UI.
2. **`reset()` dans `AuthRepository`, pas dans `SessionTeardown`** — le contrat
   de `SessionTeardown` porte sur les stores **persistés** ; le curseur est en
   mémoire. iOS fait le même choix (`AuthManager`, pas `CacheCoordinator`). Sans
   ce reset, le compte suivant ne verrait pas un faux trou (bénin) mais
   **manquerait** tous les siens tant qu'il n'aurait pas dépassé le curseur
   hérité — l'échec silencieux, pas l'échec bruyant.
3. **Pas de débounce, contrairement à iOS** — un trou **avance** le curseur, donc
   une rafale d'events n'en produit qu'UN. Le débounce iOS coalesce surtout son
   second déclencheur (`reconnect`), qu'Android n'a pas. À rajouter le jour où
   Android en gagne un.

---

## Ce qui a été écarté

- **Ne corriger que la phrase** (« les deux clients ») : exact, et suffisant pour
  rendre les deux documents cohérents. Écarté : un contrat qui documente
  proprement un manque n'est pas un contrat rempli, et le manque était le sujet.
- **Un cliquet interdisant à `emitWithSeq` d'estampiller un event non observé
  par les trois clients** : écarté sur la leçon du cycle 107 — un cliquet écrit
  sur une mesure fragile ment plus longtemps qu'un journal. La liste des
  appelants tient en deux lignes, et la règle est écrite à l'endroit exact où on
  l'enfreindrait.

---

## Gates

- **Android** : non exécutable dans le conteneur de la routine — `dl.google.com`
  refusé par la politique d'egress, `sdkmanager` ne s'amorce pas, aucune tâche
  Gradle ne tourne. C'est la raison d'être documentée de
  `.github/workflows/android.yml` (son en-tête le dit) : **le workflow CI est le
  gate de ce lot** (`assembleDebug` + `testDebugUnitTest`).
- **TypeScript / Swift** : les modifications de ce lot y sont **exclusivement des
  commentaires** — aucune ligne exécutable touchée.

Dit sans habillage : ce cycle est le premier depuis longtemps dont le gate
principal est distant. Le journal le note plutôt que de laisser croire à une
vérification locale.

---

## Suivis

- [ ] L'estampillage reste limité à `notification:new`. L'étendre (fan-out
      per-user pour `message:new`, A2.2) exige d'étendre l'observation sur les
      TROIS clients dans le même train de release.
- [ ] Android consomme le trou dans `NotificationsViewModel`, donc à la portée de
      l'écran, là où iOS le câble au boot. C'est la limitation **déjà existante**
      de la consommation temps réel Android (`observeRealtime` y vit aussi), pas
      une nouvelle — notée plutôt qu'inventée, et à sa taille.
- [ ] Hérités du cycle 107 : `senderId` sous deux espaces d'ids ;
      `ReactionUpdateEvent` / `ReactionUpdateEventData` en double ; les autres
      contrats à signature d'index (`LinkMessagePayload`, `SocketIOMessage`) ;
      2 familles sur 12 qui valident à la main.
**Vrai de l'ALIAS, faux du PAQUET.**
`__tests__/lentille/shared-law-dist-parity.test.ts` atteint la sortie construite
par chemin RELATIF (`../../../../packages/shared/dist/utils/*.js`), ce qui ne
consulte jamais `paths`. Mesure sur un arbre INCHANGÉ : **1243 sans le build,
1240 avec.** Une dérive de exactement 3.

Le défaut est celui de l'en-tête, pas du test : un test dont l'objet est de
comparer la source au `dist/` doit évidemment importer `dist/`.

Le coût a été payé dans ce cycle même : j'ai lu 1243, cru à une régression de 4,
et cherché trois erreurs qui n'existaient pas. Le sens inverse est pire — une
baseline prise un jour depuis un poste sans build offrirait 3 points
silencieusement dépensables, ce que ce cliquet existe précisément pour empêcher.

**L'état est ÉPINGLÉ plutôt que les erreurs exclues.** Exclure ces trois-là par
chemin (comme `.next/` l'est) stabiliserait aussi le chiffre, mais rendrait ce
fichier libre de toute dette à jamais. Refuser de mesurer dans un état indéfini
ne coûte rien et garde chaque fichier compté. Self-test étendu aux trois états
(absent, construit, **vide** — un build interrompu produit les mêmes TS2307).

## 4. Seize casts, deux formes, et la seconde est la nuisible

Le contrat existait déjà : `TypedSocket = Socket<ServerToClientEvents,
ClientToServerEvents>`, et `getSocket()` le rend typé.

**Forme A — `(socket as unknown).emit(…)`, 9 sites.**
Ce n'est pas une échappatoire : `.emit` sur un `unknown` est une **erreur de
compilation**. 30 des 1239 erreurs du cliquet venaient de là. Le geste avait
l'apparence d'un contournement et l'effet d'une panne. Vraisemblablement une
transformation `as any` → `as unknown` passée en masse pour satisfaire la règle
« pas de `any` » : elle a converti des types SUPPRIMÉS en dette COMPTÉE.

**Forme B — `(socket as unknown as { emit: (e: string, d: unknown) => void })`, 7 sites.**
Celle-ci **compile**. Elle ne contourne pas le contrat : elle en fabrique un
FAUX, permissif, qui accepte n'importe quel nom d'événement et n'importe quelle
charge. Aucun compteur ne la voit — ni avant, ni après.

Trois fonctions de `CallManager` déclaraient en outre `socket: unknown` en
PARAMÈTRE (le contrat jeté à la signature), alors que les trois appelants
passent tous le retour typé de `getSocket()`.

## 5. Ce que le contrat a trouvé une fois appliqué

`call:end` déclarait son ack **REQUIS**. Il ne l'est pas.

| bout | réalité mesurée |
|---|---|
| passerelle | enregistre `ack?:`, invoque `ack?.({ success })` partout → fonctionne sans |
| iOS | émet les DEUX façons — `emit("call:end", …)` et `emitWithAck` |
| Android | `CallSignalManager.kt` — sans ack |
| web | trois sites — sans ack |

Le déclarer requis **interdisait le motif majoritaire que la passerelle soutient
explicitement**.

C'est le même symptôme que `CallMediaToggleClientEvent` au cycle 107 bis et la
résolution **INVERSE**, parce que la mesure diffère : là-bas l'ack a été RETIRÉ
(personne ne l'envoyait, la passerelle ne l'appelait jamais) ; ici il est réel et
devient donc OPTIONNEL. **Un même symptôme sur un ack a deux résolutions justes,
et seule la mesure des deux bouts dit laquelle.** Le réflexe « retirer, comme la
dernière fois » aurait cassé les variantes `emitWithAck` d'iOS.

## 6. Sur le chemin de messagerie : six casts recopiaient le contrat à côté du contrat

Les six `.on` de `messaging.service.ts` sont partis **sans une seule erreur** :
le contrat déclarait déjà ces six événements avec exactement les charges que les
listeners transcrivaient à la main. Les casts ne compensaient aucun manque — ils
dupliquaient ce qui existait. Leurs voisines immédiates (`MESSAGE_CONSUMED`,
`MENTION_CREATED`) s'écrivaient d'ailleurs déjà sans cast : le fichier était
incohérent avec lui-même.

Le septième (`emitWithTimeout`) n'est **pas entièrement résolu**, et c'est
délibéré. Son nom d'événement est désormais vérifié ; sa charge ne l'est pas,
parce que corréler nom→charge exige un `messageData` TYPÉ, or il naît
`Record<string, unknown>` et se complète par MUTATION (chiffrement, pièces
jointes). Le typer suppose de rendre cette construction immuable — ce que le
style du dépôt demande par ailleurs, et qui touche le chemin E2EE. Lot à part,
consigné, pas forcé à la fin d'un cycle.

**Ce lot ne bouge pas le cliquet (1209 → 1209), et c'est sa leçon.** La forme B
compile : son retrait n'est pas chiffrable. Un progrès réel peut être invisible
au garde qui mesure — et le corollaire est plus inquiétant : la forme B peut
revenir sans que rien ne rougisse.

## 7. Gates

- `tsc` passerelle / shared / agent : **0 erreur** (prisma généré).
- Cliquet web : 1240 (rouge) → **1209**, aucun fichier en hausse
  (`CallManager` 31→6, `VideoCallInterface` 11→6 ; le reste de ces fichiers
  appartient à une autre famille — `window`, `constraints`, `event`).
- Suites web : appels 39/39 (391 témoins) + 11/11 (127), services 54/54 (1791),
  cache-sync 1/1 (93), repost 6/6 (dont **2 RED prouvés** avant correction).
- Suites passerelle : `CallEventsHandler` 2/2 (302 témoins).

## 8. Suivis

- [ ] **La forme B est hors de portée du cliquet.** Reintroduire un
      `(socket as unknown as { emit: … })` ne rougit rien. C'est le seul garde
      manquant de cette famille — un balayage textuel, sur le modèle du
      `client-receive-door-sweep` du cycle 107 bis, est la réponse ; il n'a pas
      été écrit ici pour ne pas ajouter un garde non éprouvé en fin de cycle.
- [ ] **`messageData` naît `Record<string, unknown>` et se complète par
      mutation** (`messaging.service.ts` l. 333–377). C'est la racine du dernier
      cast, et le typer est aussi une mise en conformité avec la règle
      d'immuabilité du dépôt. Touche le chemin E2EE — à faire avec ses témoins.
- [ ] **79 autres sites `(x as unknown).membre` dans `apps/web`**, hors socket
      (`window`, `user`, `conversation`, `constraints`…). Même transformation en
      masse, même effet : des types supprimés devenus dette comptée. Chacun
      demande une décision de domaine (le champ manque-t-il vraiment au type ?),
      donc ce n'est pas un balayage mécanique — mais c'est ~1/3 de la dette web.
- [ ] Suivi hérité (107 bis) — **la bivariance reste la limite générale.**
      `strictFunctionTypes: false` : aucune porte typée n'attrape une charge
      divergente. Décision qui dépasse Socket.IO.
- [ ] Suivi hérité — trois services de la passerelle prennent encore un `Server`
      NU pour ÉMETTRE.
- [ ] Suivi hérité (106) — la LECTURE depuis Redis reste non validée à
      l'exécution.
