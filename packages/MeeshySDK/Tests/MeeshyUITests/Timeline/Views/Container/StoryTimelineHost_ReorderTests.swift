import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// `StoryTimelineHost.applyReorder` (D3) traduit un dépôt `Plan2DView.onReorder`
/// (D2, gelé) en mutations `TimelineViewModel`, par famille — média/texte via
/// `setClipTransform(.zIndex)`, média/audio via `setClipBackground` au
/// franchissement d'un plan. Audio/sticker n'ont AUCUN pilotage de z
/// aujourd'hui (limitation existante hors ownership `Timeline/**`) : le
/// reorder y reste un no-op pour le z, documenté plutôt que silencieux.
@MainActor
final class StoryTimelineHostReorderTests: XCTestCase {

    private func makeViewModel(project: TimelineProject) -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.06))
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        return vm
    }

    private static let tracks: [Plan2DTrack] = [
        Plan2DTrack(id: "m1", label: "m1", plane: .fg, z: 3, bar: .ghost),
        Plan2DTrack(id: "m2", label: "m2", plane: .fg, z: 2, bar: .ghost),
        Plan2DTrack(id: "bg1", label: "bg1", plane: .bg, z: 5, bar: .ghost)
    ]

    func test_applyReorder_media_updatesZIndex() {
        var a = StoryMediaObject(id: "m1", postMediaId: "m1", kind: .video, aspectRatio: 1.0)
        a.startTime = 0; a.duration = 2
        var b = StoryMediaObject(id: "m2", postMediaId: "m2", kind: .video, aspectRatio: 1.0)
        b.startTime = 0; b.duration = 2
        let project = TimelineProject(slideId: "s", slideDuration: 10,
                                      mediaObjects: [a, b], audioPlayerObjects: [],
                                      textObjects: [], clipTransitions: [])
        let vm = makeViewModel(project: project)

        StoryTimelineHost.applyReorder(id: "m1", toIndex: 1, tracks: Self.tracks, to: vm)

        XCTAssertEqual(vm.project.mediaObjects.first(where: { $0.id == "m1" })?.zIndex, 1,
                       "voisin \"m2\" (z=2), descendu : juste dessous = 1")
    }

    func test_applyReorder_mediaCrossingIntoBackgroundPlane_flipsIsBackground() {
        var a = StoryMediaObject(id: "m1", postMediaId: "m1", kind: .video, aspectRatio: 1.0)
        a.startTime = 0; a.duration = 2
        let project = TimelineProject(slideId: "s", slideDuration: 10,
                                      mediaObjects: [a], audioPlayerObjects: [],
                                      textObjects: [], clipTransitions: [])
        let vm = makeViewModel(project: project)

        StoryTimelineHost.applyReorder(id: "m1", toIndex: 2, tracks: Self.tracks, to: vm)

        XCTAssertEqual(vm.project.mediaObjects.first(where: { $0.id == "m1" })?.isBackground, true)
    }

    func test_applyReorder_samePlane_doesNotToggleIsBackground() {
        var a = StoryMediaObject(id: "m1", postMediaId: "m1", kind: .video, aspectRatio: 1.0)
        a.startTime = 0; a.duration = 2
        let project = TimelineProject(slideId: "s", slideDuration: 10,
                                      mediaObjects: [a], audioPlayerObjects: [],
                                      textObjects: [], clipTransitions: [])
        let vm = makeViewModel(project: project)

        StoryTimelineHost.applyReorder(id: "m1", toIndex: 1, tracks: Self.tracks, to: vm)

        XCTAssertFalse(vm.canUndo == true && vm.project.mediaObjects[0].isBackground == true,
                       "rester dans .fg ne doit jamais poser isBackground")
        XCTAssertEqual(vm.project.mediaObjects[0].isBackground, false)
    }

    func test_applyReorder_unknownId_doesNothing() {
        let vm = makeViewModel(project: TimelineProjectFactory.emptyProject())
        StoryTimelineHost.applyReorder(id: "nope", toIndex: 0, tracks: Self.tracks, to: vm)
        XCTAssertFalse(vm.canUndo)
    }

    /// Sticker : aucun z pilotable (`StorySticker` rejette `.transform` au
    /// Modèle) — le reorder ne doit ni crasher ni pousser de commande.
    func test_applyReorder_sticker_isSafeNoOp() {
        var sticker = StorySticker(id: "st1", emoji: "☺")
        sticker.startTime = 0; sticker.duration = 2
        let project = TimelineProject(slideId: "s", slideDuration: 10,
                                      mediaObjects: [], audioPlayerObjects: [],
                                      textObjects: [], stickerObjects: [sticker],
                                      clipTransitions: [])
        let vm = makeViewModel(project: project)
        let tracksWithSticker: [Plan2DTrack] = [
            Plan2DTrack(id: "st1", label: "☺", plane: .fg, z: 1, bar: .timed(start: 0, end: 2)),
            Plan2DTrack(id: "other", label: "other", plane: .fg, z: 0, bar: .ghost)
        ]

        StoryTimelineHost.applyReorder(id: "st1", toIndex: 1, tracks: tracksWithSticker, to: vm)

        XCTAssertFalse(vm.canUndo)
        XCTAssertEqual(vm.project.stickerObjects[0].zIndex, 0, "inchangé : aucun pilotage de z pour le sticker")
    }
}
