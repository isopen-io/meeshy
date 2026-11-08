import AVFoundation
import Combine
import os
import QuartzCore
import SwiftUI
import MeeshySDK
import MeeshyUI

extension CameraModel {
    func takePhoto(flash: AVCaptureDevice.FlashMode) {
        #if DEBUG
        if let fixture {
            guard !isSwitchingCamera else { return }
            noteShutterFired()
            deliverFixturePhoto(fixture)
            return
        }
        #endif
        // Même exception ObjC que l'enregistrement sans connexion active, donc
        // même prévention devant l'appel — un `do/catch` ne la rattraperait pas.
        let connection = photoOutput.connection(with: .video)
        guard !isSwitchingCamera, CameraRecordingReadiness.mayCapturePhoto(
            sessionIsRunning: session.isRunning,
            hasVideoConnection: connection != nil,
            connectionIsActive: connection?.isActive ?? false,
            connectionIsEnabled: connection?.isEnabled ?? false
        ) else { return }
        let settings = CameraPhotoTuning.settings(
            flash: flash, supportedFlashModes: photoOutput.supportedFlashModes,
            outputMaxPhotoDimensions: CameraPhotoDimensions(photoOutput.maxPhotoDimensions),
            formatMaxPhotoDimensions: photoOutput.sourceMaxPhotoDimensions)
        horizon.level(connection)
        isTakingPhoto = true
        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    /// **La session peut-elle rendre une image ?** Les mêmes quatre faits que
    /// `takePhoto` exige — lus ici pour qu'un geste qui OUVRE la caméra et
    /// PREND dans le même mouvement attende qu'elle le puisse. Jamais
    /// pendant une bascule : l'entrée en place va être retirée.
    var isCaptureReady: Bool {
        #if DEBUG
        if fixture != nil { return !isSwitchingCamera }
        #endif
        let connection = photoOutput.connection(with: .video)
        return !isSwitchingCamera && CameraRecordingReadiness.mayCapturePhoto(
            sessionIsRunning: session.isRunning,
            hasVideoConnection: connection != nil,
            connectionIsActive: connection?.isActive ?? false,
            connectionIsEnabled: connection?.isEnabled ?? false)
    }

    /// Attend que la session soit prête, au plus `timeout`. `false` ⇒ elle ne
    /// l'a pas été (permission refusée, simulateur sans caméra, tâche annulée).
    func waitUntilCaptureReady(timeout: TimeInterval) async -> Bool {
        let limite = Date().addingTimeInterval(timeout)
        while !isCaptureReady {
            guard !Task.isCancelled, Date() < limite else { return false }
            guard await cancellableSleep(for: .milliseconds(50)) else { return false }
        }
        return !Task.isCancelled
    }
}
