import XCTest
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

/// **« Imager » rend la composition entière, et seul il choisit sa longueur**
/// (#13871, décision du porteur) : au-delà d'une minute, 1/4 · 2/4 ·
/// 3/4 · 4/4 depuis le début, choisis AVANT le rendu ; sous la minute, aucun
/// choix. « Enregistrer » et « Partager » ne coupent jamais.
@MainActor
final class StoryImagerTests: XCTestCase {

    @MainActor private final class Picker {
        var offered: [[ImagerLengthChoice]] = []
        var answer: ImagerQuarter?

        func pick(_ choices: [ImagerLengthChoice], _ choose: @escaping @MainActor (ImagerQuarter) -> Void) {
            offered.append(choices)
            if let answer { choose(answer) }
        }
    }

    private func makeSUT(picker: Picker) -> (StoryPhotoSaveService, ScriptedStoryExporter, StubPhotoSaver) {
        let exporter = ScriptedStoryExporter()
        let photos = StubPhotoSaver()
        let sut = StoryPhotoSaveService(
            exporter: exporter,
            photoSaver: photos,
            toasts: MockFeedbackToast(),
            preferredLanguages: { ["fr"] },
            intro: { nil },
            authorIntro: { _ in nil },
            pickImagerLength: { picker.pick($0, $1) }
        )
        return (sut, exporter, photos)
    }

    private func story(seconds: TimeInterval) -> StoryItem {
        var effects = StoryEffects(textObjects: [StoryTextObject(text: "Imager", startTime: 0, duration: seconds)])
        effects.timelineDuration = seconds
        return StoryItem(id: "story-\(UUID().uuidString)", content: "Imager", storyEffects: effects)
    }

    private func waitUntil(_ condition: () -> Bool) async {
        for _ in 0..<300 {
            if condition() { return }
            await Task.yield()
        }
        XCTFail("condition jamais vraie")
    }

    func test_imager_underAMinute_rendersEverything_withoutAsking() async {
        let picker = Picker()
        let (sut, exporter, photos) = makeSUT(picker: picker)

        sut.image(story: story(seconds: 45), author: nil)
        await waitUntil { photos.savedVideoURLs.count == 1 }

        XCTAssertTrue(picker.offered.isEmpty, "sous la minute, aucun choix")
        XCTAssertEqual(exporter.lastSlide?.computedTotalDuration(), 45)
    }

    func test_imager_fourMinutes_offersTheFourQuarters_beforeRendering() {
        let picker = Picker()
        let (sut, exporter, _) = makeSUT(picker: picker)

        sut.image(story: story(seconds: 240), author: nil)

        XCTAssertEqual(picker.offered, [ImagerLength.choices(total: 240)])
        XCTAssertEqual(picker.offered.first?.map(\.duration), [60, 120, 180, 240])
        XCTAssertEqual(exporter.prepareCallCount, 0, "le choix précède le rendu")
    }

    func test_imager_fourMinutesInTwoQuarters_rendersTwoMinutes_thenSavesToPhotos() async {
        let picker = Picker()
        picker.answer = .two
        let (sut, exporter, photos) = makeSUT(picker: picker)

        sut.image(story: story(seconds: 240), author: nil)
        await waitUntil { photos.savedVideoURLs.count == 1 }

        XCTAssertEqual(exporter.lastSlide?.computedTotalDuration(), 120)
        XCTAssertEqual(exporter.lastAppendsBrandOutro, true, "la story garde son habillage autour de la part rendue")
    }

    func test_imager_renouncing_rendersNothing() async {
        let picker = Picker()
        let (sut, exporter, photos) = makeSUT(picker: picker)

        sut.image(story: story(seconds: 240), author: nil)
        for _ in 0..<20 { await Task.yield() }

        XCTAssertEqual(exporter.prepareCallCount, 0)
        XCTAssertTrue(photos.savedVideoURLs.isEmpty)
    }

    func test_save_fourMinutes_neverAsks_andRendersEverything() async {
        let picker = Picker()
        let (sut, exporter, photos) = makeSUT(picker: picker)

        sut.save(story: story(seconds: 240), author: nil)
        await waitUntil { photos.savedVideoURLs.count == 1 }

        XCTAssertTrue(picker.offered.isEmpty, "« Enregistrer » rend TOUT")
        XCTAssertEqual(exporter.lastSlide?.computedTotalDuration(), 240)
    }

    func test_choiceLabel_saysTheQuarterAndItsDuration() {
        XCTAssertEqual(ImagerLengthPresenter.label(for: ImagerLengthChoice(quarter: .two, duration: 120)), "2/4 · 2:00")
        XCTAssertEqual(ImagerLengthPresenter.label(for: ImagerLengthChoice(quarter: .one, duration: 75.4)), "1/4 · 1:15")
        XCTAssertEqual(ImagerLengthPresenter.label(for: ImagerLengthChoice(quarter: .four, duration: 3725)), "4/4 · 1:02:05")
    }

    func test_storyMenu_offersImager_rightAfterTheVideoExport() {
        let plan = StoryOptionsMenuPlan.resolve(hasStory: true, isOwnStory: false, hasAudioTranscript: false, canCompose: true)
        XCTAssertTrue(plan.sections.contains([.compose, .exportVideo, .imager]))
        let bare = StoryOptionsMenuPlan.resolve(hasStory: false, isOwnStory: false, hasAudioTranscript: false, canCompose: true)
        XCTAssertFalse(bare.entries.contains(.imager), "sans story, rien à imager")
    }

    func test_storyMenu_imagerEntry_imagesTheCurrentStory_signedByItsAuthor() throws {
        let header = MyStoriesSourceCorpus.strippingComments(
            try AppSourceGuard.unit("Meeshy/Features/Stories/Views/StoryViewerView+Header.swift"))
        let start = try XCTUnwrap(header.range(of: "case .imager:"))
        let block = String(header[start.upperBound...].prefix(600))
        XCTAssertTrue(block.contains("StoryPhotoSaveService.shared.image(story: story, author: currentGroup.map(StoryExportAuthor.init(group:)))"))
        XCTAssertTrue(block.contains("MessageCardExportMenu.imageLabel"), "le mot « Imager » est celui de la conversation")
    }

    func test_reelMenu_offersImager_onlyForARenderedScene() throws {
        let player = MyStoriesSourceCorpus.strippingComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/ReelsPlayerView.swift"))
        XCTAssertTrue(player.contains("onImager: PostSaveAction.imagerAction(for: reel, coordinator: mediaSaveCoordinator)"))
        let menu = MyStoriesSourceCorpus.strippingComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/ReelsPlayerView+ActionRail.swift"))
        XCTAssertTrue(menu.contains("if let onImager"))
        XCTAssertTrue(menu.contains("MessageCardExportMenu.imageLabel"))
        let rules = MyStoriesSourceCorpus.strippingComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/ReelPlaybackRules.swift"))
        XCTAssertTrue(rules.contains("guard route(for: post, coordinator: coordinator) == .renderScene else { return nil }"))
        XCTAssertTrue(rules.contains("service.image(post: post)"))
    }
}
