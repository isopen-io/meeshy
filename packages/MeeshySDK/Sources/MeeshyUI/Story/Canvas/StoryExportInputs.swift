import UIKit
import MeeshySDK

/// **Ce que le moteur d'export reçoit À CÔTÉ de la slide** (#8599).
///
/// Une `StorySlide` ne suffit pas à peindre une scène : un sticker image ne
/// porte que l'identifiant de son `PostMedia`, une image retouchée au composer
/// ne vit qu'en mémoire (`loadedImages`), un son pas encore téléversé n'a
/// qu'un fichier de session. Le chemin des stories PUBLIÉES savait fournir la
/// première pièce ; le composer n'en fournissait aucune — ses stickers
/// sortaient sous leur repli 🖼️, ses retouches disparaissaient, ses sons se
/// taisaient.
///
/// Un seul type porte désormais les trois, pour les deux familles d'appelants :
/// la story publiée (`stickerImageSources` appariés depuis ses médias) et le
/// composer (`StoryComposerViewModel.exportInputs(for:)`). Le moteur est le
/// MÊME ; seule la provenance des entrées change.
///
/// `@unchecked Sendable` : `UIImage` est immuable une fois construite, et ces
/// entrées ne sont que LUES par le compositor, sur le main actor.
public struct StoryExportInputs: @unchecked Sendable {

    /// Adresses des images de stickers, keyées par `postMediaId` — distantes
    /// ou locales, rapatriées par `StoryExporter` avant la composition.
    public let stickerImageSources: [String: String]

    /// Bitmaps déjà en mémoire, keyés comme `StoryComposerViewModel.loadedImages`
    /// (id d'élément, ou `postMediaId` une fois publié). Ils PRIMENT sur toute
    /// adresse : c'est la version que l'auteur voit, retouches comprises.
    public let images: [String: UIImage]

    /// Fichiers audio de session, keyés par id d'`StoryAudioPlayerObject`.
    public let audioURLs: [String: URL]

    /// Octets ANIMÉS des stickers collés (GIF, APNG…), keyés comme `images`
    /// (#8610). `images[clé]` n'en porte que la PREMIÈRE image : sans les
    /// octets, un GIF collé sortait figé du fichier exporté.
    public let animations: [String: Data]

    public init(stickerImageSources: [String: String] = [:],
                images: [String: UIImage] = [:],
                audioURLs: [String: URL] = [:],
                animations: [String: Data] = [:]) {
        self.stickerImageSources = stickerImageSources
        self.images = images
        self.audioURLs = audioURLs
        self.animations = animations
    }

    public static let none = StoryExportInputs()

    /// Le résolveur que `StoryExporter.composeAudioLanes` consulte AVANT de
    /// retomber sur la `mediaURL` du son. `nil` quand aucun fichier de session
    /// n'existe : le repli par adresse reste alors seul juge.
    public var audioResolver: (@Sendable (StoryAudioPlayerObject) -> URL?)? {
        guard !audioURLs.isEmpty else { return nil }
        let urls = audioURLs
        return { audio in urls[audio.id] }
    }
}

extension StoryExporter {

    /// Forme de `export` qui reçoit ses entrées d'un bloc — celle qu'appellent
    /// les deux familles d'appelants, pour qu'aucune ne puisse oublier l'une
    /// des trois pièces en silence.
    public static func export(_ slide: StorySlide,
                              to outputURL: URL,
                              languages: [String] = [],
                              watermark: StoryExportWatermark? = nil,
                              branding: StoryExportBranding.Plan? = nil,
                              inputs: StoryExportInputs,
                              progress: (@Sendable (Double) -> Void)? = nil) async throws {
        try await export(slide, to: outputURL,
                         languages: languages,
                         watermark: watermark,
                         branding: branding,
                         audioResolver: inputs.audioResolver,
                         stickerImageSources: inputs.stickerImageSources,
                         images: inputs.images,
                         animations: inputs.animations,
                         progress: progress)
    }
}
