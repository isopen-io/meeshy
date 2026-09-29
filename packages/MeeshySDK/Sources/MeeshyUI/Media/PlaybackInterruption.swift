import Combine

/// **L'hôte réclame l'audio pour lui seul, le temps d'une interruption.**
///
/// La raison est opaque au SDK (côté app : un appel qui sonne ou se tient).
/// Les lecteurs qui ont une TIMELINE — le canvas d'une story et le compte à
/// rebours de sa slide — s'y GÈLENT pendant l'interruption et reprennent en
/// place à sa fin, sans saut ni slide perdue sous la vue qui les recouvre.
///
/// Un état et non une notification : un lecteur monté PENDANT l'interruption
/// doit la voir, pas seulement ceux qui écoutaient à son début.
@MainActor
public final class PlaybackInterruption: ObservableObject {
    nonisolated deinit {}
    public static let shared = PlaybackInterruption()

    @Published public private(set) var isActive = false

    public init() {}

    public func begin() {
        guard !isActive else { return }
        isActive = true
    }

    public func end() {
        guard isActive else { return }
        isActive = false
    }
}
