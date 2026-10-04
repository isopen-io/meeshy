import SwiftUI
import AVFoundation

struct CameraPreviewLayer: UIViewRepresentable {
    let session: AVCaptureSession
    /// Le pont qui convertit un toucher en point du capteur (#9295) — `nil`
    /// pour un aperçu qui ne vise pas.
    var focusPoints: CameraPreviewFocusPoints? = nil

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
        focusPoints?.attach(view)
        return view
    }

    func updateUIView(_ uiView: PreviewHost, context: Context) {
        // La SESSION peut changer (le meuble en remet une au ré-armement) ;
        // la frame, elle, n'a plus à être posée — `layerClass` s'en charge.
        if uiView.previewLayer.session !== session {
            uiView.previewLayer.session = session
        }
        focusPoints?.attach(uiView)
    }
}

/// **Le pont entre un toucher et le capteur** (#9295).
///
/// Le toucher se pose sur le chrome du viseur, l'image vit dans la couche
/// d'aperçu, et les deux ne partagent pas le même repère : le plein écran pose
/// son aperçu sous la zone sûre, le chrome au-dessus ; la carte de la scène les
/// déplace ensemble. Le point voyage donc dans le repère de la FENÊTRE, et
/// seule la couche sait le rendre au capteur — elle connaît le remplissage
/// (`.resizeAspectFill` rogne), l'orientation et le miroir de l'objectif avant.
final class CameraPreviewFocusPoints {
    private weak var host: CameraPreviewLayer.PreviewHost?

    nonisolated deinit {}

    func attach(_ host: CameraPreviewLayer.PreviewHost) {
        self.host = host
    }

    /// `nil` quand l'aperçu n'est pas à l'écran, ou que le toucher tombe hors
    /// de l'image — viser hors champ n'a pas de sens.
    func devicePoint(fromWindowPoint point: CGPoint) -> CGPoint? {
        guard let host, host.window != nil else { return nil }
        let local = host.convert(point, from: nil)
        guard host.bounds.contains(local) else { return nil }
        return host.previewLayer.captureDevicePointConverted(fromLayerPoint: local)
    }
}
