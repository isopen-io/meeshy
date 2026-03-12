import XCTest
@testable import MeeshySDK

final class CacheResultTests: XCTestCase {

    func test_fresh_returnsValue() {
        let result = CacheResult<[String]>.fresh(["a", "b"], age: 10)
        XCTAssertEqual(result.value, ["a", "b"])
    }

    func test_stale_returnsValue() {
        let result = CacheResult<[String]>.stale(["a"], age: 500)
        XCTAssertEqual(result.value, ["a"])
    }

    func test_expired_returnsNil() {
        let result = CacheResult<[String]>.expired
        XCTAssertNil(result.value)
    }

    func test_empty_returnsNil() {
        let result = CacheResult<[String]>.empty
        XCTAssertNil(result.value)
    }

    func test_isFresh_truForFresh() {
        let result = CacheResult<[String]>.fresh(["a"], age: 0)
        if case .fresh = result { } else { XCTFail("Expected .fresh") }
    }

    func test_isStale_trueForStale() {
        let result = CacheResult<[String]>.stale(["a"], age: 400)
        if case .stale = result { } else { XCTFail("Expected .stale") }
    }
}
