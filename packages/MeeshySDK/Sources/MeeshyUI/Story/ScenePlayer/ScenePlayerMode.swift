import Foundation

/// Les trois surfaces de lecture d'un document `CanvasV3`.
public nonisolated enum ScenePlayerMode: Equatable, Sendable {
    case reader
    case preview
    case card
}

/// La règle de chaque mode — la seule chose que le player décide de lui-même.
///
/// `startsPaused` ne dépend PAS du mode : les trois naissent en pause, y compris
/// le reader, dont la lecture démarre par la commande du viewer.
public nonisolated struct ScenePlayerConfig: Equatable, Sendable {
    public let startsPaused: Bool
    public let isMuted: Bool
    public let loops: Bool
    public let showsChrome: Bool

    public init(mode: ScenePlayerMode) {
        self.startsPaused = true
        self.isMuted = mode == .card
        self.loops = mode == .card
        self.showsChrome = mode == .reader
    }
}
