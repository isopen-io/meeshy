import XCTest
import UIKit
import UniformTypeIdentifiers
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

/// **Une scène FIXE et MUETTE sort en IMAGE** (#13871, comme Android
/// `SceneExportJob.still` et le web) : « Enregistrer », « Imager » et « Partager »
/// rangent une photo, tirée du même rendu que la vidéo, sans prélude ni carte de
/// fin — une image ne se déroule pas. Une scène qui bouge ou qui sonne reste une
/// vidéo.
@MainActor
final class StoryStillExportTests: XCTestCase {

    @MainActor private final class ImagerView {
        var presented: [ImagerWork] = []
    }

    @MainActor private final class Frames {
        var calls = 0
        var fails = false

        func frame(_ video: URL) -> URL? {
            calls += 1
            guard !fails else { return nil }
            let image = FileManager.default.temporaryDirectory.appendingPathComponent("still-\(UUID().uuidString).jpg")
            try? Data([0xFF, 0xD8, 0xFF]).write(to: image)
            return image
        }
    }

    private struct SUT {
        let service: StoryPhotoSaveService
        let exporter: ScriptedStoryExporter
        let photos: StubPhotoSaver
        let toasts: MockFeedbackToast
        let frames: Frames
        let imagerView: ImagerView
    }

    private func makeSUT() -> SUT {
        let exporter = ScriptedStoryExporter()
        let photos = StubPhotoSaver()
        let toasts = MockFeedbackToast()
        let frames = Frames()
        let imagerView = ImagerView()
        let service = StoryPhotoSaveService(
            exporter: exporter,
            photoSaver: photos,
            toasts: toasts,
            preferredLanguages: { ["fr"] },
            intro: { nil },
            authorIntro: { _ in nil },
            presentImager: { work, _ in imagerView.presented.append(work) },
            stillFrame: { frames.frame($0) }
        )
        return SUT(service: service, exporter: exporter, photos: photos, toasts: toasts, frames: frames,
                   imagerView: imagerView)
    }

    private func stillStory(seconds: TimeInterval? = nil) -> StoryItem {
        var effects = StoryEffects(textObjects: [StoryTextObject(text: "Fixe")])
        effects.timelineDuration = seconds
        return StoryItem(id: "story-\(UUID().uuidString)", content: "Fixe", storyEffects: effects)
    }

    private func movingStory() -> StoryItem {
        StoryItem(id: "story-\(UUID().uuidString)", content: "Bouge",
                  storyEffects: StoryEffects(textObjects: [StoryTextObject(text: "Bouge", startTime: 1, duration: 3)]))
    }

    private func stillScene() -> GallerySceneItem {
        let document = CanvasV3(scenes: [SceneV3(id: "sc0", objects: [
            ObjectV3(id: "t0", kind: .text, anchor: .free(x: 0.5, y: 0.5), plane: .fg, z: 1,
                     transform: TransformV3(), payload: ["text": .string("Fixe")])
        ])])
        return GallerySceneItem(
            id: "scene:post-still#0", postId: "post-still", document: document, sceneIndex: 0,
            carrier: StoryItem(id: "post-still", content: "", storyEffects: StoryEffects(rendering: document, sceneIndex: 0),
                               createdAt: Date(timeIntervalSince1970: 0)),
            mediaId: nil, aspect: SceneShape.aspect, canvasAspect: SceneShape.aspect, moves: false,
            thumbHash: nil, thumbnailURL: nil)
    }

    private func waitUntilIdle(_ sut: SUT, key: String) async {
        for _ in 0..<300 {
            if sut.service.progress(for: key) == nil { return }
            await Task.yield()
        }
        XCTFail("le job n'a jamais été retiré pour \(key)")
    }

    func test_save_aStillStory_savesAnImageInPhotos_notAVideo() async throws {
        let sut = makeSUT()
        let story = stillStory()

        sut.service.save(story: story, author: nil)
        XCTAssertNotNil(sut.service.progress(for: story.id), "l'anneau tourne pendant le rendu de l'image")
        await waitUntilIdle(sut, key: story.id)

        XCTAssertEqual(sut.photos.savedImageFileURLs.count, 1)
        XCTAssertEqual(sut.photos.savedImageFileURLs.first?.pathExtension, "jpg")
        XCTAssertTrue(sut.photos.savedVideoURLs.isEmpty)
        XCTAssertEqual(sut.toasts.successMessages,
                       [String(localized: "story.mine.save.imageSuccess", defaultValue: "Image enregistrée dans Photos")])
        XCTAssertEqual(sut.frames.calls, 1)
        let video = try XCTUnwrap(sut.exporter.lastBakedURL)
        XCTAssertFalse(FileManager.default.fileExists(atPath: video.path), "le MP4 d'où l'image est tirée ne reste pas")
    }

    func test_aStillImage_isBakedInOneSecond_withoutPreludeNorEndCard() async {
        let sut = makeSUT()
        let story = stillStory(seconds: 12)

        sut.service.save(story: story, author: nil)
        await waitUntilIdle(sut, key: story.id)

        XCTAssertEqual(sut.exporter.lastSlide?.computedTotalDuration(), StoryExportStill.bakeDuration)
        XCTAssertNil(sut.exporter.lastIntro)
        XCTAssertEqual(sut.exporter.lastAppendsBrandOutro, false)
    }

    func test_save_aMovingStory_staysAVideo() async {
        let sut = makeSUT()
        let story = movingStory()

        sut.service.save(story: story, author: nil)
        await waitUntilIdle(sut, key: story.id)

        XCTAssertEqual(sut.photos.savedVideoURLs.count, 1)
        XCTAssertTrue(sut.photos.savedImageFileURLs.isEmpty)
        XCTAssertEqual(sut.frames.calls, 0)
        XCTAssertEqual(sut.exporter.lastAppendsBrandOutro, true)
    }

    /// « Imager » ouvre la vue ; « Sauvegarder », depuis elle, range l'image.
    private func saveFromTheImagerView(_ sut: SUT, key: String) async throws {
        let work = try XCTUnwrap(sut.imagerView.presented.last, "« Imager » ouvre la vue")
        XCTAssertEqual(work.id, key)
        XCTAssertTrue(sut.photos.savedImageFileURLs.isEmpty, "rien n'est rangé avant le geste de la vue")
        sut.service.saveImaged(work, quarter: nil)
        await waitUntilIdle(sut, key: key)
    }

    func test_imager_aLongStillStory_neverAsksForALength_andSavesAnImage() async throws {
        let sut = makeSUT()
        let story = stillStory(seconds: 240)

        sut.service.image(story: story, author: nil)
        XCTAssertEqual(sut.imagerView.presented.last?.choices, [], "une image n'a pas de longueur")
        XCTAssertEqual(sut.imagerView.presented.last?.isStill, true)
        try await saveFromTheImagerView(sut, key: story.id)

        XCTAssertEqual(sut.photos.savedImageFileURLs.count, 1)
    }

    func test_imager_aStillScene_savesAnImage() async throws {
        let sut = makeSUT()
        let scene = stillScene()

        sut.service.image(scene: scene)
        try await saveFromTheImagerView(sut, key: scene.id)

        XCTAssertEqual(sut.photos.savedImageFileURLs.count, 1)
        XCTAssertEqual(sut.exporter.lastAppendsBrandOutro, false)
    }

    func test_imager_aStillComposedPost_savesAnImage() async throws {
        let sut = makeSUT()
        var post = FeedPost(id: "post-\(UUID().uuidString)", author: "alice", type: "POST", content: "Fixe")
        post.storyEffects = StoryEffects(textObjects: [StoryTextObject(text: "Fixe")])

        sut.service.image(post: post)
        try await saveFromTheImagerView(sut, key: post.id)

        XCTAssertEqual(sut.photos.savedImageFileURLs.count, 1)
        XCTAssertTrue(sut.service.exportsStill(post: post))
    }

    func test_aFrameThatCannotBeDrawn_saysTheExportFailed_andSavesNothing() async {
        let sut = makeSUT()
        sut.frames.fails = true
        let story = stillStory()

        sut.service.save(story: story, author: nil)
        await waitUntilIdle(sut, key: story.id)

        XCTAssertTrue(sut.photos.savedImageFileURLs.isEmpty)
        XCTAssertTrue(sut.photos.savedVideoURLs.isEmpty)
        XCTAssertEqual(sut.toasts.errorMessages,
                       [String(localized: "story.mine.save.failed", defaultValue: "L'export de la story a échoué. Réessayez.")])
    }

    func test_theShareFile_ofAStillStory_isAnImage() async {
        let sut = makeSUT()

        let file = await sut.service.renderStoryFile(of: stillStory(), author: nil)

        XCTAssertEqual(file?.pathExtension, "jpg")
        XCTAssertTrue(sut.service.exportsStill(story: stillStory()))
        XCTAssertFalse(sut.service.exportsStill(story: movingStory()))
    }

    func test_theShareSheet_announcesAnImage_forAStillStory_andAMovie_otherwise() throws {
        let link = try XCTUnwrap(URL(string: "https://meeshy.me/s/x"))
        let host = UIActivityViewController(activityItems: [], applicationActivities: nil)
        let still = try XCTUnwrap(ShareFileSource.story(stillStory(), author: nil).makeProvider(link: link))
        let moving = try XCTUnwrap(ShareFileSource.story(movingStory(), author: nil).makeProvider(link: link))

        XCTAssertEqual(still.activityViewController(host, dataTypeIdentifierForActivityType: nil), UTType.jpeg.identifier)
        XCTAssertEqual(moving.activityViewController(host, dataTypeIdentifierForActivityType: nil), UTType.mpeg4Movie.identifier)
    }
}
