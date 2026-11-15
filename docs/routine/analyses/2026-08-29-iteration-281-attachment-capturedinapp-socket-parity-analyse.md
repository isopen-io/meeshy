# Itération 281 — `serializeAttachmentForSocket` rétablit `capturedInApp` (parité select ↔ fil socket)

Issue : #4287 · classe « un champ que des clients LISENT et qu'un émetteur OMET »
(contrat incomplet), miroir de `location` / `_seq` sur `ConversationUpdatedEventData`.

## État actuel

`serializeAttachmentForSocket` (`services/gateway/src/socketio/serializeAttachmentForSocket.ts`)
est le sérialiseur CANONIQUE de tout `MessageAttachment` diffusé par Socket.IO.
Son doc-comment affirme la parité avec `attachmentMediaSelect` et la charge REST
`/messages`. Trois chemins socket passent par lui :

| chemin | site |
|---|---|
| `message:new` (livraison PRIMAIRE) | `MessageHandler._serializeAttachmentsField` |
| `message:attachment-updated` (delta d'enrichissement) | `emitAttachmentUpdated.ts:77` |
| rattrapage à froid (`sync`) | `routes/sync.ts:310` |

Le sérialiseur portait 26 champs ; il en OMETTAIT un que le `select` charge à
dessein : **`capturedInApp`** — la provenance « ce média vient de la caméra / du
micro de l'app ».

## Problèmes identifiés

**Écart de COMPLÉTUDE de contrat sur un chemin de livraison.** Le `select`
(`attachmentMediaSelect`, `attachmentIncludes.ts:100`) charge `capturedInApp`
avec un commentaire qui NOMME le risque : *« La provenance voyage avec le média …
Absent d'ici, la garde ne se déclenche jamais. »* Le producteur WS (`message:new`)
charge le message en `attachments: true` / `attachmentFullSelect`, donc
`raw.capturedInApp` est présent à l'entrée du sérialiseur. **Le sérialiseur est le
SEUL dropper** : ni l'interface `SocketAttachment` ni l'objet rendu ne portaient
le champ.

Résultat : un message porteur d'un média capturé DANS l'app, livré par le
transport WebSocket PRIMAIRE ou par le rattrapage à froid, arrivait avec
`capturedInApp` **absent** — pendant que le même message récupéré par REST le
porte (`messageAttachmentSchema` le déclare, `api-schemas.ts:295`). La garde de
confirmation de publication (`publicationNeedsCaptureConfirmation`,
`packages/shared/utils/forward-to-publication.ts:82-84`), que le web alimente
depuis ce drapeau (`transformers.service.ts:268`), était donc silencieusement
désarmée sur le chemin WS/sync.

## Causes racines

Le sérialiseur a été écrit pour miroiter `attachmentMediaSelect`, mais son
inventaire de champs est TENU À LA MAIN (26 recopies). `capturedInApp` a été
ajouté au `select` (avec sa raison écrite) sans être porté au sérialiseur qui
prétend le miroiter — la divergence exacte que le doc-comment déclarait impossible.
Aucun cliquet ne garde la parité select ↔ sérialiseur, donc rien ne l'a signalée.

## Impact métier / technique

La confirmation avant publication d'un média capturé dans l'app est une garde
PRODUIT (dimension 1/13 — « qu'est-ce qui part à côté ? ») : sans elle, un média
personnel filmé dans l'app peut être re-publié sans le rappel de confirmation
prévu, sur tout message dont l'attachement est arrivé par le fil WebSocket
(cas nominal — c'est le transport primaire). Le chemin DELTA
`message:attachment-updated` n'est pas affecté à l'usage (le client fusionne
`{...a, ...attachment}`, le `capturedInApp` préexistant survit) ; le trou est la
livraison INITIALE, la plus fréquente.

## Évaluation du risque

Faible. Le champ est une provenance booléenne DÉCLARÉE au contrat partagé et
lue défensivement par le client (`att.capturedInApp === true`) — servir sa valeur
ne fuit rien (aucune garde de confidentialité, contrairement aux champs de
présence). Le correctif AJOUTE un champ à un objet émis tel quel (le fil socket
n'a pas de sérialiseur fast-json-stringify) ; il ne retire ni ne renomme rien.
Le défaut `?? false` reflète `@default(false)` pour un appelant qui aurait
requêté sans le champ.

## Améliorations proposées (implémentées)

- `SocketAttachment` déclare `readonly capturedInApp: boolean` (non nullable,
  comme `MessageAttachment.capturedInApp`).
- L'objet rendu sert `capturedInApp: (raw.capturedInApp …) ?? false`.
- Le doc-comment sur place cite la raison du `select` et le risque (garde
  désarmée) pour que la parité soit tenue au prochain ajout.

## Bénéfices attendus

Parité REST ↔ WS ↔ sync rétablie sur les trois chemins socket d'un seul correctif
(source unique). La garde de confirmation de publication se déclenche désormais
quel que soit le transport de livraison de l'attachement.

## Complexité

Faible : deux lignes de production (interface + objet), deux témoins.

## Critères de validation (atteints)

- RED prouvé : les deux nouveaux témoins tombent sur le code courant (le
  sérialiseur rend `undefined`).
- GREEN après : `serializeAttachmentForSocket.test.ts` 13/13.
- Suites d'attachement voisines : 8 suites / 125 tests verts ; MessageHandler /
  messageNewPayload / sync / conversation-messages : 12 suites / 761 tests verts.
- Suite gateway complète : voir plan (gate final).
- `tsc --noEmit` du gateway : exit 0.

## Suivi (hors scope — issue à ouvrir si repris)

Aucun cliquet ne garde la parité **select ↔ `SocketAttachment`**. Un tel garde
exigerait une liste d'exemptions NOMMÉES (le sérialiseur AGRÈGE délibérément
`reactions` en `reactionSummary` / `currentUserReactions`, et n'expose pas la
relation brute), donc il n'est pas trivialement propre — c'est une issue à part
entière, pas une ligne de ce lot. La parité de contenu est le vrai sujet ; la
garder mécaniquement est une amélioration de MÉTHODE distincte.
