import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Un sticker de conversation, rendu SANS chrome de bulle** (#4823).
///
/// Ni fond, ni coin, ni bordure : le sticker EST le message, comme un emoji
/// libre. L'image (~160 pt) s'aligne à droite quand c'est le mien, à gauche
/// sinon, avec la méta-ligne compacte (heure + statut de livraison) posée à
/// côté et le strip de réactions à cheval sur le coin — exactement la
/// silhouette de `emojiOnlyContent` dans `BubbleStandardLayout`, dont ce
/// fichier est la feuille jumelle pour les stickers.
///
/// ## Ce qui est dessiné, par PRIORITÉ (`RenderSource.resolve`)
///
/// 1. le GABARIT, quand `StickerTemplateRenderer` sait le dessiner : un rendu
///    vectoriel natif à l'échelle de l'écran, net et animable ;
/// 2. sinon le PNG que l'expéditeur a joint — le repli d'un gabarit inconnu
///    de ce binaire (publié par une version plus récente) ;
/// 3. sinon l'emoji, en grand — à la taille d'un emoji libre.
///
/// ## Le mouvement
///
/// `StickerAnimation.pose(at:)` est une fonction PURE du temps ; elle est
/// posée à chaque image par une `TimelineView`, depuis l'instant d'APPARITION
/// de la feuille. Une animation en un coup joue une fois par affichage à
/// l'écran puis se tient (règle 1 des effets de message : aucune mémoire de
/// lecture) ; une animation continue boucle. Avec Reduce Motion, l'image est
/// fixe — le message perd son mouvement, pas son intention.
///
/// Feuille `Equatable` à entrées PRIMITIVES : aucun `@ObservedObject` de
/// singleton, les rappels ne participent pas à l'égalité.
struct BubbleSticker: View, Equatable {

    // MARK: - Mesures

    /// Le côté de référence d'un sticker dans la bulle.
    static let side: CGFloat = 160
    /// La boîte maximale d'un GABARIT — un cartouche (« Depuis le 12 mai »)
    /// est plus large que haut, et ne doit pas être écrasé dans un carré.
    static let templateBox = CGSize(width: 240, height: side)
    /// La boîte d'un emoji libre — sert d'assiette aux décalages du mouvement,
    /// qui sont des FRACTIONS du côté rendu.
    static let emojiBox = CGSize(width: 60, height: 60)

    // MARK: - Règles pures

    /// **Ce qui est dessiné, par priorité.** Écrit comme une fonction pure du
    /// sticker et du registre — et non en `if` dans le corps — pour être
    /// mesurable, et pour qu'aucune seconde surface n'en réécrive une version
    /// qui divergerait au premier ajustement.
    nonisolated enum RenderSource: Equatable {
        case template(id: String)
        case picture(BubbleContent.Sticker.Picture)
        case emoji(String)

        static func resolve(
            sticker: BubbleContent.Sticker,
            registryKnows: (String) -> Bool
        ) -> RenderSource {
            if let id = sticker.templateId, !id.isEmpty, registryKnows(id) {
                return .template(id: id)
            }
            // Un sticker EMOJI (sans gabarit) se rend en glyphe natif, jamais
            // par son PNG : le glyphe est net à toute échelle et suit Dynamic
            // Type ; le PNG n'est que le repli des clients qui ne dessinent pas.
            if sticker.templateId == nil, let emoji = sticker.emoji, !emoji.isEmpty {
                return .emoji(emoji)
            }
            if let picture = sticker.picture, !picture.fileUrl.isEmpty {
                return .picture(picture)
            }
            return .emoji(fallbackEmoji(for: sticker))
        }

        /// L'emoji servi quand ni le gabarit ni le PNG ne peuvent l'être : celui
        /// du fil, sinon le repli déclaré par le gabarit au catalogue, sinon le
        /// repli générique — jamais un vide.
        static func fallbackEmoji(for sticker: BubbleContent.Sticker) -> String {
            if let emoji = sticker.emoji, !emoji.isEmpty { return emoji }
            if let id = sticker.templateId,
               let repli = StickerTemplateCatalog.fallbackEmoji(forTemplateID: id) {
                return repli
            }
            return StorySticker.imageFallbackEmoji
        }
    }

    /// Réduit `size` pour tenir dans `box` en gardant ses proportions — sans
    /// jamais AGRANDIR : un gabarit rasterisé à sa taille naturelle deviendrait
    /// flou s'il était étiré jusqu'à la boîte.
    nonisolated static func fittedSize(_ size: CGSize, within box: CGSize) -> CGSize {
        guard size.width > 0, size.height > 0 else { return .zero }
        let ratio = min(1, box.width / size.width, box.height / size.height)
        return CGSize(width: size.width * ratio, height: size.height * ratio)
    }

    /// Les instants d'un mouvement EN UN COUP, de l'apparition à la pose
    /// finale — une `TimelineSchedule.explicit` FINIE : quand le coup est joué,
    /// la vue cesse de se réévaluer, au lieu de tourner à 60 Hz pour rendre
    /// l'identité. Vide pour une animation continue, qui boucle sur
    /// `.animation`.
    ///
    /// La dernière image est UN PAS au-delà de la période : `Date` compte en
    /// flottant depuis 2001, et `start + période − start` peut retomber un
    /// epsilon SOUS la période — la courbe rendrait alors sa dernière pose
    /// (échelle 1,00001) au lieu de l'identité, et s'y figerait.
    nonisolated static func oneShotDates(
        from start: Date,
        animation: StickerAnimation,
        framesPerSecond: Double = 60
    ) -> [Date] {
        guard animation.isOneShot, framesPerSecond > 0 else { return [] }
        let frames = Int((animation.period * framesPerSecond).rounded(.up)) + 1
        return (0...frames).map { start.addingTimeInterval(Double($0) / framesPerSecond) }
    }

    /// L'étiquette VoiceOver — la MÊME règle que la décoration posée sur une
    /// scène de story (`StoryStickerAccessibility`), obtenue par PROJECTION du
    /// sticker de conversation en `StorySticker` plutôt qu'en réécrivant
    /// « nom du gabarit + valeurs des emplacements, ou l'emoji ». Deux
    /// écritures d'une règle de parole divergent au premier gabarit ajouté.
    static func accessibilityLabel(for sticker: BubbleContent.Sticker) -> String {
        StoryStickerAccessibility.description(for: storyProjection(of: sticker))
    }

    /// Le sticker de conversation vu comme un objet de scène — position et
    /// temps par défaut, qui n'entrent pas dans l'étiquette.
    nonisolated static func storyProjection(of sticker: BubbleContent.Sticker) -> StorySticker {
        StorySticker(
            emoji: sticker.emoji ?? "",
            templateId: sticker.templateId ?? "",
            slots: sticker.slots,
            animation: sticker.animation
        )
    }

    // MARK: - Entrées

    let sticker: BubbleContent.Sticker
    let messageId: String
    let isMe: Bool
    let isDark: Bool
    /// L'accent des pastilles de réaction — l'indigo de marque pour les miens,
    /// la couleur mêlée de l'interlocuteur sinon (même règle que la bulle).
    let accentHex: String
    let timeString: String
    let deliveryStatus: MeeshyMessage.DeliveryStatus
    /// `createdAt` du message — l'horloge de la coche « envoi en cours ».
    let sendStartedAt: Date
    let isOnline: Bool
    let effects: MessageEffects
    let reactions: [MeeshyReactionSummary]
    let isLastReceivedMessage: Bool
    let isLastInGroup: Bool
    /// Aperçu du menu contextuel : sans les `Spacer` d'alignement.
    let standalone: Bool

    /// Rappels — hors de l'égalité : ils ne changent pas le rendu.
    var onRetry: (() -> Void)? = nil
    var onShowReadStatus: (() -> Void)? = nil
    var onAddReaction: ((String) -> Void)? = nil
    var onToggleReaction: ((String) -> Void)? = nil
    var onOpenReactPicker: ((String) -> Void)? = nil
    var onShowReactions: ((String) -> Void)? = nil

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.displayScale) private var displayScale

    /// Le gabarit rasterisé, à sa taille NATURELLE en points. Peint par
    /// `.task(id:)` — jamais dans `body`, qui se réévalue à chaque réaction.
    @State private var templateImage: UIImage?
    @State private var templateSize: CGSize = .zero
    /// L'instant d'apparition — la référence du mouvement. Reposé à chaque
    /// venue à l'écran, effacé au départ : c'est ce qui fait REJOUER un coup
    /// unique quand la bulle revient (règle 3 des effets), sans aucun drapeau
    /// « déjà joué ».
    @State private var appearedAt: Date? = nil

    static func == (lhs: BubbleSticker, rhs: BubbleSticker) -> Bool {
        lhs.sticker == rhs.sticker
            && lhs.messageId == rhs.messageId
            && lhs.isMe == rhs.isMe
            && lhs.isDark == rhs.isDark
            && lhs.accentHex == rhs.accentHex
            && lhs.timeString == rhs.timeString
            && lhs.deliveryStatus == rhs.deliveryStatus
            && lhs.sendStartedAt == rhs.sendStartedAt
            && lhs.isOnline == rhs.isOnline
            && lhs.effects == rhs.effects
            && lhs.reactions.map(\.emoji) == rhs.reactions.map(\.emoji)
            && lhs.reactions.map(\.count) == rhs.reactions.map(\.count)
            && lhs.reactions.map(\.includesMe) == rhs.reactions.map(\.includesMe)
            && lhs.isLastReceivedMessage == rhs.isLastReceivedMessage
            && lhs.isLastInGroup == rhs.isLastInGroup
            && lhs.standalone == rhs.standalone
    }

    // MARK: - Corps

    var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            if isMe && !standalone { Spacer(minLength: 50) }

            // Le sticker et sa méta-ligne forment un BLOC indissociable sur la
            // même base, collé au bord de la conversation côté isMe —
            // `.fixedSize()` pour que le conteneur épouse le contenu, comme
            // l'emoji libre (voir `emojiOnlyContent`).
            HStack(alignment: .bottom, spacing: 6) {
                artwork
                    .modifier(StickerMotion(
                        animation: reduceMotion ? nil : sticker.animation,
                        appearedAt: appearedAt,
                        box: artworkBox
                    ))
                    // Les effets du message se posent sur le sticker lui-même,
                    // jamais sur la rangée — même doctrine que la bulle.
                    .messageEffects(effects)
                compactFooter
            }
            .fixedSize()
            // Le strip de réactions s'échappe vers le CENTRE de la conversation,
            // jamais vers le bord d'écran — même ancrage que la bulle.
            .overlay(alignment: isMe ? .bottomLeading : .bottomTrailing) {
                if hasReactionsOverlay {
                    reactionsOverlay
                        .padding(isMe ? .leading : .trailing, -4)
                        .offset(y: 8)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(accessibilityText)

            if !isMe && !standalone { Spacer(minLength: 50) }
        }
        .padding(.bottom, bottomSpacing)
        .onAppear { appearedAt = Date() }
        .onDisappear { appearedAt = nil }
        .task(id: renderKey) { renderTemplateIfNeeded() }
    }

    // MARK: - L'image

    private var source: RenderSource {
        RenderSource.resolve(sticker: sticker) { StickerTemplateRenderer.drawer(for: $0) != nil }
    }

    /// `id:` du rendu — le gabarit ET ses emplacements : un sticker modifié
    /// (autre message dans une cellule réutilisée) se redessine.
    private var renderKey: String {
        guard case .template(let id) = source else { return "" }
        return id + "|" + sticker.slots.sorted { $0.key < $1.key }
            .map { "\($0.key)=\($0.value)" }.joined(separator: ",")
    }

    private var metrics: StickerTemplateMetrics {
        StickerTemplateMetrics.preview(side: Self.side)
    }

    @ViewBuilder
    private var artwork: some View {
        switch source {
        case .template(let id):
            if let templateImage {
                let size = Self.fittedSize(templateSize, within: Self.templateBox)
                Image(uiImage: templateImage)
                    .resizable()
                    .frame(width: size.width, height: size.height)
            } else {
                // Avant la première rasterisation (un `.task`, donc une image
                // plus tard) : on RÉSERVE la place mesurée plutôt que de
                // laisser un trou, pour que la cellule ne saute pas.
                let measured = StickerTemplateRenderer.measuredSize(templateID: id, slots: sticker.slots, metrics: metrics)
                    ?? CGSize(width: Self.side, height: Self.side)
                let size = Self.fittedSize(measured, within: Self.templateBox)
                Color.clear.frame(width: size.width, height: size.height)
            }
        case .picture(let picture):
            // `autoLoad: true` : le PNG EST le message — pas une pièce jointe
            // que l'utilisateur choisit de télécharger. Sans lui, un sticker
            // d'une version plus récente n'aurait rien à montrer.
            ProgressiveCachedImage(
                thumbHash: picture.thumbHash,
                thumbnailUrl: picture.thumbnailUrl,
                fullUrl: picture.fileUrl,
                autoLoad: true,
                targetSize: CGSize(width: Self.side, height: Self.side)
            ) {
                Color(hex: picture.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fit)
            .frame(width: Self.side, height: Self.side)
        case .emoji(let emoji):
            // La taille d'un emoji LIBRE (`EmojiDetector.EmojiOnlyResult.single`)
            // — relative, donc Dynamic Type : un sticker emoji et un message
            // emoji-only ont la même stature.
            Text(emoji)
                .font(MeeshyFont.relative(EmojiDetector.EmojiOnlyResult.single.fontSize ?? 90))
                .fixedSize()
        }
    }

    /// L'assiette des décalages du mouvement — la taille réellement rendue.
    private var artworkBox: CGSize {
        switch source {
        case .template:
            return templateSize == .zero
                ? CGSize(width: Self.side, height: Self.side)
                : Self.fittedSize(templateSize, within: Self.templateBox)
        case .picture:
            return CGSize(width: Self.side, height: Self.side)
        case .emoji:
            return Self.emojiBox
        }
    }

    private func renderTemplateIfNeeded() {
        guard case .template(let id) = source else {
            templateImage = nil
            templateSize = .zero
            return
        }
        guard let rendered = StickerTemplateRenderer.image(
            templateID: id,
            slots: sticker.slots,
            metrics: metrics,
            screenScale: displayScale
        ) else { return }
        templateImage = rendered.0
        templateSize = rendered.1
    }

    // MARK: - Méta-ligne, réactions, espacement

    /// Heure + coche de livraison, sans drapeaux ni bouton translate — le
    /// même `BubbleFooter` que l'emoji libre, en style `.compact`.
    private var compactFooter: some View {
        let model = BubbleFooterModel.make(
            timeString: timeString,
            deliveryStatus: deliveryStatus,
            isMe: isMe,
            isOnline: isOnline,
            sender: nil,
            flags: [],
            showsTranslate: false,
            sendStartedAt: sendStartedAt
        )
        // Le tap sur les coches n'a de sens que sur les messages envoyés.
        let actions = BubbleFooterActions(
            onRetry: onRetry,
            onShowReadStatus: isMe ? onShowReadStatus : nil
        )
        return BubbleFooter(model: model, actions: actions, style: .compact, isDark: isDark)
            .equatable()
    }

    private var hasReactionsOverlay: Bool {
        BubbleReactionsOverlay.isMounted(
            hasReactions: !reactions.isEmpty,
            isMe: isMe,
            isLastReceivedMessage: isLastReceivedMessage
        )
    }

    private var reactionsOverlay: some View {
        BubbleReactionsOverlay(
            messageId: messageId,
            summaries: reactions,
            isMe: isMe,
            isDark: isDark,
            isLastReceivedMessage: isLastReceivedMessage,
            accentHex: accentHex,
            onAddReaction: onAddReaction,
            onToggleReaction: onToggleReaction,
            onOpenReactPicker: onOpenReactPicker,
            onShowReactions: onShowReactions
        )
    }

    /// Les mêmes respirations que `BubbleStandardLayout.bottomSpacing` : un
    /// strip qui déborde sous le sticker ne doit pas taper le message suivant.
    private var bottomSpacing: CGFloat {
        if isLastInGroup {
            return hasReactionsOverlay ? 31 : 6
        }
        return hasReactionsOverlay ? 32 : 2
    }

    private var accessibilityText: String {
        var parts = [Self.accessibilityLabel(for: sticker), timeString]
        if !reactions.isEmpty {
            let reactionText = reactions.map { "\($0.emoji) \($0.count)" }.joined(separator: ", ")
            parts.append(String(format: String(localized: "a11y.message.reactions", bundle: .main), reactionText))
        }
        return parts.joined(separator: ", ")
    }
}

// MARK: - Le mouvement

/// La pose de `StickerAnimation.pose(at:)`, posée à chaque image depuis
/// l'instant d'apparition — fonction PURE du temps, aucune valeur animée par
/// SwiftUI, donc rien à interpoler et rien qui puisse rester coincé.
///
/// Un coup unique tourne sur une `TimelineSchedule.explicit` FINIE, identifiée
/// par `appearedAt` : chaque apparition crée un nouveau calendrier (et le
/// rejoue), et la vue cesse de se réévaluer une fois le coup joué. Une
/// animation continue tourne sur `.animation`, en pause tant que la feuille
/// n'est pas apparue. `animation == nil` (immobile, ou Reduce Motion) rend le
/// contenu tel quel — aucune `TimelineView` inerte par cellule.
private struct StickerMotion: ViewModifier {
    let animation: StickerAnimation?
    let appearedAt: Date?
    /// La taille rendue — les décalages de la pose en sont des fractions.
    let box: CGSize

    @ViewBuilder
    func body(content: Content) -> some View {
        if let animation {
            if animation.isOneShot {
                TimelineView(.explicit(BubbleSticker.oneShotDates(from: appearedAt ?? .distantFuture, animation: animation))) { context in
                    posed(content, animation.pose(at: elapsed(at: context.date)))
                }
                .id(appearedAt)
            } else {
                TimelineView(.animation(paused: appearedAt == nil)) { context in
                    posed(content, animation.pose(at: elapsed(at: context.date)))
                }
            }
        } else {
            content
        }
    }

    /// Le temps depuis l'apparition — zéro (l'identité) tant qu'elle n'a pas
    /// eu lieu.
    private func elapsed(at date: Date) -> Double {
        guard let appearedAt else { return 0 }
        return date.timeIntervalSince(appearedAt)
    }

    private func posed(_ content: Content, _ pose: StickerAnimation.Pose) -> some View {
        content
            .scaleEffect(pose.scale)
            .rotationEffect(.degrees(pose.rotationDegrees))
            .offset(x: pose.offsetX * box.width, y: pose.offsetY * box.height)
            .opacity(pose.opacity)
    }
}
