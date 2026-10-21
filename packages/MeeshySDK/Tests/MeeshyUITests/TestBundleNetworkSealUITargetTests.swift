import XCTest
import MeeshySDK
import MeeshyTestSupport

/// #10854 — le bundle `MeeshyUITests` est scellé comme `MeeshySDKTests`.
final class TestBundleNetworkSealUITargetTests: XCTestCase {

    func test_thisBundle_isSealedFromItsLoad() async throws {
        try XCTSkipUnless(TestBundleNetworkSeal.shouldSeal(environment: ProcessInfo.processInfo.environment))
        XCTAssertTrue(NetworkTransportSeal.isInstalled)
        XCTAssertTrue(SocketConfig.isTransportSealed)
        let before = NetworkTransportSeal.refusedCount
        var request = URLRequest(url: try XCTUnwrap(URL(string: "https://gate.meeshy.me/api/v1/users/me")))
        request.httpMethod = "GET"
        do {
            _ = try await URLSession.shared.data(for: request)
            XCTFail("la requête est partie sur le réseau")
        } catch let error as URLError {
            XCTAssertEqual(error.code, .notConnectedToInternet)
        }
        XCTAssertGreaterThan(NetworkTransportSeal.refusedCount, before)
    }
}
