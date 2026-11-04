import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **Une publication rouverte pour être MODIFIÉE montre tous ses médias** (#15631) :
/// une slide par scène de canevas, puis une par image ou vidéo qu'aucun objet
/// ne désigne ; un son libre devient un lecteur ; un document reste hors scène.
@MainActor
final class PublicationEditScenesTests: XCTestCase {

    func test_scenes_noCanvasThreeVisuals_oneScenePerVisualInPostOrder() {
        let scenes = PublicationEditHydration.scenes(media: [media("i1", .image), media("v2", .video),
                                                             media("i3", .image)], effects: nil)
        XCTAssertEqual(scenes.map(\.background?.id), ["i1", "v2", "i3"])
    }

    func test_scenes_freeAudio_becomesAPlayerOnTheFirstScene() {
        let scenes = PublicationEditHydration.scenes(media: [media("a1", .audio)], effects: nil)
        XCTAssertEqual(scenes.count, 1)
        XCTAssertEqual(scenes[0].effects.audioPlayerObjects?.map(\.postMediaId), ["a1"])
        XCTAssertNil(scenes[0].background)
    }

    func test_shownMediaIds_document_staysOutside() {
        let montres = PublicationEditHydration.shownMediaIds(media: [media("i1", .image), media("d2", .document)],
                                                             effects: nil)
        XCTAssertEqual(montres, ["i1"])
    }

    func test_scenes_twoCanvasScenes_oneScenePerCanvasScene() {
        let scenes = PublicationEditHydration.scenes(media: [media("i1", .image), media("i2", .image)],
                                                     effects: twoScenes())
        XCTAssertEqual(scenes.map { ($0.effects.mediaObjects ?? []).map(\.postMediaId) }, [["i1"], ["i2"]])
        XCTAssertEqual(scenes.compactMap(\.background).count, 0)
    }

    func test_initEditingPublication_slidesFollowTheScenes_contentOnTheFirstOnly() {
        let publication = StoryItem(id: "p1", content: "Bonjour", media: [media("i1", .image), media("i2", .image)],
                                    storyEffects: nil, createdAt: Date())
        let vm = PublicationEditComposer.composer(editing: publication)

        XCTAssertEqual(vm.editingPostId, "p1")
        XCTAssertEqual(vm.slides.map(\.mediaURL), ["/f/i1", "/f/i2"])
        XCTAssertEqual(vm.slides.map(\.content), ["Bonjour", nil])
        XCTAssertEqual(vm.editingOriginalBackgroundMediaId, "i1")
    }

    func test_preloadTargets_backgroundsBySlide_objectsByObject() {
        let publication = StoryItem(id: "p1", content: nil, media: [media("i1", .image), media("i2", .image)],
                                    storyEffects: twoScenes(), createdAt: Date())
        let vm = PublicationEditComposer.composer(editing: publication)
        let cibles = PublicationEditHydration.preloadTargets(slides: vm.slides, media: publication.media)

        XCTAssertEqual(cibles.map(\.storageKey), ["obj-i1", "obj-i2"])
        XCTAssertTrue(cibles.allSatisfy { $0.destination == .canvasObject })
    }

    private func media(_ id: String, _ type: FeedMediaType) -> FeedMedia {
        FeedMedia(id: id, type: type, url: "/f/\(id)")
    }

    private func twoScenes() -> StoryEffects {
        let scenes: [StoryEffects] = ["i1", "i2"].map { id in
            var e = StoryEffects()
            e.mediaObjects = [StoryMediaObject(id: "obj-\(id)", postMediaId: id, kind: .image, aspectRatio: 1)]
            return e
        }
        var effets = scenes[0]
        effets.canvasV3 = CanvasV3(migrating: scenes)
        return effets
    }
}
