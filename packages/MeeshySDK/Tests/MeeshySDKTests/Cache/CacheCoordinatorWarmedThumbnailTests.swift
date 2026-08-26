import XCTest
@testable import MeeshySDK

/// Feature 3 (plein écran net, vidéo) a besoin d'un accesseur SYNCHRONE au
/// store `thumbnails` — le même besoin que `warmedImage` couvre déjà pour le
/// store `images` (NSCache hit OU décodage disque→NSCache), pour qu'une page
/// vidéo lise son poster net déjà persisté au premier `body`, sans transition.
///
/// `CacheCoordinator.shared.thumbnails.warmedImage(for:)` ne compile PAS
/// depuis un appelant externe à `CacheCoordinator` (violation d'isolation
/// d'acteur — `thumbnails` n'est lisible synchrone que depuis l'intérieur de
/// la déclaration de l'acteur, comme `video`/`images` le sont déjà pour leurs
/// propres accesseurs `videoLocalFileURL`/`warmedImage`). D'où l'accesseur
/// `warmedThumbnail`, cinquième membre de la famille « Synchronous Media
/// Cache Access » de `CacheCoordinator`.
final class CacheCoordinatorWarmedThumbnailTests: XCTestCase {

    private func uniqueKey() -> String { "thumb:test-\(UUID().uuidString)" }

    override func tearDown() async throws {
        try await super.tearDown()
    }

    func test_warmedThumbnail_returnsTheDecodedImage_afterItWasStored() async throws {
        let key = uniqueKey()
        let pixel = try XCTUnwrap(Self.onePixelJPEG())
        await CacheCoordinator.shared.thumbnails.store(pixel, for: key)
        defer { Task { await CacheCoordinator.shared.thumbnails.invalidate(for: key) } }

        let warmed = CacheCoordinator.warmedThumbnail(for: key)

        XCTAssertNotNil(warmed, "un poster juste persisté sous cette clé doit être relu de façon synchrone")
    }

    func test_warmedThumbnail_forAnAbsentKey_isNil() {
        XCTAssertNil(CacheCoordinator.warmedThumbnail(for: uniqueKey()))
    }

    private static func onePixelJPEG() -> Data? {
        UIImage(systemName: "photo")?.jpegData(compressionQuality: 0.8)
    }
}
