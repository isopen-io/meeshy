# Itération 280 — `AttachmentReactionHandler` valide sa frontière socket par Zod (parité des 4 familles)

Issue : #4245 · suivi explicite de l'itération 279 (b) · jumelle de `ReactionHandler` / `CommentReactionHandler` / `PostReactionHandler`.

## État actuel

Les quatre familles de réaction partagent le même contrat de frontière socket
(`{ …Id, emoji }`). Trois d'entre elles valident leur charge ENTRANTE par un
schéma Zod via `validateSocketEvent` :

| handler | frontière |
|---|---|
| `ReactionHandler` | `validateSocketEvent(SocketReactionAddSchema / …RemoveSchema, data)` |
| `CommentReactionHandler` | `SocketCommentReactionAddSchema / …RemoveSchema` |
| `PostReactionHandler` | `SocketPostReactionAddSchema / …RemoveSchema` |
| **`AttachmentReactionHandler`** | **gardes manuscrites** — `!data?.x` + `isValidObjectId` |

`AttachmentReactionHandler._apply` faisait, avant tout schéma :

```ts
if (!data?.attachmentId || !data?.messageId || !data?.emoji) { … 'Invalid payload' }
if (!isValidObjectId(data.messageId) || !isValidObjectId(data.attachmentId)) { … 'Could not resolve participant' }
```

## Problèmes identifiés

1. **Écart de CONSISTANCE de frontière.** Une famille sur quatre garde sa charge
   à la main. Une règle de frontière retapée à chaque site est une règle qu'un
   site finira par appliquer différemment — les trois messages d'erreur
   divergeaient déjà (`'Invalid payload'` / `'Could not resolve participant'` vs
   le `'Validation failed: …'` des jumelles).

2. **Borne d'emoji MANQUANTE.** Les trois jumelles bornent l'emoji
   (`z.string().min(1).max(10)`). La famille par-pièce-jointe ne vérifiait que la
   présence (`!data?.emoji`) : un emoji de longueur arbitraire (charge forgée)
   traversait la frontière et atteignait le service et la persistance. Défense en
   profondeur manquante — le service backstoppe le FORMAT depuis 279 (b), pas la
   LONGUEUR.

## Causes racines

Le chemin par-pièce-jointe (`BUG2 A'`) a été porté depuis la jumelle message SANS
adopter la frontière Zod que les trois autres familles partagent. `mongoId`
(regex `OBJECT_ID_REGEX`) et `isValidObjectId` (même regex) étant équivalents, la
garde manuscrite REDÉCRIVAIT localement ce qu'un schéma déclare une fois — et
oubliait au passage la borne d'emoji.

## Impact métier / technique

Un client émettant `attachment:reaction-add/remove` avec une charge malformée
recevait un message d'erreur DIFFÉRENT des trois autres familles (incohérence
d'API), et un emoji sur-long n'était refusé par AUCUNE garde de frontière (il
n'échouait qu'au niveau du service, une couche plus bas — donc après le
résolveur de participant et la requête IDOR). Classe « cette entité a-t-elle une
jumelle ? on la prend en entier » du `CLAUDE.md`.

## Évaluation du risque

Faible. Le correctif ALIGNE exactement sur les trois jumelles testées ; il ne
change que `AttachmentReactionHandler.ts` (frontière) et ajoute deux schémas dans
`socket-event-schemas.ts`. `mongoId` subsumant `isValidObjectId`, le cid_*
optimiste et le non-ObjectId sont toujours refusés — désormais par le schéma,
comme les jumelles (qui rejettent AUSSI un cid_* à leur frontière Zod). Net effet
client inchangé (rollback de la réaction optimiste), message d'erreur convergé.

## Améliorations proposées (implémentées)

- `SocketAttachmentReactionAddSchema` / `SocketAttachmentReactionRemoveSchema`
  (`attachmentId: mongoId`, `messageId: mongoId`, `emoji: min(1).max(10)`).
- `_apply` valide en tête via `validateSocketEvent(schema, data)`, `schema` élu
  par `action`, puis `validated.*` partout — comme les trois jumelles.
- Retrait des gardes manuscrites redondantes et de l'import `isValidObjectId`
  désormais inutile.

## Bénéfices attendus

Une source de vérité de frontière par famille de réaction ; refus cohérent sur
les quatre ; un emoji sur-long refusé AVANT tout aller-retour DB ; message
d'erreur unifié (`'Validation failed: …'`).

## Complexité

Faible : deux schémas, une frontière de handler, deux fichiers de tests mis à
jour.

## Critères de validation (atteints)

- Témoins exerçant le VRAI schéma (aucun mock de `validateSocketEvent`) : RED
  prouvé (13 témoins de frontière tombent quand la validation est débranchée),
  GREEN après.
- Nouveau témoin « emoji > 10 caractères refusé à la frontière » (la garde que
  les jumelles ont et que la famille attachment n'avait pas), sur les DEUX
  fichiers de tests du handler.
- Suite gateway complète : **904 suites / 20564 tests** verts.
- `tsc --noEmit` du gateway : exit 0.

## Suivi (hors scope — piège armé désormais fermé)

Le suivi de 279 (b) — « `AttachmentReactionHandler` n'a pas de schéma Zod de
frontière socket là où ses trois jumelles en ont un » — est SOLDÉ.
