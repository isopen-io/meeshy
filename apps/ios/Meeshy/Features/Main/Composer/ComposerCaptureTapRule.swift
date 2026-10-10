import Foundation

/// **La table des touchers du viseur** (#9464, spec du porteur : « Toucher la
/// scène = mise au point ; double toucher = photo »).
///
/// Le toucher simple vise TOUT DE SUITE : il n'attend pas qu'un double échoue,
/// comme le faisait un `TapGesture(count: 2)` posé avant lui. Le second toucher
/// d'un double prend la photo par le chemin de l'hôte ; pendant une prise, tout
/// toucher vise. Le toucher qui a ARMÉ le viseur ne compte jamais comme premier
/// d'un double. Reprise par la table des gestes du viseur (Task 11).
nonisolated enum ComposerCaptureTapRule {

    enum Action: Equatable, Sendable {
        case focus
        case photo
    }

    /// L'écart au-delà duquel deux touchers ne font plus un double.
    static let doubleTapWindow: TimeInterval = 0.3

    /// - Parameters:
    ///   - lastTapAt: le toucher précédent SUR LE VISEUR, `nil` si le dernier a
    ///     déjà fini un double.
    ///   - armedAt: l'instant de l'armement.
    static func action(stage: ComposerSceneCameraStage, now: Date, lastTapAt: Date?, armedAt: Date?) -> Action {
        guard stage == .armed, let lastTapAt, now.timeIntervalSince(lastTapAt) <= doubleTapWindow else {
            return .focus
        }
        if let armedAt, lastTapAt <= armedAt { return .focus }
        return .photo
    }

    /// Le délai sous lequel un toucher est encore la levée de la tenue.
    static let holdReleaseWindow: TimeInterval = 0.3

    /// La levée d'une tenue n'est pas un toucher : celui qui la suit de trop
    /// près est le même doigt (#9557, #9566).
    static func followsAHold(_ endedAt: Date?, now: Date) -> Bool {
        guard let endedAt else { return false }
        return now.timeIntervalSince(endedAt) < holdReleaseWindow
    }
}
