# Itération 280 — La réaction par-pièce-jointe valide à sa frontière socket par un schéma Zod (parité des 4 familles)

Issue : suivi explicite de l'itération 279 (b) —
« `AttachmentReactionHandler` n'a pas de schéma Zod de frontière socket là où
ses trois jumelles en ont un ». Famille `ReactionHandler` /
`CommentReactionHandler` / `PostReactionHandler`. Leçon gateway « Un balayage qui
cherche UN idiome mesure sa popularité, pas une propriété » (cycle 107).

## État actuel

Les quatre familles de réaction du gateway portent la même opération (ajout /
retrait d'un emoji) sur quatre entités : message, commentaire, post, pièce
jointe. **Trois d'entre elles valident leur charge entrante par un schéma Zod à
la frontière socket** (`validateSocketEvent(SocketXReactionAddSchema, data)`),
site unique de la borne d'emoji (`z.string().min(1).max(10)`) et de la forme
ObjectId des ids.

`AttachmentReactionHandler._apply` validait **autrement** — à la main :

```ts
if (!data?.attachmentId || !data?.messageId || !data?.emoji) {
  callback?.({ success: false, error: 'Invalid payload' }); return;
}
if (!isValidObjectId(data.messageId) || !isValidObjectId(data.attachmentId)) {
  callback?.({ success: false, error: 'Could not resolve participant' }); return;
}
```

C'est l'une des deux familles (avec `LocationHandler`) que le balayage
`validateSocketEvent` du cycle 107 comptait en faux positif : elle valide, mais
sans schéma.

## Problèmes identifiés

1. **Écart de CONSISTANCE (dimension 6/11).** La « douzième famille » de
   réactions garde son entrant à la main quand ses trois jumelles délèguent au
   schéma. Le gateway CLAUDE.md pose exactement la question : « la douzième
   famille le sera-t-elle ? ».
2. **La borne d'emoji manquait à la frontière.** L'ad-hoc n'imposait aucune
   longueur max : un emoji arbitrairement long traversait jusqu'au service, qui
   le `sanitize`. Défense-en-profondeur absente là où les trois jumelles la
   posent (`max(10)`).
3. **Deux gardes redondantes une fois le schéma en place.** `isValidObjectId`
   sur les deux ids recouvre EXACTEMENT ce que `mongoId` (même `OBJECT_ID_REGEX`,
   mesuré) enforce — code mort après conversion.

## Causes racines

Le chemin par-pièce-jointe a été porté depuis la jumelle message en reproduisant
la LOGIQUE (résolution de participant, garde IDOR, idempotence) mais pas la
DISCIPLINE de frontière : la validation d'entrée a été réécrite à la main au lieu
d'être déléguée au schéma. C'est « cette entité a-t-elle une jumelle ? on la
prend en entier » appliqué à moitié — la moitié restante étant la frontière.

## Impact métier / technique

Défense-en-profondeur, pas un trou vivant (le service `sanitizeEmoji` +
`isValidObjectId` backstoppaient déjà — cf. 279 b). L'écart est de cohérence :
une famille de contenu réagissable dont la frontière diverge des trois autres,
et une borne d'emoji absente à l'entrée. `mongoId` continue de prévenir le throw
Prisma P2023 sur un id non réconcilié (cid_*).

## Évaluation du risque

Faible. `mongoId` réutilise le MÊME `OBJECT_ID_REGEX` que `isValidObjectId`
(vérifié : `packages/shared/utils/object-id.ts`), donc la conversion est
équivalente pour la forme d'id ; seule la CHAÎNE d'erreur sur les chemins de
refus change (`'Invalid payload'` / `'Could not resolve participant'` →
`'Validation failed: …'`), ce qui aligne sur les trois jumelles. Le chemin
succès est inchangé. Une réaction à pièce jointe ne porte en pratique jamais de
cid_ (l'id d'attachment n'existe qu'après persistance du message), donc le
changement de chaîne sur ce chemin défensif est sans effet produit.

## Améliorations proposées (implémentées)

- Deux schémas `SocketAttachmentReactionAddSchema` / `RemoveSchema`
  (`socket-event-schemas.ts`), miroir exact des schémas de réaction :
  `attachmentId: mongoId`, `messageId: mongoId`, `emoji: string().min(1).max(10)`.
- `_apply` sélectionne le schéma par `action` et valide par
  `validateSocketEvent` en tête, comme les trois jumelles ; `validated` alimente
  tout l'aval.
- Retrait de la garde `isValidObjectId` (subsumée) et de son import (code mort).

## Bénéfices attendus

Les QUATRE familles de réaction valident désormais leur entrant par le même
mécanisme ; la borne d'emoji est posée à la frontière comme ses jumelles ; une
garde de moins à maintenir à la main.

## Complexité d'implémentation

Faible : deux schémas, un bloc de validation, cinq substitutions `data.*` →
`validated.*`, un import retiré.

## Critères de validation (atteints)

- 6 assertions de frontière RED confirmé (elles attestaient `'Invalid payload'` /
  `'Could not resolve participant'`, réécrites en `'Validation failed'`), GREEN
  après. RED prouvé en revertant l'implémentation.
- 1 nouveau témoin : un emoji > 10 caractères est refusé à la frontière (borne
  que l'ad-hoc n'imposait pas).
- Les DEUX suites `AttachmentReactionHandler` (`src/socketio/handlers/__tests__`
  et `src/__tests__/unit/handlers`) exercent le VRAI `validateSocketEvent` (pas
  de mock de la SSOT partagée, discipline du gateway CLAUDE.md).
- 314 tests des 4 familles de réaction + `socket-event-schemas` verts.
- `tsc --noEmit` du gateway : exit 0.

## Suivi (hors scope — reste à instruire)

`LocationHandler` est l'autre famille qui valide à la main
(`_validateCoordinates`). Écart de consistance analogue — mais la validation de
coordonnées n'a pas de schéma jumeau évident (elle borne des nombres, pas des
ids/emoji). À peser séparément : la borne d'un schéma Zod y apporterait-elle plus
que la garde manuscrite dédiée ? À ouvrir en issue si oui.
