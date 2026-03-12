import XCTest
@testable import MeeshySDK

final class CachePolicyTests: XCTestCase {

    func test_init_validStaleTTL_preservesValues() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 300, maxItemCount: 50, storageLocation: .grdb)
        XCTAssertEqual(policy.ttl, 3600)
        XCTAssertEqual(policy.staleTTL, 300)
        XCTAssertEqual(policy.maxItemCount, 50)
    }

    func test_init_staleTTLGreaterThanTTL_clampsToTTL() {
        let policy = CachePolicy(ttl: 300, staleTTL: 3600, maxItemCount: nil, storageLocation: .grdb)
        XCTAssertEqual(policy.staleTTL, 300)
    }

    func test_init_nilStaleTTL_staysNil() {
        let policy = CachePolicy(ttl: 3600, staleTTL: nil, maxItemCount: nil, storageLocation: .grdb)
        XCTAssertNil(policy.staleTTL)
    }

    func test_init_staleTTLEqualToTTL_preserves() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 3600, maxItemCount: nil, storageLocation: .grdb)
        XCTAssertEqual(policy.staleTTL, 3600)
    }

    func test_predefined_conversations() {
        let p = CachePolicy.conversations
        XCTAssertEqual(p.ttl, 86400)
        XCTAssertEqual(p.staleTTL, 300)
    }

    func test_predefined_messages() {
        let p = CachePolicy.messages
        XCTAssertEqual(p.ttl, TimeInterval.months(6))
        XCTAssertNil(p.staleTTL)
        XCTAssertEqual(p.maxItemCount, 50)
    }

    func test_predefined_mediaImages() {
        let p = CachePolicy.mediaImages
        XCTAssertEqual(p.ttl, TimeInterval.years(1))
        if case .disk(let subdir, let max) = p.storageLocation {
            XCTAssertEqual(subdir, "Images")
            XCTAssertEqual(max, 300_000_000)
        } else { XCTFail("Expected .disk") }
    }

    func test_timeInterval_minutes() { XCTAssertEqual(TimeInterval.minutes(5), 300) }
    func test_timeInterval_hours() { XCTAssertEqual(TimeInterval.hours(24), 86400) }
    func test_timeInterval_days() { XCTAssertEqual(TimeInterval.days(7), 604800) }
    func test_timeInterval_months() { XCTAssertEqual(TimeInterval.months(6), 15_552_000) }
    func test_timeInterval_years() { XCTAssertEqual(TimeInterval.years(1), 31_536_000) }

    func test_freshness_freshWhenUnderStaleTTL() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 300, maxItemCount: nil, storageLocation: .grdb)
        let result = policy.freshness(age: 100)
        XCTAssertEqual(result, .fresh)
    }

    func test_freshness_staleAtExactStaleTTLBoundary() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 300, maxItemCount: nil, storageLocation: .grdb)
        XCTAssertEqual(policy.freshness(age: 300), .stale)
    }

    func test_freshness_staleWhenBetweenStaleTTLAndTTL() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 300, maxItemCount: nil, storageLocation: .grdb)
        let result = policy.freshness(age: 500)
        XCTAssertEqual(result, .stale)
    }

    func test_freshness_expiredAtExactTTLBoundary() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 300, maxItemCount: nil, storageLocation: .grdb)
        XCTAssertEqual(policy.freshness(age: 3600), .expired)
    }

    func test_freshness_expiredWhenOverTTL() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 300, maxItemCount: nil, storageLocation: .grdb)
        let result = policy.freshness(age: 4000)
        XCTAssertEqual(result, .expired)
    }

    func test_freshness_noStaleTTL_freshUnderTTL() {
        let policy = CachePolicy(ttl: 3600, staleTTL: nil, maxItemCount: nil, storageLocation: .grdb)
        let result = policy.freshness(age: 100)
        XCTAssertEqual(result, .fresh)
    }

    func test_freshness_noStaleTTL_expiredOverTTL() {
        let policy = CachePolicy(ttl: 3600, staleTTL: nil, maxItemCount: nil, storageLocation: .grdb)
        let result = policy.freshness(age: 4000)
        XCTAssertEqual(result, .expired)
    }
}
