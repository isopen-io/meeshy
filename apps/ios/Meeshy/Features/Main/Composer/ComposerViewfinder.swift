import SwiftUI
import AVFoundation
import MeeshySDK
import MeeshyUI

/// Les règles du viseur servi SEUL, hors d'une scène (#9125).
nonisolated enum ComposerViewfinderRules {

    /// Le mode que la porte a promis (#4998) devient celui que la barre
    /// annonce — jamais un viseur photo sous une porte vidéo.
    static func sceneMode(for mode: CameraCaptureMode) -> ComposerSceneCameraMode {
        switch mode {
        case .photo: return .photo
        case .video: return .video
        }
    }
}

/// **Le viseur du composeur, servi SEUL en plein écran** (#9125) — une COQUILLE
/// autour du montage unique (#9351, décision porteur 2026-10-05).
///
/// > « Il faut réutiliser exactement le mode plein écran de la capture existant
/// > dans le composer de story. »
///
/// Les portes qui n'ont PAS de scène — la barre de conversation, le statut, la
/// page blanche de l'atelier, la citation du fil — reçoivent ici le montage du
/// composer (`ComposerCaptureMount`), plein écran et sans carte où rentrer —
/// seul un selfie éclairé par l'écran s'y réduit en scène (#9566). Elle ne garde ni chrome ni mise en page à elle : mêmes
/// couches, mêmes gestes, même rail, même bande.
///
/// Ce que la prise rend part par `onCapture` — une photo regardée, peinte par
/// le peintre unique sur le canevas 9:16 (#9347), ou la vidéo concaténée de ses
/// segments — puis le viseur se retire.
struct ComposerViewfinder: View {
    let initialMode: CameraCaptureMode
    let onCapture: (CameraResult) -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var capture: ComposerCaptureSession
    @State private var delivered = false
    /// Cet hôte n'a pas de carte : la taille ne joue que sous le flash d'écran,
    /// où le selfie se réduit en scène entourée de blanc, ou s'agrandit (#9566).
    @State private var size = ComposerSceneCameraSize.card

    /// Le viseur naît ARMÉ, au mode que la porte a promis : posé dans un
    /// `.onAppear`, la barre annoncerait la photo une image avant de basculer.
    init(initialMode: CameraCaptureMode = .photo,
         onCapture: @escaping (CameraResult) -> Void) {
        self.initialMode = initialMode
        self.onCapture = onCapture
        _capture = StateObject(wrappedValue: ComposerCaptureSession(
            stage: .armed, mode: ComposerViewfinderRules.sceneMode(for: initialMode)))
    }

    private var camera: CameraModel { capture.camera }

    var body: some View {
        ComposerCaptureMount(session: capture, size: $size, offersSizeToggle: false,
                             onDisarm: { close() }, onDeliver: { deliver($0) }) {
            Color.black
                .ignoresSafeArea()
                .anchorPreference(key: ComposerSceneCameraFrameKey.self, value: .bounds) { $0 }
        }
        .onAppear {
            camera.configure()
            capture.watchThermalState()
            // La porte qui promet la vidéo arme le micro À L'OUVERTURE : le
            // prompt n'arrive pas sous le doigt qui veut déjà filmer.
            if initialMode == .video {
                Task { @MainActor in await camera.enableAudioCaptureIfNeeded() }
            }
        }
        .onDisappear { capture.disarm() }
        .statusBarHidden()
    }

    /// **Une prise ne part qu'une fois** : deux validations rapprochées pendant
    /// que le viseur se retire poseraient deux pièces.
    private func deliver(_ result: CameraResult) {
        guard !delivered else { return }
        delivered = true
        capture.finishCapture()
        HapticFeedback.success()
        onCapture(result)
        dismiss()
    }

    /// Quitter sans rendre emporte les segments abandonnés ET leurs fichiers,
    /// éteint la lumière et coupe la session — `onDisappear` le fait quel que
    /// soit le chemin de sortie (croix, glissé, fermeture par l'hôte).
    private func close() {
        dismiss()
    }
}
