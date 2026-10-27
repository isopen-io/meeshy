import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// #13414 — un post ou un réel refusé en HEIC (415) repart en JPEG ; un refus
/// qui persiste après repli remonte TEL QUEL, pour que la file le classe
/// définitif au lieu de renvoyer cinq fois les mêmes octets.
final class PublicationMediaUploaderTests: XCTestCase {

    func test_aHeicRefusedWith415_isResentAsJpeg_andThePublicationKeepsTheJpeg() async throws {
        let scenario = try Scenario(replies: [.refused, .served(id: "jpeg-0")])

        let montes = try await scenario.run()

        XCTAssertEqual(scenario.sent.map(\.mimeType), ["image/heic", "image/jpeg"])
        XCTAssertEqual(montes.ids, ["jpeg-0"])
        XCTAssertEqual(scenario.recorded.map(\.id), ["jpeg-0"])
        XCTAssertEqual(HEICDeliveryMemo.delivery(in: scenario.defaults), .jpegCompatibility)
    }

    func test_aRefusalThatPersistsAfterTheJpeg_surfacesAsTheRefusal_neverAsATransient503() async throws {
        let scenario = try Scenario(replies: [.refused, .refused])

        do {
            _ = try await scenario.run()
            XCTFail("un 415 qui persiste après le repli doit remonter")
        } catch {
            XCTAssertTrue(error is UnsupportedImageFormatRefusal, "remonté : \(error)")
        }
        XCTAssertEqual(scenario.sent.map(\.mimeType), ["image/heic", "image/jpeg"])
    }

    func test_aRefusedMedia_doesNotStopTheOthers_andTheRefusalWinsOverTheirOutcome() async throws {
        let scenario = try Scenario(files: 2, replies: [.refused, .refused, .served(id: "m1")])

        do {
            _ = try await scenario.run()
            XCTFail("la publication ne part pas amputée de son média refusé")
        } catch {
            XCTAssertTrue(error is UnsupportedImageFormatRefusal, "remonté : \(error)")
        }
        XCTAssertEqual(scenario.recorded, [UploadedPostMedia(sourceIndex: 1, id: "m1", url: "2026/10/u/m1.jpg")])
    }

    func test_anExpiredSessionDuringUpload_surfacesAsSessionExpiry_soTheQueueWaitsWithoutBurningAnAttempt() async throws {
        let scenario = try Scenario(replies: [.expired], mimeType: "image/jpeg")

        do {
            _ = try await scenario.run()
            XCTFail("un jeton expiré doit remonter")
        } catch MeeshyError.auth(.sessionExpired) {
        } catch {
            XCTFail("un jeton expiré remonte tel quel, pas emballé : \(error)")
        }
    }

    func test_anOfflineUpload_surfacesAsTransport_soTheQueueWaitsForTheNetwork() async throws {
        let scenario = try Scenario(replies: [.offline], mimeType: "image/jpeg")

        do {
            _ = try await scenario.run()
            XCTFail("une coupure réseau doit remonter")
        } catch let error as URLError {
            XCTAssertEqual(error.code, .notConnectedToInternet)
        } catch {
            XCTFail("une coupure réseau remonte telle quelle, pas emballée : \(error)")
        }
    }

    func test_aMediaAlreadyUploaded_isNotSentAgain() async throws {
        let scenario = try Scenario(files: 2, replies: [.served(id: "m1")], mimeType: "image/jpeg")

        let montes = try await scenario.run(alreadyUploaded: [UploadedPostMedia(sourceIndex: 0, id: "m0", url: "u0")])

        XCTAssertEqual(montes.ids, ["m0", "m1"])
        XCTAssertEqual(montes.sourceIndexes, [0, 1])
        XCTAssertEqual(scenario.sent.count, 1)
    }

    // MARK: - Fabriques

    enum Reply { case served(id: String), refused, expired, offline }
    struct Sent: Sendable { let mimeType: String }

    final class Scenario: @unchecked Sendable {
        let defaults: UserDefaults
        let paths: [String]
        private let mimeType: String
        private let lock = NSLock()
        private var replies: [Reply]
        private var sentLog: [Sent] = []
        private var recordedLog: [UploadedPostMedia] = []

        var sent: [Sent] { lock.withLock { sentLog } }
        var recorded: [UploadedPostMedia] { lock.withLock { recordedLog } }

        init(files: Int = 1, replies: [Reply], mimeType: String = "image/heic") throws {
            let suite = "publication-media-\(UUID().uuidString)"
            defaults = UserDefaults(suiteName: suite)!
            defaults.removePersistentDomain(forName: suite)
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let ext = mimeType == "image/heic" ? "heic" : "jpg"
            paths = try (0..<files).map { index in
                let url = directory.appendingPathComponent("IMG_\(index).\(ext)")
                try Self.imageBytes().write(to: url)
                return url.path
            }
            self.replies = replies
            self.mimeType = mimeType
        }

        func run(alreadyUploaded: [UploadedPostMedia] = []) async throws -> PublicationMediaUploads {
            let mime = mimeType
            return try await PublicationMediaUploader.uploadAll(
                storedPaths: paths,
                alreadyUploaded: alreadyUploaded,
                declaredMimeType: { _ in mime },
                keepsLocation: false,
                defaults: defaults,
                hooks: PublicationMediaUploader.Hooks(
                    throwIfCancelled: {},
                    recordUploaded: { media in self.lock.withLock { self.recordedLog.append(media) } }
                )
            ) { _, sentMime in
                try self.reply(mime: sentMime)
            }
        }

        private func reply(mime: String) throws -> TusUploadResult {
            let next: Reply = lock.withLock {
                sentLog.append(Sent(mimeType: mime))
                return replies.isEmpty ? .offline : replies.removeFirst()
            }
            switch next {
            case .served(let id): return try Self.result(id: id)
            case .refused: throw UnsupportedImageFormatRefusal(statusCode: 415)!
            case .expired: throw MeeshyError.auth(.sessionExpired)
            case .offline: throw URLError(.notConnectedToInternet)
            }
        }

        static func result(id: String) throws -> TusUploadResult {
            let json = #"{"id":"\#(id)","fileName":"\#(id).jpg","mimeType":"image/jpeg","fileSize":3,"fileUrl":"2026/10/u/\#(id).jpg"}"#
            return try JSONDecoder().decode(TusUploadResult.self, from: Data(json.utf8))
        }

        /// Des octets d'image lisibles par ImageIO : le repli JPEG les décode
        /// réellement (JPEG : le préparateur le rend tel quel en variante), sans
        /// dépendre d'un encodeur HEVC absent du simulateur.
        static func imageBytes() throws -> Data {
            let context = try XCTUnwrap(CGContext(
                data: nil, width: 8, height: 8, bitsPerComponent: 8, bytesPerRow: 0,
                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ))
            context.setFillColor(CGColor(red: 0.2, green: 0.4, blue: 0.8, alpha: 1))
            context.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
            let image = try XCTUnwrap(context.makeImage())
            let data = NSMutableData()
            let destination = try XCTUnwrap(CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil))
            CGImageDestinationAddImage(destination, image, nil)
            XCTAssertTrue(CGImageDestinationFinalize(destination))
            return data as Data
        }
    }
}
