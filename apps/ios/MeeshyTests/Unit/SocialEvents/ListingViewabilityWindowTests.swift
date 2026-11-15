import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// La part visible d'une carte de listing se mesurait contre la fenêtre CLÉ de la scène active. Sous Stage Manager
/// ou avec une fenêtre détachée, une carte de l'autre fenêtre — plus étroite — se comptait visible alors qu'elle
/// était hors de SA fenêtre : impressions et durées de visibilité gonflées. Elle se mesure désormais contre la
/// fenêtre qui la porte (`\.sceneWindowSize`).
@MainActor
final class ListingViewabilityWindowTests: XCTestCase {

    @MainActor
    private final class FractionRecorder: ReachImpressionRecording {
        nonisolated deinit {}
        private(set) var fractions: [Double] = []
        func record(_ postId: String) {}
        func flushNow() async {}
        func recordListed(_ postId: String, position: Int?, isVideo: Bool) -> String? { "event-\(postId)" }
        func noteVisible(fraction: Double, of eventId: String) { fractions.append(fraction) }
        func noteGone(_ eventId: String) {}
    }

    func test_aCardBeyondItsNarrowWindow_isNotVisible() {
        let recorder = FractionRecorder()
        // Fenêtre de 320 pt ; la carte commence à x = 330 : entièrement hors de SA fenêtre.
        let root = ZStack(alignment: .topLeading) {
            Color.clear
            Color.blue.frame(width: 60, height: 100)
                .countsListedImpression(of: "p1", in: recorder, position: { 0 })
                .padding(.leading, 330)
        }
        .frame(width: 320, height: 600, alignment: .topLeading)
        .publishingSceneWindowSize()

        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 600))
        let host = UIHostingController(rootView: root)
        window.rootViewController = host
        window.isHidden = false
        window.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.3))
        defer { window.isHidden = true }

        XCTAssertFalse(recorder.fractions.isEmpty, "précondition : la carte a été mesurée")
        XCTAssertEqual(recorder.fractions.last, 0, "hors de sa fenêtre, une carte n'est pas visible")
    }
}
