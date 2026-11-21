import CoreMotion
import Foundation
import MeeshySDK

/// Ce que l'appareil dit de son activité (#19887), hors de CoreMotion pour être éprouvé sans appareil. Seule une
/// activité de confiance moyenne au moins se dit ; en voiture arrêtée, l'appareil se dit à la fois immobile et en
/// voiture : le véhicule l'emporte, puis le vélo, la course, la marche, l'immobilité.
nonisolated struct SharedLocationMotionReading: Equatable, Sendable {
    enum Confidence: Sendable { case low, medium, high }

    var stationary = false
    var walking = false
    var running = false
    var cycling = false
    var automotive = false
    var confidence: Confidence

    var motion: SharedLocationMotion? {
        guard confidence != .low else { return nil }
        let ranked: [(Bool, SharedLocationMotion)] = [
            (automotive, .automotive), (cycling, .cycling), (running, .running), (walking, .walking), (stationary, .stationary),
        ]
        return ranked.first { $0.0 }?.1
    }
}

/// La source du mouvement qui accompagne ma position. L'app la tient de CoreMotion (`SharedLocationMotionSource`) ; un
/// témoin la simule. `latest` : la dernière activité de confiance suffisante, `nil` sans autorisation ni capteur.
@MainActor
protocol SharedLocationMotionProviding: AnyObject {
    var latest: SharedLocationMotion? { get }
    /// Commence à écouter l'activité (demande l'autorisation « Mouvements et forme » la première fois). Idempotent.
    func begin()
    /// Cesse d'écouter et oublie la dernière activité.
    func end()
}

/// L'activité de l'appareil par `CMMotionActivityManager`, le temps d'un partage de position. Refusée, restreinte ou
/// sans coprocesseur : aucune écoute, aucun mouvement, et rien d'autre ne change.
@MainActor
final class SharedLocationMotionSource: SharedLocationMotionProviding {
    private(set) var latest: SharedLocationMotion?
    private let manager = CMMotionActivityManager()
    private var listening = false

    nonisolated deinit {}

    func begin() {
        guard !listening, CMMotionActivityManager.isActivityAvailable() else { return }
        switch CMMotionActivityManager.authorizationStatus() {
        case .denied, .restricted: return
        default: break
        }
        listening = true
        manager.startActivityUpdates(to: .main) { [weak self] activity in
            guard let activity else { return }
            let reading = Self.reading(of: activity)
            MainActor.assumeIsolated { self?.ingest(reading) }
        }
    }

    func end() {
        guard listening else { return }
        listening = false
        manager.stopActivityUpdates()
        latest = nil
    }

    private func ingest(_ reading: SharedLocationMotionReading) {
        guard let motion = reading.motion else { return }
        latest = motion
    }

    private nonisolated static func reading(of activity: CMMotionActivity) -> SharedLocationMotionReading {
        let confidence: SharedLocationMotionReading.Confidence
        switch activity.confidence {
        case .high: confidence = .high
        case .medium: confidence = .medium
        default: confidence = .low
        }
        return SharedLocationMotionReading(stationary: activity.stationary, walking: activity.walking,
                                           running: activity.running, cycling: activity.cycling,
                                           automotive: activity.automotive, confidence: confidence)
    }
}
