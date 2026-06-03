import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Exercises the publicly-reachable business logic of `StoryComposerViewModel`
/// that was previously uncovered (everything except `duplicateSlide`, which is
/// owned by `StoryComposerViewModel_DuplicateSlideTests`).
///
/// Scope rationale:
/// - Every test drives state through the ViewModel's public surface (no
///   private mirror, no `@testable` poking of `zIndexMap` / `nextZIndex`).
///   Z-order assertions read back through `zIndex(for:)` and the persisted
///   `zIndex` on the slide's effects — i.e. the same path the reader uses.
/// - Behaviour over implementation: we assert what the user observes
///   (slide count moves, selection clears, media gets evicted) rather than
///   internal data structures.
/// - The prompt mentions a handful of methods that do NOT exist on the
///   current ViewModel (e.g. `selectElement(id:)`, `setStoryDuration(_:)`,
///   `attachAudioTrack(_:to:)`, `validateForPublish()`); see the trailing
///   `// TODO: extract protocol for testability` comments for each gap.
@MainActor
final class StoryComposerViewModelTests: XCTestCase {

    // MARK: - Factory

    private func makeSubject() -> StoryComposerViewModel {
        StoryComposerViewModel()
    }

    // MARK: - addSlide

    func test_addSlide_appendsAtEndAndAdvancesCurrentIndex() {
        let vm = makeSubject()
        XCTAssertEqual(vm.slides.count, 1)
        XCTAssertEqual(vm.currentSlideIndex, 0)

        vm.addSlide()

        XCTAssertEqual(vm.slides.count, 2)
        XCTAssertEqual(vm.currentSlideIndex, 1, "addSlide must focus the newly-created slide")
        XCTAssertEqual(vm.slides.last?.order, 1, "order field must reflect array index")
    }

    func test_addSlide_respectsCanAddSlideLimit() {
        let vm = makeSubject()
        for _ in 0..<9 { vm.addSlide() }  // 1 seed + 9 added = 10 (the hard cap)
        XCTAssertEqual(vm.slides.count, 10)
        XCTAssertFalse(vm.canAddSlide)

        vm.addSlide()

        XCTAssertEqual(vm.slides.count, 10, "addSlide must be a no-op once canAddSlide is false")
    }

    // MARK: - removeSlide

    func test_removeSlide_purgesPerSlideSideCaches() {
        let vm = makeSubject()
        vm.addSlide()
        let removedId = vm.slides[1].id
        vm.setImage(makeRedSquareImage(), for: removedId)

        vm.removeSlide(at: 1)

        XCTAssertEqual(vm.slides.count, 1)
        XCTAssertNil(vm.slideImages[removedId], "slideImages keyed by the removed slide id must be evicted")
    }

    func test_removeSlide_refusesToRemoveLastRemainingSlide() {
        let vm = makeSubject()
        XCTAssertEqual(vm.slides.count, 1)

        vm.removeSlide(at: 0)

        XCTAssertEqual(vm.slides.count, 1, "the composer must always keep at least one slide so currentSlide is valid")
    }

    func test_removeSlide_clampsCurrentIndexWhenRemovingActiveTail() {
        let vm = makeSubject()
        vm.addSlide()
        vm.addSlide()
        XCTAssertEqual(vm.currentSlideIndex, 2)

        vm.removeSlide(at: 2)

        XCTAssertEqual(vm.slides.count, 2)
        XCTAssertEqual(vm.currentSlideIndex, 1, "currentSlideIndex must be clamped to slides.count - 1")
    }

    func test_removeSlide_ignoresOutOfRangeIndex() {
        let vm = makeSubject()
        vm.addSlide()
        let before = vm.slides.map(\.id)

        vm.removeSlide(at: 42)

        XCTAssertEqual(vm.slides.map(\.id), before)
    }

    // MARK: - moveSlide (reorder gesture wiring, it.37)

    func test_moveSlide_reordersViaOnMoveConvention_andPreservesEditedSlide() {
        let vm = makeSubject()
        vm.addSlide(); vm.addSlide()        // 3 slides A,B,C (indices 0,1,2)
        let ids = vm.slides.map(\.id)
        vm.selectSlide(at: 0)               // user is editing slide A
        XCTAssertEqual(vm.currentSlideIndex, 0)

        // SwiftUI .onMove / .dropDestination convention: move C (index 2) to the
        // FRONT (toOffset 0) → [C, A, B].
        vm.moveSlide(from: 2, to: 0)

        XCTAssertEqual(vm.slides.map(\.id), [ids[2], ids[0], ids[1]], "C moved to front → [C,A,B]")
        XCTAssertEqual(vm.currentSlideIndex, 1, "currentSlideIndex follows the EDITED slide A (now index 1), not the dropped slot")
        XCTAssertEqual(vm.slides.map(\.order), [0, 1, 2], "order reindexed by position")
    }

    func test_moveSlide_toEnd_isAccepted() {
        // The .onMove move-to-end passes toOffset == count — the old `destination < count`
        // guard wrongly rejected it, so a slide could never be dragged to the last slot.
        let vm = makeSubject()
        vm.addSlide(); vm.addSlide()        // A,B,C
        let ids = vm.slides.map(\.id)

        vm.moveSlide(from: 0, to: 3)        // toOffset == count → move A to end

        XCTAssertEqual(vm.slides.map(\.id), [ids[1], ids[2], ids[0]], "A moved to end → [B,C,A]")
    }

    // MARK: - toggleBackground

    func test_toggleBackground_enforcesSingleBackgroundMediaPerSlide() {
        let vm = makeSubject()
        let first = vm.addMediaObject(kind: .image)!
        let second = vm.addMediaObject(kind: .image)!
        // `first` was auto-promoted to background (resolvedBackgroundMedia was nil),
        // `second` came in as foreground. Toggling `second` ON must demote `first`.
        XCTAssertTrue(vm.currentEffects.mediaObjects?.first(where: { $0.id == first.id })?.isBackground == true)

        vm.toggleBackground(id: second.id)

        let medias = vm.currentEffects.mediaObjects ?? []
        let backgrounds = medias.filter { $0.isBackground == true }
        XCTAssertEqual(backgrounds.count, 1, "at most one media may be background at a time")
        XCTAssertEqual(backgrounds.first?.id, second.id)
        XCTAssertEqual(medias.first(where: { $0.id == first.id })?.isBackground, false)
    }

    func test_toggleBackground_offDemotesWithoutPromotingOthers() {
        let vm = makeSubject()
        let only = vm.addMediaObject(kind: .image)!
        XCTAssertTrue(vm.isBackground(id: only.id))

        vm.toggleBackground(id: only.id)

        XCTAssertFalse(vm.isBackground(id: only.id),
                       "toggling the sole background OFF must leave the slide with no background media")
        XCTAssertNil(vm.currentEffects.resolvedBackgroundMedia)
    }

    func test_toggleBackground_audioPromotionClearsLegacyFields() {
        let vm = makeSubject()
        let audio = vm.addAudioObject()!
        // The first audio is auto-promoted to background. Turn it off so we
        // can drive a deliberate promotion path that exercises the legacy-
        // field clearing branch.
        vm.toggleBackground(id: audio.id)
        XCTAssertFalse(vm.currentEffects.audioPlayerObjects?.first(where: { $0.id == audio.id })?.isBackground == true)

        // Seed legacy background-audio fields to assert they get cleared.
        var effects = vm.currentEffects
        effects.backgroundAudioId = "legacy-track"
        effects.backgroundAudioVolume = 0.7
        effects.backgroundAudioStart = 1.0
        effects.backgroundAudioEnd = 4.0
        vm.currentEffects = effects

        vm.toggleBackground(id: audio.id)

        XCTAssertNil(vm.currentEffects.backgroundAudioId,
                     "promoting an audio object to background must wipe the legacy backgroundAudioId field")
        XCTAssertNil(vm.currentEffects.backgroundAudioVolume)
        XCTAssertNil(vm.currentEffects.backgroundAudioStart)
        XCTAssertNil(vm.currentEffects.backgroundAudioEnd)
    }

    // MARK: - bringToFront / sendToBack

    func test_bringToFront_promotesElementAboveAllOthers() {
        let vm = makeSubject()
        let a = vm.addText()!
        let b = vm.addText()!
        let c = vm.addText()!

        vm.bringToFront(id: a.id)

        XCTAssertGreaterThan(vm.zIndex(for: a.id), vm.zIndex(for: b.id))
        XCTAssertGreaterThan(vm.zIndex(for: a.id), vm.zIndex(for: c.id))

        // Persisted on the slide effects (so the reader sees the same order).
        let persisted = vm.currentEffects.textObjects.first(where: { $0.id == a.id })?.zIndex
        XCTAssertEqual(persisted, vm.zIndex(for: a.id))
    }

    func test_sendToBack_persistsZeroAndDemotesElement() {
        let vm = makeSubject()
        let a = vm.addText()!
        let b = vm.addText()!
        // `b` was added after `a` so currently sits higher.
        XCTAssertGreaterThan(vm.zIndex(for: b.id), vm.zIndex(for: a.id))

        vm.sendToBack(id: b.id)

        XCTAssertEqual(vm.zIndex(for: b.id), 0)
        let persisted = vm.currentEffects.textObjects.first(where: { $0.id == b.id })?.zIndex
        XCTAssertEqual(persisted, 0)
        XCTAssertGreaterThan(vm.zIndex(for: a.id), vm.zIndex(for: b.id))
    }

    // MARK: - autoExtendDuration

    func test_autoExtendDuration_extendsCurrentSlideWhenElementOverflows() {
        let vm = makeSubject()
        let initial = Float(vm.currentSlide.duration)

        vm.autoExtendDuration(forElementEnd: initial + 5)

        XCTAssertGreaterThan(Float(vm.currentSlide.duration), initial)
        XCTAssertLessThanOrEqual(Float(vm.currentSlide.duration), 600,
                                 "duration must never exceed the 600s hard cap")
    }

    func test_autoExtendDuration_targetsSpecifiedSlideNotCurrent() {
        let vm = makeSubject()
        let firstSlideId = vm.slides[0].id
        vm.addSlide()  // currentSlideIndex now points at slide 1
        XCTAssertEqual(vm.currentSlideIndex, 1)
        let firstSlideInitial = Float(vm.slides[0].duration)
        let secondSlideInitial = Float(vm.slides[1].duration)

        vm.autoExtendDuration(forElementEnd: firstSlideInitial + 10, slideId: firstSlideId)

        XCTAssertGreaterThan(Float(vm.slides[0].duration), firstSlideInitial,
                             "duration must grow on the slide identified by slideId, not the active one")
        XCTAssertEqual(Float(vm.slides[1].duration), secondSlideInitial,
                       "the active slide must be untouched when slideId points elsewhere")
    }

    func test_autoExtendDuration_isNoOpWhenElementEndsBeforeCurrentDuration() {
        let vm = makeSubject()
        let initial = Float(vm.currentSlide.duration)

        vm.autoExtendDuration(forElementEnd: initial - 1)

        XCTAssertEqual(Float(vm.currentSlide.duration), initial,
                       "shorter elements must not shrink the slide duration")
    }

    // MARK: - evictNonVisibleSlideMedia

    func test_evictNonVisibleSlideMedia_purgesOffScreenSlidesAndPreservesActive() {
        let vm = makeSubject()
        // Slide 0 (active): one image media + one audio. Bitmaps stay.
        let activeImage = vm.addMediaObject(kind: .image)!
        vm.loadedImages[activeImage.id] = makeRedSquareImage()
        let activeAudio = vm.addAudioObject()!
        vm.loadedAudioURLs[activeAudio.id] = URL(fileURLWithPath: "/tmp/active-audio.m4a")
        vm.setImage(makeRedSquareImage(), for: vm.slides[0].id)

        // Slide 1 (inactive): one image media + one video + one audio. Bitmaps must be evicted.
        vm.addSlide()
        let inactiveImage = vm.addMediaObject(kind: .image)!
        vm.loadedImages[inactiveImage.id] = makeRedSquareImage()
        let inactiveVideo = vm.addMediaObject(kind: .video)!
        vm.loadedVideoURLs[inactiveVideo.id] = URL(fileURLWithPath: "/tmp/inactive.mp4")
        vm.mediaAspectRatios[inactiveVideo.id] = 16.0 / 9.0
        let inactiveAudio = vm.addAudioObject()!
        vm.loadedAudioURLs[inactiveAudio.id] = URL(fileURLWithPath: "/tmp/inactive-audio.m4a")
        let inactiveSlideId = vm.slides[1].id
        vm.setImage(makeRedSquareImage(), for: inactiveSlideId)

        // Bring focus back to slide 0 (the slide we want to preserve).
        vm.selectSlide(at: 0)

        vm.evictNonVisibleSlideMedia()

        XCTAssertNotNil(vm.loadedImages[activeImage.id], "active slide bitmaps must survive eviction")
        XCTAssertNotNil(vm.loadedAudioURLs[activeAudio.id])
        XCTAssertNotNil(vm.slideImages[vm.slides[0].id])

        XCTAssertNil(vm.loadedImages[inactiveImage.id], "off-screen image must be dropped")
        XCTAssertNil(vm.loadedVideoURLs[inactiveVideo.id], "off-screen video URL must be dropped")
        XCTAssertNil(vm.mediaAspectRatios[inactiveVideo.id], "off-screen aspect ratio must be dropped")
        XCTAssertNil(vm.loadedAudioURLs[inactiveAudio.id], "off-screen audio URL must be dropped")
        XCTAssertNil(vm.slideImages[inactiveSlideId], "off-screen slide background bitmap must be dropped")
    }

    // MARK: - commitTimelineToCurrentSlide

    func test_commitTimelineToCurrentSlide_persistsTimelineProjectAndStripsSyntheticClips() {
        let vm = makeSubject()
        // Seed a slide-level bg image so loadCurrentSlideIntoTimeline injects
        // a synthetic background-image clip into the timeline project.
        let slideId = vm.slides[0].id
        vm.setImage(makeRedSquareImage(), for: slideId)
        // Add a real media object so the round-trip has something to persist.
        let realMedia = vm.addMediaObject(kind: .image)!

        vm.loadCurrentSlideIntoTimeline()
        XCTAssertTrue(vm.timelineViewModel.project.mediaObjects.contains(where: { StoryComposerViewModel.isSyntheticTimelineClipId($0.id) }),
                      "loadCurrentSlideIntoTimeline must surface the synthetic bg-image clip")

        vm.commitTimelineToCurrentSlide()

        let persistedMedias = vm.currentEffects.mediaObjects ?? []
        XCTAssertFalse(persistedMedias.contains(where: { StoryComposerViewModel.isSyntheticTimelineClipId($0.id) }),
                       "synthetic clips must be stripped before persisting back to the slide")
        XCTAssertTrue(persistedMedias.contains(where: { $0.id == realMedia.id }),
                      "real media objects must survive the commit round-trip")
    }

    // MARK: - Selection — selectedElementId surface

    // TODO: extract protocol for testability — the prompt mentions
    // `selectElement(id:)` / `deselectElement()`, but the current ViewModel
    // exposes selection through the `selectedElementId` property and the
    // `deselectAll()` helper. We test what exists.
    func test_addText_setsSelectedElementId() {
        let vm = makeSubject()
        XCTAssertNil(vm.selectedElementId)

        let obj = vm.addText()!

        XCTAssertEqual(vm.selectedElementId, obj.id)
    }

    /// Régression : `addText()` posait `fontSize: 24` en design units,
    /// ce qui sur iPhone (scaleFactor ≈ 0.38) donnait du 9 pt rendu —
    /// quasi-illisible dans l'éditeur inline. On garantit un minimum
    /// design correspondant au défaut du modèle (96 ≈ 36 pt rendu).
    func test_addText_usesReadableFontSize() {
        let vm = makeSubject()
        let obj = vm.addText()!
        XCTAssertGreaterThanOrEqual(obj.fontSize, 64,
            "fontSize design trop petite → texte illisible à l'écran")
    }

    func test_deselectAll_clearsSelectionAndActiveTool() {
        let vm = makeSubject()
        _ = vm.addText()
        XCTAssertNotNil(vm.selectedElementId)
        XCTAssertEqual(vm.activeTool, .text)

        vm.deselectAll()

        XCTAssertNil(vm.selectedElementId)
        XCTAssertNil(vm.activeTool)
    }

    // MARK: - applyFilter

    func test_applyFilter_writesNameAndIntensityToCurrentEffects() {
        let vm = makeSubject()
        vm.filterIntensity = 0.65

        vm.applyFilter("noir")

        XCTAssertEqual(vm.currentEffects.filter, "noir")
        XCTAssertEqual(vm.currentEffects.filterIntensity, 0.65)
        XCTAssertEqual(vm.selectedFilter, "noir")
    }

    func test_applyFilter_nilClearsFilterAndIntensity() {
        let vm = makeSubject()
        vm.applyFilter("noir")
        XCTAssertNotNil(vm.currentEffects.filter)

        vm.applyFilter(nil)

        XCTAssertNil(vm.currentEffects.filter, "passing nil must clear the filter on the slide effects")
        XCTAssertNil(vm.currentEffects.filterIntensity, "intensity must reset to nil when no filter is applied")
        XCTAssertNil(vm.selectedFilter)
    }

    // MARK: - currentSlideDuration

    // The prompt mentions `setStoryDuration(_:)` which does not exist as such;
    // the ViewModel exposes per-slide duration through `currentSlideDuration`
    // with clamping baked into the setter. We assert the clamp behaviour.
    // TODO: extract protocol for testability — a dedicated
    // `setStoryDuration(_:)` could centralise clamping for the whole story
    // (currently each slide owns its own duration).
    func test_currentSlideDuration_clampsBelowMinimum() {
        let vm = makeSubject()

        vm.currentSlideDuration = 0.5

        XCTAssertEqual(vm.currentSlideDuration, 2, accuracy: 0.001,
                       "the setter must clamp to the 2s lower bound")
    }

    func test_currentSlideDuration_clampsAboveMaximum() {
        let vm = makeSubject()

        vm.currentSlideDuration = 9_999

        XCTAssertEqual(vm.currentSlideDuration, 600, accuracy: 0.001,
                       "the setter must clamp to the 600s upper bound")
    }

    // MARK: - addAudioObject (lieu of attachAudioTrack / removeAudioTrack)

    // TODO: extract protocol for testability — the prompt mentions
    // `attachAudioTrack(_:to:)` and `removeAudioTrack(from:)`. These methods
    // do not exist on the current ViewModel; audio attachment is driven by
    // `addAudioObject()` (creation) and `deleteElement(id:)` (removal). We
    // test those two seams instead.
    func test_addAudioObject_autoPromotesFirstAudioToBackground() {
        let vm = makeSubject()

        let audio = vm.addAudioObject()!

        XCTAssertTrue(vm.isBackground(id: audio.id),
                      "the first audio added to an empty slide must be auto-promoted to background")
    }

    func test_deleteElement_evictsAudioFromCacheAndSelection() {
        let vm = makeSubject()
        let audio = vm.addAudioObject()!
        vm.loadedAudioURLs[audio.id] = URL(fileURLWithPath: "/tmp/x.m4a")
        XCTAssertEqual(vm.selectedElementId, audio.id)

        vm.deleteElement(id: audio.id)

        XCTAssertNil(vm.loadedAudioURLs[audio.id], "deleting an element must purge its side caches")
        XCTAssertNil(vm.selectedElementId, "deletion must clear selection when the element was selected")
        XCTAssertFalse(vm.currentEffects.audioPlayerObjects?.contains(where: { $0.id == audio.id }) ?? false)
    }

    // MARK: - validateForPublish

    // TODO: extract protocol for testability — the prompt asks for
    // `validateForPublish()`, but the current ViewModel does not expose any
    // such function. Validation lives in the publish callback owned by the
    // hosting view (`StoryComposerView.onPublishSlide`). A dedicated
    // `validateForPublish()` would centralise invariant checks (non-empty
    // text, decoded media, durations within bounds) into the ViewModel and
    // make them testable in isolation. For now we exercise the closest
    // available invariant: `canAddSlide` becomes false at the documented cap.
    func test_canAddSlide_becomesFalseAtTenSlides() {
        let vm = makeSubject()
        for _ in 0..<9 { vm.addSlide() }

        XCTAssertEqual(vm.slides.count, 10)
        XCTAssertFalse(vm.canAddSlide,
                       "canAddSlide must report false once the 10-slide cap is reached")
    }

    // MARK: - Helpers

    private func makeRedSquareImage() -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 1, height: 1))
        return renderer.image { ctx in
            UIColor.red.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 1, height: 1))
        }
    }
}
