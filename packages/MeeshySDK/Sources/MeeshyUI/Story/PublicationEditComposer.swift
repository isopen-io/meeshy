import UIKit
import MeeshySDK

/// **Le ViewModel de scène d'un POST ou d'un RÉEL rouvert pour être MODIFIÉ**
/// (#15631) — une slide par scène que `PublicationEditHydration.scenes` rend :
/// chaque scène de canevas, puis chaque image ou vidéo qu'aucun objet ne
/// désigne.
///
/// Il part de l'hydratation d'une story rouverte (`init(editing:)`), qui pose
/// le contexte d'édition et les références, puis remplace sa slide unique par
/// les scènes de la publication. Les URLs restent pointées sur les médias du
/// serveur ; seul le préchargement diffère, slide par slide.
@MainActor
public enum PublicationEditComposer {

    public static func composer(editing publication: StoryItem) -> StoryComposerViewModel {
        let composer = StoryComposerViewModel(editing: publication)
        composer.preloadTask?.cancel()
        let scenes = PublicationEditHydration.scenes(media: publication.media, effects: publication.storyEffects)
        composer.editingOriginalBackgroundMediaId = scenes[0].background?.id
        composer.slides = scenes.enumerated().map { rang, scene in
            var slide = StorySlide(id: UUID().uuidString, mediaURL: scene.background?.url, mediaData: nil,
                                   content: rang == 0 ? publication.content : nil, effects: scene.effects,
                                   duration: 6, order: rang)
            slide.duration = slide.computedTotalDuration()
            return slide
        }
        composer.currentSlideIndex = 0
        let cibles = PublicationEditHydration.preloadTargets(slides: composer.slides, media: publication.media)
        composer.preloadTask = Task { [weak composer] in
            await withTaskGroup(of: (RepostMediaPreload.Target, UIImage?).self) { group in
                for cible in cibles {
                    group.addTask { (cible, await CacheCoordinator.shared.images.image(for: cible.url.absoluteString)) }
                }
                for await (cible, image) in group {
                    guard !Task.isCancelled, let composer, let image else { continue }
                    place(image, for: cible, in: composer)
                }
            }
        }
        return composer
    }

    private static func place(_ image: UIImage, for cible: RepostMediaPreload.Target, in composer: StoryComposerViewModel) {
        switch cible.destination {
        case .slideBackground:
            guard composer.slideImages[cible.storageKey] == nil else { return }
            composer.slideImages[cible.storageKey] = image
        case .canvasObject:
            composer.registerLoadedImage(image, for: cible.storageKey)
        }
    }
}
