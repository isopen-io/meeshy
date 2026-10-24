import XCTest
import UIKit
import ImageIO
@testable import MeeshySDK

/// **Une image se décode à la taille où elle s'affiche, hors de l'acteur du
/// cache, et plusieurs à la fois** (#9872).
///
/// La sonde synchrone (`warmedImage`) décodait TOUT à 2 048 px, y compris un
/// avatar de 40 pt dans l'`init` de sa cellule ; et `image(for:maxPixelSize:)`
/// décodait sur l'exécuteur de l'acteur `DiskCacheStore`, ce qui rangeait les
/// décodages d'un écran les uns derrière les autres et bloquait les
/// `load`/`store` des autres cellules pendant ce temps.
final class DecodedImageAtDisplayedSizeTests: XCTestCase {

    private func makeStore() -> DiskCacheStore {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("DecodedAtDisplayedSize-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        return DiskCacheStore(policy: .mediaImages, baseDirectory: directory)
    }

    private func jpeg(width: CGFloat, height: CGFloat) throws -> Data {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { context in
            UIColor.systemIndigo.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
        return try XCTUnwrap(image.jpegData(compressionQuality: 0.8))
    }

    private func longestSide(_ image: UIImage?) throws -> Int {
        let cg = try XCTUnwrap(image?.cgImage)
        return max(cg.width, cg.height)
    }

    // MARK: - La sonde synchrone descend au palier affiché

    func test_warmedImage_forAnAvatar_decodesAtItsBucket_neverAtTheScreenCap() async throws {
        let store = makeStore()
        let key = "https://example.com/avatar-\(UUID().uuidString).jpg"
        await store.save(try jpeg(width: 4_000, height: 3_000), for: key)

        let warmed = store.warmedImage(for: key, maxPixelSize: 120)

        XCTAssertEqual(try longestSide(warmed), 128, "un avatar de 40 pt × 3 se décode au palier 128, pas à 2 048")
        XCTAssertNotNil(DiskCacheStore.cachedImage(for: key, maxPixelSize: 120), "le palier affiché est résident")
        XCTAssertNil(DiskCacheStore.cachedImage(for: key), "le slot plein format n'est pas occupé par une vignette")
    }

    func test_warmedImage_aboveTheBuckets_isClampedToTheScreenCap() async throws {
        let store = makeStore()
        let key = "https://example.com/poster-\(UUID().uuidString).jpg"
        await store.save(try jpeg(width: 4_000, height: 3_000), for: key)

        let warmed = store.warmedImage(for: key, maxPixelSize: 4_096)

        XCTAssertEqual(try longestSide(warmed), Int(DecodedBitmapStore.pixelCeiling(for: .current)))
    }

    func test_warmedDecodeSize_isTheBucket_elseTheRequestBoundedByTheCap() {
        XCTAssertEqual(DiskCacheStore.warmedDecodeSize(for: 90), 128)
        XCTAssertEqual(DiskCacheStore.warmedDecodeSize(for: 600), 768)
        XCTAssertEqual(DiskCacheStore.warmedDecodeSize(for: 1_500), 1_500)
        XCTAssertEqual(DiskCacheStore.warmedDecodeSize(for: 9_000), DiskCacheStore.warmedPixelCap)
    }

    func test_warmedImage_withoutASize_keepsTheHistoricalScreenCap() async throws {
        let store = makeStore()
        let key = "https://example.com/legacy-\(UUID().uuidString).jpg"
        await store.save(try jpeg(width: 4_000, height: 3_000), for: key)

        let warmed = store.warmedImage(for: key)

        XCTAssertEqual(try longestSide(warmed), Int(DecodedBitmapStore.pixelCeiling(for: .current)))
        XCTAssertNotNil(DiskCacheStore.cachedImage(for: key))
    }

    // MARK: - Décodage forcé réservé au palier affiché

    func test_thumbnailOptions_forceTheDecodeOnlyWhenTheDisplayedSizeIsKnown() {
        let displayed = DecodedBitmapStore.thumbnailOptions(128, decodeImmediately: true) as NSDictionary
        let unknown = DecodedBitmapStore.thumbnailOptions(2_048, decodeImmediately: false) as NSDictionary

        XCTAssertEqual(displayed[kCGImageSourceShouldCacheImmediately] as? Bool, true)
        XCTAssertEqual(unknown[kCGImageSourceShouldCacheImmediately] as? Bool, false)
        XCTAssertEqual(unknown[kCGImageSourceThumbnailMaxPixelSize] as? CGFloat, 2_048)
    }

    // MARK: - Hors de l'acteur, à concurrence bornée

    func test_decodeConcurrency_isBoundedBetweenTwoAndFour() {
        XCTAssertEqual(DecodedBitmapStore.decodeConcurrency(processorCount: 1), 2)
        XCTAssertEqual(DecodedBitmapStore.decodeConcurrency(processorCount: 4), 2)
        XCTAssertEqual(DecodedBitmapStore.decodeConcurrency(processorCount: 6), 4)
        XCTAssertEqual(DecodedBitmapStore.decodeConcurrency(processorCount: 10), 4)
    }

    func test_gate_twoDecodesRunTogether_theyAreNotSerialised() async {
        let gate = DecodeGate(limit: 2)

        await gate.acquire()
        await gate.acquire()

        let running = await gate.runningCount
        XCTAssertEqual(running, 2, "deux permis tenus en même temps : aucun décodage n'attend l'autre")
    }

    func test_gate_beyondTheLimit_waitsForARelease_thenRuns() async {
        let gate = DecodeGate(limit: 1)
        await gate.acquire()
        let admitted = expectation(description: "le second décodage démarre après la libération")

        let waiting = Task {
            await gate.acquire()
            admitted.fulfill()
        }
        var queuedBeforeRelease = await gate.waitingCount
        for _ in 0..<1_000 where queuedBeforeRelease == 0 {
            await Task.yield()
            queuedBeforeRelease = await gate.waitingCount
        }
        XCTAssertEqual(queuedBeforeRelease, 1, "au-delà du plafond, le décodage attend au lieu de s'empiler")
        let runningWhileQueued = await gate.runningCount
        XCTAssertEqual(runningWhileQueued, 1)

        await gate.release()

        await fulfillment(of: [admitted], timeout: 2)
        _ = await waiting.value
        let running = await gate.runningCount
        XCTAssertEqual(running, 1, "le permis passe de main en main, il ne se perd ni ne se double")
    }

    func test_decoded_offTheActor_returnsTheBucketedImage() async throws {
        let data = try jpeg(width: 4_000, height: 3_000)

        let image = await DecodedBitmapStore.decoded(data: data, maxPixelSize: 256)

        XCTAssertEqual(try longestSide(image), 256)
    }

    func test_imageForMaxPixelSize_stillServesTheBucketThroughTheGate() async throws {
        let store = makeStore()
        let key = "https://example.com/cell-\(UUID().uuidString).jpg"
        await store.save(try jpeg(width: 2_000, height: 2_000), for: key)

        async let first = store.image(for: key, maxPixelSize: 200)
        async let second = store.image(for: key, maxPixelSize: 500)
        let (small, large) = await (first, second)

        XCTAssertEqual(try longestSide(small), 256)
        XCTAssertEqual(try longestSide(large), 512)
    }
}
