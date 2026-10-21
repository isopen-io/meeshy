import XCTest
import MeeshySDK
@testable import MeeshyUI

@MainActor
final class UncachedProfileLoadingTests: XCTestCase {

    func test_cachedProfile_rendEmpty() async {
        let sut = UncachedProfileLoading()

        let result = await sut.cachedProfile(for: "u-bob")

        guard case .empty = result else { return XCTFail("attendu .empty, reçu \(result)") }
    }

    func test_cachedStats_rendEmpty() async {
        let sut = UncachedProfileLoading()

        let result = await sut.cachedStats(for: "u-bob")

        guard case .empty = result else { return XCTFail("attendu .empty, reçu \(result)") }
    }
}
