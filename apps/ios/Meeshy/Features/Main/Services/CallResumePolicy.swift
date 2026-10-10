import Foundation
import MeeshySDK

/// Ce que la passerelle apprend quand CET appareil renonce à un appel (#9111).
///
/// `call:end` termine l'appel pour TOUT LE MONDE : il ne part que d'un appel
/// jamais décroché (la sonnerie s'arrête partout, personne n'a rien à
/// rejoindre). Un appel décroché qu'on perd n'est pas fini — la passerelle
/// tient la place du partant pendant `CallRules.rejoinGrace`, et l'appel reprend
/// s'il revient. On QUITTE (`call:leave`) ou on se tait, jamais plus.
enum CallTeardownSignal: Equatable, Sendable {
    case end
    case leave
    case none
}

/// Pourquoi l'appareil renonce.
enum CallTeardownCause: Equatable, Sendable {
    /// Une panne locale (SDP, chien de garde de connexion, erreur serveur).
    case failure
    /// La reprise d'un appel en cours a échoué (`rejoinActiveCall`, relance) :
    /// la grâce du serveur décide, on peut encore revenir.
    case resumeFailure
    /// CallKit a été réinitialisé par le système.
    case systemReset
    /// Le plafond de reconnexion ICE est atteint.
    case reconnectCeiling
}

enum CallResumePolicy {

    static func teardownSignal(for cause: CallTeardownCause, wasAnswered: Bool, isGroup: Bool) -> CallTeardownSignal {
        guard wasAnswered else { return .end }
        switch cause {
        case .failure: return .leave
        case .resumeFailure, .systemReset: return .none
        case .reconnectCeiling: return isGroup ? .leave : .none
        }
    }

    /// Une erreur reçue pendant une reprise qui ne la condamne pas : la ligne
    /// du revenant peut avoir été quittée par la grâce (`NOT_A_PARTICIPANT`),
    /// ou deux `call:join` se croiser (`CALL_STATE_CONFLICT`) — le join suivant
    /// la règle. `CALL_ENDED` reste terminal (l'appel est vraiment fini).
    static func isTransientDuringResume(code: String?, isResuming: Bool) -> Bool {
        guard isResuming, let code else { return false }
        return code == "NOT_A_PARTICIPANT" || code == "CALL_STATE_CONFLICT"
    }

    /// Le temps que l'appareil s'accorde avant de renoncer à une liaison
    /// perdue : jamais moins que la grâce du serveur plus un battement, sinon
    /// il raccroche un appel que la passerelle tient encore pour lui.
    static let minimumReconnectWindow: TimeInterval = CallRules.rejoinGrace + CallRules.heartbeatInterval

    /// L'appel en cours d'une conversation vaut d'être REJOINT plutôt que
    /// recommencé quand quelqu'un d'autre y est encore.
    static func shouldJoin(_ session: ActiveCallSession?, conversationId: String, currentUserId: String) -> Bool {
        guard let session, session.conversationId == conversationId else { return false }
        return session.hasOtherActiveParticipant(currentUserId: currentUserId)
    }

    /// Un duo dont la liaison se cherche voit son pair REVENIR
    /// (`participant-joined` du pair principal) : la reprise ICE repart tout de
    /// suite vers lui, sans attendre le prochain palier de recul. Le groupe a
    /// son propre chemin (le maillage, `GroupCallMeshCoordinator`).
    static func shouldReofferToReturningPeer(
        eventCallId: String,
        eventUserId: String?,
        currentCallId: String?,
        primaryUserId: String?,
        isGroupMesh: Bool,
        isReconnecting: Bool
    ) -> Bool {
        guard !isGroupMesh, isReconnecting, eventCallId == currentCallId,
              let eventUserId, !eventUserId.isEmpty else { return false }
        return eventUserId == primaryUserId
    }

    /// À la relance de l'app : l'appel que le serveur garde à l'utilisateur
    /// (sa ligne est encore vivante) et où quelqu'un l'attend.
    static func shouldResumeOnLaunch(_ session: ActiveCallSession?, currentUserId: String) -> Bool {
        guard let session else { return false }
        return session.isStillIn(currentUserId: currentUserId) && session.hasOtherActiveParticipant(currentUserId: currentUserId)
    }
}

/// L'identité de la relecture « appel en cours » de l'en-tête d'une
/// conversation (#9111) : elle se refait quand la conversation change ET quand
/// l'appel local commence ou finit — après un départ d'un groupe qui continue,
/// « Rejoindre » revient sans rouvrir la conversation.
struct HeaderCallReconcileKey: Hashable, Sendable {
    let conversationId: String
    let isLocalCallActive: Bool
}
