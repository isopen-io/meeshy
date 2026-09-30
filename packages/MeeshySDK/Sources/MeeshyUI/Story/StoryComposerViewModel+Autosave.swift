import UIKit
import MeeshySDK

extension StoryComposerViewModel {

    /// **Rend au ViewModel une composition relue d'un brouillon** (#8848).
    ///
    /// Point d'entrée PUBLIC pour un hôte app qui tient son propre brouillon (le
    /// meuble du composer) : `slides` et les dictionnaires de média sont
    /// `internal(set)`, et l'hôte n'a pas à les écrire champ par champ — un
    /// champ oublié rouvrirait une scène dont les objets pointent un média
    /// absent.
    ///
    /// Les médias passent par `mergeRestoredMedia`, le seul site qui fasse
    /// avancer `loadedImagesVersion` : sans lui le canvas ne reconstruit pas son
    /// lecteur d'images et les bitmaps restaurés restent invisibles.
    /// L'historique repart de l'état restauré — revenir « avant » le brouillon
    /// exposerait un composer vierge.
    public func restoreAutosavedComposition(slides restored: [StorySlide],
                                            currentSlideIndex index: Int,
                                            slideImages restoredBackgrounds: [String: UIImage],
                                            images: [String: UIImage],
                                            videoURLs: [String: URL],
                                            audioURLs: [String: URL],
                                            stickerAnimations: [String: Data]) {
        slides = restored.isEmpty ? [StorySlide()] : restored
        currentSlideIndex = min(max(0, index), slides.count - 1)
        slideImages = restoredBackgrounds
        loadedStickerAnimations.merge(stickerAnimations) { _, neuf in neuf }
        mergeRestoredMedia(images: images, videoURLs: videoURLs, audioURLs: audioURLs)
        seedHistory()
    }
}
