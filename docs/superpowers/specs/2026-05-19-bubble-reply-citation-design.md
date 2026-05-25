# Design — Citation story/message dans les bulles de message (iOS)

Date : 2026-05-19
Branche : `feat/ios-bubble-meta-fixes`

## Problème

Deux choses, sur le rendu des bulles de message iOS qui répondent à une story ou à un message :

1. **Régression** — répondre à une story affichait dans la bulle les détails de la
   story (nombre de réactions, nombre de commentaires, date, aperçu texte/image),
   comme une réponse à un message. Ce n'est plus le cas.
2. **Intégration manquante** — la citation (référence du message/story cité) doit
   apparaître proprement, en **en-tête au-dessus du contenu**, dans les bulles
   **audio** et **image/carousel**, et rester **tactile** pour naviguer vers la cible.

## Root cause de la régression (vérifiée — archéologie git + lecture de code)

- Pickaxe `git log -S "storyReplyTo"` : aucun objet `storyReplyTo` enrichi n'a
  **jamais** existé côté gateway/shared/SDK — seul `storyReplyToId` (l'ID nu)
  existe. Le gateway n'a jamais renvoyé les métadonnées de la story citée.
- Les détails de la story sont capturés **côté client** au moment de répondre
  (commit `48253c0c`) : la Story Viewer construit un `ReplyReference` riche
  (`isStoryReply: true` + `storyReactionCount`/`storyCommentCount`/
  `storyPublishedAt`/`storyThumbnailUrl`) depuis la story vivante. Ce
  `ReplyReference` est persisté dans la colonne GRDB `replyToJson`.
- **Bug** : `MessagePersistenceActor.upsertFromAPIMessages`, branche UPDATE,
  ligne ~1033 :
  ```swift
  existing.replyToJson = replyToJson   // écrase systématiquement
  ```
  Pour une réponse à une story, le payload serveur n'a pas de `api.replyTo`
  (la cible est une story, exposée via `storyReplyToId`), donc le `replyToJson`
  recalculé vaut `nil`. La branche UPDATE **clobbe** le `ReplyReference` riche
  local avec `nil` au premier `refreshMessagesFromAPI` → les détails de la story
  disparaissent. Juste au-dessus (ligne ~1010), `attachmentsJson` est protégé
  par `?? existing.attachmentsJson` ; `replyToJson` ne l'est pas.

Conséquence : la fonctionnalité marchait pour **ses propres réponses** (données
locales) jusqu'à ce clobber. Elle n'a jamais marché cross-device (le gateway
n'envoie pas ces métadonnées).

## Design

Part A se décompose en **A.1 (backend — enrichissement)** et **A.2 (iOS —
préservation locale)**. Les deux sont nécessaires : A.1 fait apparaître les
détails **cross-device** (l'autre participant, tout cold-load) ; A.2 garantit
qu'un refresh serveur n'efface jamais la référence riche déjà résolue.

#### Part A.1 — Backend : enrichir `storyReplyTo`

Aujourd'hui le gateway `GET /conversations/:id/messages` ne renvoie que
`storyReplyToId` (l'ID nu). Il doit **enrichir** un objet `storyReplyTo`, en
miroir exact de l'enrichissement « messages forwardés » déjà présent dans le
même handler :

- Collecter les `storyReplyToId` non nuls des messages mappés.
- Batch `prisma.post.findMany({ where: { id: { in } } })` → sélectionner
  `id, content, reactionCount, commentCount, createdAt` + la 1ʳᵉ `PostMedia`
  (`thumbnailUrl`).
- Construire un objet `storyReplyTo { id, reactionCount, commentCount,
  createdAt, thumbnailUrl, previewText }` (`previewText` = `content` tronqué)
  et l'attacher à `mappedMessage`.
- `shared/types/api-schemas.ts` `messageSchema` : déclarer `storyReplyTo`
  (objet nullable) — sinon Fastify le strippe.

#### Part A.2 — iOS : décoder + ne plus clobberer

- **SDK** `APIMessage` : ajouter `storyReplyTo: APIStoryReplyTarget?`
  (struct `Decodable`).
- `MessagePersistenceActor.upsertFromAPIMessages` : quand `api.storyReplyTo`
  est présent, construire le `replyToJson` à partir de lui — un `ReplyReference`
  avec `isStoryReply: true` + `storyReactionCount` / `storyCommentCount` /
  `storyPublishedAt` / `storyThumbnailUrl` / `previewText`. Le mapping
  `api.replyTo` (réponse à un message) reste inchangé.
- Branche UPDATE de `upsertFromAPIMessages` : `existing.replyToJson =
  replyToJson ?? existing.replyToJson` — même garde que `attachmentsJson`.
  Préserve la référence riche quand le serveur ne porte aucune donnée de
  réponse (filet de sécurité ; couvre aussi tes propres réponses optimistes
  avant le 1er refresh enrichi).

### Part B — Citation en en-tête dans les bulles média et audio

État actuel — dans `BubbleStandardLayout.contentStack`, l'ordre du `VStack` est :
`[grille média / carousel]` → `[audio]` → `[textBubbleContent]`. La citation
(`quotedReplyView`) vit dans `textBubbleContent` (3ᵉ élément) → pour un message
média/audio + reply, **la citation s'affiche en dessous** du contenu.

Cible : quand `content.reply != nil` **et** que le message porte un média visuel
ou un audio, rendre `quotedReplyView(reply.reference)` en **en-tête, en tête du
`contentStack`**, au-dessus du média/audio, dans la même bulle. Le `else if` qui
route vers `textBubbleContent` est ajusté pour ne pas double-rendre la citation
(elle ne reste dans `textBubbleContent` que pour les messages texte purs).

- **B1 — audio + reply** : en-tête citation + widget audio conservant sa barre
  d'identité intégrée (cohérent avec le footer unifié récent, commit `c67fd51e`).
  Pas de `textBubbleContent` détaché en dessous.
- **B2 — image/carousel + reply** : en-tête citation + `visualMediaGrid` ou
  `BubbleCarouselView`, dans une seule bulle.

### Navigation (tactile)

`quotedReplyView` → `BubbleQuotedReply` est déjà câblé aux callbacks
`onReplyTap` (message) et `onStoryReplyTap` (story). Comportement cible :

- Citation d'un **message** → scroll + highlight du message dans la conversation.
- Citation d'une **story** → ouvre le Story Viewer ; story expirée → vue
  existante `StoryExpiredContent`.

Vérifier le routage de bout en bout depuis les chemins média/audio (la citation
étant désormais en en-tête) ; corriger le routage si cassé.

## Hors périmètre

- Affichage de la story citée pour une story **déjà supprimée** côté serveur
  (le batch `prisma.post.findMany` ne la retrouve pas) : `storyReplyTo` est
  alors `nil`, la citation retombe sur le rendu minimal `"📷 Story"`. Pas de
  traitement spécial — comportement acceptable.

## Tests (TDD)

- **SDK XCTest** (`MessagePersistenceActorTests`) : `upsertFromAPIMessages`
  préserve un `replyToJson` riche pré-existant quand le payload API n'a pas de
  `replyTo` ; et l'écrase normalement quand le payload API a un `replyTo`.
- **iOS XCTest pur** (`BubbleContentBuilder`) : un message média-seul / audio-seul
  avec une réponse produit `content.reply != nil`.
- Positionnement en-tête : vérifié au build + contrôle visuel simulateur (le
  layout SwiftUI n'est pas unit-testable sans snapshots).

## Fichiers touchés

- `services/gateway/src/routes/conversations/messages.ts` (Part A.1 — enrichissement + `select`)
- `packages/shared/types/api-schemas.ts` (Part A.1 — `messageSchema.storyReplyTo`)
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift` (Part A.2 — `APIMessage.storyReplyTo` + `APIStoryReplyTarget`)
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift` (Part A.2 — mapping + garde anti-clobber)
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift` (Part B)
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift` (Part B — éventuel variant d'en-tête)
- Tests : `messageSchema` (vitest), `APIMessage` decoding + `MessagePersistenceActorTests` (SDK XCTest), `BubbleContentBuilder` (XCTest pur)

## Déploiement

Part A.1 = gateway + shared → **doit être déployée en production** pour que
l'app (qui pointe prod) bénéficie de l'enrichissement cross-device. Part A.2
et Part B = iOS / SDK. Aucune migration de schéma DB (les champs lus sur `Post`
existent déjà).
