import SwiftUI

/// #8696 — l'aperçu de SA caméra pendant un appel. Seule vue à observer la
/// caméra confirmée : le miroir suit les trames réellement affichées, jamais
/// l'intention d'une bascule en cours.
struct LocalCameraVideoView: View {
    let track: Any?
    let intendedFront: Bool
    var contentMode: UIView.ContentMode = .scaleAspectFill

    @ObservedObject var liveCamera: CallLiveCamera = .shared

    private var mirror: Bool {
        CallCameraMirror.isMirrored(
            facing: CallCameraMirror.displayedFacing(live: liveCamera.facing, intendedFront: intendedFront),
            role: .localPreview
        )
    }

    var body: some View {
        CallVideoView(track: track, mirror: mirror, contentMode: contentMode)
    }
}
