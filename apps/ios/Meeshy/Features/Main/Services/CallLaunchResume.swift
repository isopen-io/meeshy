import Combine
import Foundation
import MeeshySDK

/// **Reprendre au lancement l'appel que le serveur garde encore** (#9111).
///
/// L'app tuée ou plantée pendant un appel : la passerelle tient la ligne du
/// partant pendant la grâce de reprise. À la PREMIÈRE connexion du socket,
/// l'appel en cours de l'utilisateur est relu (`GET /calls/active`) ; si sa
/// ligne est encore vivante et que quelqu'un l'attend, l'appel reprend.
///
/// Ne réveille pas la pile d'appel pour rien (#7955) : `CallManager` n'est
/// construit que lorsqu'un appel est effectivement à reprendre.
@MainActor
final class CallLaunchResume {
    nonisolated deinit {}

    static let shared = CallLaunchResume()

    private let isConnected: AnyPublisher<Bool, Never>
    private let calls: OwnActiveCallProviding
    private let currentUserId: () -> String?
    private let isIdle: () -> Bool
    private let resume: (ActiveCallSession, String) -> Void
    private var subscription: AnyCancellable?
    private var armed = false

    init(
        isConnected: AnyPublisher<Bool, Never> = MessageSocketManager.shared.$isConnected.eraseToAnyPublisher(),
        calls: OwnActiveCallProviding = ActiveCallService.shared,
        currentUserId: @escaping () -> String? = { AuthManager.shared.currentUser?.id },
        isIdle: @escaping () -> Bool = { CallManagerHost.shared.manager?.callState.isActive != true },
        resume: @escaping (ActiveCallSession, String) -> Void = { CallLaunchResume.rejoin($0, currentUserId: $1) }
    ) {
        self.isConnected = isConnected
        self.calls = calls
        self.currentUserId = currentUserId
        self.isIdle = isIdle
        self.resume = resume
    }

    /// Une fois par session d'app : la première connexion déclenche la relecture.
    func arm() {
        guard !armed else { return }
        armed = true
        subscription = isConnected
            .filter { $0 }
            .first()
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in await self?.check() }
            }
    }

    func check() async {
        guard isIdle(), let me = currentUserId(), !me.isEmpty else { return }
        let session = try? await calls.ownActiveCall()
        guard let session, isIdle(), CallResumePolicy.shouldResumeOnLaunch(session, currentUserId: me) else { return }
        resume(session, me)
    }

    private static func rejoin(_ session: ActiveCallSession, currentUserId: String) {
        let remote = session.remoteParticipant(currentUserId: currentUserId)
        let isGroup = GroupCallMeshCoordinator.shared.isGroupConversation(session.conversationId)
            || Set(session.participants.map(\.userId)).subtracting([currentUserId]).count > 1
        if isGroup { GroupCallMeshCoordinator.shared.markGroupConversation(session.conversationId, title: nil) }
        CallManagerHost.shared.require().rejoinActiveCall(
            callId: session.id,
            conversationId: session.conversationId,
            remoteUserId: isGroup ? session.conversationId : (remote?.userId ?? ""),
            remoteUsername: remote?.user?.displayName ?? remote?.user?.username
                ?? String(localized: "call.peer.fallback", defaultValue: "Appel", bundle: .main),
            isVideo: session.isVideo
        )
    }
}
