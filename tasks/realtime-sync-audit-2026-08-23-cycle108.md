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

