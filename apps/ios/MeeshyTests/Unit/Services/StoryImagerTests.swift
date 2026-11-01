import XCTest
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

/// **« Imager » OUVRE LA VUE IMAGER, et c'est elle qui enregistre ou partage**
/// (#14325, retour porteur : « Imager d'un réel sauvegarde directement au lieu
/// d'imager ! »). La vue montre la composition, offre au-delà d'une minute
/// 1/4 · 2/4 · 3/4 · 4/4 depuis le début (#13871), puis « Sauvegarder » ou
/// « Partager » rendent la part choisie. Sous la minute, aucun choix.
/// « Enregistrer » et « Partager » hors de la vue ne coupent jamais.
@MainActor
final class StoryImagerTests: XCTestCase {

    @MainActor private final class ImagerView {
        var presented: [ImagerWork] = []

        func present(_ work: ImagerWork, _ service: StoryPhotoSaveService) {
            presented.append(work)
        }
    }

    private func makeSUT(view: ImagerView) -> (StoryPhotoSaveService, ScriptedStoryExporter, StubPhotoSaver) {
        let exporter = ScriptedStoryExporter()
        let photos = StubPhotoSaver()
        let sut = StoryPhotoSaveService(
            exporter: exporter,
            photoSaver: photos,
            toasts: MockFeedbackToast(),
            preferredLanguages: { ["fr"] },
            intro: { nil },
            authorIntro: { _ in nil },
            presentImager: { view.present($0, $1) }
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

    private func settle() async {
        for _ in 0..<40 { await Task.yield() }
    }

    func test_imager_opensTheImagerView_andNeitherRendersNorSaves() async {
        let view = ImagerView()
        let (sut, exporter, photos) = makeSUT(view: view)
        let story = story(seconds: 45)

        sut.image(story: story, author: nil)
        await settle()

        XCTAssertEqual(view.presented.map(\.id), [story.id], "« Imager » ouvre la vue, une fois")
        XCTAssertEqual(exporter.prepareCallCount, 0, "rien ne se rend avant le geste de la vue")
        XCTAssertTrue(photos.savedVideoURLs.isEmpty, "rien ne s'enregistre avant le geste de la vue")
    }

    func test_imager_underAMinute_offersNoLength() {
        let view = ImagerView()
        let (sut, _, _) = makeSUT(view: view)

        sut.image(story: story(seconds: 45), author: nil)

        XCTAssertEqual(view.presented.first?.choices, [], "sous la minute, aucun choix")
        XCTAssertEqual(view.presented.first?.total, 45)
    }

    func test_imager_fourMinutes_offersTheFourQuarters() {
        let view = ImagerView()
        let (sut, _, _) = makeSUT(view: view)

        sut.image(story: story(seconds: 240), author: nil)

        XCTAssertEqual(view.presented.first?.choices, ImagerLength.choices(total: 240))
        XCTAssertEqual(view.presented.first?.choices.map(\.duration), [60, 120, 180, 240])
    }

    func test_savingFromTheView_inTwoQuarters_rendersTwoMinutes_thenSavesToPhotos() async throws {
        let view = ImagerView()
        let (sut, exporter, photos) = makeSUT(view: view)

        sut.image(story: story(seconds: 240), author: nil)
        let work = try XCTUnwrap(view.presented.first)
        sut.saveImaged(work, quarter: .two)
        await waitUntil { photos.savedVideoURLs.count == 1 }

        XCTAssertEqual(exporter.lastSlide?.computedTotalDuration(), 120)
        XCTAssertEqual(exporter.lastAppendsBrandOutro, true, "la story garde son habillage autour de la part rendue")
    }

    func test_savingFromTheView_withoutAChoice_rendersEverything() async throws {
        let view = ImagerView()
        let (sut, exporter, photos) = makeSUT(view: view)

        sut.image(story: story(seconds: 45), author: nil)
        sut.saveImaged(try XCTUnwrap(view.presented.first), quarter: nil)
        await waitUntil { photos.savedVideoURLs.count == 1 }

        XCTAssertEqual(exporter.lastSlide?.computedTotalDuration(), 45)
    }

    func test_sharingFromTheView_rendersTheChosenPart_andNeverTouchesPhotos() async throws {
        let view = ImagerView()
        let (sut, exporter, photos) = makeSUT(view: view)

        sut.image(story: story(seconds: 240), author: nil)
        let url = await sut.renderImaged(try XCTUnwrap(view.presented.first), quarter: .one)

        XCTAssertNotNil(url, "la vue reçoit le fichier à remettre à la feuille du système")
        XCTAssertEqual(exporter.lastSlide?.computedTotalDuration(), 60)
        XCTAssertTrue(photos.savedVideoURLs.isEmpty, "« Partager » ne range rien dans Photos")
    }

    func test_closingTheView_rendersNothing() async {
        let view = ImagerView()
        let (sut, exporter, photos) = makeSUT(view: view)

        sut.image(story: story(seconds: 240), author: nil)
        await settle()

        XCTAssertEqual(exporter.prepareCallCount, 0)
        XCTAssertTrue(photos.savedVideoURLs.isEmpty)
    }

    func test_save_fourMinutes_neverOpensTheView_andRendersEverything() async {
        let view = ImagerView()
        let (sut, exporter, photos) = makeSUT(view: view)

        sut.save(story: story(seconds: 240), author: nil)
        await waitUntil { photos.savedVideoURLs.count == 1 }

        XCTAssertTrue(view.presented.isEmpty, "« Enregistrer » rend TOUT, sans vue")
        XCTAssertEqual(exporter.lastSlide?.computedTotalDuration(), 240)
    }

    /// L'aperçu de la vue peint l'œuvre avec ses images : chaque média posé (une
    /// vidéo par sa vignette), chaque sticker image, le fond legacy.
    func test_thePreview_paintsEachLayerFromTheMediaTheWorkCarries() {
        var slide = StorySlide()
        slide.mediaURL = "https://cdn/fond.jpg"
        slide.effects.mediaObjects = [
            StoryMediaObject(id: "photo", postMediaId: "m-photo", kind: .image, aspectRatio: nil),
            StoryMediaObject(id: "clip", postMediaId: "m-clip", kind: .video, aspectRatio: nil),
            StoryMediaObject(id: "posee", mediaURL: "https://cdn/posee.png", kind: .image, aspectRatio: nil)
        ]
        slide.effects.stickerObjects = [StorySticker(id: "s1", emoji: "", postMediaId: "m-sticker"),
                                        StorySticker(id: "s2", emoji: "🔥")]
        let media = [
            FeedMedia(id: "m-photo", type: .image, url: "https://cdn/photo.jpg"),
            FeedMedia(id: "m-clip", type: .video, url: "https://cdn/clip.mp4", thumbnailUrl: "https://cdn/clip.jpg"),
            FeedMedia(id: "m-sticker", type: .image, url: "https://cdn/sticker.png")
        ]

        let sources = ImagerPreviewSources.of(slide, media: media)

        XCTAssertEqual(sources.background, "https://cdn/fond.jpg")
        XCTAssertEqual(sources.layers, ["photo": "https://cdn/photo.jpg", "clip": "https://cdn/clip.jpg",
                                        "posee": "https://cdn/posee.png", "s1": "https://cdn/sticker.png"])
    }

    func test_choiceLabel_saysTheQuarterAndItsDuration() {
        XCTAssertEqual(ImagerPresenter.label(for: ImagerLengthChoice(quarter: .two, duration: 120)), "2/4 · 2:00")
        XCTAssertEqual(ImagerPresenter.label(for: ImagerLengthChoice(quarter: .one, duration: 75.4)), "1/4 · 1:15")
        XCTAssertEqual(ImagerPresenter.label(for: ImagerLengthChoice(quarter: .four, duration: 3725)), "4/4 · 1:02:05")
    }

    func test_storyMenu_offersImager_rightAfterTheVideoExport() {
        let plan = StoryOptionsMenuPlan.resolve(hasStory: true, isOwnStory: false, hasAudioTranscript: false, canCompose: true)
        XCTAssertTrue(plan.sections.contains([.share, .compose, .exportVideo, .imager]))
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

    /// **Le défaut que le porteur a vu** : « Imager » un réel enregistrait sans
    /// rien montrer. L'entrée ouvre désormais la vue, et Photos reste vide.
    func test_imagerAction_ofAReel_opensTheImagerView_andNeverSavesByItself() async throws {
        let view = ImagerView()
        let (sut, exporter, photos) = makeSUT(view: view)
        let post = composedPost()

        let action = PostSaveAction.imagerAction(for: post, coordinator: MediaSaveCoordinator(exitGate: .open), service: sut)
        action?()
        await settle()

        XCTAssertEqual(view.presented.map(\.id), [post.id])
        XCTAssertEqual(view.presented.first?.choices.count, 4, "90 s : les quarts se choisissent dans la vue")
        XCTAssertEqual(exporter.prepareCallCount, 0)
        XCTAssertTrue(photos.savedVideoURLs.isEmpty)

        sut.saveImaged(try XCTUnwrap(view.presented.first), quarter: .one)
        await waitUntil { photos.savedVideoURLs.count == 1 }
        XCTAssertEqual(exporter.lastSlide?.computedTotalDuration(), 22.5)
    }

    func test_imager_ofAGalleryScene_opensTheImagerView() async {
        let view = ImagerView()
        let (sut, exporter, photos) = makeSUT(view: view)
        let document = CanvasV3(scenes: [SceneV3(id: "sc0", objects: [
            ObjectV3(id: "t0", kind: .text, anchor: .free(x: 0.5, y: 0.5), plane: .fg, z: 1,
                     transform: TransformV3(), payload: ["text": .string("Scène")])
        ])])
        let scene = GallerySceneItem(
            id: "scene:post-g#0", postId: "post-g", document: document, sceneIndex: 0,
            carrier: StoryItem(id: "post-g", content: "", storyEffects: StoryEffects(rendering: document, sceneIndex: 0),
                               createdAt: Date(timeIntervalSince1970: 0)),
            mediaId: nil, aspect: SceneShape.aspect, canvasAspect: SceneShape.aspect, moves: false,
            thumbHash: nil, thumbnailURL: nil)

        sut.image(scene: scene)
        await settle()

        XCTAssertEqual(view.presented.map(\.id), [scene.id])
        XCTAssertEqual(exporter.prepareCallCount, 0)
        XCTAssertTrue(photos.savedImageFileURLs.isEmpty)
    }

    /// **Une seule porte vers Photos depuis « Imager » : la vue.** Aucun hôte
    /// n'appelle le rendu d'« Imager » en direct — sinon une entrée de plus
    /// enregistrerait de nouveau sans rien montrer.
    func test_onlyTheImagerView_rendersWhatImagerOffers() throws {
        let app = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("Meeshy")
        let walker = try XCTUnwrap(FileManager.default.enumerator(at: app, includingPropertiesForKeys: nil))
        let sources = walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
        XCTAssertGreaterThan(sources.count, 100, "la garde lit les sources de l'app")
        let callers = sources.filter { file in
            guard !file.path.hasSuffix("Export/ImagerSheet.swift"),
                  let source = try? String(contentsOf: file, encoding: .utf8) else { return false }
            let code = MyStoriesSourceCorpus.strippingComments(source)
            return code.contains(".saveImaged(") || code.contains(".renderImaged(")
        }.map(\.lastPathComponent)
        XCTAssertEqual(callers, [], "seule `ImagerSheet` rend ce qu'« Imager » propose")
        let service = MyStoriesSourceCorpus.strippingComments(
            try AppSourceGuard.unit("Meeshy/Features/Stories/Services/StoryPhotoSaveService.swift"))
        XCTAssertTrue(service.contains("presentImager(work, self)"), "« Imager » présente la vue")
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
