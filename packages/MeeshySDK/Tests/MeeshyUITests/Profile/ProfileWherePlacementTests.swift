import Combine
import SwiftUI
import XCTest
@testable import MeeshyUI

/// Le bloc « Où il est » suit la position SERVIE, pas l'instant où la fiche s'est peinte (#20242) : la fiche s'ouvre
/// souvent avant que le rattrapage des positions n'arrive (démarrage à froid, socket pas encore accrochée). Une lecture
/// figée au premier rendu laissait la fiche sans carte alors que la position était servie quelques instants plus tard.
@MainActor
final class ProfileWherePlacementTests: XCTestCase {

    private func map(offered: Bool, changes: ((String) -> AnyPublisher<Bool, Never>)? = nil) -> ProfileLocationMap {
        ProfileLocationMap(isOffered: { _ in offered }, offeredChanges: changes,
                           destination: { _ in AnyView(EmptyView()) },
                           preview: { _, _ in AnyView(EmptyView()) })
    }

    func test_placement_withoutLiveReading_usesTheSynchronousAnswer() {
        XCTAssertEqual(map(offered: false).placement(for: "bob", live: nil), .none)
        XCTAssertEqual(map(offered: true).placement(for: "bob", live: nil), .card)
    }

    func test_placement_aLiveReading_winsOverTheFirstPaint() {
        XCTAssertEqual(map(offered: false).placement(for: "bob", live: true), .card)
        XCTAssertEqual(map(offered: true).placement(for: "bob", live: false), .none)
    }

    func test_offeredChanges_isServedByTheHost() {
        let subject = CurrentValueSubject<Bool, Never>(false)
        let sut = map(offered: false, changes: { _ in subject.eraseToAnyPublisher() })
        var seen: [Bool] = []
        let watch = sut.offeredChanges?("bob").sink { seen.append($0) }
        subject.send(true)
        XCTAssertEqual(seen, [false, true])
        watch?.cancel()
    }
}
