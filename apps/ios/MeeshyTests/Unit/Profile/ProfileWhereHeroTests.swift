import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// Le bloc héros de la fiche (#20242) : la DERNIÈRE position connue, avec son heure, dès qu'elle est servie (ou, sur
/// ma fiche, dès que ma position part et que l'appareil en connaît une) ; rien sans position.
@MainActor
final class ProfileWhereHeroTests: XCTestCase {

    private static let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func fix() -> SharedLocationFix {
        SharedLocationFix(latitude: 48.8566, longitude: 2.3522, accuracy: 12)!
    }

    func test_stamp_saysJustNow_thenMinutes_thenTheClockTime() {
        XCTAssertEqual(ProfileWhereStamp.of(Self.now.addingTimeInterval(-20), now: Self.now), .justNow)
        XCTAssertEqual(ProfileWhereStamp.of(Self.now.addingTimeInterval(-7 * 60), now: Self.now), .minutesAgo(7))
        XCTAssertEqual(ProfileWhereStamp.of(Self.now.addingTimeInterval(-59 * 60), now: Self.now), .minutesAgo(59))
        let older = Self.now.addingTimeInterval(-3 * 3600)
        XCTAssertEqual(ProfileWhereStamp.of(older, now: Self.now), .at(older))
    }

    func test_stamp_aClockAhead_isJustNow() {
        XCTAssertEqual(ProfileWhereStamp.of(Self.now.addingTimeInterval(120), now: Self.now), .justNow)
    }

    func test_stamp_anUnknownInstant_saysNothing() {
        XCTAssertNil(ProfileWhereStamp.of(.distantPast, now: Self.now))
    }

    func test_ownPreview_keepsTheInstantOfTheKnownFix_evenWhenItIsOld() {
        let old = Self.now.addingTimeInterval(-5 * 3600)
        XCTAssertEqual(ProfileOwnPositionPreview.resolve(recipients: 1, isGhost: false, fix: fix(), at: old),
                       .map(fix(), at: old))
    }

    func test_offered_followsTheServedPositions_live() {
        let served = CurrentValueSubject<[String: SharedLocationEntry], Never>([:])
        var seen: [Bool] = []
        let watch = ProfileWhereCard.offered("bob", in: served.eraseToAnyPublisher()).sink { seen.append($0) }
        let entry = SharedLocationEntry(latitude: 1, longitude: 2, precision: .exact, radiusMeters: 50,
                                        updatedAt: Self.now, deadline: Self.now.addingTimeInterval(600))
        served.send(["alice": entry])
        served.send(["alice": entry, "bob": entry])
        served.send([:])
        XCTAssertEqual(seen, [false, true, false])
        watch.cancel()
    }
}
