import SwiftUI

/// #8696 — l'aperçu de SA caméra pendant un appel. Seule vue à observer la
/// caméra confirmée : le miroir suit les trames réellement affichées, jamais
/// l'intention d'une bascule en cours.
struct LocalCameraVideoView: View {
    let track: Any?
    let intendedFront: Bool
    var contentMode: UIView.ContentMode
    /// U1.11 — ma vignette de groupe garde son rendu de la grille à la une (`CallVideoView.rendererKey`).
    var rendererKey: String?
    @ObservedObject var liveCamera: CallLiveCamera

    init(track: Any?, intendedFront: Bool, contentMode: UIView.ContentMode = .scaleAspectFill,
         rendererKey: String? = nil, liveCamera: CallLiveCamera = .shared) {
        self.track = track
        self.intendedFront = intendedFront
        self.contentMode = contentMode
        self.rendererKey = rendererKey
        self.liveCamera = liveCamera
    }

    private var mirror: Bool {
        CallCameraMirror.isMirrored(
            facing: CallCameraMirror.displayedFacing(live: liveCamera.facing, intendedFront: intendedFront),
            role: .localPreview
        )
    }

    var body: some View {
        CallVideoView(track: track, mirror: mirror, contentMode: contentMode, rendererKey: rendererKey)
    }
}
