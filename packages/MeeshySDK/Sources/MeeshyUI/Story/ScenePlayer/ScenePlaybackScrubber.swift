import Foundation

/// **Parcourir une scène au doigt** (#7878) — le pont entre une barre de
/// progression et le canvas qui rejoue la scène.
///
/// L'hôte le possède (un par surface de lecture), le passe au player, et la
/// barre l'appelle : `begin()` au toucher, `scrub(toFraction:)` à chaque
/// mouvement du doigt, `end(atFraction:)` au relâcher. Le canvas monté s'y
/// ATTACHE lui-même (`StoryReaderRepresentable.makeUIView`) : le glissé pousse
/// directement dans la vue UIKit, sans ré-évaluer aucun body SwiftUI à la
/// cadence du doigt — même principe que `StoryCanvasTimelineBridge` pour la
/// timeline du composer.
///
/// Aucun second moteur de pose temporelle : le canvas déplace `currentTime`,
/// l'horloge que vidéo, audio, fenêtres d'objets et keyframes suivent déjà, et
/// cale ses vidéos en pause par seek tolérant, comme la preview du composer.
///
/// Agnostique : une fraction `[0, 1]` de la scène, rien de plus — la durée,
/// le canvas la connaît.
@MainActor
public final class ScenePlaybackScrubber {
    // iOS 26.1 : cf. `MeeshyUIDeinitSourceGuardTests` — une `deinit`
    // synthétisée isolée double-libère à la libération hors tâche.
    nonisolated deinit {}

    /// `true` entre `begin()` et `end(atFraction:)`. Lu par l'hôte canvas pour
    /// qu'un rendu SwiftUI survenu pendant le glissé ne relance pas la lecture.
    public private(set) var isScrubbing = false

    /// La pause que l'HÔTE demande, indépendamment du glissé — posée à chaque
    /// passe par `StoryReaderRepresentable.updateUIView`. Relâcher ne relance
    /// donc jamais une scène que l'utilisateur avait mise en pause.
    var hostPaused = false

    weak var canvas: StoryCanvasUIView?

    public init() {}

    /// Un nouveau canvas (la story suivante, un tour de boucle) solde tout
    /// glissé resté ouvert : son relâcher, perdu avec l'ancien, ne viendra plus.
    func attach(_ canvas: StoryCanvasUIView) {
        self.canvas = canvas
        isScrubbing = false
    }

    public func begin() {
        isScrubbing = true
        canvas?.beginReaderScrub()
    }

    public func scrub(toFraction fraction: Double) {
        guard isScrubbing else { return }
        canvas?.scrubReader(toFraction: fraction)
    }

    public func end(atFraction fraction: Double) {
        guard isScrubbing else { return }
        isScrubbing = false
        canvas?.endReaderScrub(atFraction: fraction, resume: !hostPaused)
    }
}
