import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - L'aperçu d'une conversation se dessine dans son mode de lecture (#11213)

/// **Les lois de l'aperçu d'appui long d'une conversation** (#11213, décision
/// #11204, qui supplante la directive du 2026-08-23).
///
/// L'aperçu dessinait toujours des bulles : une conversation lue en Script
/// montrait, sous le doigt, une face que le fil ne montre jamais. Il suit
/// désormais le mode que le fil ouvrirait
/// (`LentilleReadingModeContext.listPreviewMode`) : rangées plates en Script et
/// en Focal, bulles en Bulles. Le Résumé et la Rivière ne montrent pas le fil ;
/// l'aperçu, qui montre des messages, s'y pose comme « Aller au message » —
/// `ReadingModeController.landing`, la même loi.
///
/// L'aperçu d'un MESSAGE (`MessageOverlayPreviewKind`) lit la même face pour
/// chaque mode qui montre le fil. Il ne diverge que sur le Résumé et la
/// Rivière, parce qu'il répond à une autre question : la cellule VISIBLE sous
/// le doigt, là où celui-ci montre le fil tel qu'il S'OUVRIRA.
///
/// Toutes pures : la vue ne décide rien qu'un test ne puisse interroger.
enum ConversationPreviewRenderer {
    enum Kind: Equatable {
        case flatRow
        case bubble
    }

    /// Ce que la zone des messages montre. Charger n'est jamais « vide » :
    /// l'aperçu ne dit « Aucun message » qu'après l'avoir constaté.
    enum Display: Equatable {
        case skeleton
        case empty
        case unavailable
        case messages
    }

    /// Une rangée dans sa suite — le groupement du fil (`MessageDayGrouping`) :
    /// un même auteur, le même jour, une seule identité.
    struct RowLayout: Equatable {
        let messageId: String
        let isMe: Bool
        let isFirstInGroup: Bool
        let isLastInGroup: Bool

        /// La rangée plate porte l'identité en TÊTE de groupe ; la bulle la
        /// porte en FIN de groupe, jamais pour moi ni en conversation directe
        /// (`BubbleStandardLayout.showIdentityBar`).
        func showsIdentity(kind: Kind, isDirect: Bool) -> Bool {
            switch kind {
            case .flatRow: return isFirstInGroup
            case .bubble: return !isDirect && isLastInGroup && !isMe
            }
        }
    }

    /// Les marges de la carte et de son contenu.
    static let margin: CGFloat = MeeshySpacing.lg
    /// L'air entre deux SUITES : une rangée qui continue la suite de son
    /// auteur reste collée à la précédente, comme dans le fil.
    static let rowSpacing: CGFloat = MeeshySpacing.md
    /// La cible d'un contrôle de l'en-tête, quand l'aperçu est interactif.
    static let headerTargetSize: CGFloat = MeeshyControlSize.tapTarget
    /// La cible repliée quand trois cibles pleines ne tiennent pas sous le
    /// titre (volet gauche étroit de l'iPad) : le cercle lui-même, la hauteur
    /// gardant `headerTargetSize`.
    static let compactHeaderTargetSize: CGFloat = MeeshyControlSize.compact
    /// La hauteur, en fraction, du fondu qui efface le haut du fil.
    static let topFadeLength: CGFloat = 0.14

    static func kind(mode: ConversationReadingMode) -> Kind {
        landed(mode).usesFlatRow ? .flatRow : .bubble
    }

    /// La densité que la cellule du fil reçoit (`MessageOverlayPreviewKind`).
    static func density(mode: ConversationReadingMode) -> FocalRowInput.Density {
        MessageOverlayPreviewKind.density(for: landed(mode))
    }

    static func layout(of messages: [Message]) -> [RowLayout] {
        let candidates = messages.map { MessageRowGrouping.candidate(of: $0) }
        return messages.indices.map { index in
            RowLayout(
                messageId: messages[index].id,
                isMe: messages[index].isMe,
                isFirstInGroup: MessageDayGrouping.isGroupHead(
                    previous: index > 0 ? candidates[index - 1] : nil,
                    current: candidates[index]
                ),
                isLastInGroup: MessageDayGrouping.isGroupTail(
                    current: candidates[index],
                    next: index + 1 < candidates.count ? candidates[index + 1] : nil
                )
            )
        }
    }

    /// L'espace posé AU-DESSUS d'une rangée : `rowSpacing` quand elle ouvre une
    /// nouvelle suite, rien quand elle continue la précédente ou ouvre la liste.
    static func gap(before row: RowLayout, isFirst: Bool) -> CGFloat {
        guard !isFirst, row.isFirstInGroup else { return 0 }
        return rowSpacing
    }

    static func display(phase: ConversationPreviewPhase, messageCount: Int) -> Display {
        guard messageCount == 0 else { return .messages }
        switch phase {
        case .loading: return .skeleton
        case .unavailable: return .unavailable
        case .empty, .loaded: return .empty
        }
    }

    /// Un message chiffré que l'appareil n'a pas déchiffré arrive SCELLÉ : seul
    /// son drapeau voyage (`ConversationListPreviewLoader.snapshot`). Il se dit
    /// « Message chiffré », jamais une bulle vide.
    static func isSealed(_ message: Message) -> Bool {
        message.isEncrypted && message.content.isEmpty
    }

    static func contentWidth(cardWidth: CGFloat) -> CGFloat {
        max(0, cardWidth - 2 * margin)
    }

    /// La colonne que la bulle mesure : la largeur INTÉRIEURE de la carte,
    /// jamais la fenêtre (sur iPad, la bulle débordait de la carte).
    static func bubbleContainerWidth(cardWidth: CGFloat) -> CGFloat {
        contentWidth(cardWidth: cardWidth)
    }

    /// Ce que la vue POSE dans `\.bubbleContainerWidth` : la colonne intérieure
    /// de la carte, ou rien tant que la carte n'est pas mesurée.
    static func bubbleEnvironmentWidth(cardWidth: CGFloat) -> CGFloat? {
        let width = bubbleContainerWidth(cardWidth: cardWidth)
        return width > 0 ? width : nil
    }

    /// Le fondu du haut n'efface que ce qui DÉPASSE : un fil qui tient dans la
    /// carte reste net jusqu'à sa première rangée.
    static func fadesTop(contentHeight: CGFloat, viewportHeight: CGFloat) -> Bool {
        viewportHeight > 0 && contentHeight > viewportHeight + 0.5
    }

    /// L'aperçu natif d'iOS 26 n'est pas interactif : un bouton y serait inerte.
    static func showsHeaderActions(isInteractive: Bool) -> Bool {
        isInteractive
    }

    static func isEndToEnd(_ conversation: Conversation) -> Bool {
        conversation.encryptionMode == "e2ee"
    }

    /// La peau que le fil peint : l'apparence relevée par le fil ouvert, sinon
    /// celle que la conversation porte.
    static func skin(for conversation: Conversation, isDark: Bool) -> BubbleSkin {
        BubbleSkin.resolve(
            BubbleSkinLedger.appearance(for: conversation.id) ?? conversation.userState.appearance,
            isDark: isDark
        )
    }

    private static func landed(_ mode: ConversationReadingMode) -> ConversationReadingMode {
        ReadingModeController.landing(.init(mode: mode, reason: .default)).mode
    }
}

// MARK: - Les derniers messages, dans la face du fil

/// La zone des messages de `ConversationPreviewView` : les composants du fil
/// eux-mêmes — `FocalRow` pour une rangée plate, `ThemedMessageBubble` pour une
/// bulle —, avec la traduction que le chargeur a élue pour le lecteur, la peau
/// de la conversation et la largeur de la carte. Rendue à l'échelle 1 : aucun
/// effet de taille ni de flou ne s'y pose, le texte reste net.
struct ConversationRecentMessagesPreview: View {
    let messages: [Message]
    let translations: [String: [MessageTranslation]]
    let served: [String: MessageTranslation]
    let phase: ConversationPreviewPhase
    let readingMode: ConversationReadingMode
    let accentHex: String
    let skin: BubbleSkin
    let isDirect: Bool
    let isDark: Bool
    let currentUserId: String
    let cardWidth: CGFloat

    @Environment(\.layoutDirection) private var layoutDirection
    /// Les heures d'une rangée au repos ne se montrent qu'au défilement : la
    /// carte porte son propre révélé, fermé, comme l'aperçu d'un message.
    @StateObject private var timestampReveal = FocalTimestampRevealState()
    @State private var contentHeight: CGFloat = 0
    @State private var viewportHeight: CGFloat = 0

    private var kind: ConversationPreviewRenderer.Kind { ConversationPreviewRenderer.kind(mode: readingMode) }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            content
        }
    }

    @ViewBuilder
    private var content: some View {
        switch ConversationPreviewRenderer.display(phase: phase, messageCount: messages.count) {
        case .skeleton:
            skeleton
        case .unavailable:
            EmptyStateView(
                icon: "wifi.exclamationmark",
                title: String(localized: "preview.messages_unavailable", defaultValue: "Impossible de charger les messages"),
                subtitle: ""
            )
            .padding(.bottom, MeeshySpacing.smPlus)
        case .empty:
            EmptyStateView(
                icon: "bubble.left.and.bubble.right",
                title: String(localized: "preview.no_messages", defaultValue: "Aucun message"),
                subtitle: ""
            )
            .padding(.bottom, MeeshySpacing.smPlus)
        case .messages:
            messageList
        }
    }

    private var messageList: some View {
        let layout = ConversationPreviewRenderer.layout(of: messages)
        return ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 0) {
                    ForEach(Array(messages.enumerated()), id: \.element.id) { index, message in
                        row(message, layout: layout[index])
                            .padding(.top, ConversationPreviewRenderer.gap(before: layout[index], isFirst: index == 0))
                            .id(message.id)
                    }
                }
                .padding(.horizontal, ConversationPreviewRenderer.margin)
                .padding(.vertical, MeeshySpacing.md)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
                // Ancré en BAS, comme le fil : une conversation courte se pose
                // au-dessus du bord inférieur, jamais sous le fondu.
                .frame(minHeight: viewportHeight, alignment: .bottom)
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { viewportHeight = $0 }
            .mask { topFade(isActive: ConversationPreviewRenderer.fadesTop(contentHeight: contentHeight, viewportHeight: viewportHeight)) }
            .onAppear {
                guard let lastID = messages.last?.id else { return }
                proxy.scrollTo(lastID, anchor: .bottom)
            }
        }
    }

    @ViewBuilder
    private func row(_ message: Message, layout: ConversationPreviewRenderer.RowLayout) -> some View {
        if ConversationPreviewRenderer.isSealed(message) {
            sealedRow(message)
        } else {
            switch kind {
            case .flatRow: flatRow(message, layout: layout)
            case .bubble: bubble(message, layout: layout)
            }
        }
    }

    private func flatRow(_ message: Message, layout: ConversationPreviewRenderer.RowLayout) -> some View {
        let input = FocalRowInput.preview(
            message: message,
            translations: translations[message.id] ?? [],
            servedTranslation: served[message.id],
            accentHex: accentHex,
            density: ConversationPreviewRenderer.density(mode: readingMode),
            context: FocalRowInput.PreviewContext(
                currentUserId: currentUserId,
                isDark: isDark,
                isDirect: isDirect,
                isRightToLeft: layoutDirection == .rightToLeft,
                availableWidth: ConversationPreviewRenderer.contentWidth(cardWidth: cardWidth),
                isFirstInGroup: layout.isFirstInGroup,
                isLastInGroup: layout.isLastInGroup
            )
        )
        return FocalRow(input: input, actions: FocalRowActions())
            .environmentObject(timestampReveal)
            .fixedSize(horizontal: false, vertical: true)
            .allowsHitTesting(false)
    }

    private func bubble(_ message: Message, layout: ConversationPreviewRenderer.RowLayout) -> some View {
        ThemedMessageBubble(
            message: message,
            contactColor: accentHex,
            isDirect: isDirect,
            isDark: isDark,
            textTranslations: translations[message.id] ?? [],
            preferredTranslation: served[message.id],
            showAvatar: !isDirect,
            isLastInGroup: layout.isLastInGroup,
            currentUserId: currentUserId
        )
        .equatable()
        .environment(\.bubbleSkin, skin)
        .environment(\.bubbleContainerWidth, ConversationPreviewRenderer.bubbleEnvironmentWidth(cardWidth: cardWidth))
        .allowsHitTesting(false)
    }

    private func sealedRow(_ message: Message) -> some View {
        HStack(spacing: 0) {
            if message.isMe { Spacer(minLength: MeeshySpacing.xl) }
            Label {
                Text(String(localized: "protection.encrypted", bundle: .main))
            } icon: {
                Image(systemName: "lock.fill")
            }
            .font(.footnote.weight(.medium))
            .foregroundColor(isDark ? MeeshyColors.indigo50.opacity(MeeshyOpacity.intense) : MeeshyColors.indigo950.opacity(MeeshyOpacity.intense))
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.sm)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                    .fill(Color(hex: accentHex).opacity(isDark ? 0.18 : 0.10))
            )
            if !message.isMe { Spacer(minLength: MeeshySpacing.xl) }
        }
        .accessibilityElement(children: .combine)
    }

    private func topFade(isActive: Bool) -> some View {
        LinearGradient(
            stops: [
                .init(color: isActive ? .clear : .black, location: 0),
                .init(color: .black, location: ConversationPreviewRenderer.topFadeLength)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    // MARK: - Ligne froide : la forme du fil, jamais « Aucun message » ni un spinner

    private static let skeletonWidths: [CGFloat] = [150, 190, 120]

    private var skeleton: some View {
        VStack(spacing: ConversationPreviewRenderer.rowSpacing) {
            ForEach(0..<Self.skeletonWidths.count, id: \.self) { index in
                skeletonRow(index)
            }
        }
        .padding(.horizontal, ConversationPreviewRenderer.margin)
        .padding(.vertical, MeeshySpacing.md)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(String(localized: "conversation.view.loading_messages", bundle: .main)))
    }

    @ViewBuilder
    private func skeletonRow(_ index: Int) -> some View {
        switch kind {
        case .flatRow:
            HStack(alignment: .top, spacing: MeeshySpacing.sm) {
                SkeletonShape(width: MeeshyControlSize.small, height: MeeshyControlSize.small, cornerRadius: MeeshyControlSize.small / 2)
                VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                    SkeletonShape(width: 90, height: 10, cornerRadius: MeeshyRadius.xxs)
                    SkeletonShape(width: Self.skeletonWidths[index], height: 12, cornerRadius: MeeshyRadius.xxs)
                }
                Spacer(minLength: 0)
            }
        case .bubble:
            HStack {
                if index % 2 == 1 { Spacer(minLength: MeeshySpacing.xl) }
                SkeletonShape(width: Self.skeletonWidths[index], height: 34, cornerRadius: MeeshyRadius.lg)
                if index % 2 == 0 { Spacer(minLength: MeeshySpacing.xl) }
            }
        }
    }
}
