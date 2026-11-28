import XCTest
@testable import MeeshySDK

/// La session TUS reçoit la créance de l'appelant à chaque PATCH et HEAD :
/// son adresse ne se résout que sur l'origine de l'API.
final class TusUploadLocationTests: XCTestCase {

    private let api = URL(string: "https://gate.meeshy.me")!

    func test_resolve_relativeLocation_resolvesOnTheApiOrigin() {
        let url = TusUploadLocation.resolve("/api/v1/uploads/abc", baseURL: api)
        XCTAssertEqual(url?.absoluteString, "https://gate.meeshy.me/api/v1/uploads/abc")
    }

    func test_resolve_absoluteLocationOnTheApiOrigin_isKept() {
        let url = TusUploadLocation.resolve("https://gate.meeshy.me/api/v1/uploads/abc", baseURL: api)
        XCTAssertEqual(url?.absoluteString, "https://gate.meeshy.me/api/v1/uploads/abc")
    }

    func test_resolve_explicitDefaultPort_isTheSameOrigin() {
        XCTAssertNotNil(TusUploadLocation.resolve("https://gate.meeshy.me:443/api/v1/uploads/abc", baseURL: api))
    }

    func test_resolve_hostCaseDiffers_isTheSameOrigin() {
        XCTAssertNotNil(TusUploadLocation.resolve("https://Gate.Meeshy.me/api/v1/uploads/abc", baseURL: api))
    }

    func test_resolve_foreignHost_isRefused() {
        XCTAssertNil(TusUploadLocation.resolve("https://evil.example/api/v1/uploads/abc", baseURL: api))
    }

    func test_resolve_lookalikeHost_isRefused() {
        XCTAssertNil(TusUploadLocation.resolve("https://gate.meeshy.me.evil.example/uploads/abc", baseURL: api))
    }

    func test_resolve_downgradedScheme_isRefused() {
        XCTAssertNil(TusUploadLocation.resolve("http://gate.meeshy.me/api/v1/uploads/abc", baseURL: api))
    }

    func test_resolve_foreignPort_isRefused() {
        XCTAssertNil(TusUploadLocation.resolve("https://gate.meeshy.me:8443/api/v1/uploads/abc", baseURL: api))
    }

    func test_resolve_protocolRelativeForeignHost_isRefused() {
        XCTAssertNil(TusUploadLocation.resolve("//evil.example/uploads/abc", baseURL: api))
    }

    func test_resolve_localDevelopmentOrigin_keepsItsPort() {
        let local = URL(string: "http://localhost:3000")!
        XCTAssertNotNil(TusUploadLocation.resolve("http://localhost:3000/api/v1/uploads/abc", baseURL: local))
        XCTAssertNil(TusUploadLocation.resolve("http://localhost:4000/api/v1/uploads/abc", baseURL: local))
    }
}
