import SwiftUI
import AVFoundation
import MeeshySDK

// MARK: - Flat Renderer

/// Renders a `.flat` style player : no chrome, autoplay + loop + muted.
/// Used for SwiftUI previews of story foreground/background hors canvas.
/// In the canvas itself, `MeeshyVideoCanvasLayer` is used directly.
internal struct _FlatRenderer: View {
    let player: MeeshyVideoPlayer

    @State private var avPlayer: AVQueuePlayer?
    @State private var looper: AVPlayerLooper?
    @State private var aspectRatio: CGFloat?

    var body: some View {
        ZStack {
            Color.black
            if let p = avPlayer {
                MeeshyVideoSurface(player: p, gravity: .resizeAspectFill, isMuted: true)
            }
        }
        .aspectRatio(player.frame.maxAspectRatio == nil ? aspectRatio : nil, contentMode: .fit)
        .applyVideoFrame(player.frame)
        .onAppear { setup() }
        .onDisappear { teardown() }
    }

    private func setup() {
        guard avPlayer == nil,
              let url = MeeshyConfig.resolveMediaURL(player.attachment.fileUrl) else { return }
        let item = AVPlayerItem(url: url)
        item.preferredForwardBufferDuration = player.performance.preferredForwardBufferDuration
        let queue = AVQueuePlayer(playerItem: item)
        queue.isMuted = true
        /* UN LECTEUR EN BOUCLE NE VEILLE PAS L'ÉCRAN (#6221, volet énergie).
           `preventsDisplaySleepDuringVideoPlayback` vaut `true` par DÉFAUT :
           cette vignette muette, qui boucle indéfiniment dans chaque bulle,
           carte de feed, commentaire et rangée Focal, empêchait l'écran de
           s'éteindre tant qu'elle était montée. Personne ne « regarde » une
           vignette silencieuse en boucle — c'est la définition d'un décor.
           `RecentMediaStrip:900` et `AttachmentQuickLookPreview:50` le
           posaient déjà ; ce site, le plus instancié des six, ne l'avait pas. */
        queue.preventsDisplaySleepDuringVideoPlayback = false
        queue.automaticallyWaitsToMinimizeStalling = player.performance.waitsToMinimizeStalling
        looper = AVPlayerLooper(player: queue, templateItem: item)
        avPlayer = queue
        aspectRatio = player.attachment.videoAspectRatio
        queue.playImmediately(atRate: 1.0)
    }

    private func teardown() {
        looper?.disableLooping()
        looper = nil
        avPlayer?.pause()
        avPlayer = nil
    }
}
