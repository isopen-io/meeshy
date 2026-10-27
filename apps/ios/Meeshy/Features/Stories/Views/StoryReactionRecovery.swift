import Foundation
import MeeshySDK

/// Ce qu'on fait d'une réaction de story que le POST direct n'a pas posée.
///
/// Le tri lit `MeeshyError.from(_:)`, la normalisation `APIClient` de tout
/// `URLError` de transport en `.network` — la même forme que
/// `NearbyDiscoveryViewModel` lit pour dire « hors ligne », et celle sur
/// laquelle la file elle-même exempte une ligne de son budget de tentatives
/// (`OutboxFlusher.isNetworkTransportError`). Tout le reste est un REFUS ou une
/// erreur locale : le 409 `REACTION_LIMIT_REACHED` du gateway, un 403, un 404,
/// un décodage — rejouer ne changerait rien, l'optimisme est rembobiné.
nonisolated enum StoryReactionRecovery: Equatable, Sendable {
    /// Panne de transport : la file durable rejouera la réaction au retour du
    /// réseau, et l'emoji affiché reste vrai.
    case queueForReplay
    /// Refus du serveur ou erreur locale : restaurer l'état d'avant le tap.
    case rollback

    static func decide(for error: Error) -> StoryReactionRecovery {
        if case .network = MeeshyError.from(error) { return .queueForReplay }
        return .rollback
    }
}
