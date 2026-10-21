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
nonisolated final class ComposerCameraFirstFrameClock: @unchecked Sendable {
    private let lock = NSLock()
    private var startedAt: CFTimeInterval?
    private var prewarmed = false

    nonisolated deinit {}

    init() {}

    func start(prewarmed: Bool, at instant: CFTimeInterval = CACurrentMediaTime()) {
        lock.lock()
        startedAt = instant
        self.prewarmed = prewarmed
        lock.unlock()
    }

    /// La première trame depuis `start` : sa durée, en millisecondes, une fois ;
    /// `nil` pour toutes les suivantes.
    @discardableResult
    func report(at instant: CFTimeInterval = CACurrentMediaTime()) -> Int? {
        lock.lock()
        guard let debut = startedAt else {
            lock.unlock()
            return nil
        }
        startedAt = nil
        let prechauffee = prewarmed
        lock.unlock()
        let duree = Int(((instant - debut) * 1000).rounded())
        Logger.media.info("camera first frame: \(duree, privacy: .public) ms (\(prechauffee ? "prewarmed" : "cold", privacy: .public))")
        return duree
    }
}
