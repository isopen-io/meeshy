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

    // MARK: - value property exhaustive (point 46)

    func test_value_freshWithEmptyArray_returnsEmptyArray() {
        let result = CacheResult<[String]>.fresh([], age: 0)
        XCTAssertNotNil(result.value)
        XCTAssertEqual(result.value?.count, 0)
    }

    func test_value_staleWithEmptyArray_returnsEmptyArray() {
        let result = CacheResult<[String]>.stale([], age: 500)
        XCTAssertNotNil(result.value)
        XCTAssertEqual(result.value?.count, 0)
    }

    func test_value_freshInt_returnsInt() {
        let result = CacheResult<Int>.fresh(42, age: 5)
        XCTAssertEqual(result.value, 42)
    }

    func test_value_staleInt_returnsInt() {
        let result = CacheResult<Int>.stale(99, age: 300)
        XCTAssertEqual(result.value, 99)
    }

    func test_value_expiredInt_returnsNil() {
        let result = CacheResult<Int>.expired
        XCTAssertNil(result.value)
    }

    func test_value_emptyInt_returnsNil() {
        let result = CacheResult<Int>.empty
        XCTAssertNil(result.value)
    }

    func test_fresh_preservesAge() {
        let result = CacheResult<String>.fresh("hello", age: 42.5)
        if case .fresh(_, let age) = result {
            XCTAssertEqual(age, 42.5)
        } else {
            XCTFail("Expected .fresh")
        }
    }

    func test_stale_preservesAge() {
        let result = CacheResult<String>.stale("hello", age: 300.0)
        if case .stale(_, let age) = result {
            XCTAssertEqual(age, 300.0)
        } else {
            XCTFail("Expected .stale")
        }
    }

    func test_fresh_isUsable() {
        let result = CacheResult<String>.fresh("data", age: 1)
        XCTAssertNotNil(result.value, "Fresh result should be usable")
    }

    func test_stale_isUsable() {
        let result = CacheResult<String>.stale("data", age: 500)
        XCTAssertNotNil(result.value, "Stale result should be usable")
    }

    func test_expired_isNotUsable() {
        let result = CacheResult<String>.expired
        XCTAssertNil(result.value, "Expired result should not be usable")
    }

    func test_empty_isNotUsable() {
        let result = CacheResult<String>.empty
        XCTAssertNil(result.value, "Empty result should not be usable")
    }
}
