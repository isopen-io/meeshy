import UIKit
import MeeshySDK

/// Ce qu'un brouillon de « Mes stories » rend à l'HÔTE en plus de la scène :
/// l'audience, la langue déclarée, et les médias que l'appareil a perdus.
/// La scène elle-même est reposée sur le ViewModel par la restauration.
public nonisolated struct StoryStoredDraftRestoration: Equatable, Sendable {
    public let visibility: String
    public let visibilityUserIds: [String]
    public let originalLanguage: String?
    public let lostMediaCount: Int

    public init(visibility: String, visibilityUserIds: [String], originalLanguage: String?, lostMediaCount: Int) {
        self.visibility = visibility
        self.visibilityUserIds = visibilityUserIds
        self.originalLanguage = originalLanguage
        self.lostMediaCount = lostMediaCount
    }
}

/// Ce que l'hôte remet au brouillon en plus de la scène, à chaque écriture.
public nonisolated struct StoryStoredDraftFrame: Equatable, Sendable {
    public let visibility: String
    public let visibilityUserIds: [String]
    public let originalLanguage: String?

    public init(visibility: String, visibilityUserIds: [String], originalLanguage: String?) {
        self.visibility = visibility
        self.visibilityUserIds = visibilityUserIds
        self.originalLanguage = originalLanguage
    }
}

/// **Le brouillon de « Mes stories », tenu par le ViewModel et non par une vue**
/// (#15629).
///
/// La reprise et l'écriture vivaient dans `StoryComposerView` : un hôte qui
/// compose ailleurs que dans l'atelier adoptait l'identifiant du brouillon
/// (`adoptDraft(id:)`) et rouvrait une scène VIDE — rien ne relisait le
/// magasin. Elles sont ici, où tout hôte les atteint.
@MainActor
public enum StoryStoredDraft {

    /// Repose sur la scène le brouillon adopté — slides, médias, historique.
    /// `nil` si la session n'a adopté aucun brouillon, ou si le magasin n'en a
    /// plus trace : la scène reste alors telle que l'hôte l'a construite.
    @discardableResult
    public static func restoreAdopted(into scene: StoryComposerViewModel,
                                      from store: StoryDraftStore = .shared) -> StoryStoredDraftRestoration? {
        let draftId = scene.draftId
        guard scene.isAdoptedDraftSession, let stored = store.load(draftId: draftId) else { return nil }
        scene.slides = stored.slides.isEmpty ? [StorySlide()] : stored.slides
        scene.currentSlideIndex = 0
        scene.applyPersistedCommandHistory(store.loadCommandHistoryBlob(draftId: draftId))
        let media = store.loadMedia(draftId: draftId)
        let session = StoryStoredDraftMedia.sessionDirectory(for: draftId)
        scene.mergeRestoredMedia(
            images: media.images,
            videoURLs: StoryStoredDraftMedia.sessionSafeURLs(media.videoURLs, sessionDirectory: session),
            audioURLs: StoryStoredDraftMedia.sessionSafeURLs(media.audioURLs, sessionDirectory: session)
        )
        if !media.lostElementIds.isEmpty {
            store.purgeLostMedia(media.lostElementIds, draftId: draftId)
        }
        scene.seedHistory()
        return StoryStoredDraftRestoration(visibility: stored.visibility,
                                           visibilityUserIds: stored.visibilityUserIds,
                                           originalLanguage: stored.originalLanguage,
                                           lostMediaCount: media.lostElementIds.count)
    }

    /// Écrit la composition sous `draftId`, avec le lien d'édition s'il y en a
    /// un : rouvrir le brouillon rouvre alors l'édition, jamais une story neuve.
    /// Les médias ne sont recopiés que si leur ensemble a changé depuis la
    /// dernière écriture — `lastStoredMediaKeys` le dit.
    @discardableResult
    public static func persist(_ scene: StoryComposerViewModel, frame: StoryStoredDraftFrame,
                               to store: StoryDraftStore = .shared,
                               lastStoredMediaKeys: Set<String>?) -> Set<String> {
        if scene.isTimelineVisible { scene.commitTimelineToCurrentSlide() }
        let draftId = scene.draftId
        let estampillees = scene.slides.map { slide in
            var estampillee = slide
            estampillee.effects.thumbHash = StorySlideRenderer.computeThumbHash(
                slide: slide, bgImage: scene.slideImages[slide.id], loadedImages: scene.loadedImages)
            return estampillee
        }
        store.save(draftId: draftId, slides: estampillees, visibility: frame.visibility,
                   visibilityUserIds: frame.visibilityUserIds, originalLanguage: frame.originalLanguage,
                   editingPostId: scene.editingPostId)
        if let historique = scene.commandHistoryBlobForPersistence() {
            store.saveCommandHistoryBlob(historique, draftId: draftId)
        }
        storeCover(of: scene, firstSlide: estampillees.first)
        let cles = StoryStoredDraftMedia.keys(images: scene.loadedImages, videos: scene.loadedVideoURLs,
                                              audios: scene.loadedAudioURLs)
        guard cles != lastStoredMediaKeys else { return cles }
        store.saveMedia(draftId: draftId, images: scene.loadedImages, videoURLs: scene.loadedVideoURLs,
                        audioURLs: scene.loadedAudioURLs)
        return cles
    }

    private static func storeCover(of scene: StoryComposerViewModel, firstSlide: StorySlide?) {
        guard let firstSlide,
              let jpeg = StoryStaticSnapshot.render(slide: firstSlide, loadedImages: scene.loadedImages,
                                                    bgImage: scene.slideImages[firstSlide.id],
                                                    size: StoryCoverCacheKey.renderSize)?
                .jpegData(compressionQuality: 0.85) else { return }
        let cle = StoryCoverCacheKey.key(for: scene.draftId)
        Task { await CacheCoordinator.shared.thumbnails.store(jpeg, for: cle) }
    }
}

/// Les fichiers d'un brouillon repris, mis à l'abri de son magasin.
///
/// Les URLs de `loadMedia` pointent DANS le répertoire que la publication
/// efface au hand-off : la file les copierait après leur destruction. La
/// session ne garde que des copies hors du magasin (clone APFS) ; une copie qui
/// échoue retombe sur l'URL d'origine.
public nonisolated enum StoryStoredDraftMedia {

    public static func keys(images: [String: UIImage], videos: [String: URL], audios: [String: URL]) -> Set<String> {
        Set(images.keys).union(videos.keys).union(audios.keys)
    }

    public static func sessionDirectory(for draftId: String) -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy_draft_session", isDirectory: true)
            .appendingPathComponent(draftId, isDirectory: true)
    }

    public static func sessionSafeURLs(_ urls: [String: URL], sessionDirectory: URL,
                                       fileManager: FileManager = .default) -> [String: URL] {
        guard !urls.isEmpty,
              (try? fileManager.createDirectory(at: sessionDirectory, withIntermediateDirectories: true)) != nil
        else { return urls }
        return urls.mapValues { source in
            let destination = sessionDirectory.appendingPathComponent(source.lastPathComponent)
            try? fileManager.removeItem(at: destination)
            return (try? fileManager.copyItem(at: source, to: destination)) != nil ? destination : source
        }
    }
}
