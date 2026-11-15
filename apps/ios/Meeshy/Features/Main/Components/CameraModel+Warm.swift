import Foundation

extension CameraModel {
    /// La caméra gardée au chaud entre deux viseurs (#16504).
    static let warmKeeper = CameraWarmKeeper<CameraModel> { CameraModel() }

    var isIdle: Bool {
        !isTakingPhoto && !isRecordingVideo && recordingId == nil && !isSwitchingCamera
    }

    func beginOpening() -> Int {
        openingGeneration &+= 1
        return openingGeneration
    }

    func openingIsCurrent(_ ouverture: Int) -> Bool { openingGeneration == ouverture }

    func cancelOpening() { openingGeneration &+= 1 }

    /// Un viseur parti sans s'arrêter n'a pas éteint l'objectif : son prêt le fait.
    /// Le VŒU, pas `session.isRunning` : un lancement encore en file doit tomber.
    func stopIfRunning() {
        guard runsFixture || sessionQueue.wantsToRun else { return }
        stop()
    }
}
