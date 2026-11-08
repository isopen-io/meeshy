import AVFoundation
import MeeshySDK
import os

/// L'entrée micro de la session de capture : branchée DANS une configuration
/// ouverte par l'appelant (`beginConfiguration`), sur la file de la session —
/// jamais sur le fil principal.
nonisolated enum CameraAudioInput {

    /// Branche le micro. `true` ⇒ la session a son micro (déjà présent, ou ajouté).
    static func add(to session: AVCaptureSession) -> Bool {
        let present = session.inputs.contains { ($0 as? AVCaptureDeviceInput)?.device.hasMediaType(.audio) == true }
        guard !present else { return true }
        guard let audioDevice = AVCaptureDevice.default(for: .audio) else { return false }
        let audioInput: AVCaptureDeviceInput
        do {
            audioInput = try AVCaptureDeviceInput(device: audioDevice)
        } catch {
            Logger.media.error("Failed to create audio capture input: \(error.localizedDescription, privacy: .public)")
            return false
        }
        guard session.canAddInput(audioInput) else { return false }
        session.addInput(audioInput)
        return true
    }

    /// Retire toute entrée micro de la configuration ouverte par l'appelant.
    static func remove(from session: AVCaptureSession) {
        session.inputs.compactMap { $0 as? AVCaptureDeviceInput }
            .filter { $0.device.hasMediaType(.audio) }
            .forEach(session.removeInput)
    }
}
