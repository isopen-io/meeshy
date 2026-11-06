import Foundation

extension CameraModel {
    /// La caméra gardée au chaud entre deux viseurs (#16504).
    static let warmKeeper = CameraWarmKeeper<CameraModel> { CameraModel() }

    var isIdle: Bool {
        !isTakingPhoto && !isRecordingVideo && recordingId == nil && !isSwitchingCamera
    }

    /// Un viseur parti sans s'arrêter n'a pas éteint l'objectif : son prêt le fait.
    func stopIfRunning() {
        guard runsFixture || session.isRunning else { return }
        stop()
    }
}
