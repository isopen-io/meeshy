# Suppression de la bulle parasite autour des replies audio et média (iOS)

Date : 2026-05-20
Statut : design validé par l'utilisateur (choix « carte empilée, bordure commune » pour le média reply)

## 1. Problème

Sur iOS, les messages **audio en réponse** et les messages **média seul en réponse** (image, vidéo, galerie) affichent une bulle de chat parasite autour du contenu — alors que ces composants disposent déjà de leur propre conteneur visuel autonome :

1. **Audio reply** : un `BubbleBackground` (RR 18, dégradé indigo/contactColor) s'ajoute autour de l'`AudioPlayerView`, qui possède pourtant déjà son `playerBackground` (RR avec subtle fill + stroke 0.5). Double conteneur empilé, contraste visuel cassé.
2. **Média reply (image/vidéo/galerie seuls)** : la grille média rend une carte arrondie noire ; **en dessous**, une bulle de chat séparée contient uniquement la carte de citation. Deux éléments visuellement déconnectés au lieu d'un seul.

## 2. Cause racine (vérifiée par lecture de code)

Dans `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift` :

- **Audio reply** : le booléen `audioInQuoteBubble` (l. 186-190) vaut `true` quand `content.reply != nil` et `content.attachments == .audio(...)`. Il pilote deux choses :
  1. Skip du chemin audio standalone dans `contentStack` (l. 467-474) ;
  2. Injection du player **à l'intérieur** de `bubbleInnerContent` (l. 554-560).
  Comme `bubbleInnerContent` est rendu via `textBubbleContent`, et que `textBubbleContent` applique `.background(bubbleBackground).clipShape(RoundedRectangle(cornerRadius: 18)).shadow(...)` (l. 643-649), le widget audio se retrouve englobé par la bulle de chat colorée.

- **Média reply (visual-only)** : `visualMediaGrid` rend la grille avec son fond noir clippé en RR 16 (l. 432-457). Indépendamment, la condition d'entrée dans `textBubbleContent` (l. 483) — `content.hasTextOrNonMediaContent || content.reply != nil` — déclenche un rendu de la bulle texte uniquement pour porter la citation (`bubbleInnerContent` → `quotedReplyView`). Résultat : deux conteneurs verticalement empilés sans lien visuel.

## 3. Principe de la solution

Pour les replies dont le seul rendu est un audio (`.audio`) ou une grille visuelle (`.visualGrid`), le composant média devient un conteneur autonome avec sa propre bordure subtile, et la carte de citation s'intègre dedans. **Plus aucun `BubbleBackground` chat-bubble n'est appliqué dans ces cas.**

Les autres combinaisons (texte + reply, texte + visual + reply, audio + non-media + reply, mixed + reply) **conservent leur comportement actuel** — la bulle de chat reste légitime quand elle porte du texte ou du non-média.

## 4. Design

### 4.1 `AudioPlayerView` (SDK MeeshyUI) — ajout d'un `topContent`

Fichier : `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift`

Le composant possède déjà un `bottomSlot: AnyView?` injecté via `bottomContent: () -> some View` (utilisé par `AudioMediaView` pour héberger le `BubbleFooter` quand l'audio est l'unique contenu). On ajoute un `topSlot` strictement symétrique.

```swift
private var topSlot: AnyView?
private var bottomSlot: AnyView?

public init(
    attachment: ...,
    ...,
    @ViewBuilder topContent: () -> some View = { EmptyView() },
    @ViewBuilder bottomContent: () -> some View = { EmptyView() }
) {
    ...
    let top = topContent()
    self.topSlot = top is EmptyView ? nil : AnyView(top)
    let bottom = bottomContent()
    self.bottomSlot = bottom is EmptyView ? nil : AnyView(bottom)
}

private var mainPlayer: some View {
    VStack(spacing: 0) {
        if let slot = topSlot {
            slot
            Divider().background(
                isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.06)
            )
        }
        HStack(...) { /* play button, waveform, time row, percent, actions */ }
            .padding(.horizontal, context.isCompact ? 10 : 14)
            .padding(.vertical, context.isCompact ? 8 : 12)
        inlineTranscription
    }
    .background(playerBackground)
}
```

Changement purement additif. Toutes les call sites existantes (composer attachment, message bubble, fullscreen, story reply input) gardent `topContent` par défaut à `EmptyView()`.

### 4.2 `BubbleQuotedReply` (apps/ios) — variante `.inline`

Fichier : `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift`

Ajout d'un `Style` exposé par init, défaut `.card` (rétro-compatible). En `.inline` :

- Suppression du `RoundedRectangle(cornerRadius: 12).fill(bgColor)` qui enveloppe le contenu.
- Suppression des paddings extérieurs (`.padding(.horizontal, 6)` + `.padding(.top, 6)` aux l. 137-138).
- Conserve : accent bar 4pt + HStack contenu (nom + preview + thumbnail) + paddings internes (`.padding(.leading, 8)`, `.padding(.trailing, 10)`, `.padding(.vertical, 8)`).

```swift
struct BubbleQuotedReply: View, Equatable {
    enum Style: Equatable { case card; case inline }
    var style: Style = .card
    let reply: ReplyReference
    let parentIsMe: Bool
    let accentHex: String
    let isDark: Bool
    let mentionDisplayNames: [String: String]

    var body: some View {
        let contentBody = HStack(spacing: 0) {
            RoundedRectangle(cornerRadius: 2)
                .fill(...)
                .frame(width: 4)
            HStack(spacing: 8) { ... }
                .padding(.leading, 8)
                .padding(.trailing, 10)
        }
        .padding(.vertical, 8)
        .contentShape(Rectangle())

        switch style {
        case .card:
            contentBody
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(bgColor))
                .padding(.horizontal, 6)
                .padding(.top, 6)
        case .inline:
            contentBody
        }
    }
}
```

Le `static func ==` Equatable inclut `style`.

### 4.3 `AudioMediaView` (apps/ios) — paramètres reply + topContent

Fichier : `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift`

Nouveaux paramètres :

```swift
var replyReference: ReplyReference? = nil
var replyIsStory: Bool = false
var parentIsMe: Bool = false
var onReplyTap: ((String) -> Void)? = nil
var onStoryReplyTap: ((String) -> Void)? = nil
```

Mise à jour du `static func ==` pour inclure :
```swift
&& lhs.replyReference?.messageId == rhs.replyReference?.messageId
&& lhs.replyReference?.previewText == rhs.replyReference?.previewText
&& lhs.replyIsStory == rhs.replyIsStory
&& lhs.parentIsMe == rhs.parentIsMe
```

Dans `audioPlayer`, construction du `topContent` quand `replyReference != nil` :

```swift
@ViewBuilder
private var replyTopSlot: some View {
    if let ref = replyReference {
        BubbleQuotedReply(
            style: .inline,
            reply: ref,
            parentIsMe: false,   // surface neutre (pas chat bubble colorée)
            accentHex: accentColor,
            isDark: isDark,
            mentionDisplayNames: mentionDisplayNames
        )
        .onTapGesture {
            guard !ref.messageId.isEmpty else { return }
            HapticFeedback.light()
            if replyIsStory { onStoryReplyTap?(ref.messageId) }
            else { onReplyTap?(ref.messageId) }
        }
    }
}

private var audioPlayer: some View {
    AudioPlayerView(
        attachment: attachment, context: .messageBubble,
        accentColor: contactColor,
        transcription: transcription,
        translatedAudios: translatedAudios,
        onFullscreen: { showAudioFullscreen = true },
        onRetranscribe: { ... },
        onPlayingChange: { ... },
        externalLanguage: $selectedAudioLangCode,
        availability: availability,
        onDownload: { downloader.start(attachment: attachment, onShare: nil) },
        topContent: { replyTopSlot },
        bottomContent: { playerBottomContent }
    )
}
```

Note : on simplifie la branche actuelle `hasPlayerBottomContent` (deux call sites distincts d'`AudioPlayerView` selon la présence d'un footer, l. 488-536) en **un seul appel** — `bottomContent: { EmptyView() }` par défaut conserve le comportement actuel (l'inlineTranscription ne rend rien sous son divider quand `bottomSlot == nil`). Idem `topContent` : par défaut `EmptyView()` → pas de slot + pas de divider supérieur.

### 4.4 `BubbleStandardLayout` (apps/ios) — routage

Fichier : `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift`

**Remplacement** de `audioInQuoteBubble` (l. 186-190) par deux booléens dérivés purs :

```swift
/// Pure audio reply : reply + .audio + ni texte ni non-media. Le widget audio
/// héberge la citation (topSlot) ET le footer (bottomSlot) — pas de chat bubble.
private var audioHostsReply: Bool {
    guard content.reply != nil, !isEmojiOnly else { return false }
    guard !content.hasTextOrNonMediaContent else { return false }
    if case .audio = content.attachments { return true }
    return false
}

/// Pure visual reply : reply + .visualGrid + ni texte ni non-media. Le conteneur
/// unifié héberge la citation + la grille + le footer overlay — pas de chat bubble.
private var visualHostsReply: Bool {
    guard content.reply != nil, !isEmojiOnly else { return false }
    guard !content.hasTextOrNonMediaContent else { return false }
    if case .visualGrid = content.attachments { return true }
    return false
}
```

**Dans `contentStack`** :

```swift
// Grille visuelle (avec ou sans reply intégrée)
if !visualAttachments.isEmpty {
    if showCarousel {
        carouselView // inchangé
    } else if visualHostsReply, let reply = content.reply {
        mediaWithReplyContainer(reply: reply)
    } else {
        visualMediaGrid // inchangé
            .background(Color.black)
            .compositingGroup()
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(alignment: .bottomTrailing) { /* footer overlay existant */ }
    }
}

// Audio (avec ou sans reply intégrée)
ForEach(audioAttachments) { attachment in
    mediaStandaloneView(
        attachment,
        injectFooter: audioIsSoleContent || audioHostsReply,
        replyReference: audioHostsReply ? content.reply?.reference : nil,
        replyIsStory: audioHostsReply ? (content.reply?.isStory ?? false) : false
    )
}

// Le path emoji-only-no-reply reste inchangé.
// Le path textBubbleContent ne se déclenche plus pour audioHostsReply ou visualHostsReply.
if isEmojiOnly && content.reply == nil {
    emojiOnlyContent
} else if content.hasTextOrNonMediaContent
    || (content.reply != nil && !audioHostsReply && !visualHostsReply) {
    textBubbleContent
}
```

**Suppression** du bloc audio-inside-quote dans `bubbleInnerContent` (l. 554-560) — `audioHostsReply` ne route plus l'audio dans la bulle texte.

**`mediaStandaloneView`** signature étendue :

```swift
@ViewBuilder
private func mediaStandaloneView(
    _ attachment: MessageAttachment,
    injectFooter: Bool = false,
    replyReference: ReplyReference? = nil,
    replyIsStory: Bool = false
) -> some View {
    let footer = injectFooter ? resolvedFooter(includesTranslationControls: false) : nil
    switch attachment.type {
    case .audio:
        AudioMediaView(
            attachment: attachment, message: message, ...,
            replyReference: replyReference,
            replyIsStory: replyIsStory,
            parentIsMe: content.isMe,
            onReplyTap: onReplyTap,
            onStoryReplyTap: onStoryReplyTap,
            footerModel: footer?.0,
            footerActions: footer?.1 ?? .none
        )
        .equatable()
    default:
        EmptyView()
    }
}
```

**`standardFooter`** : reste géré par la condition existante. Le `BubbleBodyFooterLayout` ne se déclenche plus pour `audioHostsReply` / `visualHostsReply` puisque `textBubbleContent` n'est plus rendu dans ces cas.

### 4.5 Nouveau conteneur unifié `mediaWithReplyContainer` (extension de `BubbleStandardLayout`)

À placer dans `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble+Media.swift`, en extension de `BubbleStandardLayout` (cohérent avec `visualMediaGrid` déjà localisé dans ce fichier) :

```swift
@ViewBuilder
fileprivate func mediaWithReplyContainer(reply: BubbleContent.Reply) -> some View {
    let neutralBg = isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03)
    let strokeColor = isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05)
    let dividerColor = isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.06)

    VStack(spacing: 0) {
        BubbleQuotedReply(
            style: .inline,
            reply: reply.reference,
            parentIsMe: false,
            accentHex: contactColor,
            isDark: isDark,
            mentionDisplayNames: mentionDisplayNames
        )
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(neutralBg)
        .contentShape(Rectangle())
        .onTapGesture {
            guard !reply.reference.messageId.isEmpty else { return }
            HapticFeedback.light()
            if reply.isStory { onStoryReplyTap?(reply.reference.messageId) }
            else { onReplyTap?(reply.reference.messageId) }
        }

        Divider().background(dividerColor)

        visualMediaGrid
            .background(Color.black)
            .overlay(alignment: .bottomTrailing) {
                BubbleFooter(
                    model: resolvedFooter().0,
                    actions: .none,
                    style: .overlay,
                    isDark: isDark
                )
                .equatable()
                .padding(8)
                .transition(.opacity)
            }
    }
    .compositingGroup()
    .clipShape(RoundedRectangle(cornerRadius: 16))
    .overlay(
        RoundedRectangle(cornerRadius: 16)
            .stroke(strokeColor, lineWidth: 0.5)
    )
    .transition(.opacity.combined(with: .scale(scale: 0.98)))
}
```

Valeurs `neutralBg` / `strokeColor` choisies identiques à `AudioPlayerView.playerBackground` (cohérence visuelle audio reply ↔ média reply).

## 5. Comportement préservé (matrice de non-régression)

| Cas | Avant | Après |
|---|---|---|
| Audio seul (pas reply) | Widget audio standalone, footer injecté | **Identique** |
| Visual seul (pas reply) | Grille + footer overlay | **Identique** |
| Texte + reply | Chat bubble (quote + texte) | **Identique** |
| Emoji-only + reply | Chat bubble (quote + emoji centré) | **Identique** |
| Texte + visual + reply | Visual + chat bubble (quote + texte) | **Identique** |
| **Audio + texte (caption) + reply** | Chat bubble englobante [quote + audio + texte développé] | **Changement (désiré)** : `isAudioOnlyWithText` force `hasTextOrNonMediaContent == false` → `audioHostsReply == true` → widget audio avec citation (topSlot) + caption sous le player (déjà géré par `AudioMediaView.body`) + footer (bottomSlot). Plus de chat bubble. Voir §6 |
| Audio + non-media + reply | Audio standalone + chat bubble (quote + non-media) | **Identique** |
| Mixed (audio + visual) + reply | Visual + audio + chat bubble (quote) | **Identique** (legacy, voir §7) |
| **Audio seul + reply** | **Chat bubble englobante + audio dedans** | **Widget audio avec citation intégrée (topSlot), pas de chat bubble** |
| **Visual seul + reply** | **Grille + chat bubble séparée (quote)** | **Conteneur unifié citation + grille avec bordure commune** |

## 6. Edge cases analysés

- **Audio + caption text + reply** : `BubbleContent.hasTextOrNonMediaContent` retourne `false` quand `attachments == .audio` et `text` non vide (voir `isAudioOnlyWithText` dans `BubbleContent.swift` l. 124-131). Donc `audioHostsReply == true`. Le widget audio hébergera la citation (topSlot) **et** la caption (déjà rendue dans `AudioMediaView.body` l. 413-427 sous le player) **et** le footer (bottomSlot). Cohérent et désiré.
- **Audio reply avec transcription** : la transcription continue de s'afficher dans `inlineTranscription` (au-dessus du `bottomSlot`, séparée par son divider). L'empilement visuel dans `playerBackground` devient : **topSlot (reply) → divider → player row → inlineTranscription (segments) → divider → bottomSlot (footer)**. Hiérarchie lisible.
- **Reply avec attachmentType image/vidéo dans la citation** : `BubbleQuotedReply` affiche la thumbnail à droite (l. 119-127). Préservé en `.inline` style.
- **Reply story** : `isStoryReply == true` → `BubbleStoryReplyPreview` rend les compteurs réactions/comments. Préservé en `.inline` style.
- **Conversation directe (`isDirect`)** : `showIdentityBar == false`. Le footer injecté/overlay ne porte pas de `SenderIdentity` → reste compact. Aucun changement.
- **Group avec `isLastInGroup` + reçu** : `showIdentityBar == true`. Pour audio reply, le `SenderIdentity` part dans le footer injecté (déjà géré par `audioFooter` qui prend `sender` du `BubbleFooterModel`). Pour visual reply, le footer `.overlay` ne porte pas l'identité — c'est le comportement actuel des bulles visual-only, conservé.

## 7. Hors scope

- **Mixed reply** (audio + visual seuls, sans texte, avec reply) : laisse intact le rendu legacy (visual standalone + audio standalone + chat bubble avec quote). Volumétrie faible. Follow-up potentiel si le ressenti est mauvais.
- **Tap-to-reveal blur/view-once + reply** : la révélation continue de fonctionner. Le topSlot n'est pas blurré (la citation n'est pas du contenu sensible).

## 8. Tests

### Unitaires (XCTest, `MeeshyTests/`)

- `BubbleStandardLayoutRoutingTests` : extraire les deux booléens en helpers statiques purs (`BubbleContentBuilder.audioHostsReply(content:)`, `.visualHostsReply(content:)`) et tester la matrice :
  - Pure audio + reply → `audioHostsReply == true`, `visualHostsReply == false`.
  - Pure visualGrid + reply → `visualHostsReply == true`.
  - Audio + texte + reply → `audioHostsReply == true` (via `isAudioOnlyWithText` qui force `hasTextOrNonMediaContent == false`).
  - Mixed + reply → les deux à `false`.
  - Pas de reply → les deux à `false`.
  - Emoji-only + reply → les deux à `false`.

- `AudioMediaViewEquatableTests` : vérifier que `static func ==` détecte un changement de `replyReference.messageId`, `replyReference.previewText`, `replyIsStory`, `parentIsMe`.

### Smoke visuel (manuel, atabeth ↔ test peer)

1. Texte → reply audio → vérifier widget audio sans bulle parasite, citation visible au-dessus du player, tap citation = scroll-to-original.
2. Reply à une story (story → reply audio + reply image) → idem, avec `BubbleStoryReplyPreview` (compteurs réactions).
3. Reply audio avec caption → caption sous le player, citation au-dessus, transcription au milieu.
4. Reply image unique → conteneur unifié, citation au-dessus, image en dessous, footer overlay capsule bas-droit.
5. Reply vidéo unique → idem avec play icon centrée.
6. Reply galerie 2/3/4+ images → conteneur unifié englobe la grille entière.
7. Mode dark + mode light → fidélité couleurs (neutralBg, strokeColor identiques au `playerBackground`).
8. Audio reply de soi-même (`isMe`) → vérifier `parentIsMe: false` rend bien la citation sur surface neutre (pas blanc-sur-indigo).

## 9. Risques & mitigations

- **Régression sur `audioInQuoteBubble`** : booléen supprimé, remplacé par `audioHostsReply` avec sémantique équivalente sur le cas pur (`.audio` + reply + pas de texte/non-media). Filet : la matrice non-régression du §5 + tests routing.
- **Effet de bord sur Equatable cache** : ajout de champs reply à `AudioMediaView.==`. Vérifier que le re-render n'est pas excessif (les `ReplyReference` sont en général stables dans le cycle de vie du message).
- **Couleurs néon du dégradé indigo perdues pour les replies audio/visual** : c'est précisément l'objectif. Le contraste avec les replies texte/non-média qui gardent le dégradé donne une distinction visuelle nette « citation portée par la bulle » vs « citation portée par le média ».
- **Compilation Swift 6 sur AudioPlayerView** : ajout d'un `@ViewBuilder topContent: () -> some View` à un init public. L'utilisation d'`AnyView` pour effacer le type sans-effet est déjà le pattern de `bottomContent` (l. 357-358). Pas de nouveau concept concurrence.

## 10. Critère de succès

Après merge :
1. Tous les tests `MeeshyTests` passent (`./apps/ios/meeshy.sh test`).
2. Le smoke visuel §8 valide la matrice non-régression.
3. Aucune bulle de chat (gradient indigo/contactColor) ne s'affiche pour les cas « audio seul + reply » et « visual seul + reply ».
4. La citation reste tactile dans les nouveaux contextes et scroll vers le message/story d'origine.
