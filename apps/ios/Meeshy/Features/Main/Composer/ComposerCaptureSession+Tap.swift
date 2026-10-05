import Foundation

// MARK: - Le toucher du viseur (#9464)

extension ComposerCaptureSession {

    /// Ce que fait ce toucher — viser, ou prendre la photo s'il finit un double.
    /// Un double fini oublie son premier toucher : un troisième en ouvre un nouveau.
    func tapAction(at now: Date = Date()) -> ComposerCaptureTapRule.Action {
        let action = ComposerCaptureTapRule.action(stage: stage, now: now,
                                                   lastTapAt: lastViewfinderTapAt, armedAt: armedAt)
        lastViewfinderTapAt = action == .photo ? nil : now
        return action
    }
}
