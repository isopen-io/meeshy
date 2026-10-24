import Foundation
import XCTest
@testable import MeeshySDK

/// #11291 — une pièce HEIC part telle quelle ; si le serveur la refuse (415)
/// ou la rend encore en `image/heic` (il l'a rangée comme un fichier, sans la
/// convertir pour les lecteurs), elle repart UNE fois en JPEG q 0,92.
final class HEICUploadFallbackTests: XCTestCase {

    func test_serverThatConverts_receivesTheHeicOnce_andIsRemembered() async throws {
        let scenario = try Scenario(replies: [.served("image/jpeg")])
        let uploaded = try await scenario.run()
        XCTAssertEqual(uploaded.mimeType, "image/jpeg")
        XCTAssertEqual(scenario.sent.map(\.mimeType), ["image/heic"])
        XCTAssertEqual(HEICDeliveryMemo.delivery(in: scenario.defaults, now: Scenario.now), .native)
    }

    func test_serverThatKeepsTheHeic_getsAJpegQ92Second_andFallsBackForADay() async throws {
        let scenario = try Scenario(replies: [.served("image/heic"), .served("image/jpeg")])
        let uploaded = try await scenario.run()
        XCTAssertEqual(uploaded.mimeType, "image/jpeg")
        XCTAssertEqual(scenario.sent.map(\.mimeType), ["image/heic", "image/jpeg"])
        XCTAssertEqual(scenario.sent.last?.fileName, "IMG_0042.jpg")
        XCTAssertEqual(scenario.preparer.policies.map(\.quality), [0.92])
        XCTAssertEqual(scenario.preparer.policies.map(\.heicDelivery), [.jpegCompatibility])
        XCTAssertEqual(HEICDeliveryMemo.delivery(in: scenario.defaults, now: Scenario.now), .jpegCompatibility)
    }

    func test_serverThatRefusesWith415_getsAJpegQ92Second() async throws {
        let scenario = try Scenario(replies: [.refused, .served("image/jpeg")])
        let uploaded = try await scenario.run()
        XCTAssertEqual(uploaded.mimeType, "image/jpeg")
        XCTAssertEqual(scenario.sent.map(\.mimeType), ["image/heic", "image/jpeg"])
        XCTAssertEqual(HEICDeliveryMemo.delivery(in: scenario.defaults, now: Scenario.now), .jpegCompatibility)
    }

    func test_theJpegVariantBytesAreWhatThePreparerProduced_andTheTemporaryFileIsRemoved() async throws {
        let scenario = try Scenario(replies: [.refused, .served("image/jpeg")])
        _ = try await scenario.run()
        XCTAssertEqual(scenario.sent.last?.bytes, Scenario.jpegBytes)
        let variant = try XCTUnwrap(scenario.sent.last?.url)
        XCTAssertFalse(FileManager.default.fileExists(atPath: variant.path))
    }

    func test_locationChoiceTravelsToTheVariantPolicy() async throws {
        let scenario = try Scenario(replies: [.refused, .served("image/jpeg")], keepsLocation: true)
        _ = try await scenario.run()
        XCTAssertEqual(scenario.preparer.policies.map(\.keepsLocation), [true])
    }

    func test_aRefusalWithoutAVariant_isRethrown() async throws {
        let scenario = try Scenario(replies: [.refused], variant: nil)
        do {
            _ = try await scenario.run()
            XCTFail("sans variante JPEG, le refus remonte")
        } catch {
            XCTAssertTrue(error is UnsupportedImageFormatRefusal)
        }
        XCTAssertEqual(scenario.sent.count, 1)
    }

    func test_aHeicKeptAsAFile_withoutAVariant_isStillBetterThanNothing() async throws {
        let scenario = try Scenario(replies: [.served("image/heic")], variant: nil)
        let uploaded = try await scenario.run()
        XCTAssertEqual(uploaded.mimeType, "image/heic")
        XCTAssertEqual(scenario.sent.count, 1)
    }

    func test_otherErrors_areNotAFormatRefusal_andRetryNothing() async throws {
        let scenario = try Scenario(replies: [.failed])
        do {
            _ = try await scenario.run()
            XCTFail("une erreur réseau remonte telle quelle")
        } catch {
            XCTAssertTrue(error is URLError)
        }
        XCTAssertEqual(scenario.sent.count, 1)
        XCTAssertEqual(HEICDeliveryMemo.delivery(in: scenario.defaults, now: Scenario.now), .native)
    }

    func test_aNonHeicFile_isSentOnce_withoutTouchingTheMemo() async throws {
        let scenario = try Scenario(replies: [.served("image/jpeg")], mimeType: "image/jpeg", fileExtension: "jpg")
        _ = try await scenario.run()
        XCTAssertEqual(scenario.sent.map(\.mimeType), ["image/jpeg"])
        XCTAssertTrue(scenario.preparer.policies.isEmpty)
    }

    // MARK: - Fabriques

    struct Served: Sendable { let mimeType: String }
    struct Sent: Sendable, Equatable { let url: URL; let mimeType: String; let fileName: String; let bytes: Data? }

    enum Reply { case served(String), refused, failed }

    final class FakePreparer: OutgoingImagePreparing, @unchecked Sendable {
        private let lock = NSLock()
        private var recorded: [OutgoingImagePolicy] = []
        let variant: Data?
        init(variant: Data?) { self.variant = variant }
        var policies: [OutgoingImagePolicy] { lock.withLock { recorded } }
        func prepare(_ data: Data, policy: OutgoingImagePolicy) -> OutgoingImage? {
            lock.withLock { recorded.append(policy) }
            return variant.map { OutgoingImage(data: $0, format: .jpeg, pixelSize: nil, encodedGenerations: 1) }
        }
    }

    final class Scenario: @unchecked Sendable {
        static let now = Date(timeIntervalSince1970: 1_790_000_000)
        static let jpegBytes = Data([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3])

        let defaults: UserDefaults
        let preparer: FakePreparer
        private let source: URL
        private let mimeType: String
        private let keepsLocation: Bool
        private let lock = NSLock()
        private var replies: [Reply]
        private var recorded: [Sent] = []

        var sent: [Sent] { lock.withLock { recorded } }

        init(replies: [Reply], variant: Data? = Scenario.jpegBytes, keepsLocation: Bool = false,
             mimeType: String = "image/heic", fileExtension: String = "heic") throws {
            let name = "heic-fallback-\(UUID().uuidString)"
            defaults = UserDefaults(suiteName: name)!
            defaults.removePersistentDomain(forName: name)
            preparer = FakePreparer(variant: variant)
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            source = directory.appendingPathComponent("IMG_0042.\(fileExtension)")
            try Data([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]).write(to: source)
            self.replies = replies
            self.mimeType = mimeType
            self.keepsLocation = keepsLocation
        }

        func run() async throws -> Served {
            try await HEICUploadFallback.upload(
                fileURL: source, mimeType: mimeType, keepsLocation: keepsLocation,
                defaults: defaults, now: Self.now, preparer: preparer,
                servedMimeType: { $0.mimeType }
            ) { url, mime in
                try self.reply(url: url, mime: mime)
            }
        }

        private func reply(url: URL, mime: String) throws -> Served {
            let next: Reply = lock.withLock { replies.isEmpty ? .failed : replies.removeFirst() }
            lock.withLock {
                recorded.append(Sent(url: url, mimeType: mime, fileName: url.lastPathComponent, bytes: try? Data(contentsOf: url)))
            }
            switch next {
            case .served(let served): return Served(mimeType: served)
            case .refused: throw UnsupportedImageFormatRefusal(statusCode: 415)!
            case .failed: throw URLError(.notConnectedToInternet)
            }
        }
    }
}
