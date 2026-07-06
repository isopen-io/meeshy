import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Sprint 6 #61 — P4 testability seam.
///
/// Three behaviours covered, matching the test-strategy in the design memo:
///   1. The concrete `StoryComposerViewModel` MUST conform to
///      `StoryComposerProviding` at compile time so the protocol is the only
///      thing host views need to depend on.
///   2. The mock's stored-property setters MUST round-trip through the
///      protocol existential — settable members reachable via
///      `StoryComposerProviding` are the wiring the host view writes through
///      (selection, active tool, timeline visibility, …).
///   3. The mock's mutating-method call counters MUST increment when invoked
///      through the protocol existential — proves the protocol method
///      surface is wired to the mock's bookkeeping.
///
/// Isolation: `MeeshyUITests` keeps the default `nonisolated` swift settings
/// (Package.swift) to remain compatible with XCTestCase's inherited init /
/// setUp / tearDown. The class opts into `@MainActor` explicitly because the
/// protocol it exercises (`StoryComposerProviding`) is `@MainActor`-isolated.
@MainActor
final class StoryComposerProtocolConformanceTests: XCTestCase {

    // MARK: - 1) Compile-time conformance

    /// The mere fact that this method compiles proves `StoryComposerViewModel`
    /// declares `StoryComposerProviding` conformance. The runtime cast is a
    /// belt-and-braces guard against any future extension that might
    /// accidentally remove the conformance via a typo.
    func test_concreteViewModel_conformsToProtocol() {
        let vm = StoryComposerViewModel()
        let provider: any StoryComposerProviding = vm

        XCTAssertTrue(
            provider is StoryComposerViewModel,
            "StoryComposerViewModel must conform to StoryComposerProviding"
        )
    }

    // MARK: - 2) Mock drives protocol surface — setters

    /// Settable properties exposed by the protocol — selection, active tool,
    /// timeline visibility, drawing state, canvas viewport — MUST be writable
    /// through the existential and observable when read back.
    func test_mock_drives_protocol_surface_setters() {
        let mock = MockStoryComposerViewModel()
        let provider: any StoryComposerProviding = mock

        // Selection + active tool.
        provider.selectedElementId = "elem-42"
        provider.activeTool = .text
        XCTAssertEqual(provider.selectedElementId, "elem-42")
        XCTAssertEqual(provider.activeTool, .text)

        // Repost chain (Patch B.6 — host view forwards these to PostService).
        provider.repostOfId = "story-1"
        provider.originalRepostOfId = "root-1"
        XCTAssertEqual(provider.repostOfId, "story-1")
        XCTAssertEqual(provider.originalRepostOfId, "root-1")

        // Timeline visibility + playback state — driven by the timeline sheet.
        provider.isTimelineVisible = true
        provider.timelinePlaybackTime = 4.5
        provider.isTimelinePlaying = true
        provider.timelineZoomScale = 2.0
        provider.timelineScrollOffset = 120
        provider.timelineAdvanced = true
        provider.isMuted = true
        provider.hasBackgroundImage = true
        XCTAssertTrue(provider.isTimelineVisible)
        XCTAssertEqual(provider.timelinePlaybackTime, 4.5, accuracy: 0.001)
        XCTAssertTrue(provider.isTimelinePlaying)
        XCTAssertEqual(provider.timelineZoomScale, 2.0, accuracy: 0.001)
        XCTAssertEqual(provider.timelineScrollOffset, 120, accuracy: 0.001)
        XCTAssertTrue(provider.timelineAdvanced)
        XCTAssertTrue(provider.isMuted)
        XCTAssertTrue(provider.hasBackgroundImage)

        // Drawing state — driven by the drawing toolbar.
        provider.drawingData = Data([0x01, 0x02, 0x03])
        provider.drawingColor = .red
        provider.drawingWidth = 12
        XCTAssertEqual(provider.drawingData, Data([0x01, 0x02, 0x03]))
        XCTAssertEqual(provider.drawingWidth, 12)

        // Filter — driven by the filter panel.
        provider.selectedFilter = "noir"
        provider.filterIntensity = 0.6
        XCTAssertEqual(provider.selectedFilter, "noir")
        XCTAssertEqual(provider.filterIntensity, 0.6, accuracy: 0.001)

        // Canvas viewport — driven by pinch / pan gestures.
        provider.canvasScale = 1.8
        provider.canvasOffset = CGSize(width: 30, height: -10)
        provider.canvasSize = CGSize(width: 390, height: 844)
        XCTAssertEqual(provider.canvasScale, 1.8, accuracy: 0.001)
        XCTAssertEqual(provider.canvasOffset, CGSize(width: 30, height: -10))
        XCTAssertEqual(provider.canvasSize, CGSize(width: 390, height: 844))

        // UI state — pickers + alerts driven by toolbar buttons.
        provider.showPhotoPicker = true
        provider.showVideoPicker = true
        provider.showAudioPicker = true
        provider.publishProgress = (current: 2, total: 5)
        provider.errorMessage = "kaboom"
        provider.showDraftAlert = true
        XCTAssertTrue(provider.showPhotoPicker)
        XCTAssertTrue(provider.showVideoPicker)
        XCTAssertTrue(provider.showAudioPicker)
        XCTAssertEqual(provider.publishProgress?.current, 2)
        XCTAssertEqual(provider.publishProgress?.total, 5)
        XCTAssertEqual(provider.errorMessage, "kaboom")
        XCTAssertTrue(provider.showDraftAlert)

        // Slide-level write-through.
        provider.currentSlideIndex = 3
        XCTAssertEqual(provider.currentSlideIndex, 3)

        // Slide-duration setter — propagates via the protocol's `set`.
        provider.currentSlideDuration = 7.5
        XCTAssertEqual(provider.currentSlideDuration, 7.5, accuracy: 0.001)
    }

    // MARK: - 3) Mock drives protocol surface — methods with counters

    /// Every mutating-method on the protocol — slide management, element
    /// management, drag lifecycle, timeline bootstrap/commit, memory observer,
    /// reset — MUST hit the mock's call counter when invoked through the
    /// existential. Last-args snapshots cover the argument plumbing.
    func test_mock_drives_protocol_surface_methods_with_counters() {
        let mock = MockStoryComposerViewModel()
        let provider: any StoryComposerProviding = mock

        // Background transform lifecycle.
        provider.saveBackgroundTransform()
        provider.restoreBackgroundTransform()
        XCTAssertEqual(mock._saveBackgroundTransformCalls, 1)
        XCTAssertEqual(mock._restoreBackgroundTransformCalls, 1)

        // Aspect-ratio bookkeeping.
        provider.setAspectRatio(1.77, for: "media-1")
        XCTAssertEqual(mock._setAspectRatioCalls, 1)
        XCTAssertEqual(mock._setAspectRatioLastArgs?.ratio, 1.77)
        XCTAssertEqual(mock._setAspectRatioLastArgs?.mediaId, "media-1")
        XCTAssertEqual(provider.mediaAspectRatios["media-1"], 1.77)

        // Drag gesture lifecycle.
        provider.beginDrag(elementId: "elem-1", position: .init(x: 0.4, y: 0.6), size: .init(width: 100, height: 50))
        provider.updateDrag(position: .init(x: 0.5, y: 0.7))
        provider.endDrag()
        XCTAssertEqual(mock._beginDragCalls, 1)
        XCTAssertEqual(mock._beginDragLastArgs?.elementId, "elem-1")
        XCTAssertEqual(mock._updateDragCalls, 1)
        XCTAssertEqual(mock._updateDragLastPosition?.x, 0.5)
        XCTAssertEqual(mock._endDragCalls, 1)

        // Timeline bootstrap + commit.
        provider.loadCurrentSlideIntoTimeline()
        provider.commitTimelineToCurrentSlide()
        XCTAssertEqual(mock._loadCurrentSlideIntoTimelineCalls, 1)
        XCTAssertEqual(mock._commitTimelineToCurrentSlideCalls, 1)

        // Filter application.
        provider.applyFilter("vivid")
        provider.updateFilterIntensity(0.8)
        XCTAssertEqual(mock._applyFilterCalls, 1)
        XCTAssertEqual(mock._applyFilterLastName ?? nil, "vivid")
        XCTAssertEqual(mock._updateFilterIntensityCalls, 1)
        XCTAssertEqual(mock._updateFilterIntensityLastValue, 0.8)

        // Duration auto-extend.
        provider.autoExtendDuration(forElementEnd: 9.2, slideId: "slide-A")
        XCTAssertEqual(mock._autoExtendDurationCalls, 1)
        XCTAssertEqual(mock._autoExtendDurationLastArgs?.end, 9.2)
        XCTAssertEqual(mock._autoExtendDurationLastArgs?.slideId, "slide-A")

        // Canvas-zoom reset + viewport center.
        provider.resetCanvasZoom()
        XCTAssertEqual(mock._resetCanvasZoomCalls, 1)
        _ = provider.viewportCenter()
        XCTAssertEqual(mock._viewportCenterCalls, 1)

        // Slide management.
        provider.addSlide()
        provider.removeSlide(at: 2)
        provider.duplicateSlide(at: 0)
        provider.selectSlide(at: 1)
        provider.moveSlide(from: 0, to: 2)
        XCTAssertEqual(mock._addSlideCalls, 1)
        XCTAssertEqual(mock._removeSlideCalls, 1)
        XCTAssertEqual(mock._removeSlideLastIndex, 2)
        XCTAssertEqual(mock._duplicateSlideCalls, 1)
        XCTAssertEqual(mock._duplicateSlideLastIndex, 0)
        XCTAssertEqual(mock._selectSlideCalls, 1)
        XCTAssertEqual(mock._selectSlideLastIndex, 1)
        XCTAssertEqual(provider.currentSlideIndex, 1)
        XCTAssertEqual(mock._moveSlideCalls, 1)
        XCTAssertEqual(mock._moveSlideLastArgs?.source, 0)
        XCTAssertEqual(mock._moveSlideLastArgs?.destination, 2)

        // Element management.
        _ = provider.addText()
        _ = provider.addMediaObject(kind: .image, toSlideId: "slide-B")
        provider.setMediaDuration(id: "m-1", duration: 3.5, slideId: "slide-B")
        _ = provider.addAudioObject()
        provider.deleteElement(id: "elem-z")
        provider.updateElementLanguage(elementId: "elem-y", language: "fr")
        provider.duplicateElement(id: "elem-x")
        XCTAssertEqual(mock._addTextCalls, 1)
        XCTAssertEqual(mock._addMediaObjectCalls, 1)
        XCTAssertEqual(mock._addMediaObjectLastArgs?.kind, .image)
        XCTAssertEqual(mock._addMediaObjectLastArgs?.toSlideId, "slide-B")
        XCTAssertEqual(mock._setMediaDurationCalls, 1)
        XCTAssertEqual(mock._setMediaDurationLastArgs?.id, "m-1")
        XCTAssertEqual(mock._setMediaDurationLastArgs?.duration, 3.5)
        XCTAssertEqual(mock._addAudioObjectCalls, 1)
        XCTAssertEqual(mock._deleteElementCalls, 1)
        XCTAssertEqual(mock._deleteElementLastId, "elem-z")
        XCTAssertEqual(mock._updateElementLanguageCalls, 1)
        XCTAssertEqual(mock._updateElementLanguageLastArgs?.language, "fr")
        XCTAssertEqual(mock._duplicateElementCalls, 1)
        XCTAssertEqual(mock._duplicateElementLastId, "elem-x")

        // Background toggle + isBackground query.
        provider.toggleBackground(id: "elem-bg")
        mock.stubIsBackground["elem-bg"] = true
        XCTAssertTrue(provider.isBackground(id: "elem-bg"))
        XCTAssertEqual(mock._toggleBackgroundCalls, 1)
        XCTAssertEqual(mock._toggleBackgroundLastId, "elem-bg")
        XCTAssertEqual(mock._isBackgroundCalls, 1)

        // Z-order.
        mock.stubZIndex["elem-1"] = 7
        XCTAssertEqual(provider.zIndex(for: "elem-1"), 7)
        provider.bringToFront(id: "elem-1")
        provider.sendToBack(id: "elem-2")
        XCTAssertEqual(mock._zIndexCalls, 1)
        XCTAssertEqual(mock._bringToFrontCalls, 1)
        XCTAssertEqual(mock._bringToFrontLastId, "elem-1")
        XCTAssertEqual(mock._sendToBackCalls, 1)
        XCTAssertEqual(mock._sendToBackLastId, "elem-2")

        // Tool selection + deselect.
        provider.selectTool(.drawing)
        provider.deselectAll()
        XCTAssertEqual(mock._selectToolCalls, 1)
        XCTAssertEqual(mock._selectToolLastTool ?? nil, .drawing)
        XCTAssertEqual(mock._deselectAllCalls, 1)
        XCTAssertNil(provider.selectedElementId)
        XCTAssertNil(provider.activeTool)

        // Memory observer + cleanup.
        provider.startMemoryObserver()
        provider.stopMemoryObserver()
        provider.evictNonVisibleSlideMedia()
        provider.cleanupTempFiles()
        XCTAssertEqual(mock._startMemoryObserverCalls, 1)
        XCTAssertEqual(mock._stopMemoryObserverCalls, 1)
        XCTAssertEqual(mock._evictNonVisibleSlideMediaCalls, 1)
        XCTAssertEqual(mock._cleanupTempFilesCalls, 1)

        // Slide-image plumbing.
        let image = UIImage()
        provider.setImage(image, for: "slide-img")
        _ = provider.imageForCurrentSlide()
        XCTAssertEqual(mock._setImageCalls, 1)
        XCTAssertEqual(mock._setImageLastArgs?.slideId, "slide-img")
        XCTAssertNotNil(provider.slideImages["slide-img"])
        XCTAssertEqual(mock._imageForCurrentSlideCalls, 1)

        // Reset.
        provider.reset()
        XCTAssertEqual(mock._resetCalls, 1)
        XCTAssertEqual(provider.slides.count, 1)
        XCTAssertEqual(provider.currentSlideIndex, 0)
        XCTAssertNil(provider.errorMessage)
    }
}
