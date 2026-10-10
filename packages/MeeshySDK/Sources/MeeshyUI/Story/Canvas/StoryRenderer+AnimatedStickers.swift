import CoreMedia
import QuartzCore
import MeeshySDK

// MARK: - Stickers animés dans les rendus « en un coup »

extension StoryRenderer {

    /// **Avance les stickers ANIMÉS d'un arbre à l'instant `time`** (#8610).
    ///
    /// À l'écran, un GIF anime par une `CAKeyframeAnimation` que Core Animation
    /// fait tourner seul. Un rendu par `layer.render(in:)` — l'export MP4 — ne
    /// fait tourner AUCUNE animation : il peint la couche modèle, donc la
    /// première image. Le compositor appelle cette passe après avoir construit
    /// l'arbre, pour que chaque image de la vidéo porte l'image du GIF qu'un
    /// lecteur verrait au même instant.
    ///
    /// L'horloge part de l'APPARITION du sticker (`startTime`), comme la pose
    /// d'une décoration animée (#4821) : c'est à cet instant que la scène monte
    /// la couche et lance son animation.
    @MainActor
    public static func advanceAnimatedStickers(in tree: CALayer, at time: CMTime) {
        for layer in tree.sublayers ?? [] {
            guard let stickerLayer = layer as? StoryStickerLayer,
                  let sticker = stickerLayer.sticker else { continue }
            stickerLayer.showAnimatedFrame(atElapsed: time.seconds - (sticker.startTime ?? 0))
        }
    }
}
