import CoreHaptics
import UIKit

/// UN TOUCHER du motif : à quel instant, avec quelle force.
nonisolated struct GameHapticTap: Equatable, Sendable {
    /// Secondes depuis le début du motif.
    let time: TimeInterval
    let intensity: Float
    let sharpness: Float
}

/// LES MOTIFS HAPTIQUES DU JEU (#9381) — conception, partie V : frappe « choc
/// net, léger rebond » ; rang « trois tapes, une par trait » ; niveau gagné
/// « tape légère » ; badge allumé « tape légère » ; coffre « une tape par
/// récompense » ; niveau perdu : aucune. Des DONNÉES, pas des appels : le motif
/// se prouve sans moteur haptique.
nonisolated enum GameHapticPattern {

    /// Le choc net de la frappe à 0,45 s (le « tchak »), puis un léger rebond.
    static let strike: [GameHapticTap] = [
        GameHapticTap(time: 0.45, intensity: 1.0, sharpness: 1.0),
        GameHapticTap(time: 0.54, intensity: 0.45, sharpness: 0.55),
    ]

    /// La frappe EN PLACE du moment photo : le choc tombe au déclenchement, sans le préambule de la scène.
    static let strikeInPlace: [GameHapticTap] = [
        GameHapticTap(time: 0, intensity: 1.0, sharpness: 1.0),
        GameHapticTap(time: 0.09, intensity: 0.45, sharpness: 0.55),
    ]

    /// Une tape par trait de la Signature qui se grave.
    static let rank: [GameHapticTap] = [
        GameHapticTap(time: 0.55, intensity: 0.55, sharpness: 0.6),
        GameHapticTap(time: 0.8, intensity: 0.7, sharpness: 0.7),
        GameHapticTap(time: 1.05, intensity: 0.9, sharpness: 0.85),
    ]

    static let levelGain: [GameHapticTap] = [GameHapticTap(time: 0.45, intensity: 0.4, sharpness: 0.5)]

    static let badgeLit: [GameHapticTap] = [GameHapticTap(time: 0.5, intensity: 0.4, sharpness: 0.5)]

    /// Une tape par récompense, au moment où elle monte du coffre.
    static func chest(rewards: Int) -> [GameHapticTap] {
        (0..<max(0, rewards)).map { index in
            GameHapticTap(time: 0.5 + Double(index) * 0.3, intensity: 0.55, sharpness: 0.6)
        }
    }
}

/// Le retour haptique du jeu — un protocole pour que les chorégraphies se
/// testent sans moteur.
@MainActor
protocol GameHapticsProviding: AnyObject {
    func play(_ taps: [GameHapticTap])
}

/// Core Haptics quand l'appareil le sait, sinon les générateurs d'impact de
/// UIKit (iPad, anciens iPhone, simulateur). Le moteur est créé au premier
/// usage et relancé s'il s'arrête (mise en veille de l'app).
@MainActor
final class GameHaptics: GameHapticsProviding {
    static let shared = GameHaptics()

    nonisolated deinit {}

    private var engine: CHHapticEngine?

    private var supportsCoreHaptics: Bool {
        CHHapticEngine.capabilitiesForHardware().supportsHaptics
    }

    func play(_ taps: [GameHapticTap]) {
        guard !taps.isEmpty else { return }
        guard supportsCoreHaptics, playWithEngine(taps) else {
            playWithImpact(taps)
            return
        }
    }

    private func playWithEngine(_ taps: [GameHapticTap]) -> Bool {
        do {
            let engine = try self.engine ?? makeEngine()
            let events = taps.map { tap in
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: tap.intensity),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: tap.sharpness),
                    ],
                    relativeTime: tap.time
                )
            }
            let pattern = try CHHapticPattern(events: events, parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try engine.start()
            try player.start(atTime: CHHapticTimeImmediate)
            return true
        } catch {
            engine = nil
            return false
        }
    }

    private func makeEngine() throws -> CHHapticEngine {
        let created = try CHHapticEngine()
        created.isAutoShutdownEnabled = true
        created.resetHandler = { [weak self] in
            Task { @MainActor in self?.engine = nil }
        }
        engine = created
        return created
    }

    private func playWithImpact(_ taps: [GameHapticTap]) {
        for tap in taps {
            let generator = UIImpactFeedbackGenerator(style: tap.intensity > 0.75 ? .heavy : (tap.intensity > 0.5 ? .medium : .light))
            generator.prepare()
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: UInt64(tap.time * 1_000_000_000))
                generator.impactOccurred(intensity: CGFloat(tap.intensity))
            }
        }
    }
}
