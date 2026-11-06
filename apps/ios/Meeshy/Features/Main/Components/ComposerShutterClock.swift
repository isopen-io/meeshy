import Foundation
import QuartzCore
import os
import MeeshySDK

/// Les intervalles de la caméra, lisibles dans Instruments (`os_signpost`) sur
/// un iPhone réel, sans rien recoder (#16504, #16505).
nonisolated enum CameraSignposts {
    static let signposter = OSSignposter(subsystem: "me.meeshy.app", category: "camera")
    static let open: StaticString = "camera.open"
    static let shutter: StaticString = "camera.shutter"
}

/// **Du toucher à l'obturateur, mesuré** (#16504) : démarré au toucher sur le fil
/// principal, relevé quand `willCapturePhotoFor` part. Une mesure par toucher.
nonisolated final class ComposerShutterClock: Sendable {
    private nonisolated struct Touch: @unchecked Sendable {
        let startedAt: CFTimeInterval
        let interval: OSSignpostIntervalState
    }

    private let touch = Locked<Touch?>(nil)

    nonisolated deinit {}

    init() {}

    func start(at instant: CFTimeInterval = CACurrentMediaTime()) {
        let intervalle = CameraSignposts.signposter.beginInterval(CameraSignposts.shutter)
        touch.mutate { $0 = Touch(startedAt: instant, interval: intervalle) }
    }

    @discardableResult
    func report(at instant: CFTimeInterval = CACurrentMediaTime()) -> Int? {
        guard let parti = touch.mutate({ state -> Touch? in
            defer { state = nil }
            return state
        }) else { return nil }
        CameraSignposts.signposter.endInterval(CameraSignposts.shutter, parti.interval)
        let ms = Int(((instant - parti.startedAt) * 1000).rounded())
        Logger.media.notice("camera shutter: \(ms, privacy: .public) ms after the touch")
        return ms
    }
}
