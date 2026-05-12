import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Verifies that `StoryComposerViewModel.duplicateSlide(at:)` produces a slide
/// that is visually identical to its source — all per-slide side caches
/// (`loadedImages`, `loadedVideoURLs`, `loadedAudioURLs`, `mediaAspectRatios`,
/// `slideImages`, `backgroundTransformCache`) are re-keyed under the freshly
/// minted ids so the duplicate renders bitmaps instead of placeholders.
///
/// Regression: previously the slide struct was cloned with a new UUID but the
/// child media object ids and side-cache keys were left pointing at the
/// original, so the duplicate displayed empty placeholders.
final class StoryComposerViewModel_DuplicateSlideTests: XCTestCase {

    // MARK: - loadedImages

    @MainActor
    func test_duplicateSlide_preservesLoadedImages() {
        let vm = StoryComposerViewModel()
        let media = vm.addMediaObject(kind: .image)
        XCTAssertNotNil(media)
        let originalMediaId = media!.id
        let bitmap = makeRedSquareImage()
        vm.loadedImages[originalMediaId] = bitmap

        vm.duplicateSlide(at: 0)

        XCTAssertEqual(vm.slides.count, 2)
        let duplicated = vm.slides[1]
        guard let cloneMedia = duplicated.effects.mediaObjects?.first else {
            return XCTFail("Duplicated slide is missing its media object")
        }
        XCTAssertNotEqual(cloneMedia.id, originalMediaId, "child media object must receive a fresh id")
        XCTAssertNotNil(vm.loadedImages[cloneMedia.id], "loadedImages must contain an entry for the cloned media id")
        XCTAssertNotNil(vm.loadedImages[originalMediaId], "original loadedImages entry must remain intact")
    }

    // MARK: - loadedVideoURLs

    @MainActor
    func test_duplicateSlide_preservesVideoURLs() {
        let vm = StoryComposerViewModel()
        let media = vm.addMediaObject(kind: .video)
        XCTAssertNotNil(media)
        let originalMediaId = media!.id
        let url = URL(fileURLWithPath: "/tmp/meeshy-duplicate-slide-test.mp4")
        vm.loadedVideoURLs[originalMediaId] = url
        vm.mediaAspectRatios[originalMediaId] = 16.0 / 9.0

        vm.duplicateSlide(at: 0)

        XCTAssertEqual(vm.slides.count, 2)
        let duplicated = vm.slides[1]
        guard let cloneMedia = duplicated.effects.mediaObjects?.first else {
            return XCTFail("Duplicated slide is missing its media object")
        }
        XCTAssertNotEqual(cloneMedia.id, originalMediaId)
        XCTAssertEqual(vm.loadedVideoURLs[cloneMedia.id], url)
        XCTAssertEqual(vm.mediaAspectRatios[cloneMedia.id], 16.0 / 9.0)
        XCTAssertEqual(vm.loadedVideoURLs[originalMediaId], url)
    }

    // MARK: - loadedAudioURLs

    @MainActor
    func test_duplicateSlide_preservesAudioURLs() {
        let vm = StoryComposerViewModel()
        let audio = vm.addAudioObject()
        XCTAssertNotNil(audio)
        let originalAudioId = audio!.id
        let url = URL(fileURLWithPath: "/tmp/meeshy-duplicate-slide-test.m4a")
        vm.loadedAudioURLs[originalAudioId] = url

        vm.duplicateSlide(at: 0)

        XCTAssertEqual(vm.slides.count, 2)
        let duplicated = vm.slides[1]
        guard let cloneAudio = duplicated.effects.audioPlayerObjects?.first else {
            return XCTFail("Duplicated slide is missing its audio player object")
        }
        XCTAssertNotEqual(cloneAudio.id, originalAudioId)
        XCTAssertEqual(vm.loadedAudioURLs[cloneAudio.id], url)
        XCTAssertEqual(vm.loadedAudioURLs[originalAudioId], url)
    }

    // MARK: - Unique IDs for every child object

    @MainActor
    func test_duplicateSlide_generatesUniqueIdsForChildObjects() {
        let vm = StoryComposerViewModel()
        // Cover all four object families to confirm none of them retain the
        // original id — id collisions would corrupt zIndexMap, persistZIndex
        // and the per-element side caches on subsequent edits.
        _ = vm.addText()
        _ = vm.addMediaObject(kind: .image)
        _ = vm.addMediaObject(kind: .video)
        _ = vm.addAudioObject()
        // Inject a sticker manually — there is no public `addSticker` helper.
        var effects = vm.currentEffects
        let sticker = StorySticker(emoji: "🎉")
        effects.stickerObjects = [sticker]
        vm.currentEffects = effects

        let originalSlide = vm.slides[0]
        let originalTextIds = Set(originalSlide.effects.textObjects.map(\.id))
        let originalMediaIds = Set((originalSlide.effects.mediaObjects ?? []).map(\.id))
        let originalAudioIds = Set((originalSlide.effects.audioPlayerObjects ?? []).map(\.id))
        let originalStickerIds = Set((originalSlide.effects.stickerObjects ?? []).map(\.id))

        vm.duplicateSlide(at: 0)

        XCTAssertEqual(vm.slides.count, 2)
        let cloned = vm.slides[1]
        XCTAssertNotEqual(cloned.id, originalSlide.id, "cloned slide must have a fresh id")

        let cloneTextIds = Set(cloned.effects.textObjects.map(\.id))
        let cloneMediaIds = Set((cloned.effects.mediaObjects ?? []).map(\.id))
        let cloneAudioIds = Set((cloned.effects.audioPlayerObjects ?? []).map(\.id))
        let cloneStickerIds = Set((cloned.effects.stickerObjects ?? []).map(\.id))

        XCTAssertEqual(cloneTextIds.count, originalTextIds.count)
        XCTAssertEqual(cloneMediaIds.count, originalMediaIds.count)
        XCTAssertEqual(cloneAudioIds.count, originalAudioIds.count)
        XCTAssertEqual(cloneStickerIds.count, originalStickerIds.count)

        XCTAssertTrue(cloneTextIds.isDisjoint(with: originalTextIds), "text ids must not collide")
        XCTAssertTrue(cloneMediaIds.isDisjoint(with: originalMediaIds), "media ids must not collide")
        XCTAssertTrue(cloneAudioIds.isDisjoint(with: originalAudioIds), "audio ids must not collide")
        XCTAssertTrue(cloneStickerIds.isDisjoint(with: originalStickerIds), "sticker ids must not collide")
    }

    // MARK: - backgroundTransformCache + slideImages

    @MainActor
    func test_duplicateSlide_preservesBackgroundTransform() {
        let vm = StoryComposerViewModel()
        let originalSlideId = vm.slides[0].id
        // The transform cache key is the slide id and is populated by
        // `saveBackgroundTransform`. Mutate `backgroundTransform`, then save.
        vm.backgroundTransform = StoryComposerViewModel.BackgroundTransform(
            scale: 1.5,
            offsetX: 24,
            offsetY: -16,
            rotation: 0.25
        )
        vm.saveBackgroundTransform()
        // Slide-level background bitmap (`slideImages`) is also keyed by slideId.
        let bgImage = makeRedSquareImage()
        vm.setImage(bgImage, for: originalSlideId)

        vm.duplicateSlide(at: 0)

        XCTAssertEqual(vm.slides.count, 2)
        let cloned = vm.slides[1]
        XCTAssertNotEqual(cloned.id, originalSlideId)

        // backgroundTransformCache is private — observe it via `restoreBackgroundTransform`
        // after navigating to the duplicate. `currentSlideIndex` is already pointing at the
        // duplicate after `duplicateSlide`, so call directly.
        vm.restoreBackgroundTransform()
        XCTAssertEqual(vm.backgroundTransform.scale, 1.5)
        XCTAssertEqual(vm.backgroundTransform.offsetX, 24)
        XCTAssertEqual(vm.backgroundTransform.offsetY, -16)
        XCTAssertEqual(vm.backgroundTransform.rotation, 0.25)

        XCTAssertNotNil(vm.slideImages[cloned.id], "cloned slide must have its own slideImages entry")
        XCTAssertNotNil(vm.slideImages[originalSlideId], "original slideImages entry must remain intact")
    }

    // MARK: - Helpers

    /// Produces a 1×1 red UIImage so tests can compare reference equality of
    /// `loadedImages` entries without pulling in real assets.
    @MainActor
    private func makeRedSquareImage() -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 1, height: 1))
        return renderer.image { ctx in
            UIColor.red.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 1, height: 1))
        }
    }
}
