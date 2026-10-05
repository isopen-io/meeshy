import SwiftUI
import AVFoundation

struct CameraPreviewLayer: UIViewRepresentable {
    let session: AVCaptureSession
    /// Le pont qui convertit un toucher en point du capteur (#9295) — `nil`
    /// pour un aperçu qui ne vise pas.
    var focusPoints: CameraPreviewFocusPoints? = nil
    /// Avec un effet, la vue Metal peint seule (#9349) : la couche système se
    /// détache — un passage par image, jamais deux. Elle reste montée, le pont
    /// des touchers y convertit toujours ses points.
    var mirrorsFrames = true

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
        view.previewLayer.connection?.isEnabled = mirrorsFrames
        view.isHidden = !mirrorsFrames
        return view
    }

    func updateUIView(_ uiView: PreviewHost, context: Context) {
        // La SESSION peut changer (le meuble en remet une au ré-armement) ;
        // la frame, elle, n'a plus à être posée — `layerClass` s'en charge.
        if uiView.previewLayer.session !== session {
            uiView.previewLayer.session = session
        }
        focusPoints?.attach(uiView)
        uiView.previewLayer.connection?.isEnabled = mirrorsFrames
        uiView.isHidden = !mirrorsFrames
    }
}

/// **Le pont entre un toucher et le capteur** (#9295).
///
/// Le toucher se pose sur le chrome du viseur, l'image vit dans la couche
/// d'aperçu, et les deux ne partagent pas le même cadre : le plein écran pose
/// son aperçu sous la zone sûre, le chrome au-dessus ; la carte de la scène les
/// déplace ensemble. Le toucher et l'aperçu se mesurent donc dans le MÊME
/// repère — le repère global de SwiftUI, quelle que soit la présentation
/// (plein écran, feuille, carte) — et seule la couche rend le point au
/// capteur : elle connaît le remplissage (`.resizeAspectFill` rogne),
/// l'orientation et le miroir de l'objectif avant.
final class CameraPreviewFocusPoints {
    private weak var host: CameraPreviewLayer.PreviewHost?
    /// Le cadre de l'aperçu dans le repère global, posé par l'aperçu lui-même.
    var previewFrame: CGRect = .zero

    nonisolated deinit {}

    func attach(_ host: CameraPreviewLayer.PreviewHost) {
        self.host = host
    }

    /// Le toucher dans le repère de l'aperçu ; `nil` quand l'aperçu n'est pas
    /// à l'écran, ou que le toucher tombe hors de lui. La conversion vers le
    /// capteur suit l'image AFFICHÉE (`ComposerCaptureFocusGeometry`, #9464) —
    /// pas la couche système, cachée quand la vue Metal peint.
    func localPoint(fromGlobalPoint point: CGPoint) -> CGPoint? {
        guard let host, host.window != nil else { return nil }
        return Self.layerPoint(global: point, previewFrame: previewFrame)
    }

    /// Le toucher, ramené au repère de la couche — `nil` hors de l'aperçu.
    nonisolated static func layerPoint(global point: CGPoint, previewFrame: CGRect) -> CGPoint? {
        guard !previewFrame.isEmpty, previewFrame.contains(point) else { return nil }
        return CGPoint(x: point.x - previewFrame.minX, y: point.y - previewFrame.minY)
    }
}
