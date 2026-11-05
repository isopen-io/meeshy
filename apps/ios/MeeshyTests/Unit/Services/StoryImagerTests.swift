import XCTest
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

/// **« Imager » ouvre UN atelier, celui de la carte** (#16393). Un post, un réel,
/// une story et la scène d'une galerie s'imagent comme un message : l'atelier
/// de carte s'ouvre tout de suite, et une œuvre composée y arrive par le RENDU
/// de sa scène, produit quand l'atelier le demande. Rien ne s'enregistre avant
/// le geste de l'atelier.
@MainActor
final class StoryImagerTests: XCTestCase {

    @MainActor private final class Workshop {
        var presented: [MessageCardExportRequest] = []
    }

    private func makeSUT() -> (StoryPhotoSaveService, ScriptedStoryExporter, StubPhotoSaver) {
        let exporter = ScriptedStoryExporter()
        let photos = StubPhotoSaver()
        let sut = StoryPhotoSaveService(
            exporter: exporter,
            photoSaver: photos,
            toasts: MockFeedbackToast(),
            preferredLanguages: { ["fr"] },
            intro: { nil },
            authorIntro: { _ in nil },
            stillFrame: { _ in
                let image = FileManager.default.temporaryDirectory.appendingPathComponent("still-\(UUID().uuidString).jpg")
                try? Data([0xFF, 0xD8, 0xFF]).write(to: image)
                return image
            }
        )
        return (sut, exporter, photos)
    }

    private static let viewer = MessageCardSubject.Viewer(id: "me", displayName: "Moi", username: "moi")

    private func story(seconds: TimeInterval) -> StoryItem {
        var effects = StoryEffects(textObjects: [StoryTextObject(text: "Imager", startTime: 0, duration: seconds)])
        effects.timelineDuration = seconds
        return StoryItem(id: "story-\(UUID().uuidString)", content: "Imager", storyEffects: effects)
    }

    private func composedPost() -> FeedPost {
        var post = FeedPost(id: "post-\(UUID().uuidString)", author: "alice", authorUsername: "alice", type: "POST", content: "Imager")
        var effects = StoryEffects(textObjects: [StoryTextObject(text: "Imager", startTime: 0, duration: 90)])
        effects.timelineDuration = 90
        post.storyEffects = effects
        return post
    }

    private func waitUntil(_ condition: () -> Bool) async {
        for _ in 0..<300 {
            if condition() { return }
            await Task.yield()
        }
        XCTFail("condition jamais vraie")
    }

    // MARK: - Un post s'image par l'atelier de carte

    func test_imagerAction_composedPost_presentsTheCardWorkshop_withItsSceneAsLead_andRendersNothing() throws {
        let (sut, exporter, photos) = makeSUT()
        let workshop = Workshop()
        let post = composedPost()

        let action = try XCTUnwrap(PostSaveAction.imagerAction(for: post, coordinator: MediaSaveCoordinator(exitGate: .open),
                                                               service: sut, present: { workshop.presented.append($0) }))
        action()

        let request = try XCTUnwrap(workshop.presented.first)
        XCTAssertEqual(workshop.presented.count, 1)
        XCTAssertEqual(request.lead?.id, "scene:\(post.id)")
        XCTAssertEqual(request.subject.media.map(\.media.id), ["scene:\(post.id)"])
        XCTAssertEqual(request.subject.heroID, "scene:\(post.id)")
        XCTAssertEqual(exporter.prepareCallCount, 0, "le rendu attend l'atelier")
        XCTAssertTrue(photos.savedVideoURLs.isEmpty)
        XCTAssertTrue(photos.savedImageFileURLs.isEmpty)
    }

    func test_lead_ofAComposedPost_rendersTheBareScene_withoutTouchingPhotos() async throws {
        let (sut, exporter, photos) = makeSUT()
        let request = try XCTUnwrap(ImagerCardRequest.post(composedPost(), viewer: Self.viewer, preferredLanguages: ["fr"], service: sut))

        let rendered = await request.lead?.render()

        let file = try XCTUnwrap(rendered)
        defer { try? FileManager.default.removeItem(at: file) }

        XCTAssertEqual(exporter.prepareCallCount, 1)
        XCTAssertEqual(exporter.lastAppendsBrandOutro, false, "l'œuvre seule : la carte signe elle-même")
        XCTAssertTrue(photos.savedVideoURLs.isEmpty)
        XCTAssertEqual(request.lead?.media(rendered: file).media.kind, .video)
    }

    func test_imagerAction_textPost_imagesAsACard_withoutAnyScene() throws {
        let workshop = Workshop()
        let post = FeedPost(author: "alice", authorUsername: "alice", type: "POST", content: "Un texte simple")

        let action = try XCTUnwrap(PostSaveAction.imagerAction(for: post, coordinator: MediaSaveCoordinator(exitGate: .open),
                                                               present: { workshop.presented.append($0) }))
        action()

        let request = try XCTUnwrap(workshop.presented.first)
        XCTAssertNil(request.lead)
        XCTAssertEqual(request.subject.reply.text, "Un texte simple")
        XCTAssertEqual(request.subject.reply.handle, "alice")
    }

    func test_imagerAction_photoPost_paintsItsPhotos() throws {
        let photos = [FeedMedia(id: "p1", type: .image, url: "https://staging.meeshy.me/p1.jpg", width: 1200, height: 800),
                      FeedMedia(id: "p2", type: .image, url: "https://staging.meeshy.me/p2.jpg", width: 800, height: 1200)]
        let post = FeedPost(author: "alice", type: "POST", content: "", media: photos)

        let request = try XCTUnwrap(ImagerCardRequest.post(post, viewer: Self.viewer, preferredLanguages: ["fr"]))

        XCTAssertNil(request.lead)
        XCTAssertEqual(request.subject.media.map(\.media.id), ["p1", "p2"])
    }

    func test_imagerAction_closedExitGate_offersNothing() {
        let post = FeedPost(author: "alice", type: "POST", content: "texte")
        XCTAssertNil(PostSaveAction.imagerAction(for: post, coordinator: MediaSaveCoordinator()), "la loi de sortie gagne sur tout")
        XCTAssertNil(PostSaveAction.imagerAction(for: composedPost(), coordinator: MediaSaveCoordinator()))
    }

    func test_imagerAction_emptyPost_offersNothing() {
        let post = FeedPost(author: "alice", type: "POST", content: "   ")
        XCTAssertNil(PostSaveAction.imagerAction(for: post, coordinator: MediaSaveCoordinator(exitGate: .open)))
    }

    func test_postRequest_originalBelowRankOne_imagesTheServedLanguage() throws {
        let post = FeedPost(author: "alice", type: "POST", content: "Hello", originalLanguage: "en",
                            translations: ["fr": PostTranslation(text: "Bonjour")])

        let request = try XCTUnwrap(ImagerCardRequest.post(post, viewer: Self.viewer, preferredLanguages: ["fr", "en"]))

        XCTAssertEqual(request.subject.reply.text, "Bonjour")
    }

    func test_quickly_keepsTheCard_andAsksForTheDefaultFormat() throws {
        let request = try XCTUnwrap(ImagerCardRequest.post(composedPost(), viewer: Self.viewer, preferredLanguages: ["fr"]))

        XCTAssertFalse(request.quick)
        XCTAssertTrue(request.quickly.quick)
        XCTAssertEqual(request.quickly.subject, request.subject)
        XCTAssertEqual(request.quickly.lead?.id, request.lead?.id)
    }

    // MARK: - Une story et une scène de galerie aussi

    func test_storyRequest_paintsTheStoryRender_signedByItsAuthor() async throws {
        let (sut, exporter, _) = makeSUT()
        let story = story(seconds: 45)

        let request = ImagerCardRequest.story(story, author: StoryExportAuthor(userId: "u1", name: "awa"),
                                              accentColor: "6366F1", service: sut)

        XCTAssertEqual(request.lead?.id, "story:\(story.id)")
        XCTAssertEqual(request.subject.reply.author, "awa")
        XCTAssertEqual(request.subject.media.first?.author?.name, "awa")
        XCTAssertEqual(exporter.prepareCallCount, 0)
        let rendered = await request.lead?.render()
        let file = try XCTUnwrap(rendered)
        defer { try? FileManager.default.removeItem(at: file) }
        XCTAssertEqual(exporter.lastAppendsBrandOutro, false)
        XCTAssertEqual(exporter.lastSlide?.computedTotalDuration(), 45)
    }

    func test_sceneRequest_rendersTheOpenScene() async throws {
        let (sut, exporter, _) = makeSUT()
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

        let request = ImagerCardRequest.scene(scene, accentColor: "6366F1", service: sut)

        XCTAssertEqual(request.lead?.id, scene.id)
        XCTAssertEqual(request.subject.heroID, scene.id)
        let rendered = await request.lead?.render()
        let file = try XCTUnwrap(rendered)
        defer { try? FileManager.default.removeItem(at: file) }
        XCTAssertEqual(exporter.prepareCallCount, 1)
        XCTAssertEqual(request.lead?.media(rendered: file).media.kind, .image, "une scène fixe arrive en photo")
    }

    func test_save_fourMinutes_rendersEverything() async {
        let (sut, exporter, photos) = makeSUT()

        sut.save(story: story(seconds: 240), author: nil)
        await waitUntil { photos.savedVideoURLs.count == 1 }

        XCTAssertEqual(exporter.lastSlide?.computedTotalDuration(), 240)
    }

    func test_choiceLabel_saysTheQuarterAndItsDuration() {
        XCTAssertEqual(ImagerLengthLabel.label(for: ImagerLengthChoice(quarter: .two, duration: 120)), "2/4 · 2:00")
        XCTAssertEqual(ImagerLengthLabel.label(for: ImagerLengthChoice(quarter: .one, duration: 75.4)), "1/4 · 1:15")
        XCTAssertEqual(ImagerLengthLabel.label(for: ImagerLengthChoice(quarter: .four, duration: 3725)), "4/4 · 1:02:05")
    }

    // MARK: - Plus aucun chemin n'ouvre la vue de scène

    func test_noHost_opensTheSceneImagerView() throws {
        let app = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("Meeshy")
        let walker = try XCTUnwrap(FileManager.default.enumerator(at: app, includingPropertiesForKeys: nil))
        let sources = walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
        XCTAssertGreaterThan(sources.count, 100, "la garde lit les sources de l'app")
        let callers = sources.filter { file in
            guard let source = try? String(contentsOf: file, encoding: .utf8) else { return false }
            let code = MyStoriesSourceCorpus.strippingComments(source)
            return ["ImagerPresenter", "ImagerSheet", ".image(story:", ".image(post:", ".image(scene:", "presentImager"]
                .contains { code.contains($0) }
        }.map(\.lastPathComponent)
        XCTAssertEqual(callers, [], "« Imager » n'ouvre que l'atelier de carte")
        let rules = MyStoriesSourceCorpus.strippingComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/ReelPlaybackRules.swift"))
        XCTAssertTrue(rules.contains("ImagerCardRequest.post(post, quick: quick, service: service)"))
    }

    func test_storyRail_imagesThroughTheCardWorkshop() throws {
        let rail = MyStoriesSourceCorpus.strippingComments(
            try AppSourceGuard.unit("Meeshy/Features/Stories/Views/StoryViewerView+Sidebar.swift"))
        XCTAssertTrue(rail.contains("MessageCardExportPresenter.present(ImagerCardRequest.story(story"))
    }

    func test_reelMenu_offersImager_throughTheSharedAction() throws {
        let player = MyStoriesSourceCorpus.strippingComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/ReelsPlayerView.swift"))
        XCTAssertTrue(player.contains("onImager: PostSaveAction.imagerAction(for: reel, coordinator: mediaSaveCoordinator)"))
        let menu = MyStoriesSourceCorpus.strippingComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/ReelsPlayerView+ActionRail.swift"))
        XCTAssertTrue(menu.contains("if let onImager"))
        XCTAssertTrue(menu.contains("MessageCardExportMenu.imageLabel"))
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
        XCTAssertTrue(block.contains("MessageCardExportPresenter.present(ImagerCardRequest.story(story, author: currentGroup.map { StoryExportAuthor.served(from: $0) }"))
        XCTAssertTrue(block.contains("MessageCardExportMenu.imageLabel"), "le mot « Imager » est celui de la conversation")
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
        XCTAssertTrue(menu.contains("MessageCardExportPresenter.present(ImagerCardRequest.scene(scene, accentColor: accentColor))"))
    }
}
