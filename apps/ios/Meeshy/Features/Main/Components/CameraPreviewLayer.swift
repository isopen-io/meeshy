import SwiftUI
import AVFoundation

struct CameraPreviewLayer: UIViewRepresentable {
    let session: AVCaptureSession

    /// **La couche d'aperçu EST la couche de la vue** (#4080).
    ///
    /// Elle était un SOUS-CALQUE dont la frame se posait dans un
    /// `Task { @MainActor }` depuis `updateUIView`. Deux défauts que la feuille
    /// ne montrait pas et que la scène a révélés sur appareil :
    ///
    /// - la frame arrivait une passe de layout APRÈS la vue, donc l'aperçu
    ///   naissait à `.zero` — un rectangle NOIR de la taille de la carte, qui
    ///   ressemble exactement à une caméra qui ne rend rien ;
    /// - un sous-calque ne suit pas son parent : toute reprise de disposition
    ///   (rotation, clavier, changement de ratio) le laissait à l'ancienne
    ///   taille jusqu'au prochain `updateUIView`.
    ///
    /// `layerClass` supprime les deux : le système redimensionne la couche avec
    /// la vue, à chaque passe, sans qu'aucun code ne s'en charge.
    final class PreviewHost: UIView {
        nonisolated deinit {}
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    func makeUIView(context: Context) -> PreviewHost {
        let view = PreviewHost()
        view.backgroundColor = .black
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: PreviewHost, context: Context) {
        // La SESSION peut changer (le meuble en remet une au ré-armement) ;
        // la frame, elle, n'a plus à être posée — `layerClass` s'en charge.
        if uiView.previewLayer.session !== session {
            uiView.previewLayer.session = session
        }
    }
}
