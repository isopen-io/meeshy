import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Regarder ou écouter ensemble » sur la fiche d'un Proche ou d'un Sang (#17097, iso `user-profile-together.tsx`) :
/// on y choisit une vidéo ou un audio de NOTRE conversation directe, un toucher invite.
///
/// - Présent dès Proche (`ProfileCircleViewModel.offersTalkie`, le même rang). Le serveur rejuge à chaque invitation ;
///   un refus se dit d'une phrase neutre, jamais par sa raison.
/// - Les médias sont ceux de la galerie de la conversation, servie par la passerelle au seul membre, les plus récents
///   d'abord. Sans conversation directe, ou sans média : une phrase qui invite à en envoyer un, jamais une liste vide.
struct ProfileTogetherRow: View {
    let userId: String
    let displayName: String

    @ObservedObject private var center: TogetherCenter
    @State private var open = false
    @State private var pieces: [TogetherPiece]?
    @State private var conversationId: String?
    private let service: TogetherProviding
    private let conversations: ConversationServiceProviding
    private var theme: ThemeManager { ThemeManager.shared }

    init(
        userId: String,
        displayName: String,
        center: TogetherCenter = .shared,
        service: TogetherProviding = TogetherService.shared,
        conversations: ConversationServiceProviding = ConversationService.shared
    ) {
        self.userId = userId
        self.displayName = displayName
        _center = ObservedObject(wrappedValue: center)
        self.service = service
        self.conversations = conversations
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Button {
                open.toggle()
            } label: {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: "play.rectangle.on.rectangle")
                        .accessibilityHidden(true)
                    Text(TogetherRowWording.title)
                }
                .font(.subheadline.weight(.bold))
                .foregroundStyle(MeeshyColors.brandPrimary)
                .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget)
                .overlay(Capsule().stroke(MeeshyColors.brandPrimary, lineWidth: 1.5))
                .contentShape(Capsule())
            }
            .accessibilityValue(open ? TogetherRowWording.expanded : "")
            .accessibilityIdentifier("together.open")
            if open { list }
        }
        .padding(MeeshySpacing.md)
        .background(MeeshyColors.brandPrimary.opacity(MeeshyOpacity.subtle))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
        .task(id: open) { if open, pieces == nil { await load() } }
    }

    @ViewBuilder private var list: some View {
        if let pieces, !pieces.isEmpty {
            Text(TogetherRowWording.explain(name: displayName))
                .font(.footnote)
                .foregroundStyle(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(pieces) { piece in
                Button { invite(piece) } label: {
                    HStack(spacing: MeeshySpacing.sm) {
                        Image(systemName: piece.media == .video ? "film" : "waveform")
                            .foregroundStyle(MeeshyColors.brandPrimary)
                            .accessibilityHidden(true)
                        Text(piece.attachment.originalName)
                            .font(.subheadline)
                            .foregroundStyle(theme.textPrimary)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                    }
                    .frame(minHeight: MeeshyControlSize.tapTarget)
                    .contentShape(Rectangle())
                }
                .accessibilityLabel(TogetherRowWording.inviteA11y(name: displayName, file: piece.attachment.originalName))
                .accessibilityIdentifier("together.piece.\(piece.id)")
            }
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
        pieces = await service.directPieces(conversationId: direct.id)
    }

    private func invite(_ piece: TogetherPiece) {
        guard let conversationId else { return }
        HapticFeedback.light()
        Task {
            let outcome = await center.invite(toUserId: userId, conversationId: conversationId, attachmentId: piece.id)
            let text = TogetherWording.outcome(outcome, name: displayName)
            if case .invited = outcome {
                FeedbackToastManager.shared.showSuccess(text)
                open = false
            } else {
                FeedbackToastManager.shared.showError(text)
            }
        }
    }
}

enum TogetherRowWording {
    static var title: String { String(localized: "together.row.title", defaultValue: "Regarder ou écouter ensemble", bundle: .main) }

    static func explain(name: String) -> String {
        String(format: String(localized: "together.row.explain", defaultValue: "Choisissez une vidéo ou un audio de votre conversation : %@ le lit en même temps que vous.", bundle: .main), name)
    }

    static var empty: String {
        String(localized: "together.row.empty", defaultValue: "Envoyez-lui une vidéo ou un audio pour le lire ensemble.", bundle: .main)
    }

    static func inviteA11y(name: String, file: String) -> String {
        String(format: String(localized: "together.row.invite.a11y", defaultValue: "Inviter %1$@ à lire %2$@ ensemble", bundle: .main), name, file)
    }

    static var expanded: String { String(localized: "together.row.expanded", defaultValue: "Ouvert", bundle: .main) }
}
