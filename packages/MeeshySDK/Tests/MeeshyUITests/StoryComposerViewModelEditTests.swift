import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

// MARK: - StoryComposerViewModelEditTests
//
// Mode ÉDITION d'une story publiée (directive 2026-07-29) : contrairement au
// repost (conversion lossy + badge d'attribution), l'hydratation d'édition est
// FIDÈLE — effects verbatim, médias pointés sur leurs assets serveur, contexte
// d'édition capturé pour le diff `removeMediaIds` au publish.
@MainActor
final class StoryComposerViewModelEditTests: XCTestCase {

    func test_init_editing_capturesPostIdAndSingleFaithfulSlide() {
        var effects = StoryEffects()
        effects.textObjects = [
            StoryTextObject(
                id: "t1", text: "Bonjour", x: 0.4, y: 0.3,
                scale: 1.2, rotation: 0, fontSize: 22,
                textStyle: "bold", textColor: "FFFFFF",
                textAlign: "center", textBg: nil
            )
        ]
        let story = makeStoryItem(id: "post-42", content: "Bonjour", storyEffects: effects)

        let vm = StoryComposerViewModel(editing: story)

        XCTAssertEqual(vm.editingPostId, "post-42")
        XCTAssertEqual(vm.slides.count, 1)
        XCTAssertEqual(vm.slides[0].content, "Bonjour")
        XCTAssertNotEqual(vm.slides[0].id, "post-42", "La slide d'édition a un id frais")
        XCTAssertEqual(vm.currentEffects.textObjects.map(\.id), ["t1"],
                       "Les effects sont repris VERBATIM — aucun badge ajouté")
        XCTAssertFalse(vm.currentEffects.textObjects.contains { $0.isLocked == true },
                       "Pas de badge d'attribution en mode édition (≠ repost)")
    }

    func test_init_editing_neverSetsRepostChain() {
        let vm = StoryComposerViewModel(editing: makeStoryItem(id: "post-1"))
        XCTAssertNil(vm.repostOfId)
        XCTAssertNil(vm.originalRepostOfId)
    }

    func test_init_editing_capturesOriginalMediaIds() {
        let media = [
            FeedMedia(id: "bg-1", type: .image, url: "/api/v1/attachments/file/bg.jpg"),
            FeedMedia(id: "fg-1", type: .image, url: "/api/v1/attachments/file/fg.jpg"),
        ]
        var effects = StoryEffects()
        effects.mediaObjects = [
            StoryMediaObject(id: "obj-1", postMediaId: "fg-1", kind: .image, aspectRatio: 1)
        ]
        let story = makeStoryItem(id: "post-9", media: media, storyEffects: effects)

        let vm = StoryComposerViewModel(editing: story)

        XCTAssertEqual(vm.editingOriginalMediaIds, ["bg-1", "fg-1"])
        XCTAssertEqual(vm.editingOriginalBackgroundMediaId, "bg-1",
                       "Le premier média non référencé par le canvas est le fond")
    }

    func test_init_editing_firstMediaReferencedByCanvas_isNotBackground() {
        let media = [FeedMedia(id: "fg-1", type: .image, url: "/api/v1/attachments/file/fg.jpg")]
        var effects = StoryEffects()
        effects.mediaObjects = [
            StoryMediaObject(id: "obj-1", postMediaId: "fg-1", kind: .image, aspectRatio: 1)
        ]
        let story = makeStoryItem(id: "post-10", media: media, storyEffects: effects)

        let vm = StoryComposerViewModel(editing: story)

        XCTAssertNil(vm.editingOriginalBackgroundMediaId,
                     "Un média déjà référencé par un objet du canvas n'est pas un fond")
    }

    func test_init_editing_firstMediaReferencedByCanvas_isNotPaintedAsBackground() {
        let media = [FeedMedia(id: "fg-1", type: .image, url: "/api/v1/attachments/file/fg.jpg")]
        var effects = StoryEffects()
        effects.mediaObjects = [
            StoryMediaObject(id: "obj-1", postMediaId: "fg-1", kind: .image, aspectRatio: 1)
        ]

        let vm = StoryComposerViewModel(editing: makeStoryItem(id: "post-12", media: media, storyEffects: effects))

        XCTAssertNil(vm.slides[0].mediaURL,
                     "Le média d'un objet ne se peint pas une seconde fois en fond de slide")
    }

    func test_init_editing_freeFirstImage_isTheBackground() {
        let media = [FeedMedia(id: "bg-1", type: .image, url: "/api/v1/attachments/file/bg.jpg")]

        let vm = StoryComposerViewModel(editing: makeStoryItem(id: "post-13", media: media))

        XCTAssertEqual(vm.slides[0].mediaURL, "/api/v1/attachments/file/bg.jpg")
        XCTAssertEqual(vm.editingOriginalBackgroundMediaId, "bg-1")
    }

    func test_publicationEditHydration_shownMediaIds_coversObjectsAndEveryFreeVisual() {
        let media = [
            FeedMedia(id: "bg-1", type: .image, url: "/bg.jpg"),
            FeedMedia(id: "fg-1", type: .image, url: "/fg.jpg"),
            FeedMedia(id: "orphelin", type: .image, url: "/o.jpg"),
        ]
        var effects = StoryEffects()
        effects.mediaObjects = [StoryMediaObject(id: "obj-1", postMediaId: "fg-1", kind: .image, aspectRatio: 1)]

        XCTAssertEqual(PublicationEditHydration.shownMediaIds(media: media, effects: effects),
                       ["bg-1", "fg-1", "orphelin"], "Une image libre de plus devient sa propre slide (#15631)")
    }

    func test_publicationEditHydration_background_isNeverAnAudio_theAudioBecomesAPlayer() {
        let media = [FeedMedia(id: "son", type: .audio, url: "/son.m4a")]

        XCTAssertNil(PublicationEditHydration.background(media: media, effects: nil))
        XCTAssertEqual(PublicationEditHydration.shownMediaIds(media: media, effects: nil), ["son"])
    }

    func test_init_editing_seedsVisibilityContext() {
        let story = StoryItem(
            id: "post-11", content: nil, media: [], storyEffects: nil,
            createdAt: Date(), expiresAt: nil,
            visibility: "ONLY", visibilityUserIds: ["u1", "u2"],
            isViewed: false
        )

        let vm = StoryComposerViewModel(editing: story)

        XCTAssertEqual(vm.editingInitialVisibility, "ONLY")
        XCTAssertEqual(vm.editingInitialVisibilityUserIds, ["u1", "u2"])
    }

    func test_init_plain_hasNoEditingContext() {
        let vm = StoryComposerViewModel()
        XCTAssertNil(vm.editingPostId)
        XCTAssertTrue(vm.editingOriginalMediaIds.isEmpty)
        XCTAssertNil(vm.editingOriginalBackgroundMediaId)
        XCTAssertNil(vm.editingInitialVisibility)
    }

    // MARK: - Factories

    private func makeStoryItem(
        id: String = "story-x",
        content: String? = "Hello",
        media: [FeedMedia] = [],
        storyEffects: StoryEffects? = nil
    ) -> StoryItem {
        StoryItem(
            id: id,
            content: content,
            media: media,
            storyEffects: storyEffects,
            createdAt: Date(),
            expiresAt: nil,
            visibility: "PUBLIC",
            isViewed: false
        )
    }
}
