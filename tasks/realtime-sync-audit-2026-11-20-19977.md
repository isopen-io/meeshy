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

2. **L'ORDRE est corrigé au passage, et c'est une loi écrite du dépôt** :
   l'enfilage DURABLE précède désormais l'aperçu de liste, qui est cosmétique.
   Avant, l'aperçu était `await`é entre l'émission et l'enfilage (règle du
   cycle 116 : « charger la liste → enfiler (durable) → diffuser la cosmétique »).

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
