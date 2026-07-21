import XCTest
import UIKit
@testable import Meeshy

/// Intercepts every request on sessions built from a configuration that
/// registers it, regardless of host — `AttachmentUploader` only needs a
/// stubbed `URLSession.data(for:)`, not a real `APIClient.baseURL` match.
private final class StubURLProtocol: URLProtocol {
    // The project builds with SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor
    // (SE-0466): a plain `static var` here would be MainActor-isolated, but
    // `startLoading()` overrides a nonisolated Foundation requirement and
    // runs off the main actor — `nonisolated(unsafe)` is required to read it
    // there. Safe in practice: each test sets the stub before awaiting the
    // single request it triggers, so there is no concurrent access.
    nonisolated(unsafe) static var stubData: Data?
    nonisolated(unsafe) static var stubStatusCode: Int = 200

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }
    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override nonisolated func startLoading() {
        let url = request.url ?? URL(string: "https://stub.meeshy.test")!
        let response = HTTPURLResponse(
            url: url, statusCode: Self.stubStatusCode, httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        if let data = Self.stubData {
            client?.urlProtocol(self, didLoad: data)
        }
        client?.urlProtocolDidFinishLoading(self)
    }

    override nonisolated func stopLoading() {}
}

@MainActor
final class AttachmentUploaderTests: XCTestCase {

    private func makeStubbedSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        return URLSession(configuration: config)
    }

    private func makeTinyJPEGData() -> Data {
        let size = CGSize(width: 4, height: 4)
        UIGraphicsBeginImageContext(size)
        defer { UIGraphicsEndImageContext() }
        UIColor.red.setFill()
        UIRectFill(CGRect(origin: .zero, size: size))
        let image = UIGraphicsGetImageFromCurrentImageContext()!
        return image.jpegData(compressionQuality: 1.0)!
    }

    // MARK: - uploadAvatar network decoding (P0 fix: `fileUrl` not `url`)

    func test_uploadAvatar_decodesGatewayFileUrlKey_returnsAvatarURL() async throws {
        let expectedURLString = "https://gate.meeshy.me/uploads/avatar123.jpg"
        StubURLProtocol.stubStatusCode = 200
        StubURLProtocol.stubData = Data("""
        {"success":true,"data":{"attachments":[{"fileUrl":"\(expectedURLString)"}]}}
        """.utf8)

        let uploader = AttachmentUploader(urlSession: makeStubbedSession())

        let resultURL = try await uploader.uploadAvatar(makeTinyJPEGData())

        XCTAssertEqual(resultURL.absoluteString, expectedURLString,
            "uploadAvatar must decode the gateway's real `fileUrl` key")
    }

    func test_uploadAvatar_whenResponseOnlyHasLegacyUrlKey_throws() async {
        // Regression guard for the P0 bug: the gateway NEVER sends a bare
        // `url` key (see messageAttachmentSchema) — decoding must fail loudly
        // instead of silently succeeding against a shape the server can't produce.
        StubURLProtocol.stubStatusCode = 200
        StubURLProtocol.stubData = Data("""
        {"success":true,"data":{"attachments":[{"url":"https://gate.meeshy.me/uploads/avatar123.jpg"}]}}
        """.utf8)

        let uploader = AttachmentUploader(urlSession: makeStubbedSession())

        do {
            _ = try await uploader.uploadAvatar(makeTinyJPEGData())
            XCTFail("Expected a decode failure for a response missing `fileUrl`")
        } catch {
            // Expected: JSONDecoder throws keyNotFound for the required `fileUrl`.
        }
    }

    func test_uploadAvatar_whenServerErrors_throwsServerError() async {
        StubURLProtocol.stubStatusCode = 500
        StubURLProtocol.stubData = Data("{}".utf8)

        let uploader = AttachmentUploader(urlSession: makeStubbedSession())

        do {
            _ = try await uploader.uploadAvatar(makeTinyJPEGData())
            XCTFail("Expected a server error to be thrown")
        } catch APIError.serverError(let code, _) {
            XCTAssertEqual(code, 500)
        } catch {
            XCTFail("Expected APIError.serverError, got \(error)")
        }
    }

    func test_compress_reducesImageBelow500KB_whenLargerInput() {
        // 1200x1200 random-color image — yields ~1MB+ as JPEG quality 0.8
        let size = CGSize(width: 1200, height: 1200)
        UIGraphicsBeginImageContext(size)
        defer { UIGraphicsEndImageContext() }
        let context = UIGraphicsGetCurrentContext()!
        for x in stride(from: 0, to: Int(size.width), by: 4) {
            for y in stride(from: 0, to: Int(size.height), by: 4) {
                context.setFillColor(UIColor(red: CGFloat.random(in: 0...1),
                                              green: CGFloat.random(in: 0...1),
                                              blue: CGFloat.random(in: 0...1),
                                              alpha: 1).cgColor)
                context.fill(CGRect(x: x, y: y, width: 4, height: 4))
            }
        }
        let image = UIGraphicsGetImageFromCurrentImageContext()!
        let inputData = image.jpegData(compressionQuality: 1.0)!
        XCTAssertGreaterThan(inputData.count, 500 * 1024,
                              "Test setup: input must exceed 500KB to be meaningful")

        let compressed = AttachmentUploader.compress(inputData, maxSizeKB: 500)

        XCTAssertLessThanOrEqual(compressed.count, 500 * 1024,
                                  "Compression must bring output under 500KB")
    }
}
