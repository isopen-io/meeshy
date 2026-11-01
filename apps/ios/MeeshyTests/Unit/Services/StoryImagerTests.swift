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
        XCTAssertTrue(block.contains("StoryPhotoSaveService.shared.image(story: story, author: currentGroup.map { StoryExportAuthor.served(from: $0) })"))
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

    // MARK: - Même entrée, même ordre, partout où une œuvre composée s'enregistre

    private func composedPost() -> FeedPost {
        var post = FeedPost(id: "post-\(UUID().uuidString)", author: "alice", type: "POST", content: "Imager")
        var effects = StoryEffects(textObjects: [StoryTextObject(text: "Imager", startTime: 0, duration: 90)])
        effects.timelineDuration = 90
        post.storyEffects = effects
        return post
    }

    func test_imagerAction_existsForAComposedWork_only() {
        let open = MediaSaveCoordinator(exitGate: .open)
        XCTAssertNotNil(PostSaveAction.imagerAction(for: composedPost(), coordinator: open))
        XCTAssertNil(PostSaveAction.imagerAction(for: FeedPost(author: "alice", type: "POST", content: "texte"), coordinator: open),
                     "rien à rendre, rien à imager")
        XCTAssertNil(PostSaveAction.imagerAction(for: composedPost(), coordinator: MediaSaveCoordinator()),
                     "la loi de sortie gagne sur tout")
    }

    func test_imagerAction_rendersThePost_throughTheImagerPath() async {
        let picker = Picker()
        picker.answer = .one
        let (sut, exporter, photos) = makeSUT(picker: picker)
        let post = composedPost()

        let action = PostSaveAction.imagerAction(for: post, coordinator: MediaSaveCoordinator(exitGate: .open), service: sut)
        action?()
        await waitUntil { photos.savedVideoURLs.count == 1 }

        XCTAssertEqual(picker.offered.count, 1, "90 s : les quarts se choisissent d'abord")
        XCTAssertEqual(exporter.lastSlide?.computedTotalDuration(), 22.5)
    }

    /// L'entrée « Imager » suit « Sauvegarder », comme au lecteur de réels, et
    /// précède ce qui vient après dans chaque menu : l'hôte la pose par `call`,
    /// entre `save` et `next`.
    private func assertImagerFollows(_ save: String, before next: String, in path: String,
                                     calling call: String, file: StaticString = #filePath, line: UInt = #line) throws {
        let source = MyStoriesSourceCorpus.strippingComments(try AppSourceGuard.unit(path))
        let saveAt = try XCTUnwrap(source.range(of: save), "\(path) : \(save)", file: file, line: line)
        let imagerAt = try XCTUnwrap(source.range(of: call, range: saveAt.upperBound..<source.endIndex),
                                     "\(path) : « Imager » (\(call)) après « Sauvegarder »", file: file, line: line)
        let nextAt = try XCTUnwrap(source.range(of: next, range: saveAt.upperBound..<source.endIndex), file: file, line: line)
        XCTAssertLessThan(imagerAt.lowerBound, nextAt.lowerBound, "\(path) : « Imager » juste après « Sauvegarder »",
                          file: file, line: line)
    }

    /// Le couple partagé pose « Sauvegarder » PUIS « Imager » — l'ordre ne se
    /// réécrit plus chez chaque hôte.
    func test_theSharedSaveItems_putImagerRightAfterSave() throws {
        let items = MyStoriesSourceCorpus.strippingComments(
            try AppSourceGuard.unit("Meeshy/Features/Export/PostSaveMenuItems.swift"))
        let saveAt = try XCTUnwrap(items.range(of: "Button(action: save)"))
        let imagerAt = try XCTUnwrap(items.range(of: "ImagerMenuButton(action: imager)"))
        XCTAssertLessThan(saveAt.lowerBound, imagerAt.lowerBound)
        let button = MyStoriesSourceCorpus.strippingComments(
            try AppSourceGuard.unit("Meeshy/Features/Export/ImagerMenuButton.swift"))
        XCTAssertTrue(button.contains("if let action"), "rien à rendre ⇒ pas d'entrée")
        XCTAssertTrue(button.contains("MessageCardExportMenu.imageLabel"), "le mot « Imager » des autres menus")
    }

    func test_theFeedPostCard_offersImager_rightAfterSave() throws {
        try assertImagerFollows("\"feed.post.save\"", before: "PublicationViewersMenuButton",
                                in: "Meeshy/Features/Main/Views/FeedPostCard+Header.swift",
                                calling: "imager: imagerAction")
        let card = MyStoriesSourceCorpus.strippingComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/FeedPostCard.swift"))
        XCTAssertTrue(card.contains("PostSaveAction.imagerAction(for: post, coordinator: mediaSaveCoordinator)"))
    }

    func test_theReelFeedCard_offersImager_rightAfterSave() throws {
        try assertImagerFollows("\"feed.reel.save_media\"", before: "PublicationViewersMenuButton",
                                in: "Meeshy/Features/Main/Views/ReelFeedCard.swift",
                                calling: "ImagerMenuButton(action: PostSaveAction.imagerAction(for: post, coordinator: mediaSaveCoordinator))")
    }

    func test_thePostDetail_offersImager_rightAfterSave() throws {
        try assertImagerFollows("\"feed.post.save\"", before: "feed.post.pin",
                                in: "Meeshy/Features/Main/Views/PostDetailView.swift",
                                calling: "imager: displayPost.flatMap { PostSaveAction.imagerAction(for: $0, coordinator: mediaSaveCoordinator) }")
    }

    func test_theGalleryScene_offersImager_rightAfterSave_andImagesTheOpenScene() throws {
        try assertImagerFollows("Text(saveVerb)", before: "currentOffersForward",
                                in: "Meeshy/Features/Main/Views/ConversationMediaGalleryView+Menu.swift",
                                calling: "ImagerMenuButton(action: { imageCurrent(scene) })")
        let menu = MyStoriesSourceCorpus.strippingComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationMediaGalleryView+Menu.swift"))
        XCTAssertTrue(menu.contains("if case .scene(let scene) = subject"), "une pièce transmise n'a rien à imager")
        XCTAssertTrue(menu.contains("StoryPhotoSaveService.shared.image(scene: scene)"))
    }
}
