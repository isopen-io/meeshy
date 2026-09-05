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
                // **Le dessin est l'ATOME PARTAGÉ**, pas une copie locale.
                // Focal, Script et Rivière montent le même
                // `MessageStickerArtwork` : la priorité gabarit → image →
                // emoji, la place réservée avant rasterisation et le mouvement
                // ne peuvent plus diverger d'une surface à l'autre. Reduce
                // Motion est honoré DANS l'atome — la bulle n'a plus à le lire.
                MessageStickerArtwork(sticker: sticker, side: Self.side)
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
    }

    // MARK: - L'image

    private var source: RenderSource {
        RenderSource.resolve(sticker: sticker) { StickerTemplateRenderer.drawer(for: $0) != nil }
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


