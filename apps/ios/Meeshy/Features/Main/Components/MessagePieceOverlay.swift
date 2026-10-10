import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - L'aperçu d'UNE pièce d'un message (#9907)

/// **L'appui long sur une tuile montre CETTE pièce seule, avec le défilement
/// vers les autres pièces du message** (directive porteur du 2026-10-10).
///
/// L'aperçu du message entier (`MessageOverlayMenu`) montrait la grille — quatre
/// images au plus, sans « +N », non navigable — et son menu agissait sur le
/// message. Ici :
/// - la pièce pressée s'ouvre à SON ratio, sans étirement ni rognure
///   (`MessagePieceTarget.fittedSize`) ;
/// - un défilement horizontal mène aux autres pièces, avec « 3/7 » ;
/// - la pièce AFFICHÉE est la cible de la bande de réactions et du menu : le
///   défilement réécrit `focusedPieceId`, que l'hôte lit pour ses actions ;
/// - « Tout le message » rend l'aperçu du message entier (`focusedPieceId = nil`).
///
/// Une pièce protégée (vue unique, flou, chiffrement) se montre masquée, sans
/// réaction ni sortie : l'appui long ne dévoile pas ce que le fil retient.
struct MessagePieceOverlay: View {
    let message: Message
    let accentHex: String
    @Binding var focusedPieceId: String?
    @Binding var isPresented: Bool
    var canDelete: Bool = false
    /// Réagir à la pièce affichée. `nil` ⇒ pas de bande (loi 4).
    var onReact: ((MessageAttachment, String) -> Void)? = nil
    /// Les actions du menu, rendues à l'hôte avec la pièce affichée.
    var onAction: ((PrimaryAction, MessageAttachment) -> Void)? = nil

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var selection: String
    @State private var isVisible = false
    @State private var topEmojis: [String]
    /// La pièce dont la suppression attend sa confirmation — action
    /// destructive, jamais directe (feedback device 2026-07-14).
    @State private var pendingDeletion: MessageAttachment?

    private static let sidePadding: CGFloat = MeeshySpacing.lg
    private static let emojiBarHeight: CGFloat = 52
    private static let positionChipHeight: CGFloat = 28
    private static let stackSpacing: CGFloat = MeeshySpacing.md

    init(message: Message,
         accentHex: String,
         focusedPieceId: Binding<String?>,
         isPresented: Binding<Bool>,
         canDelete: Bool = false,
         onReact: ((MessageAttachment, String) -> Void)? = nil,
         onAction: ((PrimaryAction, MessageAttachment) -> Void)? = nil) {
        self.message = message
        self.accentHex = accentHex
        self._focusedPieceId = focusedPieceId
        self._isPresented = isPresented
        self.canDelete = canDelete
        self.onReact = onReact
        self.onAction = onAction
        let start = focusedPieceId.wrappedValue ?? MessagePieceTarget.pieces(of: message).first?.id ?? ""
        self._selection = State(initialValue: start)
        self._topEmojis = State(initialValue: EmojiUsageTracker.topEmojis(count: 20, defaults: MessageOverlayMenu.defaultEmojis))
    }

    private var pieces: [MessageAttachment] { MessagePieceTarget.pieces(of: message) }

    private var current: MessageAttachment? {
        pieces.first { $0.id == selection } ?? pieces.first
    }

    private func isProtected(_ piece: MessageAttachment) -> Bool {
        MessagePieceTarget.isProtected(piece, in: message)
    }

    private var actions: [PrimaryAction] {
        guard let current else { return [.wholeMessage] }
        return MessagePieceMenu.actions(MessagePieceMenu.Context(
            isProtected: isProtected(current),
            exits: message.exitOffer,
            canDelete: canDelete
        ))
    }

    private var offersReaction: Bool {
        guard let current, onReact != nil else { return false }
        return AttachmentReactionOffer.offersReaction(surface: .fullscreen, attachment: current, hasHandler: true)
            && !isProtected(current)
    }

    var body: some View {
        GeometryReader { geometry in
            let stage = stageSize(in: geometry)
            ZStack {
                dimBackground
                VStack(spacing: Self.stackSpacing) {
                    if offersReaction {
                        emojiBar(width: geometry.size.width - 2 * Self.sidePadding)
                    }
                    pager(stage: stage)
                    positionChip
                    MessageActionsMenu(actions: actions, accentHex: accentHex, onSelect: { action in
                        guard let current else { return }
                        handle(action, on: current)
                    })
                }
                .padding(.horizontal, Self.sidePadding)
                .scaleEffect(isVisible ? 1 : 0.94)
                .opacity(isVisible ? 1 : 0)
            }
        }
        .ignoresSafeArea()
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape) { dismiss() }
        .adaptiveOnChange(of: selection) { _, newValue in
            focusedPieceId = newValue
        }
        .confirmationDialog(
            String(localized: "message-more.media.title", defaultValue: "Ce média", bundle: .main),
            isPresented: Binding(get: { pendingDeletion != nil }, set: { if !$0 { pendingDeletion = nil } }),
            titleVisibility: .visible,
            presenting: pendingDeletion
        ) { piece in
            Button(String(localized: "action.delete_media", defaultValue: "Supprimer le média", bundle: .main), role: .destructive) {
                onAction?(.deletePiece, piece)
                dismiss()
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
        }
        .onAppear {
            HapticFeedback.medium()
            withAnimation(reduceMotion ? nil : .spring(response: 0.38, dampingFraction: 0.82)) {
                isVisible = true
            }
        }
    }

    // MARK: - La scène

    /// La boîte où la pièce s'inscrit : toute la largeur utile, et la hauteur
    /// que laissent la bande, l'indicateur et le menu.
    private func stageSize(in geometry: GeometryProxy) -> CGSize {
        let width = min(geometry.size.width - 2 * Self.sidePadding, 440)
        let menuHeight = MessageActionsMenu.estimatedSize(actionCount: actions.count).height
        let chrome = (offersReaction ? Self.emojiBarHeight + Self.stackSpacing : 0)
            + Self.positionChipHeight + Self.stackSpacing
            + menuHeight + Self.stackSpacing
        let available = geometry.size.height
            - geometry.safeAreaInsets.top - geometry.safeAreaInsets.bottom
            - chrome - 2 * MeeshySpacing.lg
        return CGSize(width: max(0, width), height: max(160, min(width * 1.3, available)))
    }

    private func pager(stage: CGSize) -> some View {
        TabView(selection: $selection) {
            ForEach(pieces) { piece in
                MessagePiecePage(
                    piece: piece,
                    isProtected: isProtected(piece),
                    accentHex: accentHex,
                    size: MessagePieceTarget.fittedSize(
                        ratio: OverlayPreviewMediaLayout.aspectRatio(of: piece), in: stage)
                )
                .frame(width: stage.width, height: stage.height)
                .contentShape(Rectangle())
                // Un toucher sur la scène ne referme pas l'aperçu : il est la
                // pièce, pas le voile.
                .onTapGesture {}
                .tag(piece.id)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .frame(width: stage.width, height: stage.height)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(current.map(spokenPosition(of:)) ?? "")
        .accessibilityAdjustableAction { direction in
            let step = direction == .increment ? 1 : -1
            guard let next = MessagePieceTarget.neighbour(of: selection, step: step, in: message) else { return }
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.25)) { selection = next }
        }
    }

    @ViewBuilder
    private var positionChip: some View {
        if pieces.count > 1, let index = MessagePieceTarget.index(of: selection, in: message) {
            Text(verbatim: MessagePieceTarget.position(index: index, count: pieces.count))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold).monospacedDigit())
                .foregroundStyle(.white)
                .padding(.horizontal, MeeshySpacing.smPlus)
                .frame(minHeight: Self.positionChipHeight)
                .adaptiveGlass(in: Capsule())
                .accessibilityHidden(true)
                .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: index)
        }
    }

    private func emojiBar(width: CGFloat) -> some View {
        EmojiReactionPicker(
            quickEmojis: topEmojis,
            style: .dark,
            scrollable: true,
            chrome: .none,
            onReact: { emoji in
                guard let current else { return }
                EmojiUsageTracker.recordUsage(emoji: emoji)
                onReact?(current, emoji)
                dismiss()
            }
        )
        .frame(maxWidth: MessageOverlayMenu.emojiBandWidth(available: width))
        .frame(height: Self.emojiBarHeight)
    }

    private var dimBackground: some View {
        Color.black
            .opacity(isVisible ? 0.62 : 0)
            .animation(.easeOut(duration: 0.24), value: isVisible)
            .contentShape(Rectangle())
            .onTapGesture { dismiss() }
            .accessibilityHidden(true)
    }

    // MARK: - Les actions

    private func handle(_ action: PrimaryAction, on piece: MessageAttachment) {
        guard action != .wholeMessage else {
            // Le message entier : l'hôte remonte l'aperçu du message.
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { focusedPieceId = nil }
            return
        }
        guard action != .deletePiece else {
            pendingDeletion = piece
            return
        }
        onAction?(action, piece)
        dismiss()
    }

    private func dismiss() {
        HapticFeedback.light()
        withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.9)) {
            isVisible = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
            isPresented = false
        }
    }

    private func spokenPosition(of piece: MessageAttachment) -> String {
        guard let index = MessagePieceTarget.index(of: piece.id, in: message) else { return "" }
        let format = piece.type == .video
            ? String(localized: "message.piece.a11y.video", defaultValue: "Vidéo %1$lld sur %2$lld", bundle: .main)
            : String(localized: "message.piece.a11y.photo", defaultValue: "Photo %1$lld sur %2$lld", bundle: .main)
        let position = String(format: format, index + 1, pieces.count)
        return isProtected(piece) ? "\(position), \(ProtectedVeilAffordance.hiddenLabel)" : position
    }
}

// MARK: - Une page de l'aperçu

/// Une pièce, à son ratio, dans la boîte de la scène. Une pièce protégée ne
/// charge aucun pixel : la tuile masquée, comme dans l'aperçu du message.
private struct MessagePiecePage: View {
    let piece: MessageAttachment
    let isProtected: Bool
    let accentHex: String
    let size: CGSize

    var body: some View {
        content
            .frame(width: size.width, height: size.height)
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous))
            .shadow(color: .black.opacity(0.3), radius: 18, y: 8)
    }

    @ViewBuilder
    private var content: some View {
        if isProtected {
            MaskedMediaTile()
        } else if piece.type == .video {
            ConversationVideoPoster(attachment: piece, accentHex: accentHex, playButtonDiameter: 64)
        } else {
            ProgressiveCachedImage(
                thumbHash: piece.thumbHash,
                thumbnailUrl: piece.thumbnailUrl?.isEmpty == false ? piece.thumbnailUrl : nil,
                fullUrl: piece.fileUrl.isEmpty ? piece.thumbnailUrl : piece.fileUrl,
                targetSize: size
            ) {
                Color(hex: piece.thumbnailColor).opacity(0.3)
            }
            .aspectRatio(contentMode: .fit)
        }
    }
}
