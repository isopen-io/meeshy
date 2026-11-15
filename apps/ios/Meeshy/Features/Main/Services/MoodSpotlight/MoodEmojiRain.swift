import CoreGraphics
import Foundation

/// Une instance de l'emoji d'une humeur qui PEUPLE sa page plein écran (#10814).
///
/// Décrite en coordonnées RELATIVES figées à la naissance, plus une horloge :
/// tout ce qui se voit (taille, opacité, position) se DÉRIVE de l'instant
/// courant, jamais d'un état muté image par image.
nonisolated struct MoodEmojiParticle: Equatable, Identifiable, Sendable {
    let id: Int
    let birth: TimeInterval
    let lifetime: TimeInterval
    /// Point de naissance, fractions de la largeur et de la hauteur (0…1).
    let originX: Double
    let originY: Double
    /// Phase et amplitude (fraction de la largeur) de l'oscillation latérale.
    let phase: Double
    let amplitude: Double
}

/// Ce que le pinceau dessine pour une particule à un instant donné.
nonisolated struct MoodEmojiParticleFrame: Equatable, Sendable {
    let center: CGPoint
    let size: CGFloat
    let opacity: Double
}

/// L'état de la pluie : les particules VIVANTES, et rien d'autre. Une particule
/// arrivée au bout de sa vie en est RETIRÉE — elle n'existe plus nulle part.
nonisolated struct MoodEmojiRainState: Equatable, Sendable {
    private(set) var particles: [MoodEmojiParticle] = []
    private(set) var nextId = 0
    private(set) var lastSpawn: TimeInterval?

    static let empty = MoodEmojiRainState()

    /// L'état à l'instant `now` : les particules arrivées au bout de leur vie
    /// sont DÉTRUITES, puis une nouvelle naît si l'intervalle est écoulé et que
    /// le plafond n'est pas atteint.
    func advanced<G: RandomNumberGenerator>(to now: TimeInterval, using generator: inout G) -> MoodEmojiRainState {
        var next = self
        next.particles = particles.filter { MoodEmojiRain.progress(of: $0, at: now) < 1 }
        let due = lastSpawn.map { now - $0 >= MoodEmojiRain.spawnInterval } ?? true
        guard due, next.particles.count < MoodEmojiRain.maxParticles else { return next }
        next.particles.append(MoodEmojiRain.makeParticle(id: nextId, birth: now, using: &generator))
        next.nextId = nextId + 1
        next.lastSpawn = now
        return next
    }
}

/// Les LOIS de la pluie d'emoji, pures : le plafond, la cadence, et la
/// projection d'une particule sur l'écran.
///
/// Une particule naît petite, grossit en oscillant, et devient de plus en plus
/// transparente à mesure qu'elle grossit : elle est TOTALEMENT transparente
/// quand sa taille atteint la moitié de la largeur de l'écran — c'est l'instant
/// où elle est détruite.
nonisolated enum MoodEmojiRain {
    static let maxParticles = 12
    static let spawnInterval: TimeInterval = 0.4
    static let lifetimeRange: ClosedRange<TimeInterval> = 3.0...4.6
    static let birthSize: CGFloat = 22
    /// Fraction de la largeur à laquelle une particule disparaît.
    static let vanishingWidthFraction: CGFloat = 0.5

    static func vanishingSize(forWidth width: CGFloat) -> CGFloat {
        max(birthSize, width * vanishingWidthFraction)
    }

    static func progress(of particle: MoodEmojiParticle, at now: TimeInterval) -> Double {
        guard particle.lifetime > 0 else { return 1 }
        return min(1, max(0, (now - particle.birth) / particle.lifetime))
    }

    static func size(atProgress progress: Double, width: CGFloat) -> CGFloat {
        birthSize + (vanishingSize(forWidth: width) - birthSize) * CGFloat(progress)
    }

    /// Décroît avec la TAILLE : 1 à la naissance, 0 à la moitié de la largeur.
    static func opacity(forSize size: CGFloat, width: CGFloat) -> Double {
        let span = vanishingSize(forWidth: width) - birthSize
        guard span > 0 else { return 0 }
        return Double(min(1, max(0, 1 - (size - birthSize) / span)))
    }

    static func frame(of particle: MoodEmojiParticle, at now: TimeInterval, in canvas: CGSize) -> MoodEmojiParticleFrame {
        let progress = progress(of: particle, at: now)
        let size = size(atProgress: progress, width: canvas.width)
        let elapsed = now - particle.birth
        let sway = sin(particle.phase + elapsed * 2 * .pi * 0.55) * particle.amplitude * canvas.width
        let rise = progress * 0.08 * canvas.height
        return MoodEmojiParticleFrame(
            center: CGPoint(x: particle.originX * canvas.width + sway,
                            y: particle.originY * canvas.height - rise),
            size: size,
            opacity: opacity(forSize: size, width: canvas.width)
        )
    }

    static func makeParticle<G: RandomNumberGenerator>(id: Int, birth: TimeInterval, using generator: inout G) -> MoodEmojiParticle {
        MoodEmojiParticle(
            id: id,
            birth: birth,
            lifetime: TimeInterval.random(in: lifetimeRange, using: &generator),
            originX: Double.random(in: 0.08...0.92, using: &generator),
            originY: Double.random(in: 0.08...0.92, using: &generator),
            phase: Double.random(in: 0...(2 * .pi), using: &generator),
            amplitude: Double.random(in: 0.015...0.05, using: &generator)
        )
    }
}

/// Le moteur que la vue interroge à chaque image. Il ne publie rien (aucun
/// rendu déclenché par lui) : c'est l'horloge de `TimelineView` qui cadence, et
/// `reset()` vide tout quand la page disparaît.
final class MoodEmojiRainEngine {
    // iOS 26 : deinit synthétisée ISOLÉE au MainActor → double-free au démontage hors d'une tâche (#9694).
    nonisolated deinit {}

    private(set) var state = MoodEmojiRainState.empty
    private var generator = SystemRandomNumberGenerator()

    func advance(to now: TimeInterval) -> [MoodEmojiParticle] {
        state = state.advanced(to: now, using: &generator)
        return state.particles
    }

    func reset() {
        state = .empty
    }
}
