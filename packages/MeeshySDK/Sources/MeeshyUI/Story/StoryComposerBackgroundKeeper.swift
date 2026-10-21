import UIKit
import MeeshySDK

/// **Le gardien du fond figé d'une story recomposée d'autrui** (#9994).
///
/// Le ViewModel l'interroge là où toute écriture aboutit — les `didSet` de
/// `slides` et de `slideImages` — et aux commandes qui ont des effets de bord
/// hors de la slide (supprimer un objet ou une slide, basculer fond / premier
/// plan), qui refusent avant d'agir pour ne libérer aucun actif. La règle de ce
/// qui est figé vit dans `StoryBackgroundLock` ; ce type y ajoute l'image de
/// fond héritée, qui vit hors de la slide.
struct StoryComposerBackgroundKeeper {
    let lock: StoryBackgroundLock
    /// Le bitmap de fond hérité que `slideImages` doit garder sous la slide.
    let image: UIImage?

    /// Les slides corrigées, ou `nil` quand le fond n'a pas été touché.
    func kept(_ slides: [StorySlide]) -> [StorySlide]? {
        guard let index = slides.firstIndex(where: { $0.id == lock.slideId }),
              let fixed = lock.enforced(slides[index]) else { return nil }
        var kept = slides
        kept[index] = fixed
        return kept
    }

    /// Les images corrigées, ou `nil` quand l'image héritée est en place.
    func kept(_ images: [String: UIImage]) -> [String: UIImage]? {
        guard images[lock.slideId] !== image else { return nil }
        var kept = images
        kept[lock.slideId] = image
        return kept
    }

    func refuses(objectId: String) -> Bool { lock.backgroundObjectId == objectId }

    func refuses(slideId: String) -> Bool { lock.slideId == slideId }
}
