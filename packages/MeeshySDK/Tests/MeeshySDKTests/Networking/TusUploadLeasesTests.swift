import XCTest
@testable import MeeshySDK

final class TusUploadLeasesTests: XCTestCase {

    func test_secondClaimOfSameKey_failsUntilRelease() {
        let leases = TusUploadLeases()
        XCTAssertTrue(leases.claim("k"))
        XCTAssertFalse(leases.claim("k"))
        leases.release("k")
        XCTAssertTrue(leases.claim("k"))
    }

    func test_fiftyConcurrentClaimsOfOneKey_exactlyOneWins() async {
        let leases = TusUploadLeases()
        let winners = await withTaskGroup(of: Bool.self) { group in
            for _ in 0..<50 { group.addTask { leases.claim("shared") } }
            return await group.reduce(0) { $0 + ($1 ? 1 : 0) }
        }
        XCTAssertEqual(winners, 1)
    }

    func test_distinctKeys_areIndependent() {
        let leases = TusUploadLeases()
        XCTAssertTrue(leases.claim("a"))
        XCTAssertTrue(leases.claim("b"))
    }
}
