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

/// Ce que la feuille montre, et EXACTEMENT ce que « Appeler » composera :
/// valeur immuable figée à l'affichage — contact résolu, mode, compte connecté,
/// et un jeton propre à CETTE confirmation. Rien n'est relu depuis un état
/// mutable au moment du tap.
struct CallLinkTarget: Identifiable, Equatable {
    let conversationId: String
    let userId: String
    let displayName: String
    let username: String?
    let avatarURL: String?
    let isVideo: Bool
    /// Le compte connecté quand la feuille s'est affichée.
    let accountId: String?
    /// Une confirmation = un jeton : deux liens identiques donnent deux feuilles
    /// distinctes, et un tap sur l'ancienne ne vaut jamais pour la nouvelle.
    let token: UUID

    init(conversationId: String, userId: String, displayName: String, username: String?,
         avatarURL: String?, isVideo: Bool, accountId: String?, token: UUID = UUID()) {
        self.conversationId = conversationId
        self.userId = userId
        self.displayName = displayName
        self.username = username
        self.avatarURL = avatarURL
        self.isVideo = isVideo
        self.accountId = accountId
        self.token = token
    }

    var id: UUID { token }

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
    private let currentAccountId: @MainActor () -> String?
    private let dial: @MainActor (CallLinkTarget) -> Void
    /// Les barrières de la confirmation AFFICHÉE, relues au tap.
    private var gatesOpen: @MainActor () -> Bool = { false }
    private let showRefusal: @MainActor (CallLinkRefusal) -> Void

    init(
        resolveConversation: @escaping @MainActor (String) async -> MeeshyConversation? = { conversationId in
            if let cached = ConversationStore.shared.conversation(id: conversationId) { return cached }
            guard let currentUserId = AuthManager.shared.currentUser?.id,
                  let fetched = try? await ConversationService.shared.getById(conversationId) else { return nil }
            return fetched.toConversation(currentUserId: currentUserId)
        },
        isBlocked: @escaping @MainActor (String) -> Bool = { BlockService.shared.isBlocked(userId: $0) },
        currentAccountId: @escaping @MainActor () -> String? = { AuthManager.shared.currentUser?.id },
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
        self.currentAccountId = currentAccountId
        self.dial = dial
        self.showRefusal = showRefusal
    }

    /// Prépare la confirmation. `gatesOpen` : aucune barrière (mise à jour
    /// forcée, âge) n'est levée — sinon le lien ne montre RIEN ; relu au tap.
    /// Un second lien REMPLACE la feuille ouverte (nouveau jeton).
    func request(conversationId: String, isVideo: Bool, gatesOpen: @escaping @MainActor () -> Bool) async {
        guard gatesOpen() else { return }
        let account = currentAccountId()
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
        // Le compte a pu changer pendant la résolution : rien ne s'affiche.
        guard currentAccountId() == account else { return }
        self.gatesOpen = gatesOpen
        pending = CallLinkTarget(
            conversationId: conversationId,
            userId: userId,
            displayName: conversation.displayName,
            username: conversation.participantUsername,
            avatarURL: conversation.participantAvatarURL,
            isVideo: isVideo,
            accountId: account
        )
    }

    /// Le SEUL chemin qui compose : le geste « Appeler » sur la feuille qui
    /// montrait `shown`. Compose EXACTEMENT `shown` — jamais l'état courant —
    /// et seulement si cette feuille est toujours celle affichée et que ni le
    /// compte, ni le blocage, ni les barrières n'ont changé ; sinon rien ne part
    /// et la feuille se ferme (une feuille remplacée laisse sa remplaçante).
    func confirm(_ shown: CallLinkTarget) {
        guard pending == shown else { return }
        pending = nil
        guard currentAccountId() == shown.accountId,
              !isBlocked(shown.userId),
              gatesOpen() else { return }
        dial(shown)
    }

    func cancel() {
        pending = nil
    }

    /// La feuille qui montrait `shown` s'est fermée (Annuler, glisser vers le
    /// bas). Une feuille REMPLACÉE par un second lien ne referme pas sa
    /// remplaçante.
    func dismissed(_ shown: CallLinkTarget) {
        if pending == shown { pending = nil }
    }
}

// MARK: - La feuille

struct CallLinkConfirmationSheet: View {
    let target: CallLinkTarget
    let onCall: () -> Void
    let onCancel: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemePalette { ThemePalette(colorScheme: colorScheme) }

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
    @ObservedObject private var controller: CallLinkConfirmationController

    init(controller: CallLinkConfirmationController = .shared) {
        self.controller = controller
    }

    func body(content: Content) -> some View {
        // Le setter n'efface rien : pendant un remplacement (second lien) SwiftUI
        // y écrit `nil` pour la feuille sortante — c'est `dismissed(_:)`, propre
        // à CHAQUE feuille, qui referme.
        content.sheet(item: Binding(
            get: { controller.pending },
            set: { _ in }
        )) { target in
            CallLinkConfirmationSheet(
                target: target,
                onCall: { controller.confirm(target) },
                onCancel: { controller.dismissed(target) }
            )
            .onDisappear { controller.dismissed(target) }
        }
    }
}

extension View {
    func callLinkConfirmationSheet() -> some View {
        modifier(CallLinkConfirmationHost())
    }
}
