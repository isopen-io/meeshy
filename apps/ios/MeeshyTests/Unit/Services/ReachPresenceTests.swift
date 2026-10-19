import XCTest
import SwiftUI
import UIKit
@testable import Meeshy

/// #11037 — un même AFFICHAGE ne compte qu'une fois. Les deux rangées du rail
/// (grande et épinglée) montrent les mêmes anneaux : passer de l'une à l'autre,
/// ou les voir ensemble pendant le fondu, n'est pas un nouvel affichage.
@MainActor
final class ReachPresenceTests: XCTestCase {

    private func makeSUT(start: Date = Date(timeIntervalSince1970: 1_000)) -> (sut: ReachPresence, clock: PresenceClockBox) {
        let clock = PresenceClockBox(now: start)
        return (ReachPresence(clock: { clock.now }), clock)
    }

    func test_appeared_firstHolder_isANewDisplay() {
        let (sut, _) = makeSUT()

        XCTAssertTrue(sut.appeared("s1"))
    }

    func test_appeared_secondHolderWhileTheFirstShows_isNotANewDisplay() {
        let (sut, _) = makeSUT()
        _ = sut.appeared("s1")

        XCTAssertFalse(sut.appeared("s1"), "La rangée épinglée qui montre le même anneau pendant le fondu ne recompte pas.")
    }

    func test_swapBetweenRows_neverRecounts() {
        let (sut, clock) = makeSUT()
        _ = sut.appeared("s1")
        _ = sut.appeared("s1")
        sut.disappeared("s1")
        clock.now += 30

        XCTAssertFalse(sut.appeared("s1"), "Tant qu'une rangée le montre, l'anneau n'a jamais quitté l'écran.")
    }

    func test_reappearanceWithinTheGrace_isNotANewDisplay() {
        let (sut, clock) = makeSUT()
        _ = sut.appeared("s1")
        sut.disappeared("s1")
        clock.now += ReachPresence.rejoinGrace - 0.5

        XCTAssertFalse(sut.appeared("s1"), "Une sortie suivie d'un retour immédiat (seuil franchi au défilement) n'est pas un nouvel affichage.")
    }

    func test_reappearanceAfterTheGrace_isANewDisplay() {
        let (sut, clock) = makeSUT()
        _ = sut.appeared("s1")
        sut.disappeared("s1")
        clock.now += ReachPresence.rejoinGrace + 0.5

        XCTAssertTrue(sut.appeared("s1"), "Les autres lecteurs comptent à chaque vrai retour à l'écran.")
    }

    func test_distinctContents_areCountedIndependently() {
        let (sut, _) = makeSUT()
        _ = sut.appeared("s1")

        XCTAssertTrue(sut.appeared("s2"))
    }

    func test_unmatchedDisappearance_isIgnored() {
        let (sut, _) = makeSUT()
        sut.disappeared("s1")

        XCTAssertTrue(sut.appeared("s1"))
    }

    // MARK: - Le modificateur, deux rangées montées ensemble

    private var window: UIWindow?

    override func tearDown() async throws {
        window?.isHidden = true
        window = nil
        try await super.tearDown()
    }

    private func host<V: View>(_ view: V) -> UIHostingController<V> {
        let controller = UIHostingController(rootView: view)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
        window.rootViewController = controller
        window.isHidden = false
        self.window = window
        controller.view.layoutIfNeeded()
        return controller
    }

    private func settle() async {
        for _ in 0..<5 {
            window?.layoutIfNeeded()
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
    }

    func test_modifier_twoRowsShowingTheSameRing_countOnce() async {
        let (presence, _) = makeSUT()
        let recorder = PresenceRecordingSpy()
        let controller = host(TwoRowsProbe(storyId: "s1", showsLarge: true, showsPinned: false, presence: presence, recorder: recorder))
        await settle()

        controller.rootView = TwoRowsProbe(storyId: "s1", showsLarge: true, showsPinned: true, presence: presence, recorder: recorder)
        await settle()
        controller.rootView = TwoRowsProbe(storyId: "s1", showsLarge: false, showsPinned: true, presence: presence, recorder: recorder)
        await settle()

        XCTAssertEqual(recorder.ids, ["s1"])
    }

    func test_modifier_withoutPresence_stillCountsEachAppearance() async {
        let recorder = PresenceRecordingSpy()
        let controller = host(TwoRowsProbe(storyId: "s1", showsLarge: true, showsPinned: true, presence: nil, recorder: recorder))
        await settle()
        _ = controller

        XCTAssertEqual(recorder.ids, ["s1", "s1"], "Les surfaces hors rail gardent la règle « chaque apparition compte ».")
    }
}

@MainActor
private final class PresenceClockBox {
    nonisolated deinit {}
    var now: Date
    init(now: Date) { self.now = now }
}

@MainActor
private final class PresenceRecordingSpy {
    nonisolated deinit {}
    private(set) var ids: [String] = []
    func record(_ id: String) { ids.append(id) }
}

private struct TwoRowsProbe: View {
    let storyId: String
    let showsLarge: Bool
    let showsPinned: Bool
    let presence: ReachPresence?
    let recorder: PresenceRecordingSpy

    var body: some View {
        VStack {
            if showsPinned {
                Text("épinglée")
                    .countsImpression(of: storyId, recountsOnChange: false, presence: presence) { recorder.record($0) }
            }
            if showsLarge {
                Text("grande")
                    .countsImpression(of: storyId, recountsOnChange: false, presence: presence) { recorder.record($0) }
            }
        }
    }
}
