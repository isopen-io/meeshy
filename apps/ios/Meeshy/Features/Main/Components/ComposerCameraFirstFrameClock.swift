import Foundation
import QuartzCore
import os
import MeeshySDK

/// **Le temps de l'armement à la première trame, mesuré** (#10307, porteur
/// 2026-10-12 : « armer la caméra vite »). Relevé dans la console
/// (`Logger.media`, « camera first frame ») sur l'appareil, là où il se juge,
/// avec ce qui l'explique : une session préparée à l'ouverture du composer, ou
/// configurée à froid au toucher.
///
/// Thread-safe : démarré sur le fil principal, arrêté sur la file des trames.
nonisolated final class ComposerCameraFirstFrameClock: Sendable {
    private nonisolated struct Armed: Sendable {
        let startedAt: CFTimeInterval
        let prewarmed: Bool
        let interval: OSSignpostIntervalState
    }

    private let armed = Locked<Armed?>(nil)

    nonisolated deinit {}

    init() {}

    func start(prewarmed: Bool, at instant: CFTimeInterval = CACurrentMediaTime()) {
        let intervalle = CameraSignposts.signposter.beginInterval(CameraSignposts.open)
        armed.mutate { $0 = Armed(startedAt: instant, prewarmed: prewarmed, interval: intervalle) }
    }

    /// La première trame depuis `start` : sa durée, en millisecondes, une fois ;
    /// `nil` pour toutes les suivantes.
    @discardableResult
    func report(at instant: CFTimeInterval = CACurrentMediaTime()) -> Int? {
        guard let started = armed.mutate({ state -> Armed? in
            defer { state = nil }
            return state
        }) else { return nil }
        CameraSignposts.signposter.endInterval(CameraSignposts.open, started.interval)
        let elapsedMs = Int(((instant - started.startedAt) * 1000).rounded())
        Logger.media.notice("camera first frame: \(elapsedMs, privacy: .public) ms (\(started.prewarmed ? "prewarmed" : "cold", privacy: .public))")
        return elapsedMs
    }
}
