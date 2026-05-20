# Bubble Reactions, Emoji-Only Messages, Optimistic Reply Preview & Image Cold Start — Design

**Date** : 2026-05-20
**Branche** : `fix/ios-attachments-magenta-policy-gate` (sera mergée sur `main`)
**Scope** : Quatre fixes iOS indépendants sur le rendu des bulles de messages.

## Contexte

L'utilisateur a remonté quatre régressions visuelles distinctes sur le flux de messagerie iOS :

1. Les strips de réactions existantes sur les bulles sont mal positionnés (côté intérieur de la conversation au lieu de côté extérieur), et l'ordre des emojis peut changer au scroll quand le backend renvoie le tableau `message.reactions` ré-ordonné.
2. Les messages emoji-only sans reply affichent leur `meta-row` (date + statut) sous l'emoji, déconnecté visuellement, et le container invisible prend toute la largeur disponible, faisant "voler" la date à un endroit excentré ; les emoji-only avec reply produisent une bulle qui s'étire sur 70 % de la largeur d'écran à cause d'un `.frame(maxWidth: .infinity)` parasite.
3. Les bulles optimistes des messages avec attachements (image, vidéo, audio, galerie) et reply n'affichent jamais la zone de quote citée, car le pipeline d'insertion optimiste laisse `replyToJson` à `nil` pour les replies non-story.
4. À l'ouverture froide d'une conversation après libération de l'app, on observe un glitch visible "magenta → thumbhash → image" alors que les images devraient être déjà décodées au moment où la vue de conversation se rend.

Un screenshot pris avant fix (`/tmp/meeshy-screenshots/before-fix-emoji-only-151042.png`) confirme :
- Un message reçu `🙄` à 16:00 dont le timestamp `16:00` flotte au milieu de l'écran, déconnecté de l'emoji.
- Un message envoyé `🤔` dans une bulle violette qui occupe ~80 % de la largeur d'écran (cas emoji-only-with-reply).
- Des messages envoyés `💯`, `🔥🙏🔥` dont le timestamp est sous l'emoji, séparé.

## Chantier 1 — Reactions strip : repositionnement + ordre stable

### Comportement attendu

| Cas | Alignement du conteneur | Layout interne du strip | Bouton `+` |
|---|---|---|---|
| Message **reçu** (`!isMe`) | `.bottomTrailing` (sous coin droit-bas, déborde vers droite) | `HStack { pills, [+ si dernier reçu] }`, gauche→droite | Visible **uniquement sur le dernier message reçu** |
| Message **envoyé** (`isMe`) | `.bottomLeading` (sous coin gauche-bas, déborde vers gauche) | `HStack { pills }`, gauche→droite | Jamais visible |

Le strip déborde toujours vers le côté "vide" de la conversation (zone hors-bulle), pas vers le côté du bord d'écran. C'est l'inverse de l'alignement actuel.

### Ordre des emojis stable

Aujourd'hui `BubbleContentBuilder.summarizeReactions()` garde l'ordre du tableau source `message.reactions`. Si le backend renvoie ce tableau dans un ordre différent (post socket-update), l'ordre affiché change.

Fix : trier les emojis par `min(createdAt)` par emoji — donne la chronologie réelle de première apparition, indépendamment de l'ordre de livraison du tableau.

### Sites de code touchés

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift:320-333` — inverser les `Alignment` des `overlay(alignment:)` du strip.
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleReactionsOverlay.swift:57-88` — unifier les deux branches `isMe` / `!isMe` en un seul layout `HStack { pills, +? }`.
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift:217-240` — réécrire `summarizeReactions` pour trier par `min(createdAt)` par emoji.

## Chantier 2 — Emoji-only : meta-row inline, bulle compacte

### Comportement attendu

Pour les messages emoji-only :

- **Sans reply** : layout `HStack(alignment: .lastTextBaseline) { Text(emoji, font: 90/60/45pt), CompactFooter(timestamp + delivery) }`, le tout en `.fixedSize()`. Le bloc complet est aligné à gauche pour les messages reçus et à droite pour les envoyés. Plus de meta-row dessous, plus de container qui s'étire.
- **Avec reply** : retirer le `.frame(maxWidth: .infinity, alignment: .center)` parasite sur `Text(emoji)` à `BubbleStandardLayout:547-562`. La bulle reprend sa taille intrinsèque épousant l'emoji + la quoted-reply card.

### CompactFooter

Variante minimale de `BubbleFooter` :
- Pas d'identity-bar, pas de drapeaux de langue, pas d'avatar.
- Juste `timestamp (11pt, opacity 0.55) + delivery check (si isMe)` dans un `HStack(spacing: 4)`.
- Style `.compact` à ajouter à l'enum `BubbleFooterStyle` ou inliner directement dans la branche emoji-only.

### Sites de code touchés

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift:492-517` — branche `emojiOnlyContent` sans reply, refactor en `HStack(.lastTextBaseline)` + `.fixedSize()`.
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift:547-562` — retirer `.frame(maxWidth: .infinity, alignment: .center)`.
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFooter.swift` — ajout style compact ou variante inline.

## Chantier 3 — Reply preview dans la bulle optimiste avec attachements

### Diagnostic confirmé

Pipeline actuel :

1. `ConversationView+AttachmentHandlers.sendMessageWithAttachments` extrait `pendingReplyReference`.
2. Calcule `storyRef = isStory ? pendingRef : nil` (ligne 53).
3. Appelle `viewModel.insertOptimisticMediaMessage(replyToId:, storyReplyToId:, replyReference: storyRef, ...)` à la ligne 172.
4. `insertOptimisticMediaMessage:1796` : `replyToJson = replyReference.flatMap { try? JSONEncoder().encode($0) }` → **nil** pour les replies message normales (parce que `storyRef` est `nil` sauf story).
5. La bulle optimiste se rend avec `message.replyTo == nil` → `BubbleContent.reply == nil` → quote pas affichée.
6. Plus tard, dans `sendMessage:1458-1485`, le `ReplyReference` riche est correctement construit depuis `messages.first { $0.id == replyId }`, mais c'est trop tard.

### Fix

Déplacer la construction du `ReplyReference` riche **avant** l'insertion optimiste. Deux options envisagées :

**Option A — Construire dans `insertOptimisticMediaMessage`** : la fonction prend déjà `replyToId`, elle a accès à `self.messages`, elle peut lookup elle-même. C'est l'option recommandée : ça centralise la logique, et le call-site n'a pas à dupliquer.

**Option B — Construire dans `ConversationView+AttachmentHandlers`** avant l'appel : duplique la logique présente dans `sendMessage:1458-1485`. Moins propre.

**Choix : Option A.**

### Implémentation

Dans `ConversationViewModel.insertOptimisticMediaMessage` :

```swift
let resolvedReplyRef: ReplyReference?
if let storyRef = replyReference {
    resolvedReplyRef = storyRef          // Story reply : passé par le call-site
} else if let rid = replyToId,
          let quoted = messages.first(where: { $0.id == rid }) {
    resolvedReplyRef = ReplyReference(
        messageId: rid,
        authorName: quoted.senderName ?? "Utilisateur",
        previewText: makePreviewText(from: quoted),
        isMe: quoted.isMe,
        authorColor: quoted.senderColor,
        attachmentType: quoted.attachments.first?.type.rawValue,
        attachmentThumbnailUrl: quoted.attachments.first?.thumbnailUrl
    )
} else {
    resolvedReplyRef = nil
}
let replyToJson = resolvedReplyRef.flatMap { try? JSONEncoder().encode($0) }
```

`makePreviewText` extrait la même logique de preview qu'on a dans `sendMessage` (contenu texte tronqué, ou icône d'attachement, ou "Story"). Si elle existe déjà, on la réutilise ; sinon on l'extrait dans une helper privée pour partager les deux call-sites.

### Sites de code touchés

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1784-1839` — `insertOptimisticMediaMessage` enrichi.
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1458-1485` — extraction de la helper `makePreviewText` (ou nom équivalent) pour partage.

## Chantier 4 — Glitch magenta / thumbhash à l'ouverture froide

### Diagnostic

Le commit `b8222212` a posé le bypass policy-gate pour `CachedAsyncImage`/`ProgressiveCachedImage`. Donc les images vues via ces composants ne montrent plus de magenta sur cold start. Mais :

1. Il reste possiblement un placeholder magenta dans un site non couvert (à identifier en runtime : `grep -ri magenta` dans iOS Swift sources).
2. Le `prefetchRecentMedia` (`ConversationViewModel:978`) est appelé **après** `loadMessages` retourne — donc lors du 1ᵉʳ render, NSCache est vide pour les images qui n'étaient pas déjà résidentes en mémoire, d'où le thumbhash flou avant que l'image arrive.

### Fix

1. **Audit visuel** : grep tous les sites `magenta`, `#FF00FF`, `Color.magenta`, `MeeshyColors.magenta` dans iOS sources. Tout placeholder magenta restant doit passer en gris neutre (`Color.gray.opacity(0.2)`) avec thumbhash en backdrop.

2. **Pré-résolution synchrone disk** : ajouter une passe synchrone (sans IO réseau) qui peuple le NSCache via `DiskCacheStore.cachedImage(for:)` pour les images des messages de la 1ʳᵉ page **avant** que `loadMessages` retourne. Concrètement, dans `loadMessages` après `hydrate cached data` et avant de marquer `loadState = .loaded`, faire :

```swift
for message in messages.prefix(30) {
    for attachment in message.attachments where attachment.type == .image {
        if let url = attachment.fileUrl ?? attachment.thumbnailUrl {
            _ = DiskCacheStore.warmNSCacheIfDiskHit(for: url)  // sync, no-op si pas en disk
        }
    }
}
```

`warmNSCacheIfDiskHit` est une nouvelle helper synchrone à ajouter à `DiskCacheStore` : check disk, decode UIImage, put en NSCache, return Bool. Pas d'await, pas d'IO réseau. Si l'image n'est pas en disk, no-op.

3. **Première frame avec image décodée** : grâce à (2), `CachedAsyncImage._image` se peuple via `DiskCacheStore.cachedImage(for:)` sync à `init`, et la 1ʳᵉ frame affiche directement l'image au lieu du thumbhash → plus de glitch sur cold start si l'image était déjà en disk.

4. **Fallback thumbhash inchangé** : si l'image n'est pas en disk (premier chargement vraiment, pas un cold start), le thumbhash continue d'être rendu en initial state, ce qui est OK.

### Sites de code touchés

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:880-979` — passe sync NSCache-warm dans `loadMessages`.
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift` — ajout `warmNSCacheIfDiskHit(for:) -> Bool` static.
- Eventuels sites magenta à corriger (identifiés au runtime via grep).

## Tests

- **Build** : `./apps/ios/meeshy.sh build` doit passer.
- **Visual** : screenshot après fix, comparer avec `/tmp/meeshy-screenshots/before-fix-emoji-only-151042.png`. Vérifier emoji-only compacts, date inline, strip de réactions du bon côté, bulle 🤔 avec reply ne s'étire plus.
- **Tests unitaires** : `BubbleContentMatrixTests` doit toujours passer ; ajouter un test sur l'ordre stable de `summarizeReactions` (envoyer deux fois le même tableau dans l'ordre A puis B → même résultat trié par `min(createdAt)`).

## Order d'exécution

1. Chantier 1 (reactions strip) — fichier le plus localisé, scope clair.
2. Chantier 2 (emoji-only) — touche les mêmes fichiers que chantier 1, on ne fait que des additions.
3. Chantier 3 (optimistic reply) — pipeline isolé dans ViewModel.
4. Chantier 4 (cold start) — touche le SDK + ViewModel, à faire en dernier pour ne pas perturber les autres tests.

Build après chaque chantier. Commit final unique avec un message décrivant les 4 fixes.

## Out of scope

- Refonte de l'animation cascade des réactions (CometPillModifier inchangé).
- Migration générale des `AsyncImage` natifs vers `CachedAsyncImage` (les 7 sites listés par l'exploration restent en l'état, ils n'affichent pas de magenta — juste un fond gris en absence de cache).
- Réécriture de `BubbleFooter` en cas plus généraux.
