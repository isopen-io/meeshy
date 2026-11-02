import SwiftUI

// MARK: - Le temps qui passe ne vit plus dans le lecteur (#9859)

/// **L'horloge que SEULE la barre de progression lit.**
///
/// La progression était un `@State` de `StoryViewerView`, écrit par chaque tick
/// du compte à rebours (jusqu'à 60 fois par seconde). Chaque écriture
/// réévaluait le lecteur entier — carte, en-tête, rail, calques des
/// commentaires et du composeur — pour ne faire bouger qu'une capsule de 3 pt.
/// Depuis que la story boucle sous les commentaires (#9821), ce coût était
/// permanent : 75 à 90 % de processeur au simulateur, et un figeage.
///
/// Le lecteur tient l'horloge par RÉFÉRENCE et ne l'observe pas : publier une
/// fraction n'invalide que les vues qui la déclarent `@ObservedObject`, c'est-à-
/// dire la barre (`StoryLiveProgressBars`). Le lecteur, lui, ne change d'état
/// qu'aux vrais événements — début, fin, pause, boucle, changement de story.
final class StoryPlaybackProgressClock: ObservableObject {
    @Published private(set) var fraction: CGFloat = 0

    nonisolated deinit {}

    /// Une fraction reçue du compte à rebours ; ne publie que ce qui se voit.
    func publish(_ raw: Double) {
        guard let next = Self.committedFraction(raw: raw, current: fraction) else { return }
        fraction = next
    }

    /// Début de story, changement de story, boucle : la barre repart de zéro.
    func reset() {
        publish(0)
    }

    /// La barre fait au plus ~300 pt : un écart plus fin ne déplace aucun pixel.
    nonisolated static let granularity: CGFloat = 1.0 / 300.0

    /// **La règle de publication, pure.** Rend la fraction à publier, ou `nil`
    /// quand le changement est invisible. Zéro et la fin se publient toujours :
    /// un départ ou une boucle ne doit jamais laisser la barre pleine, et la fin
    /// ne doit jamais s'arrêter à un cheveu du bord.
    nonisolated static func committedFraction(raw: Double, current: CGFloat) -> CGFloat? {
        let clamped = raw.isFinite ? CGFloat(min(max(raw, 0), 1)) : 0
        guard clamped != current else { return nil }
        if clamped == 0 || clamped >= 1 { return clamped }
        return abs(clamped - current) >= granularity ? clamped : nil
    }
}
