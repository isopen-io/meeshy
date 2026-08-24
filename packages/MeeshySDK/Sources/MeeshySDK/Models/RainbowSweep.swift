import Foundation
import CoreGraphics

// MARK: - RainbowSweep (géométrie de la comète — pure, sans dépendance UI)

/// Où se trouve le point chaud du `rainbow` à un instant donné de son cycle.
///
/// L'effet ne fait plus tourner son spectre : les couleurs sont POSÉES, et
/// c'est une comète qui court le long du contour, puis se repose, puis
/// repart. Le repos domine le cycle — c'est ce qui distingue un effet qui
/// ponctue d'un effet qui tourne en boucle et que l'œil finit par subir.
///
/// **Pourquoi cette règle vit hors de SwiftUI.** Une vue ne peut pas dériver
/// sa forme d'une phase animée sans passer par `animatableData` : SwiftUI
/// n'anime pas la phase, il interpole la VALEUR PRODUITE entre son état
/// initial et son état final. C'est le piège déjà documenté pour
/// `ShakeGeometryEffect`, et il frapperait identiquement ici — le plateau de
/// pause serait écrasé par une interpolation plate, et la comète glisserait
/// sans jamais s'arrêter. La vue parcourt donc cette règle pas à pas.
///
/// **Pourquoi le périmètre et non l'angle.** Un `AngularGradient` qui tourne
/// balaie vite les côtés courts d'un rectangle et lentement les longs : la
/// vitesse apparente du point chaud dépend de la forme de la bulle. Un arc
/// défini en fraction du PÉRIMÈTRE (`Shape.trim(from:to:)`) avance à vitesse
/// constante quelle que soit la bulle.
public struct RainbowSweep: Equatable, Sendable {

    /// Durée d'un cycle complet — course puis repos.
    public static let cycle: TimeInterval = 4.5

    /// Part du cycle consacrée à la course. Le reste est du repos.
    public static let sweepFraction: CGFloat = 0.55

    /// Longueur de la comète, en fraction du périmètre.
    public static let arcLength: CGFloat = 0.12

    /// Part de la COURSE consacrée à l'allumage, et autant à l'extinction.
    /// Une comète qui apparaît et disparaît net clignote.
    public static let fadeFraction: CGFloat = 0.12

    /// Ce qu'il faut tracer, ici et maintenant.
    public struct State: Equatable, Sendable {
        /// Segments à tracer, en fractions du périmètre. Vide au repos, deux
        /// entrées quand l'arc franchit le raccord — voir `segments(headAt:)`.
        public let segments: [ClosedRange<CGFloat>]
        /// `0…1`. La vue module sa propre intensité par-dessus.
        public let opacity: Double

        public init(segments: [ClosedRange<CGFloat>], opacity: Double) {
            self.segments = segments
            self.opacity = opacity
        }

        public static let resting = State(segments: [], opacity: 0)
    }

    /// - Parameter phase: progression du cycle. Ramenée dans `[0, 1)` : une
    ///   animation `repeatForever` peut livrer une valeur légèrement hors
    ///   bornes aux extrémités du cycle, et rendre un état vide à ce
    ///   moment-là produirait un trou d'une frame par cycle.
    public static func state(at phase: CGFloat) -> State {
        let normalized = normalize(phase)
        guard normalized < sweepFraction else { return .resting }

        let progress = normalized / sweepFraction
        return State(segments: segments(headAt: progress),
                     opacity: Double(fade(at: progress)))
    }

    // MARK: - Dérivations

    private static func normalize(_ phase: CGFloat) -> CGFloat {
        guard phase.isFinite else { return 0 }
        let wrapped = phase.truncatingRemainder(dividingBy: 1)
        return wrapped < 0 ? wrapped + 1 : wrapped
    }

    /// `Shape.trim(from:to:)` ne reboucle pas : demander `from: 0.93, to: 1.05`
    /// ne trace rien au-delà de `1`. Quand la queue de la comète est encore
    /// avant le raccord alors que sa tête l'a franchi, il faut donc DEUX
    /// segments — dont les longueurs somment toujours à l'arc entier.
    private static func segments(headAt head: CGFloat) -> [ClosedRange<CGFloat>] {
        let tail = head - arcLength
        guard tail < 0 else { return [tail...head] }

        return [(tail + 1)...1, 0...head].filter { $0.upperBound > $0.lowerBound }
    }

    private static func fade(at progress: CGFloat) -> CGFloat {
        let ramp = min(progress / fadeFraction, (1 - progress) / fadeFraction, 1)
        return max(0, min(1, ramp))
    }
}
