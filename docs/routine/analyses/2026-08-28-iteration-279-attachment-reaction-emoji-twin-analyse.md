# Itération 279 (b) — La réaction par-pièce-jointe valide son emoji comme sa jumelle

Issue : #4234 · jumelle de `ReactionService` / `CommentReactionService` / `PostReactionService`.

## État actuel

`AttachmentReactionService` (`services/gateway/src/services/AttachmentReactionService.ts`)
est le miroir par-pièce-jointe de `ReactionService`. Sa validation d'emoji
divergeait des trois autres familles de réaction.

`sanitizeEmoji(input): string | null` rend `null` pour un non-emoji ;
`isValidEmoji(emoji: string)` fait `emoji.trim()`.

```ts
const emoji = sanitizeEmoji(o.emoji);       // string | null
if (!isValidEmoji(emoji)) throw new Error('Invalid emoji');
```

## Problèmes identifiés

1. **`addAttachmentReaction` — fuite d'un `TypeError`.** Pour `emoji: "hi"`,
   `sanitizeEmoji` rend `null`, puis `isValidEmoji(null)` fait `null.trim()` →
   `TypeError: Cannot read properties of null (reading 'trim')`. La branche
   `throw new Error('Invalid emoji')` est du CODE MORT : soit `emoji` est valide
   (pas de throw), soit `null` (TypeError avant l'évaluation du `!`). Le handler
   renvoie le message du TypeError interne dans l'ack au lieu du refus propre.

2. **`removeAttachmentReaction` — remove malformé silencieux.** Il passait
   `sanitizeEmoji(o.emoji)` (possiblement `null`) directement dans le `where` du
   `deleteMany`, sans validation. Un remove invalide « réussissait » — et,
   `emoji: null` ne ciblant plus un emoji précis, pouvait emporter les autres
   réactions du participant.

## Causes racines

Le chemin par-pièce-jointe a été porté depuis la jumelle message SANS la même
discipline de normalisation. Les trois autres familles font
`const s = sanitizeEmoji(e); if (!s) throw new Error('Invalid emoji format')` —
`null` est la seule preuve d'invalidité, et `isValidEmoji` n'est jamais rappelé
sur son résultat.

Le témoin qui aurait dû l'attraper le MASQUAIT : le fichier
`__tests__/unit/services/AttachmentReactionService.test.ts` mocke `isValidEmoji`
pour rendre `false` sur `null`, désarmant exactement le bug (le vrai
`isValidEmoji(null)` lève). C'est le motif « mocker la SSOT partagée DÉSARME »
que le `CLAUDE.md` du gateway proscrit.

## Impact métier / technique

Un client qui émet `attachment:reaction-add` avec un non-emoji reçoit une chaîne
d'erreur interne opaque au lieu d'un refus lisible ; un remove malformé peut
détruire des réactions voisines du participant. Divergence de gestion d'erreur
d'une famille de contenu réagissable — classe « cette entité a-t-elle une
jumelle ? on le prend en entier » du `CLAUDE.md`.

## Évaluation du risque

Très faible. Le correctif aligne EXACTEMENT sur la jumelle testée, ne change que
`AttachmentReactionService.ts`, et retire un import mort. Le message d'erreur
passe de `'Invalid emoji'` à `'Invalid emoji format'` (parité des quatre
familles) — le témoin existant assertant `toThrow('Invalid emoji')` reste vert
(sous-chaîne).

## Améliorations proposées

`const emoji = sanitizeEmoji(o.emoji); if (!emoji) throw new Error('Invalid emoji format');`
sur les DEUX méthodes, puis `emoji` (narrowed `string`) dans les requêtes.

## Bénéfices attendus

Refus propre et cohérent avec les trois familles ; plus de remove destructeur ;
plus de fuite de message interne dans l'ack.

## Complexité

Faible : une méthode d'ajout, une de retrait, un import.

## Critères de validation (atteints)

- 3 témoins exerçant les VRAIES fonctions partagées (add rejette proprement ;
  remove rejette ; un remove invalide n'emporte pas les autres réactions) : RED
  confirmé, GREEN après.
- 85 tests attachment-reaction + 35 tests reaction verts.
- `tsc --noEmit` du gateway : exit 0.

## Suivi (hors scope — issue à instruire)

`AttachmentReactionHandler` n'a pas de schéma Zod de frontière socket là où ses
trois jumelles en ont un (`validateSocketEvent(SocketReaction*Schema)`). Défense
en profondeur (le service backstoppe désormais), pas un trou vivant.
