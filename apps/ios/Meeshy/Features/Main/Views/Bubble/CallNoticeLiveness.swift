import Foundation
import MeeshySDK

/// #19790 — CE QUE LA CARTE D'APPEL PEUT DIRE D'UN APPEL « EN COURS ».
///
/// La copie locale du message dit `call-live` tant qu'elle n'a pas reçu la fin de
/// l'appel. Seule, elle proposait « Rejoindre » sur un appel fini, et le geste
/// répondait « L'appel est terminé ». La carte ne se lit donc « en cours » qu'une
/// fois le serveur interrogé sur CET appel (`GET /calls/:callId`) ; d'ici là, et
/// quand il le dit fini, elle se lit comme un appel terminé — le double tap rappelle
/// au lieu de rejoindre.
nonisolated enum CallNoticeLiveness: Equatable, Sendable {
    case unverified
    case confirmed
    case ended

    /// Les statuts terminaux de la passerelle (`CallService.TERMINAL_STATUSES`).
    static let terminalStatuses: Set<String> = ["ended", "missed", "rejected", "failed"]

    static func of(session: ActiveCallSession?, callId: String) -> CallNoticeLiveness {
        guard let session, session.id == callId, !terminalStatuses.contains(session.status) else { return .ended }
        return .confirmed
    }

    /// Le résumé que la carte présente : vivant seulement si le serveur le confirme,
    /// sans la durée d'un placeholder sinon.
    static func presented(_ summary: CallSummaryMetadata, liveness: CallNoticeLiveness) -> CallSummaryMetadata {
        guard summary.isLive, liveness != .confirmed else { return summary }
        return CallSummaryMetadata(
            callId: summary.callId,
            initiatorId: summary.initiatorId,
            callType: summary.callType,
            outcome: summary.outcome,
            durationSeconds: 0,
            bytesTotal: summary.bytesTotal,
            bytesEstimated: summary.bytesEstimated,
            networkQuality: summary.networkQuality,
            isLive: false,
            endedByInitiator: summary.endedByInitiator,
            participants: summary.participants
        )
    }
}

/// Les appels déjà constatés finis : un appel terminé le reste, donc une carte figée
/// sur un appel fini n'interroge le serveur qu'une fois par lancement. Un échec réseau
/// laisse la carte non vérifiée (ni « Rejoindre », ni verdict mémorisé).
actor CallNoticeLivenessChecker {
    static let shared = CallNoticeLivenessChecker(service: ActiveCallService.shared)

    private let service: ActiveCallServiceProviding
    private var ended: Set<String> = []

    init(service: ActiveCallServiceProviding) {
        self.service = service
    }

    func liveness(callId: String) async -> CallNoticeLiveness {
        if ended.contains(callId) { return .ended }
        do {
            let session = try await service.callSession(callId: callId)
            let verdict = CallNoticeLiveness.of(session: session, callId: callId)
            if verdict == .ended { ended.insert(callId) }
            return verdict
        } catch {
            return .unverified
        }
    }

    func markEnded(callId: String) {
        ended.insert(callId)
    }
}
