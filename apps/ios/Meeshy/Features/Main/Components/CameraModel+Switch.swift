import AVFoundation
import Combine
import os
import QuartzCore
import SwiftUI
import MeeshySDK
import MeeshyUI

extension CameraModel {
    /// Les sorties dont chaque entrée neuve redresse et miroite la connexion.
    nonisolated var orientedOutputs: [(AVCaptureOutput, ComposerCaptureMirrorRule.Output)] {
        [(photoOutput, .photo), (videoOutput, .movie), (frameOutput, .frames)]
    }

    /// Ce que l'objectif installé change à l'écran — publié APRÈS le commit.
    func adopt(_ installe: CameraInputInstaller.InstalledCamera) {
        activeVideoDevice = installe.device
        horizon.follow(installe.device)
        currentPosition = installe.position
        liveFeed.setPosition(installe.position)
        zoomScale = installe.zoomScale
        zoomFactor = 1
        watchSubjectArea(of: installe.device)
    }

    /// Switches the active camera. While recording, this cannot reconfigure the
    /// input in place without losing the capture (see the property doc-comment
    /// on `recordedSegmentURLs`) — it closes the current segment, swaps once
    /// stopped, and reopens a new segment on the new camera. A no-op while a
    /// previous switch is still settling (guards rapid double-taps).
    func switchCamera() {
        switchCamera(then: { _ in })
    }

    /// `then` reçoit l'objectif en place une fois la bascule finie —
    /// la machine de capture y rend le zoom et la lumière.
    func switchCamera(then: @escaping @MainActor @Sendable (AVCaptureDevice.Position) -> Void) {
        guard ComposerCameraSwitchRule.mayFlip(isSwitching: isSwitchingCamera), !recordingIsPending else { return }
        guard !isSwitchingCameraDuringRecording else { return }
        isSwitchingCamera = true
        #if DEBUG
        if fixture != nil {
            // La caméra de recette se retourne aussi : le selfie éclairé par
            // l'écran se recette au simulateur.
            currentPosition = currentPosition == .back ? .front : .back
            endSwitch()
            then(currentPosition)
            return
        }
        #endif
        if isRecordingVideo {
            isSwitchingCameraDuringRecording = true
            pendingSwitchPosition = currentPosition == .back ? .front : .back
            switchFollower = then
            videoOutput.stopRecording()
            return
        }
        performCameraSwitch(to: currentPosition == .back ? .front : .back) { [weak self] in
            guard let self else { return }
            then(self.currentPosition)
        }
    }

    /// Sur la file de la session : l'objectif change, son plan de photo avec lui.
    nonisolated func swapLens(to position: AVCaptureDevice.Position) -> CameraInputInstaller.InstalledCamera? {
        let installe = CameraInputInstaller.installVideoInput(in: session, position: position, outputs: orientedOutputs,
                                                  prepared: preparedInputs,
                                                  previewWanted: previewMirroring.isWanted,
                                                  photoPlan: { self.adoptLens($0) })
        if let device = installe?.device { CameraPhotoTuning.confirm(photoOutput, in: session, for: device) }
        return installe
    }

    /// Ce que reçoit chaque objectif installé, dans sa transaction : le plan
    /// photo, et les curseurs du bouton Camera Control (OPUS-9).
    nonisolated func adoptLens(_ device: AVCaptureDevice) {
        CameraPhotoTuning.adopt(for: device, on: photoOutput)
        CameraSystemControlsHost.install(in: session, for: device) { [weak self] facteur in
            guard let self else { return }
            self.zoomFactor = self.zoomScale.displayed(facteur)
        }
    }

    func publishLens(_ installe: CameraInputInstaller.InstalledCamera?) {
        if let installe { adopt(installe) }
        self.inputEpoch += 1
    }

    /// La bascule se fait sur la file ; `then` passe sur le fil principal une
    /// fois l'objectif publié. La trame de couverture est celle déjà retenue,
    /// et son flou se peint À CÔTÉ de la bascule, jamais devant elle.
    func performCameraSwitch(to position: AVCaptureDevice.Position,
                                     then: @escaping @MainActor @Sendable () -> Void = {}) {
        let debut = CACurrentMediaTime()
        switchGeneration += 1
        let generation = switchGeneration
        let quitte = currentPosition
        sessionQueue.perform { [weak self] in
            guard let self else { return }
            let file = CACurrentMediaTime()
            let trame = ComposerCameraSwitchRule.coverFrame(latest: self.liveFeed.latestImage()) {
                self.liveFeed.holdNextFrame(timeout: ComposerCameraSwitchRule.frameWait)
            }
            let couverte = CACurrentMediaTime()
            if let trame {
                self.paintCover(ComposerCameraSwitchRule.Frame(image: trame), generation: generation, leaving: quitte)
            }
            let installe = self.swapLens(to: position)
            let posee = CACurrentMediaTime()
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    self.publishLens(installe)
                    func ms(_ a: CFTimeInterval, _ b: CFTimeInterval) -> Int {
                        ComposerCameraSwitchTiming.milliseconds(from: a, to: b)
                    }
                    let fin = CACurrentMediaTime()
                    let validee = installe?.committedAt ?? posee
                    let phases = ComposerCameraSwitchPhases(queue: ms(debut, file), frame: ms(file, couverte),
                                                            commit: ms(couverte, validee), settle: ms(validee, posee),
                                                            main: ms(posee, fin))
                    let rapport = ComposerCameraSwitchTiming.report(to: position, total: ms(debut, fin), phases: phases)
                    Logger.media.info("\(rapport, privacy: .public)")
                    self.endSwitch()
                    then()
                }
            }
        }
        HapticFeedback.light()
    }

    /// Le flou de la couverture, hors de la file de la session ; il ne se pose
    /// que si sa bascule dure encore et que l'ancien objectif est toujours là.
    nonisolated private func paintCover(_ trame: ComposerCameraSwitchRule.Frame, generation: Int,
                                        leaving ancien: AVCaptureDevice.Position) {
        DispatchQueue.global(qos: .userInteractive).async { [weak self] in
            guard let self, let couverture = ComposerCameraSwitchRule.cover(from: trame.image)
                .map(ComposerCameraSwitchRule.Cover.init(image:)) else { return }
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard self.isSwitchingCamera, self.switchGeneration == generation,
                          self.currentPosition == ancien else { return }
                    self.switchCover = couverture.image
                }
            }
        }
    }

    /// La couverture reste le temps que le nouvel objectif serve, puis s'efface.
    func endSwitch() {
        Task { @MainActor [weak self] in
            guard await cancellableSleep(for: .seconds(ComposerCameraSwitchRule.coverHold)) else { return }
            self?.switchCover = nil
            self?.isSwitchingCamera = false
        }
    }
}
