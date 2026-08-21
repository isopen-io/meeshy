import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// L'aimantation d'un glissement de clip est exprimée en POINTS de doigt, donc
/// convertie en secondes par le zoom courant. La conversion était écrite pour
/// une plage de zoom 25 %–400 % ; les bornes ont été élargies à 5 %–800 % le
/// 2026-07-20 sans que la formule suive.
///
/// À 5 %, huit points valent **3,2 secondes** : sur une story de six secondes,
/// l'aimant couvre plus de la moitié de la timeline. Le clip saute alors d'un
/// point d'accroche à l'autre et refuse toute position intermédiaire — le
/// glissement devient inutilisable, ce qui est exactement ce que l'auteur
/// constate en dézoomant.
///
/// Même famille que la règle devenue illisible à 5 % : une formule juste sur
/// son ancienne plage, périmée par l'élargissement des bornes.
@MainActor
final class TimelineViewModelDragSnapToleranceTests: XCTestCase {

    private func makeViewModel(zoomScale: CGFloat) -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.06))
        var video = StoryMediaObject(id: "v1", postMediaId: "v1",
                                     kind: .video, aspectRatio: 1.0)
        video.startTime = 0
        video.duration = 1
        var moved = StoryMediaObject(id: "m1", postMediaId: "m1",
                                     kind: .image, aspectRatio: 1.0)
        moved.startTime = 0
        moved.duration = 1
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: 6,
                                              mediaObjects: [video, moved],
                                              audioPlayerObjects: [],
                                              textObjects: [],
                                              clipTransitions: []),
                     mediaURLs: [:], images: [:])
        vm.zoomScale = zoomScale
        return vm
    }

    /// Le geste vise 2,0 s. Les bords voisins (0 s, 1 s, la fin de slide) sont
    /// tous à plus d'une demi-seconde : rien ne justifie de les préférer.
    private func droppedStart(zoomScale: CGFloat) -> Float {
        let vm = makeViewModel(zoomScale: zoomScale)
        vm.beginClipDrag(clipId: "m1")
        vm.dragClipMoved(rawTime: 2.0, snapCandidates: [],
                         geometry: TimelineGeometry(zoomScale: zoomScale))
        vm.endClipDrag()
        return vm.project.mediaObjects.first(where: { $0.id == "m1" })?.startTime.map(Float.init) ?? -1
    }

    func test_atNominalZoom_theClipLandsWhereTheFingerAsked() {
        XCTAssertEqual(droppedStart(zoomScale: 1.0), 2.0, accuracy: 0.05)
    }

    func test_zoomedOut_theClipStillLandsWhereTheFingerAsked() {
        XCTAssertEqual(droppedStart(zoomScale: 0.25), 2.0, accuracy: 0.05)
    }

    /// Le zoom le plus large de la plage — celui qui « embrasse une timeline de
    /// plusieurs minutes d'un coup d'œil ». C'est là que l'aimant avalait tout.
    func test_atWidestZoom_theClipStillLandsWhereTheFingerAsked() {
        XCTAssertEqual(droppedStart(zoomScale: 0.05), 2.0, accuracy: 0.05)
    }

    /// L'aimant doit rester UTILE : un bord frôlé de quelques centièmes de
    /// seconde s'accroche toujours.
    func test_theMagnetStillCatchesANearbyEdge() {
        let vm = makeViewModel(zoomScale: 1.0)
        vm.beginClipDrag(clipId: "m1")
        vm.dragClipMoved(rawTime: 1.02, snapCandidates: [],
                         geometry: TimelineGeometry(zoomScale: 1.0))
        vm.endClipDrag()
        let start = vm.project.mediaObjects.first(where: { $0.id == "m1" })?.startTime ?? -1
        XCTAssertEqual(Float(start), 1.0, accuracy: 0.001,
                       "Le bord de fin de la vidéo (1,0 s) doit encore attraper un glissement qui le frôle")
    }

    /// La borne : quel que soit le zoom, l'aimant ne décide jamais à la place de
    /// l'auteur au-delà d'un quart de seconde.
    func test_toleranceIsCappedAcrossTheWholeZoomRange() {
        var zoom = TimelineScrubArea<AnyView>.zoomRange.lowerBound
        while zoom <= TimelineScrubArea<AnyView>.zoomRange.upperBound {
            let tolerance = TimelineGeometry(zoomScale: zoom).dragSnapToleranceSeconds
            XCTAssertLessThanOrEqual(tolerance, TimelineGeometry.maxSnapToleranceSeconds,
                                     "zoom \(zoom) : tolérance \(tolerance) s")
            XCTAssertGreaterThan(tolerance, 0)
            zoom *= 1.15
        }
    }
}
