import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le lien d'appel DEMANDE, il ne compose pas (décision porteur)

/// `meeshy://call?contactId=…&type=…` composait directement : n'importe quelle
/// app, un QR code ou une page web (Safari ne demande que « Ouvrir dans
/// Meeshy ? ») faisait passer un appel vidéo, caméra et micro ouverts, sans le
/// moindre geste. Le lien devient une DEMANDE : la racine de la fenêtre
/// principale présente « Appeler @x en vidéo ? », et seul « Appeler » compose.
/// Les barrières (mise à jour forcée, âge) passent AVANT ; un contact inconnu,
/// une conversation de groupe ou un contact bloqué donnent un refus propre.

/// Ce que la feuille montre, et ce que « Appeler » composera.
struct CallLinkTarget: Identifiable, Equatable {
    let conversationId: String
    let userId: String
    let displayName: String
    let username: String?
    let avatarURL: String?
    let isVideo: Bool

    var id: String { "\(conversationId)|\(isVideo ? "video" : "audio")" }

    /// `@pseudo` quand on le connaît, le nom sinon.
    var handle: String {
        if let username, !username.isEmpty { return "@\(username)" }
        return displayName
    }

    var title: String {
        isVideo
            ? String(format: String(localized: "call.link.confirm.video", defaultValue: "Appeler %@ en vidéo ?", bundle: .main), handle)
            : String(format: String(localized: "call.link.confirm.audio", defaultValue: "Appeler %@ en audio ?", bundle: .main), handle)
    }
}

enum CallLinkRefusal: Equatable {
    /// Conversation absente, inaccessible, ou qui n'est pas un échange à deux.
    case unknownContact
    case blocked
}

@MainActor
final class CallLinkConfirmationController: ObservableObject {
    nonisolated deinit {}

    static let shared = CallLinkConfirmationController()

    @Published private(set) var pending: CallLinkTarget?

    private let resolveConversation: @MainActor (String) async -> MeeshyConversation?
    private let isBlocked: @MainActor (String) -> Bool
    private let dial: @MainActor (CallLinkTarget) -> Void
    private let showRefusal: @MainActor (CallLinkRefusal) -> Void

    init(
        resolveConversation: @escaping @MainActor (String) async -> MeeshyConversation? = { conversationId in
            if let cached = ConversationStore.shared.conversation(id: conversationId) { return cached }
            guard let currentUserId = AuthManager.shared.currentUser?.id,
                  let fetched = try? await ConversationService.shared.getById(conversationId) else { return nil }
            return fetched.toConversation(currentUserId: currentUserId)
        },
        isBlocked: @escaping @MainActor (String) -> Bool = { BlockService.shared.isBlocked(userId: $0) },
        dial: @escaping @MainActor (CallLinkTarget) -> Void = { target in
            CallBackDialer.shared.dial(CallBackRequest(
                userId: target.userId,
                displayName: target.displayName,
                isVideo: target.isVideo,
                conversationId: target.conversationId
            ))
        },
        showRefusal: @escaping @MainActor (CallLinkRefusal) -> Void = { refusal in
            switch refusal {
            case .unknownContact:
                FeedbackToastManager.shared.showError(
                    String(localized: "call.link.refused.unknown", defaultValue: "Ce contact est introuvable", bundle: .main))
            case .blocked:
                FeedbackToastManager.shared.showError(
                    String(localized: "call.link.refused.blocked", defaultValue: "Vous avez bloqué ce contact", bundle: .main))
            }
        }
    ) {
        self.resolveConversation = resolveConversation
        self.isBlocked = isBlocked
        self.dial = dial
        self.showRefusal = showRefusal
    }

    /// Prépare la confirmation. `gatesOpen` : aucune barrière (mise à jour
    /// forcée, âge) n'est levée — sinon le lien ne montre RIEN.
    func request(conversationId: String, isVideo: Bool, gatesOpen: Bool) async {
        guard gatesOpen else { return }
        guard let conversation = await resolveConversation(conversationId),
              conversation.type == .direct,
              let userId = conversation.participantUserId, !userId.isEmpty else {
            showRefusal(.unknownContact)
            return
        }
        guard !isBlocked(userId) else {
            showRefusal(.blocked)
            return
        }
        pending = CallLinkTarget(
            conversationId: conversationId,
            userId: userId,
            displayName: conversation.displayName,
            username: conversation.participantUsername,
            avatarURL: conversation.participantAvatarURL,
            isVideo: isVideo
        )
    }

    /// Le SEUL chemin qui compose : le geste « Appeler ».
    func confirm() {
        guard let target = pending else { return }
        pending = nil
        dial(target)
    }

    func cancel() {
        pending = nil
    }
}

// MARK: - La feuille

struct CallLinkConfirmationSheet: View {
    let target: CallLinkTarget
    let onCall: () -> Void
    let onCancel: () -> Void

    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        VStack(spacing: MeeshySpacing.lg) {
            MeeshyAvatar(
                name: target.displayName,
                context: .profileSheet,
                avatarURL: target.avatarURL
            )
            .accessibilityHidden(true)

            Text(target.title)
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: MeeshySpacing.sm) {
                Button(action: onCall) {
                    Label(String(localized: "call.link.confirm.call", defaultValue: "Appeler", bundle: .main),
                          systemImage: target.isVideo ? "video.fill" : "phone.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button(role: .cancel, action: onCancel) {
                    Text(String(localized: "call.link.confirm.cancel", defaultValue: "Annuler", bundle: .main))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.vertical, MeeshySpacing.xl)
        .frame(maxWidth: 480)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(theme.backgroundPrimary.ignoresSafeArea())
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }
}

/// Monté par les DEUX racines (iPhone, iPad), qui ne vivent que dans la
/// fenêtre principale : la confirmation se montre dans la bonne scène.
private struct CallLinkConfirmationHost: ViewModifier {
    @ObservedObject private var controller = CallLinkConfirmationController.shared

    func body(content: Content) -> some View {
        content.sheet(item: Binding(
            get: { controller.pending },
            set: { if $0 == nil { controller.cancel() } }
        )) { target in
            CallLinkConfirmationSheet(
                target: target,
                onCall: { controller.confirm() },
                onCancel: { controller.cancel() }
            )
        }
    }
}

extension View {
    func callLinkConfirmationSheet() -> some View {
        modifier(CallLinkConfirmationHost())
    }
}
