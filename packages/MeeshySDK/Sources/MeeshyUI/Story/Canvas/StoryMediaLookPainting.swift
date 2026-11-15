import CoreImage
import Foundation
import MeeshySDK
import os

// MARK: - Le peintre du look d'un média, injecté par l'app (#13840)

/// **Ce que le SDK demande au peintre de l'app** : poser un look (filtre, cadre,
/// effet de visage, cadrage de l'appel — identifiants opaques) sur une image.
///
/// Le SDK ne connaît aucun de ces rendus : l'app les nomme et les peint, par le
/// MÊME peintre qu'au viseur et qu'à la publication (loi 6 : l'aperçu est la
/// pièce rendue). Le canvas, la vignette composite et la capture d'export
/// l'appellent pour tout média qui porte un `look`, image comme trame vidéo.
///
/// Contrat : l'image rendue a la MÊME étendue que la source (un cadre se pose
/// dans le cadre du média, il n'en change pas les proportions). `still` : une
/// photo, dont le visage se cherche sur elle ; sinon une trame de vidéo.
/// Appelé hors du fil principal, y compris sur la file de rendu d'AVFoundation.
public protocol StoryMediaLookPainting: Sendable {
    nonisolated func paint(_ image: CIImage, look: StoryMediaLook, still: Bool) -> CIImage
}

/// **Le peintre posé par l'app au démarrage** — `nil` tant qu'aucune app ne l'a
/// posé : un look se lit alors comme neutre (la source telle quelle), jamais
/// comme une erreur.
public nonisolated enum StoryMediaLookPainterRegistry {

    private static let slot = OSAllocatedUnfairLock<(any StoryMediaLookPainting)?>(initialState: nil)

    public static var painter: (any StoryMediaLookPainting)? {
        get { slot.withLock { $0 } }
        set { slot.withLock { $0 = newValue } }
    }

    /// Le look à peindre pour cet objet : `nil` s'il ne peint rien ou si aucun
    /// peintre n'est posé.
    public static func paintable(_ look: StoryMediaLook?) -> StoryMediaLook? {
        guard let look, !look.isNeutral, painter != nil else { return nil }
        return look
    }

    /// La source peinte de ce look, ou la source telle quelle.
    public static func painted(_ image: CIImage, look: StoryMediaLook?, still: Bool) -> CIImage {
        guard let look = paintable(look), let painter else { return image }
        return painter.paint(image, look: look, still: still).cropped(to: image.extent)
    }
}
