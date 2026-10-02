import Combine
import Foundation
import MeeshySDK
import os

/// La reprise d'un appel EN COURS (#9111) : ce que `CallManager` dit au
/// serveur quand il renonce, et comment « Appeler » rejoint l'appel qui
/// existe déjà au lieu de le casser. Les règles sont dans `CallResumePolicy` ;
/// ce fichier les applique à l'appel tenu par `CallManager`.

/// L'appel que cet appareil a REPRIS (`rejoinActiveCall`). Tant que sa liaison
/// ne s'est pas rétablie (`callStartDate` nul), une panne n'est pas une fin :
/// la grâce du serveur décide.
@MainActor
final class CallResumeLedger {
    nonisolated deinit {}

    static let shared = CallResumeLedger()

    private(set) var resumingCallId: String?

    func begin(_ callId: String) { resumingCallId = callId }

    func isResuming(_ callId: String?) -> Bool {
        guard let callId else { return false }
        return resumingCallId == callId
    }
}

extension CallManager {

    /// #9111 — un lien NEUF compte depuis 1 : la première offre d'un pair revenu
    /// (rechargé, relancé) fait converger la marque au lieu d'être jetée comme
    /// périmée par un compteur resté haut sur l'ancien lien.
    nonisolated static func isFreshLinkOffer(incoming: Int, highWaterMark: Int, isOffer: Bool) -> Bool {
        isOffer && incoming <= 1 && incoming < highWaterMark
    }

    /// Ce que la passerelle apprend quand cet appareil renonce à l'appel en
    /// cours — `call:end` seulement pour un appel jamais décroché (#9111).
    /// Une reprise dont la liaison ne s'est pas encore rétablie.
    var isResumingCall: Bool {
        CallResumeLedger.shared.isResuming(currentCallId) && callStartDate == nil
    }

    func abandonOnServer(cause: CallTeardownCause) {
        guard let callId = currentCallId else { return }
        let resuming = isResumingCall
        let signal = CallResumePolicy.teardownSignal(
            for: resuming && cause == .failure ? .resumeFailure : cause,
            wasAnswered: callStartDate != nil || resuming,
            isGroup: isGroupMeshCall
        )
        Logger.calls.info("[CALL_RESUME] abandon (\(String(describing: cause), privacy: .public)) → \(String(describing: signal), privacy: .public) (callId=\(callId, privacy: .public))")
        switch signal {
        case .end: emitCallEndReliably(callId: callId)
        case .leave: MessageSocketManager.shared.emitCallLeave(callId: callId)
        case .none: break
        }
    }

    /// CallKit réinitialisé par le système : la pile locale se démonte, l'appel
    /// décroché reste aux autres le temps de la grâce.
    func abandonAfterSystemReset() {
        guard callState.isActive else { return }
        abandonOnServer(cause: .systemReset)
        endCallInternal(reason: .connectionLost)
    }

    /// Le temps que le chien de garde `.connecting` laisse à la liaison : une
    /// reprise attend au moins la grâce du serveur.
    var connectingFailBudget: TimeInterval {
        isResumingCall
            ? CallResumePolicy.minimumReconnectWindow
            : QualityThresholds.connectingFailSeconds
    }

    /// « Appeler » une conversation dont l'appel est EN COURS le rejoint, sans
    /// `call:force-leave` — qui quitterait la ligne qu'on vient retrouver.
    func startOrJoinLiveCall(
        conversationId: String,
        userId: String,
        displayName: String,
        isVideo: Bool,
        router: CallDialRouter = .live
    ) async -> Bool {
        if callState == .idle, let request = await router.liveCall(
            conversationId: conversationId,
            peerUserId: userId,
            displayName: displayName
        ) {
            await router.join(request)
            return true
        }
        return startCall(conversationId: conversationId, userId: userId, displayName: displayName, isVideo: isVideo)
    }
}

/// #9111 — le pair d'un DUO revient pendant que la liaison se cherche : la
/// reprise ICE repart vers lui sur-le-champ (`CallResumePolicy`).
@MainActor
final class CallReturnBinding {
    nonisolated deinit {}

    static let shared = CallReturnBinding()

    private var cancellable: AnyCancellable?
    private weak var bound: CallManager?

    func bind(_ manager: CallManager, socket: MessageSocketManager = .shared) {
        guard bound !== manager else { return }
        bound = manager
        cancellable = socket.callParticipantJoined
            .receive(on: DispatchQueue.main)
            .sink { [weak manager] event in
                guard let manager, CallResumePolicy.shouldReofferToReturningPeer(
                    eventCallId: event.callId,
                    eventUserId: event.userId,
                    currentCallId: manager.currentCallId,
                    primaryUserId: manager.remoteUserId,
                    isGroupMesh: manager.isGroupMeshCall,
                    isReconnecting: manager.isGroupPrimaryReconnecting
                ) else { return }
                manager.attemptReconnection()
            }
    }
}

/// Le choix « rejoindre ou appeler », sans `CallManager` : l'appel actif de la
/// conversation est lu, et s'il réunit encore quelqu'un d'autre il est rejoint.
@MainActor
struct CallDialRouter {
    let activeCalls: ActiveCallServiceProviding
    let currentUserId: () -> String
    let isGroupConversation: (String) -> Bool
    let join: @MainActor (LiveCallJoinRequest) async -> Void

    static var live: CallDialRouter {
        CallDialRouter(
            activeCalls: ActiveCallService.shared,
            currentUserId: { AuthManager.shared.currentUser?.id ?? "" },
            isGroupConversation: { GroupCallMeshCoordinator.shared.isGroupConversation($0) },
            join: { await LiveCallJoiner.live.join($0) }
        )
    }

    func liveCall(conversationId: String, peerUserId: String, displayName: String) async -> LiveCallJoinRequest? {
        let me = currentUserId()
        let live = try? await activeCalls.activeCall(conversationId: conversationId)
        guard let live, CallResumePolicy.shouldJoin(live, conversationId: conversationId, currentUserId: me) else { return nil }
        let isGroup = isGroupConversation(conversationId)
        return LiveCallJoinRequest(
            callId: live.id,
            conversationId: conversationId,
            isVideo: live.isVideo,
            currentUserId: me,
            fallbackRemoteUserId: isGroup ? nil : peerUserId,
            fallbackDisplayName: displayName,
            isGroup: isGroup
        )
    }
}

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
