import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Regarder ensemble » ou « Écouter ensemble » sur la fiche d'un Proche ou d'un Sang (#17097, iso
/// `user-profile-together.tsx` ; hiérarchie #19433, planche `Autre-Actions`) : la feuille propose les vidéos — ou les
/// audios — de NOTRE conversation directe, un toucher invite.
///
/// - Présent dès Proche (`ProfileCircleViewModel.offersTogether`). Le serveur rejuge à chaque invitation ; un refus se
///   dit d'une phrase neutre, jamais par sa raison.
/// - Les médias sont ceux de la galerie de la conversation, servie par la passerelle au seul membre, les plus récents
///   d'abord. Sans conversation directe, ou sans média de ce genre : une phrase qui invite à en envoyer un, jamais une
///   liste vide.
struct ProfileTogetherPicker: View {
    let userId: String
    let displayName: String
    let media: TogetherMediaKind
    let tint: Color

    @ObservedObject private var center: TogetherCenter
    @Environment(\.dismiss) private var dismiss
    @State private var pieces: [TogetherPiece]?
    @State private var conversationId: String?
    private let service: TogetherProviding
    private let conversations: ConversationServiceProviding
    private var theme: ThemeManager { ThemeManager.shared }

    init(
        userId: String,
        displayName: String,
        media: TogetherMediaKind,
        tint: Color,
        center: TogetherCenter = .shared,
        service: TogetherProviding = TogetherService.shared,
        conversations: ConversationServiceProviding = ConversationService.shared
    ) {
        self.userId = userId
        self.displayName = displayName
        self.media = media
        self.tint = tint
        _center = ObservedObject(wrappedValue: center)
        self.service = service
        self.conversations = conversations
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: TogetherRowWording.title(media))
                list
            }
            .padding(MeeshySpacing.xl)
        }
        .task { if pieces == nil { await load() } }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder private var list: some View {
        if let pieces, !pieces.isEmpty {
            Text(TogetherRowWording.explain(name: displayName))
                .font(.footnote)
                .foregroundStyle(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            VStack(spacing: 0) {
                ForEach(Array(pieces.enumerated()), id: \.element.id) { index, piece in
                    MeeshyToggleRow(piece.attachment.originalName, systemImage: media == .video ? "film" : "waveform",
                                    accessory: .chevron, showsDivider: index > 0, tint: tint,
                                    action: { invite(piece) })
                        .accessibilityLabel(TogetherRowWording.inviteA11y(name: displayName, file: piece.attachment.originalName))
                        .accessibilityIdentifier("together.piece.\(piece.id)")
                }
            }
            .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
        } else if pieces != nil {
            Text(TogetherRowWording.empty)
                .font(.footnote)
                .foregroundStyle(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            ProgressView().frame(maxWidth: .infinity)
        }
    }

    private func load() async {
        guard let direct = try? await conversations.findDirectWith(userId: userId) else {
            pieces = []
            return
        }
        conversationId = direct.id
        pieces = ProfileTogetherChoice.pieces(await service.directPieces(conversationId: direct.id), for: media)
    }

    private func invite(_ piece: TogetherPiece) {
        guard let conversationId else { return }
        HapticFeedback.light()
        Task {
            let outcome = await center.invite(toUserId: userId, conversationId: conversationId, attachmentId: piece.id)
            let text = TogetherWording.outcome(outcome, name: displayName)
            if case .invited = outcome {
                FeedbackToastManager.shared.showSuccess(text)
                dismiss()
            } else {
                FeedbackToastManager.shared.showError(text)
            }
        }
    }
}

/// Ce que chaque action d'« Ensemble » propose : les vidéos pour regarder, les audios pour écouter.
nonisolated enum ProfileTogetherChoice {
    static func pieces(_ pieces: [TogetherPiece], for media: TogetherMediaKind) -> [TogetherPiece] {
        pieces.filter { $0.media == media }
    }
}

enum TogetherRowWording {
    static var watch: String { String(localized: "together.action.watch", defaultValue: "Regarder ensemble", bundle: .main) }

    static var listen: String { String(localized: "together.action.listen", defaultValue: "Écouter ensemble", bundle: .main) }

    static func title(_ media: TogetherMediaKind) -> String {
        media == .video ? watch : listen
    }

    static func explain(name: String) -> String {
        String(format: String(localized: "together.row.explain", defaultValue: "Choisissez une vidéo ou un audio de votre conversation : %@ le lit en même temps que vous.", bundle: .main), name)
    }

    static var empty: String {
        String(localized: "together.row.empty", defaultValue: "Envoyez-lui une vidéo ou un audio pour le lire ensemble.", bundle: .main)
    }

    static func inviteA11y(name: String, file: String) -> String {
        String(format: String(localized: "together.row.invite.a11y", defaultValue: "Inviter %1$@ à lire %2$@ ensemble", bundle: .main), name, file)
    }
}
