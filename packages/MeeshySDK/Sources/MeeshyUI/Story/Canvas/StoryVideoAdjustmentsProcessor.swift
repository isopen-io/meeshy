import AVFoundation
import CoreImage
import UIKit
import MeeshySDK

// MARK: - Les réglages d'une VIDÉO posée, peints trame par trame (#9169)

/// **Une vidéo posée se règle par la chaîne de l'image** — `ImageAdjustmentStage`,
/// la même que l'éditeur d'avatar et que `StoryMediaLayer.filtered` — restreinte
/// à ce qu'une vidéo peint (`ImageAdjustments.served(for: .video)`).
///
/// Deux chemins, une fonction de trame :
/// - la LECTURE (aperçu du composer, lecteur) pose `composition(for:adjustments:)`
///   sur l'item de son `AVPlayer` ; AVFoundation appelle la trame sur sa file de
///   rendu, hors du fil principal ;
/// - l'EXPORT décode ses trames (`StoryForegroundVideoFrameSource`) et les
///   règle par `apply(_:to:)`.
///
/// **Coût par trame** (dimensions 2 et 4) : UN `CIContext` pour toutes les
/// trames de toutes les vidéos, créé une fois — jamais par trame. La chaîne ne
/// porte que des noyaux par pixel (exposition, contrôles de couleur, vibrance,
/// température, vignette), que CoreImage fusionne en une passe GPU ; le flou
/// gaussien, seul étage multi-passes, n'est pas servi à une vidéo. Les
/// `CIFilter` de la chaîne sont des descriptions légères reconstruites par
/// trame — c'est aussi ce qui la rend sûre sur la file concurrente
/// d'AVFoundation, un `CIFilter` n'étant pas partageable entre fils.
public nonisolated enum StoryVideoAdjustmentsProcessor {

    /// Le contexte partagé. Les intermédiaires ne sont pas gardés en cache :
    /// une trame vidéo ne se rejoue jamais à l'identique.
    static let context = CIContext(options: [.cacheIntermediates: false])

    /// Les réglages que cette vidéo POSÉE peint, `nil` quand il n'y a rien à
    /// peindre — une image, un fond (#9496), une vidéo sans réglage actif ou
    /// dont la charge ne porte que des réglages non servis à une vidéo. `nil`
    /// ⇒ aucune composition : la vidéo passe par le compositeur natif.
    public static func paintedAdjustments(for media: StoryMediaObject) -> ImageAdjustments? {
        guard media.kind == .video, !media.isBackground,
              let peints = media.adjustments?.served(for: .video), peints.activeCount > 0 else { return nil }
        return peints
    }

    /// Une trame réglée — CIImage → CIImage, pure, dans le cadre de la source.
    public static func frame(_ source: CIImage, _ adjustments: ImageAdjustments) -> CIImage {
        paint(source, adjustments.served(for: .video))
    }

    /// La chaîne seule, sur des réglages DÉJÀ projetés : c'est ce que la
    /// composition appelle à chaque trame, la projection ayant été faite une
    /// fois à sa construction.
    static func paint(_ source: CIImage, _ projected: ImageAdjustments) -> CIImage {
        guard !projected.isNeutral else { return source }
        return ImageAdjustmentStage.apply(source, projected, extent: source.extent).cropped(to: source.extent)
    }

    /// La composition qui peint ces réglages sur la première piste vidéo de
    /// `asset` — celle que la lecture pose sur son `AVPlayerItem`.
    public static func composition(for asset: AVAsset,
                                   adjustments: ImageAdjustments) async throws -> AVVideoComposition {
        let peints = adjustments.served(for: .video)
        return try await AVVideoComposition.videoComposition(with: asset, applyingCIFiltersWithHandler: { request in
            request.finish(with: Self.paint(request.sourceImage, peints), context: Self.context)
        })
    }

    /// Une trame DÉCODÉE (export), réglée par la même chaîne ; la trame telle
    /// quelle si cette vidéo ne peint rien.
    public static func apply(_ media: StoryMediaObject, to image: CGImage) -> CGImage {
        guard let reglages = paintedAdjustments(for: media) else { return image }
        let source = CIImage(cgImage: image)
        return context.createCGImage(frame(source, reglages), from: source.extent) ?? image
    }

    /// L'affiche d'une vidéo (vignette composite, `StorySlideRenderer`) réglée
    /// comme ses trames ; l'affiche telle quelle si la vidéo ne peint rien.
    public static func poster(_ image: UIImage, for media: StoryMediaObject) -> UIImage {
        guard let reglages = paintedAdjustments(for: media) else { return image }
        return StoryMediaAdjustmentsProcessor.apply(reglages, to: image,
                                                    imageId: "\(media.id)-poster-\(ObjectIdentifier(image).hashValue)")
    }
}
