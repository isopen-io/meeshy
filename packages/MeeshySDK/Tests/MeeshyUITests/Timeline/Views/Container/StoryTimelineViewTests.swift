import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryTimelineViewTests: XCTestCase {

    private func makeViewModel(project: TimelineProject = TimelineProjectFactory.projectWithVideoClip()) -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        return vm
    }

    func test_init_doesNotCrash() {
        let view = StoryTimelineView(viewModel: makeViewModel())
        _ = view.body
    }

    func test_compactVisibleTracks_neverExceedsThree() {
        let project = TimelineProjectFactory.projectWithVideoClip()
        let resolved = StoryTimelineView.resolveCompactTracks(
            project: project,
            selectedClipId: nil,
            maxCount: StoryTimelineView.compactMaxTracks
        )
        XCTAssertLessThanOrEqual(resolved.count, StoryTimelineView.compactMaxTracks)
    }

    func test_compactVisibleTracks_alwaysIncludesSelectedClipTrack() {
        let project = TimelineProjectFactory.projectWithVideoClip()
        let resolved = StoryTimelineView.resolveCompactTracks(
            project: project,
            selectedClipId: "clip-1",
            maxCount: 1
        )
        XCTAssertTrue(resolved.contains(where: { $0.containsClipId("clip-1") }),
                      "Selected clip's track must be in the compact set even when room is tight")
    }

    func test_emptyMediaTrack_isNotCounted() {
        let resolved = StoryTimelineView.resolveCompactTracks(
            project: TimelineProjectFactory.emptyProject(),
            selectedClipId: nil,
            maxCount: 3
        )
        XCTAssertTrue(resolved.allSatisfy { !$0.isEmpty })
    }

    // MARK: - Task 33 tests

    func test_deployedState_listsAllNonEmptyTracks() {
        var project = TimelineProjectFactory.projectWithVideoClip()
        project.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "a-1", postMediaId: "a-1",
                                   volume: 1.0, startTime: 0, duration: 5)
        ]
        let resolved = StoryTimelineView.resolveAllTracks(project: project)
        XCTAssertGreaterThanOrEqual(resolved.count, 2)
    }

    func test_deployedFooterCopy_isCollapseLabel() {
        XCTAssertEqual(StoryTimelineView.footerLabelKey(isExpanded: true),
                       "story.timeline.toolbar.collapseTracks")
        XCTAssertEqual(StoryTimelineView.footerLabelKey(isExpanded: false),
                       "story.timeline.toolbar.deployTracks")
    }

    func test_previewHeightFraction_compressesWhenExpanded() {
        XCTAssertGreaterThan(StoryTimelineView.previewHeightFraction(isExpanded: false),
                             StoryTimelineView.previewHeightFraction(isExpanded: true))
        XCTAssertEqual(StoryTimelineView.previewHeightFraction(isExpanded: true), 0.30, accuracy: 0.001)
    }

    // MARK: - Sections BG → FG (retour user 2026-07-20 : « placer les pistes
    // par section : BG → IMAGE/SON/VIDÉO puis FG → IMAGES/SONS/VIDÉOS/TEXTE »)

    private func mixedSectionsProject() -> TimelineProject {
        var bgImage = StoryMediaObject(id: "bg-img", postMediaId: "bg-img", kind: .image, aspectRatio: 1.0)
        bgImage.isBackground = true
        var bgVideo = StoryMediaObject(id: "bg-vid", postMediaId: "bg-vid", kind: .video, aspectRatio: 1.0)
        bgVideo.isBackground = true
        let bgAudio = StoryAudioPlayerObject(id: "bg-aud", postMediaId: "bg-aud",
                                             volume: 1.0, isBackground: true,
                                             startTime: 0, duration: 5)
        var fgImage = StoryMediaObject(id: "fg-img", postMediaId: "fg-img", kind: .image, aspectRatio: 1.0)
        fgImage.isBackground = false
        var fgVideo = StoryMediaObject(id: "fg-vid", postMediaId: "fg-vid", kind: .video, aspectRatio: 1.0)
        fgVideo.isBackground = false
        let fgAudio = StoryAudioPlayerObject(id: "fg-aud", postMediaId: "fg-aud",
                                             volume: 1.0, isBackground: false,
                                             startTime: 0, duration: 3)
        let text = StoryTextObject(id: "txt-1", text: "Hello")
        return TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [fgVideo, bgImage, fgImage, bgVideo],
            audioPlayerObjects: [fgAudio, bgAudio],
            textObjects: [text],
            clipTransitions: []
        )
    }

    func test_resolveAllTracks_backgroundSectionFirst_imageSoundVideoOrder() {
        let tracks = StoryTimelineView.resolveAllTracks(project: mixedSectionsProject())
        let kinds = tracks.map(\.kind)
        XCTAssertEqual(kinds, [.bgImage, .bgAudio, .bgVideo, .image, .audio, .video, .text],
                       "Section FOND (image/son/vidéo) d'abord, puis AVANT-PLAN (images/sons/vidéos/textes)")
    }

    func test_resolveAllTracks_bgKind_derivedFromIsBackground_notFirstIndex() {
        var a = StoryMediaObject(id: "v1", postMediaId: "v1", kind: .video, aspectRatio: 1.0)
        a.isBackground = false
        var b = StoryMediaObject(id: "v2", postMediaId: "v2", kind: .video, aspectRatio: 1.0)
        b.isBackground = false
        let project = TimelineProject(slideId: "s", slideDuration: 10,
                                      mediaObjects: [a, b],
                                      audioPlayerObjects: [], textObjects: [], clipTransitions: [])
        let tracks = StoryTimelineView.resolveAllTracks(project: project)
        XCTAssertEqual(tracks.map(\.kind), [.video, .video],
                       "Sans isBackground, AUCUNE piste n'est bg — l'ancien « premier de chaque type = bg » était faux")
    }

    func test_resolveAllTracks_foregroundNumbering_ignoresBackgroundClips() {
        let tracks = StoryTimelineView.resolveAllTracks(project: mixedSectionsProject())
        XCTAssertTrue(tracks.contains(where: { $0.id == "video-1" && $0.kind == .video }),
                      "La vidéo FG est VIDEO_1 — la vidéo de fond ne consomme pas la numérotation FG")
        XCTAssertTrue(tracks.contains(where: { $0.id == "image-1" && $0.kind == .image }))
    }

    func test_typeLabel_backgroundKinds_haveBGPrefixWithoutIndex() {
        XCTAssertEqual(StoryTimelineView.typeLabel(kind: .bgImage, index: 1, customName: nil), "BG_IMAGE")
        XCTAssertEqual(StoryTimelineView.typeLabel(kind: .bgAudio, index: 1, customName: nil), "BG_AUDIO")
        XCTAssertEqual(StoryTimelineView.typeLabel(kind: .bgVideo, index: 1, customName: nil), "BG_VIDEO")
        XCTAssertEqual(StoryTimelineView.typeLabel(kind: .video, index: 2, customName: nil), "VIDEO_2")
    }

    // MARK: - Zoom étendu (retour user 2026-07-20 : 5 % – 800 %)

    func test_zoomRange_extendedTo5PercentAnd800Percent() {
        XCTAssertEqual(TimelineScrubArea<Color>.zoomRange.lowerBound, 0.05, accuracy: 0.001)
        XCTAssertEqual(TimelineScrubArea<Color>.zoomRange.upperBound, 8.0, accuracy: 0.001)
    }

    func test_pinchZoom_clampsToExtendedBounds() {
        XCTAssertEqual(TimelineScrubArea<Color>.pinchZoom(anchor: 4, magnification: 10),
                       8.0, accuracy: 0.001)
        XCTAssertEqual(TimelineScrubArea<Color>.pinchZoom(anchor: 0.25, magnification: 0.01),
                       0.05, accuracy: 0.001)
    }

    func test_resolveCompactTracks_backgroundLanesFirst() {
        let tracks = StoryTimelineView.resolveCompactTracks(
            project: mixedSectionsProject(), selectedClipId: nil, maxCount: 10)
        let firstFgIndex = tracks.firstIndex(where: { !$0.kind.isBackgroundSection }) ?? tracks.count
        let lastBgIndex = tracks.lastIndex(where: { $0.kind.isBackgroundSection }) ?? -1
        XCTAssertLessThan(lastBgIndex, firstFgIndex,
                          "Le strip compact liste aussi la section FOND avant l'AVANT-PLAN")
        XCTAssertTrue(tracks.contains(where: { $0.kind.isBackgroundSection }))
    }
}
