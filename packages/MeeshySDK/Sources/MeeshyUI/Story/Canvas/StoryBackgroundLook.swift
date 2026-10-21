import CoreImage
import UIKit
import MeeshySDK

// MARK: - Le RENDU du fond d'une scène : filtre de slide, puis réglages (#9496)

/// **Ce que le fond d'une scène peint, en un seul endroit.**
///
/// Le fond est un `StoryMediaObject(isBackground: true)` : ses réglages
/// (`adjustments`) vivent sur le même champ que ceux d'une image posée (#9175)
/// et voyagent par le même transport (v1, CanvasV3, borne passerelle). Ce qui
/// manquait était le rendu — la couche de fond, la vignette composite et
/// l'export ne cuisaient que le filtre de SLIDE. Les trois passent désormais par
/// cette fonction, dans l'ordre de l'éditeur d'image : le filtre, puis les
/// réglages (loi 6 : l'aperçu est le lecteur, le lecteur est la pièce rendue).
///
/// Un fond VIDÉO suit la règle vidéo (#9169) : ni netteté ni flou, et rien du
/// tout — aucune composition, aucun coût par trame — quand la projection est
/// neutre.
public nonisolated enum StoryBackgroundLook {

    /// Les réglages que le fond de ces effets PEINT, projetés sur son genre ;
    /// `nil` sans fond, sans réglage, ou quand il ne reste rien à peindre.
    public static func adjustments(for effects: StoryEffects) -> ImageAdjustments? {
        guard let fond = effects.resolvedBackgroundMedia else { return nil }
        return painted(fond.adjustments, for: fond.kind)
    }

    /// La projection d'une charge sur ce qu'un fond de ce genre peint. Un genre
    /// inconnu (client plus récent) se lit comme une image.
    public static func painted(_ adjustments: ImageAdjustments?, for kind: StoryMediaKind?) -> ImageAdjustments? {
        guard let peints = adjustments?.served(for: kind ?? .image), peints.activeCount > 0 else { return nil }
        return peints
    }

    /// **La chaîne du look, pure** : le filtre de slide, puis les réglages, sur
    /// une source DÉJÀ redressée (`StoryRenderingContext.orientedSource`).
    /// C'est ce que l'aperçu et l'export rendent (loi 6) ; la source telle
    /// quelle quand il n'y a rien à peindre.
    public static func ciImage(_ source: CIImage, filter: StoryFilter?, intensity: Float,
                               adjustments: ImageAdjustments?) -> CIImage {
        let filtree = filter.map { StoryFilterProcessor.filtered(source, $0, intensity: intensity) } ?? source
        guard let adjustments, adjustments.activeCount > 0 else { return filtree }
        return ImageAdjustmentStage.apply(filtree, adjustments, extent: source.extent)
    }

    /// Le bitmap du fond tel qu'il se peint : la chaîne ci-dessus, cuite en UN
    /// passage (`StoryLookBake`). L'image elle-même, à l'identique, quand il
    /// n'y a ni filtre ni réglage.
    public static func image(_ image: UIImage, filter: StoryFilter?, intensity: Float,
                             adjustments: ImageAdjustments?, imageId: String?) -> UIImage {
        StoryLookBake.image(image, filter: filter, intensity: intensity, adjustments: adjustments, imageId: imageId)
    }

    /// Le bitmap du fond de ces effets — la vignette composite et l'export.
    public static func image(_ image: UIImage, effects: StoryEffects, imageId: String? = nil) -> UIImage {
        let intensity = Float(max(0.0, min(1.0, effects.filterIntensity ?? 1.0)))
        return Self.image(image, filter: effects.filter.flatMap(StoryFilter.init(rawValue:)), intensity: intensity,
                          adjustments: adjustments(for: effects), imageId: imageId)
    }

    /// Une trame DÉCODÉE du fond vidéo (export), réglée par la chaîne vidéo ;
    /// la trame telle quelle quand le fond ne peint rien.
    public static func videoFrame(_ frame: CIImage, effects: StoryEffects) -> CIImage {
        guard let reglages = adjustments(for: effects) else { return frame }
        return StoryVideoAdjustmentsProcessor.frame(frame, reglages)
    }
}
