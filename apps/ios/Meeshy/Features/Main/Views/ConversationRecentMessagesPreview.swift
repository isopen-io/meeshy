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

    /// L'apparence que le fil peint : celle relevée par le fil ouvert, sinon
    /// celle que la conversation porte. La peau ET le fond la lisent.
    static func appearance(for conversation: Conversation) -> ConversationAppearance? {
        BubbleSkinLedger.appearance(for: conversation.id) ?? conversation.userState.appearance
    }

    static func skin(for conversation: Conversation, isDark: Bool) -> BubbleSkin {
        BubbleSkin.resolve(Self.appearance(for: conversation), isDark: isDark)
    }

    /// Le fond que le fil peint sous ses bulles, et l'accent de son motif.
    struct Backdrop: Equatable {
        let resolution: ConversationBackgroundResolution
        let accentHex: String

        /// Signature : la carte garde son propre fond (dégradé et halos à
        /// l'accent), la version réduite du fond animé du fil.
        static let card = Backdrop(resolution: .signature, accentHex: MeeshyColors.brandPrimaryHex)

        var paintsOverTheCard: Bool { resolution != .signature }
    }

    /// Le fond RÉSOLU de la conversation (#11231) — couleur, motif ou photo —,
    /// par la même résolution que le fil (`ConversationBackgroundResolution`) :
    /// un choix illisible retombe sur la carte, jamais sur un vide.
    static func backdrop(for conversation: Conversation, computedAccentHex: String, isDark: Bool) -> Backdrop {
        let chosen = Self.appearance(for: conversation)
        return Backdrop(
            resolution: ConversationBackgroundResolution.resolve(chosen, isDark: isDark),
            accentHex: ConversationBackgroundResolution.effectiveAccentHex(chosen, computedHex: computedAccentHex, isDark: isDark)
        )
    }

    /// Ce que l'aperçu peint pour la photo d'un fond : la photo, ou la carte —
    /// le repli du fil (Signature), jamais un aplat qu'il ne montre pas.
    enum BackdropPhoto: Equatable {
        case paint(ConversationBackgroundPhoto)
        case signature
    }

    /// La photo d'un fond, dans l'aperçu : la pièce connue parmi les messages
    /// servis, sinon la mémoire de l'appareil, sinon la route qui vérifie
    /// l'appartenance. Une pièce CHIFFRÉE connue n'est jamais demandée au
    /// réseau (`ConversationBackgroundPhotoVerdict`), ni une pièce que la sonde
    /// a déjà jugée illisible (`ConversationPreviewPhotoFallbacks`) : la carte.
    /// Une pièce INCONNUE se demande, et l'échec de son chargement est sondé
    /// comme dans le fil (`ConversationBackgroundPhotoProbe`).
    static func backdropPhoto(
        attachmentId: String,
        among messages: [Message],
        remembered: ConversationBackgroundPhoto?,
        serverOrigin: String,
        judgedUnreadable: Bool = false
    ) -> BackdropPhoto {
        let known = knownPiece(attachmentId, among: messages)
        guard !judgedUnreadable, ConversationBackgroundPhotoVerdict.source(for: known) == .clear else { return .signature }
        return .paint(ConversationBackgroundPhoto.resolve(
            attachmentId: attachmentId, known: known, remembered: remembered, serverOrigin: serverOrigin
        ))
    }

    /// Le fond MONTRÉ : une photo que l'aperçu n'a pas pu peindre rend la carte.
    static func displayed(_ backdrop: Backdrop, photoFellBack: Bool) -> Backdrop {
        guard case .photo = backdrop.resolution, photoFellBack else { return backdrop }
        return .card
    }

    /// Ce qui fait résoudre la photo à nouveau : la pièce, et ce que les
    /// messages servis en disent — jamais une réévaluation du corps.
    struct PhotoKey: Equatable {
        let attachmentId: String
        let source: ConversationBackgroundPhotoVerdict.Source
        let isKnown: Bool
    }

    static func photoKey(of backdrop: Backdrop, among messages: [Message]) -> PhotoKey? {
        guard case .photo(let attachmentId, _, _) = backdrop.resolution else { return nil }
        let known = knownPiece(attachmentId, among: messages)
        return PhotoKey(
            attachmentId: attachmentId,
            source: ConversationBackgroundPhotoVerdict.source(for: known),
            isKnown: known != nil
        )
    }

    private static func knownPiece(_ attachmentId: String, among messages: [Message]) -> MeeshyMessageAttachment? {
        messages.lazy.flatMap(\.attachments).first { $0.id == attachmentId }
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
    let accentColor: String
    let skin: BubbleSkin
    let isDirect: Bool
    let isDark: Bool
    let currentUserId: String
    let cardWidth: CGFloat
    /// Le fond de la conversation sous ses bulles (#11231) ; la carte garde le
    /// sien quand la conversation n'en a pas choisi.
    var backdrop: ConversationPreviewRenderer.Backdrop = .card

    @Environment(\.layoutDirection) private var layoutDirection
    /// Les heures d'une rangée au repos ne se montrent qu'au défilement : la
    /// carte porte son propre révélé, fermé, comme l'aperçu d'un message.
    @StateObject private var timestampReveal = FocalTimestampRevealState()
    @State private var contentHeight: CGFloat = 0
    @State private var viewportHeight: CGFloat = 0
    /// La photo du fond, résolue UNE fois par pièce (`.task(id:)`), comme le fil.
    @State private var photo: ConversationBackgroundPhoto?
    @State private var photoFellBack = false

    private var kind: ConversationPreviewRenderer.Kind { ConversationPreviewRenderer.kind(mode: readingMode) }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            content
        }
        .background {
            let shown = ConversationPreviewRenderer.displayed(backdrop, photoFellBack: photoFellBack)
            if shown.paintsOverTheCard {
                ConversationPreviewBackdrop(backdrop: shown, photo: photo, isDark: isDark) { attachmentId in
                    settleFailedPhoto(attachmentId)
                }
            }
        }
        .task(id: ConversationPreviewRenderer.photoKey(of: backdrop, among: messages)) {
            resolvePhoto()
        }
    }

    private func resolvePhoto() {
        guard case .photo(let attachmentId, _, _) = backdrop.resolution else {
            photo = nil
            photoFellBack = false
            return
        }
        switch ConversationPreviewRenderer.backdropPhoto(
            attachmentId: attachmentId,
            among: messages,
            remembered: ConversationBackgroundPhotoMemory().photo(for: attachmentId),
            serverOrigin: MeeshyConfig.shared.serverOrigin,
            judgedUnreadable: ConversationPreviewPhotoFallbacks.shared.contains(attachmentId)
        ) {
        case .paint(let resolved):
            photo = resolved
            photoFellBack = false
        case .signature:
            photo = nil
            photoFellBack = true
        }
    }

    /// Comme le fil : une panne passagère garde le voile ; une pièce disparue,
    /// refusée ou chiffrée rend la carte — et le verdict est retenu, pour que
    /// l'appui long suivant ne la retélécharge pas.
    private func settleFailedPhoto(_ attachmentId: String) {
        Task {
            guard await ConversationBackgroundPhotoProbe.live.fallsBackToSignature(attachmentId: attachmentId) else { return }
            ConversationPreviewPhotoFallbacks.shared.remember(attachmentId)
            guard ConversationBackgroundPhotoVerdict.settles(probed: attachmentId, current: backdrop.resolution) else { return }
            photoFellBack = true
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
            accentHex: accentColor,
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
            contactColor: accentColor,
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
                    .fill(Color(hex: accentColor).opacity(isDark ? 0.18 : 0.10))
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

// MARK: - Le fond de la conversation, dans la carte (#11231)

/// Le fond que le fil peint, rendu à la taille de la carte : la couleur unie,
/// le motif du catalogue embarqué (premier rendu sans réseau, sans sa couche
/// animée — un aperçu ne joue rien), ou la photo sous son voile et son flou.
/// Décor pur : ni cible, ni élément d'accessibilité.
private struct ConversationPreviewBackdrop: View {
    let backdrop: ConversationPreviewRenderer.Backdrop
    let photo: ConversationBackgroundPhoto?
    let isDark: Bool
    let onPhotoFailure: @MainActor (String) -> Void

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    /// La carte fait 340 pt de large au plus : la photo ne se décode jamais
    /// au plein format.
    private static let photoTargetSize = CGSize(width: 340, height: 300)

    var body: some View {
        layer
            .clipped()
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private var layer: some View {
        switch backdrop.resolution {
        case .signature:
            Color.clear
        case .design(let design):
            AppearanceDesignView(design: design, isDark: isDark, accentHex: backdrop.accentHex)
                .equatable()
        case .solid(let hex):
            Color(hex: hex)
        case .photo(let attachmentId, let veil, let blur):
            photoLayer(attachmentId: attachmentId, veil: veil, blur: blur)
        }
    }

    private func photoLayer(attachmentId: String, veil: Double, blur: Int) -> some View {
        ZStack {
            MeeshyColors.backgroundPrimary(isDark: isDark)
            if let photo {
                Color.clear
                    .overlay {
                        ProgressiveCachedImage(
                            thumbHash: photo.thumbHash,
                            thumbnailUrl: photo.thumbnailUrl,
                            fullUrl: photo.fullUrl,
                            autoLoad: true,
                            targetSize: Self.photoTargetSize,
                            onFullImageFailure: { onPhotoFailure(attachmentId) }
                        ) {
                            Color.clear
                        }
                        .scaledToFill()
                        .blur(radius: CGFloat(blur))
                    }
                    .clipped()
            }
            MeeshyColors.backgroundPrimary(isDark: isDark)
                .opacity(ConversationBackgroundResolution.effectiveVeil(veil, reduceTransparency: reduceTransparency))
        }
    }
}

// MARK: - Les pièces de fond que la sonde a jugées illisibles

/// Une pièce disparue, refusée ou chiffrée ne redevient pas lisible d'un appui
/// long à l'autre : le verdict de la sonde est retenu, borné, pour la session.
/// Une panne passagère n'est jamais retenue (la sonde rend `false`).
@MainActor
final class ConversationPreviewPhotoFallbacks {
    static let shared = ConversationPreviewPhotoFallbacks()

    private let capacity: Int
    private var attachmentIds: [String] = []

    init(capacity: Int = 32) {
        self.capacity = capacity
    }

    nonisolated deinit {}

    func contains(_ attachmentId: String) -> Bool {
        attachmentIds.contains(attachmentId)
    }

    func remember(_ attachmentId: String) {
        attachmentIds = Array((attachmentIds.filter { $0 != attachmentId } + [attachmentId]).suffix(capacity))
    }
}
