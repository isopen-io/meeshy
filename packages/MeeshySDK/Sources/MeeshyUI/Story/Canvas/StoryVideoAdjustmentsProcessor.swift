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
/// trames de toutes les vidéos, celui du domaine — jamais un par trame. La chaîne ne
/// porte que des noyaux par pixel (exposition, contrôles de couleur, vibrance,
/// température, vignette), que CoreImage fusionne en une passe GPU ; le flou
/// gaussien, seul étage multi-passes, n'est pas servi à une vidéo. Les
/// `CIFilter` de la chaîne sont des descriptions légères reconstruites par
/// trame — c'est aussi ce qui la rend sûre sur la file concurrente
/// d'AVFoundation, un `CIFilter` n'étant pas partageable entre fils.
public nonisolated enum StoryVideoAdjustmentsProcessor {

    /// Le contexte du domaine (#9873) : celui du canvas, que le compositeur
    /// d'export emploie déjà — une trame réglée en lecture et la même trame
    /// exportée sont rendues dans les mêmes espaces de couleur.
    static var context: CIContext { StoryRenderingContext.shared.ciContext }

    /// Les réglages que cette vidéo POSÉE peint, `nil` quand il n'y a rien à
    /// peindre — une image, un fond (#9496), une vidéo sans réglage actif ou
    /// dont la charge ne porte que des réglages non servis à une vidéo. `nil`
    /// ⇒ aucune composition : la vidéo passe par le compositeur natif.
    public static func paintedAdjustments(for media: StoryMediaObject) -> ImageAdjustments? {
        guard media.kind == .video, !media.isBackground,
              let peints = media.adjustments?.served(for: .video), peints.activeCount > 0 else { return nil }
        return peints
    }

    /// **Le look de la retouche que cette vidéo POSÉE peint** (#13840), `nil`
    /// sans look, pour un fond (sa couche a son propre chemin) ou sans peintre.
    public static func paintedLook(for media: StoryMediaObject) -> StoryMediaLook? {
        guard media.kind == .video, !media.isBackground else { return nil }
        return StoryMediaLookPainterRegistry.paintable(media.look)
    }

    /// Cette vidéo demande-t-elle une composition — un look ou des réglages ?
    public static func paints(_ media: StoryMediaObject) -> Bool {
        paintedLook(for: media) != nil || paintedAdjustments(for: media) != nil
    }

    /// La signature de ce que la composition peint — vide quand elle ne peint rien.
    public static func signature(look: StoryMediaLook?, adjustments: ImageAdjustments?) -> String {
        guard look != nil || adjustments != nil else { return "" }
        return (look?.signature ?? "-") + "#" + (adjustments.map(StoryMediaAdjustmentsProcessor.signature) ?? "-")
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
        try await composition(for: asset, adjustments: adjustments, look: nil)
    }

    /// La composition qui peint le look de la retouche (#13840) PUIS les
    /// réglages — l'ordre de la publication, qui cuit le look dans les octets.
    public static func composition(for asset: AVAsset, adjustments: ImageAdjustments?,
                                   look: StoryMediaLook?) async throws -> AVVideoComposition {
        let peints = adjustments?.served(for: .video) ?? .neutral
        return try await AVVideoComposition.videoComposition(with: asset, applyingCIFiltersWithHandler: { request in
            let regardee = StoryMediaLookPainterRegistry.painted(request.sourceImage, look: look, still: false)
            request.finish(with: Self.paint(regardee, peints), context: Self.context)
        })
    }

    /// Une trame DÉCODÉE (export), réglée par la même chaîne ; la trame telle
    /// quelle si cette vidéo ne peint rien.
    public static func apply(_ media: StoryMediaObject, to image: CGImage) -> CGImage {
        apply(look: paintedLook(for: media), adjustments: paintedAdjustments(for: media), to: image)
    }

    /// La même chaîne sur un look et des réglages DÉJÀ résolus — ceux d'une
    /// vidéo posée, ou ceux qu'un fond vidéo pose sur son player (#14180).
    public static func apply(look: StoryMediaLook?, adjustments: ImageAdjustments?, to image: CGImage) -> CGImage {
        guard look != nil || adjustments != nil else { return image }
        let source = CIImage(cgImage: image)
        let regardee = StoryMediaLookPainterRegistry.painted(source, look: look, still: false)
        let peinte = adjustments.map { frame(regardee, $0) } ?? regardee
        return context.createCGImage(peinte, from: source.extent) ?? image
    }

    /// L'affiche d'une vidéo (vignette composite, `StorySlideRenderer`) réglée
    /// comme ses trames ; l'affiche telle quelle si la vidéo ne peint rien.
    public static func poster(_ image: UIImage, for media: StoryMediaObject) -> UIImage {
        let reglages = paintedAdjustments(for: media)
        guard let regard = paintedLook(for: media) else {
            guard let reglages else { return image }
            return StoryMediaAdjustmentsProcessor.apply(reglages, to: image,
                                                        imageId: "\(media.id)-poster-\(ObjectIdentifier(image).hashValue)")
        }
        return StoryLookBake.image(image, filter: nil, intensity: 1, adjustments: reglages,
                                   imageId: "\(media.id)-poster", look: regard)
    }
}
