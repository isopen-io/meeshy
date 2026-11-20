# `message:edited` — le troisième transport servait l'adresse nue d'une pièce qui se lit par lecteur (#19977)

*2026-11-20. Journal daté, pas un tableau de bord : l'état des tâches vit dans
les issues. Pas de numéro de cycle — il s'alloue dans un espace de noms partagé
et deux sessions l'ont déjà pris le même jour (#5102).*

## Le défaut

`MeeshySocketIOManager.broadcastMessageEdited` — la bulle d'un enregistrement
d'appel — était le TROISIÈME producteur de `message:edited`, et **le seul des
trois qui charge des pièces jointes aujourd'hui** : son appelant
(`POST /calls/:callId/recordings/:recordingId/link` → `linkCallRecording`) relit
la bulle avec `CALL_SUMMARY_MESSAGE_INCLUDE`, qui porte `attachments`.

Il faisait les deux choses que #9646 (REST) et #19939 (socket) interdisent :

| ligne | ce qu'il faisait |
|---|---|
| `:3447` | `attachments: serializeMessageAttachmentsForSocket(message.attachments)` |
| `:3451` | diffusait à la room **ENTIÈRE**, sans aucun plan signé |
| `:3459` | **enfilait** sans `resolvePayloadForReader`, sans interroger `PLAN_UNAVAILABLE` |

Le scénario : conversation en mode serveur-au-repos, appel enregistré, le
balayage `at-rest-file-sweep` scelle le fichier ⇒ `carriesSealedFile` vrai ⇒ la
pièce se lit par lecteur. L'adresse **nue** partait à toute la room et dans
Redis pour 48 h, pendant que la route par chemin la refuse (404) — donc lecture
d'enregistrement cassée pour tout le monde, et une adresse de pièce protégée
persistée chez des gens que la route ne servirait pas.

## Ce qui a été livré

1. **`socketio/callSummaryEditedDelivery.ts`** — la composition de la charge et
   la remise, sorties du manager. La remise passe par les deux portes du
   dépôt : `emitEditedToReaders` (canal vivant, `PLAN_UNAVAILABLE ⇒ rien`) et
   `offlineSignedEdit` + `queueSigningFields` (canal durable, `withhold` ⇒ aucune
   entrée). `MeeshySocketIOManager.ts` : **3756 → 3708 lignes**, soit sous sa
   dette gelée (3816) — le lot REND des lignes au budget.

2. **L'ordre suit la loi du cycle 116** — l'enfilage DURABLE précède l'aperçu de
   liste, qui est cosmétique. **Mais ce n'est pas une réparation, et la première
   rédaction de ce journal le laissait croire** : `emitConversationPreviewUpdate`
   enveloppe TOUT son corps dans un `try` dont le `catch` ne relance pas, donc
   elle ne peut pas lever, donc l'ancien ordre ne mettait aucune garantie
   durable en danger (mesuré par l'audit adversarial, constat C6). L'ordre est
   gardé parce qu'il est juste par loi, pas parce qu'il ferme quoi que ce soit.

3. **Le cliquet** `socketio/__tests__/edited-signing-door-sweep.ts` apparie
   « unité qui sert `message:edited` en portant des pièces » × « interroge un
   plan signé », inventaire **VIDE**.

4. **Le compte de `messageEditedPayload.ts` est corrigé.** Il écrivait « TROIS
   producteurs » ; recompté, **quatre chemins d'émission et six sites de
   composition** — il nommait la PORTE REST là où la composition a lieu dans
   trois fichiers de routes, et omettait entièrement `emitArrivalsLineUpdate`.

## Ce que ce lot a failli livrer, et qui est la vraie leçon

**La première rédaction du cliquet cherchait les deux idiomes dans le même
FICHIER, et elle était VERTE sur le défaut qu'elle est écrite pour attraper.**
`MeeshySocketIOManager.ts` appelait déjà `readerSignedPlanBestEffort` et
`offlineSignedPayload` — trois cents lignes plus haut, pour `message:new`.

Le grain a donc été ramené à l'**unité qui sert** (pile d'accolades remontée
jusqu'à une tête de fonction, les `if (…) {` retirés nommément pour que la
fenêtre se trompe du côté TROP LARGE). Mesuré sur l'arbre d'AVANT reconstruit
(`git show origin/dev:… > /tmp/oldsrc/…`) :

```
INSCOPE   ["routes/conversations/messages-advanced-edit.ts","routes/messages-writes.ts",
           "socketio/MeeshySocketIOManager.ts","socketio/handlers/MessageHandler.ts"]
OFFENDERS [{"file":"socketio/MeeshySocketIOManager.ts","missing":"both"},
           {"file":"socketio/MeeshySocketIOManager.ts","missing":"both"}]
```

Détail et règle générale : `tasks/lessons/2026-11-20-un-balayage-a-l-echelle-du-fichier-mesure-la-popularite-d-un-idiome.md`.

## Ce qui sort du balayage par CONSTRUCTION, et pourquoi ce n'est pas une exemption

`emitArrivalsLineUpdate` (`services/conversations/globalArrivalsNotice.ts`) émet
bien `message:edited` à la room sans aucun plan — sa charge ne déclare AUCUNE
pièce jointe, donc il n'y a rien à signer. Le geler par une ligne d'inventaire
l'aurait fait passer pour une dette ; le discriminant exige donc `attachments`
dans l'unité, et le site sort sans qu'on ait à l'écrire nulle part.

## Preuve

- 4 témoins neufs sur la PRODUCTION (vrai `MeeshySocketIOManager`, signature
  vérifiée par `checkReaderFileToken`) : émission par lecteur signée, entrée de
  file signée pour la ligne `Participant`, `withhold` sur lecture tombée, et la
  non-régression « une bulle ORDINAIRE garde sa diffusion de room ».
- ROUGE prouvé par mutation (`plan: null` aux deux canaux ⇒ 3 témoins tombent,
  la non-régression reste verte).
- Cliquet : 3 témoins, dont une fixture NÉGATIVE qui reproduit le voisinage
  (un fichier qui consulte un plan pour un AUTRE événement) — sans elle, le
  cliquet par fichier passerait aussi.
- `tsc --noEmit` EXIT=0 ; les deux cliquets de taille verts ; 111 suites /
  1614 témoins verts sur `src/socketio` + budgets.

## Ce qui reste

- **La capacité au porteur n'est pas fermée** : rien dans `linkCallRecording` ne
  refuse une pièce téléversée avec `isViewOnce` / `effectFlags`
  (`callRecordingLink.ts` ne lit que `uploadedBy` / `messageId` / `mimeType`).
  Ce lot ferme la fuite de l'adresse ; il ne décide pas qui a le droit de lier
  une pièce protégée à une bulle d'appel.
- **`ATTACHMENT_URL_SIGNING_KEY` doit être posée en staging et en production** :
  sans elle, `readerFileUrlSignerFromEnv` rend `null`, le plan rend `null`, et ce
  correctif — comme celui de #19939 — est un no-op fonctionnel. À confirmer côté
  infrastructure.


## Ce que l'audit adversarial a cassé, et qui change le lot

L'audit (agent `auditeur-adversarial`, worktree isolé) a rendu un verdict
**BLOQUANT** sur la première rédaction. Il avait raison sur les six points, et
deux d'entre eux retournaient le lot contre lui-même.

### C1 — le lot RETIRAIT une garde, et sortait le site du cliquet qui la tient

L'ancien site portait `safeBroadcast('message:edited (call summary)', …)` avec
sa raison écrite. **Je l'ai supprimé sans le remettre.** Son jumeau socket
l'a, à dix lignes d'un commentaire qui dit pourquoi
(`MessageHandler.ts:982`) — et `emitEditedToReaders` n'enrobait que sa boucle
PAR LECTEUR, ses branches de ROOM étant des `.emit()` nus.

Mesuré par l'audit, sur une bulle d'appel ORDINAIRE dont l'émission lève :

| arbre | `queue.enqueue` | `conversation:updated` |
|---|---|---|
| parent du lot | **1** | **true** |
| première rédaction du lot | **0** | **false** |

La bulle « appel terminé », déjà commise en base, était perdue pour TOUJOURS
pour tout absent — c'est-à-dire le défaut du cycle 116 / #17026, rouvert par le
lot qui cite cette loi.

**Et le cliquet qui garde cette classe était VERT** : avant le lot, l'émission
et `enqueueOfflineMessageMutation(` vivaient dans la même unité, donc la paire
était vue ; après, l'enfilage passe par un paramètre de RAPPEL nommé `enqueue`,
absent de `ENQUEUE_CALLS`. Sa portée est tombée de **14 à 13 émissions
candidates**, sous un témoin dont le plancher est `>= 10`.

> **Un lot peut retirer une garde ET sortir son site du périmètre du cliquet qui
> la tient, dans le même geste.** Les deux mouvements ont la même cause — on a
> déplacé du code — et aucun des deux ne rougit, parce qu'un cliquet mesure ce
> qu'il ATTEINT.

Réparé sur trois fronts : les branches de room d'`emitEditedToReaders` sont
enrobées (donc les TROIS transports en profitent, pas seulement celui-ci) ;
l'appel est enrobé AUSSI au site, comme son jumeau socket, ce qui le rend
VISIBLE au cliquet ; et `deliverCallSummaryEdit` + `enqueue` rejoignent
`ENQUEUE_CALLS`. Portée remesurée : **14**, inventaire vide.

**Enrober sans relayer supprime un signal** : `broadcastMessageMutation` passe
un `onError` qu'un témoin exigeait déjà de voir appelé quand la room lève.
`emitEditedToReaders` prend donc l'`onError` de son appelant et le relaie à
chaque sortie — la moitié de la garde qui reste chez celui qui a le contexte,
comme `serverEmit.ts` le prescrit.

### C2 — la moitié « canal durable » du lot n'avait aucun témoin qui PUISSE tomber

Supprimer `if (signed.kind === 'withhold') return;` laissait les quatre témoins
VERTS. Le témoin censé la couvrir rejetait `participant.findMany` EN BLOC — ce
qui tue aussi la lecture de participants INTERNE à la file, si bien que
`queue.enqueue` n'était jamais atteint, garde ou pas.

**Et j'ai reproduit la faute en la corrigeant.** Ma première isolation rejetait
sur `select.shareLinkId` — que `HISTORY_FLOOR_PARTICIPANT_SELECT` demande AUSSI,
donc elle tuait la loi de lecture et le témoin repassait au vert par
`kind: 'unknown'`, c'est-à-dire pour une seconde raison vacante. Le discriminant
juste est `shareLinkId` **sans** `historyVisibleFrom`.

> **Isoler une lecture dans un double, c'est affirmer qu'on connaît toutes
> celles qui lui ressemblent.** Quatre requêtes de participants traversent ce
> chemin, et trois demandent `shareLinkId`.

### C3 et C5 — le cliquet neuf mentait, et sur le point même qu'il revendique

Le doc-comment affirmait avoir éliminé la mesure à l'échelle du fichier.
Mesuré par l'audit : **deux unités sur cinq**, dont `MessageHandler.ts` et ses
2 265 lignes, étaient rendues à l'échelle du FICHIER — parce que `UNIT_HEAD`
exigeait `(` sur la ligne portant l'accolade, et qu'un paramètre-objet
multi-lignes ferme son `{` sur `}): Promise<void> {`. Deux défauts réels
passaient : signature multi-lignes, et charge composée ailleurs (la forme que ce
lot venait de créer). `DELEGATES` matchait de plus la DÉFINITION d'une porte,
donc `callSummaryEditedDelivery.ts` s'auto-exemptait.

`blankComments` traitait enfin `/*` à l'intérieur d'une CHAÎNE comme un
commentaire : **612 lignes de code réel effacées** sur `src/`, et l'erreur allait
du côté qui DISPENSE.

Réparés : tête d'unité reconnue sur le TEXTE (du `{` à sa `)` appariée, puis à
sa `(`), portée décidée au FICHIER et verdict rendu à l'UNITÉ, une unité
non délimitée comptée comme un DÉFAUT de l'instrument (`unresolved-unit`), et un
automate qui connaît les chaînes. Quatre fixtures négatives de plus, une par
forme.

### C4 — le plancher d'historique, absent des trois portes

`blocked: NO_BLOCKED` était câblé à vide quand les deux transports frères
appellent `messageReadership` / `blockedReaderKeys`. Pré-existant, non aggravé —
et désormais fermé : un invité entré APRÈS la bulle ne la reçoit ni en direct ni
dans sa file.

### C7 — le compte, recompté par l'audit

Six sites de composition et quatre chemins d'émission : juste. **Mais le DRAIN
est un cinquième émetteur de `message:edited` sur le fil**
(`DRAINED_EVENT.edited`), et c'est lui qui applique le plancher au dernier
instant. Un inventaire du contrat doit le nommer.

### Ce que l'audit a confirmé comme JUSTE

La citation ne peut pas traverser : `CALL_SUMMARY_MESSAGE_INCLUDE` ne porte pas
`replyTo`, et `callSummaryEditedPayload` n'étale pas `message` — il énumère ses
clés. Ce n'est pas circonstanciel, c'est structurel. Et le plan est calculé sur
une charge sérialisée qui conserve ce dont `attachmentIsReaderBound` a besoin.

## Preuve, après réparations

- 7 témoins sur la PRODUCTION, chacun tombant sous SA mutation :
  `withhold` (1), plancher (1), `safeBroadcast` (1), plan par lecteur (3) ;
  intact : 7/7.
- Cliquet de signature : 7 témoins, dont **quatre fixtures négatives** (signature
  multi-lignes, charge composée ailleurs, `/*` en chaîne, fichier sans pièce).
- Cliquet #17026 : portée **14** (celle d'avant le lot), inventaire vide.
- `tsc --noEmit` EXIT=0 ; **172 suites / 2740 témoins** verts sur `src/socketio` ;
  les deux cliquets de taille verts.
