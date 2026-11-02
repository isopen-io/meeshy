import XCTest
import UIKit
import os
import MeeshySDK
@testable import MeeshyUI

private final class SpyMediaImageLoader: MediaImageLoading, @unchecked Sendable {
    struct State {
        var calls: [String] = []
        var pixelSizes: [CGFloat] = []
        var persistedFile: URL?
        var dataFailure: (any Error & Sendable)?
    }

    private let lock = OSAllocatedUnfairLock(initialState: State())

    init(persistedFile: URL? = nil, dataFailure: (any Error & Sendable)? = nil) {
        lock.withLock { $0.persistedFile = persistedFile; $0.dataFailure = dataFailure }
    }

    var calls: [String] { lock.withLock { $0.calls } }
    var pixelSizes: [CGFloat] { lock.withLock { $0.pixelSizes } }

    func image(for urlString: String) async -> UIImage? {
        lock.withLock { $0.calls.append("image") }
        return UIImage()
    }

    func image(for urlString: String, maxPixelSize: CGFloat) async -> UIImage? {
        lock.withLock { $0.calls.append("image.bounded"); $0.pixelSizes.append(maxPixelSize) }
        return UIImage()
    }

    func data(for urlString: String) async throws -> Data {
        lock.withLock { $0.calls.append("data") }
        if let failure = lock.withLock({ $0.dataFailure }) { throw failure }
        return Data([1, 2, 3])
    }

    func store(_ data: Data, for key: String) async {
        lock.withLock { $0.calls.append("store") }
    }

    func persistedFileURL(for key: String) async -> URL? {
        lock.withLock { $0.calls.append("persisted") }
        return lock.withLock { $0.persistedFile }
    }
}

private struct LoaderFailure: Error {}

@MainActor
final class MediaImageLoadingInjectionTests: XCTestCase {

    private func makeAttachment() -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: "att_1", fileName: "a.jpg", mimeType: "image/jpeg", fileUrl: "https://x/a.jpg")
    }

    func test_cachedImageFetch_avecTargetSize_appelleLaVarianteBornee() async {
        let spy = SpyMediaImageLoader()
        let size = CGSize(width: 120, height: 120)

        _ = await CachedImageFetch.load("https://x/a.jpg", targetSize: size, using: spy)

        XCTAssertEqual(spy.calls, ["image.bounded"])
        XCTAssertEqual(spy.pixelSizes, [DecodeBudget.maxPixelWidth(for: .fitting(size))])
    }

    func test_cachedImageFetch_sansTargetSize_appelleLaVariantePleine() async {
        let spy = SpyMediaImageLoader()

        _ = await CachedImageFetch.load("https://x/a.jpg", targetSize: nil, using: spy)

        XCTAssertEqual(spy.calls, ["image"])
    }

    func test_cachedAsyncImage_conserveLeChargeurInjecte() {
        let spy = SpyMediaImageLoader()
        let sut = CachedAsyncImage(url: nil, imageLoader: spy)
        XCTAssertTrue((sut.imageLoader as? SpyMediaImageLoader) === spy)
    }

    func test_cachedAsyncImage_parDefaut_utiliseCoordinatorImages() {
        let sut = CachedAsyncImage(url: nil)
        XCTAssertEqual(sut.imageLoader as? CoordinatorImageLoader, CoordinatorImageLoader.images)
    }

    func test_imageViewerView_transmetSonChargeur() {
        let spy = SpyMediaImageLoader()
        let sut = ImageViewerView(attachment: makeAttachment(), context: .messageBubble, imageLoader: spy)
        XCTAssertTrue((sut.imageLoader as? SpyMediaImageLoader) === spy)
    }

    func test_imageFullscreen_receivedBytes_rendNilQuandLeChargeurEchoue() async {
        let spy = SpyMediaImageLoader(dataFailure: LoaderFailure())
        let bytes = await ImageFullscreen.receivedBytes(for: URL(string: "https://x/a.jpg")!, using: spy)
        XCTAssertNil(bytes)
    }

    func test_videoThumbnail_persistedPoster_sansFichier_neDecodeRien() async {
        let spy = SpyMediaImageLoader(persistedFile: nil)

        let poster = await MeeshyVideoThumbnail.persistedPoster(forKey: "thumb:x", using: spy)

        XCTAssertNil(poster)
        XCTAssertEqual(spy.calls, ["persisted"])
    }

    func test_videoThumbnail_persistedPoster_avecFichier_decodeA600() async {
        let spy = SpyMediaImageLoader(persistedFile: URL(fileURLWithPath: "/tmp/poster.jpg"))

        let poster = await MeeshyVideoThumbnail.persistedPoster(forKey: "thumb:x", using: spy)

        XCTAssertNotNil(poster)
        XCTAssertEqual(spy.pixelSizes, [600])
    }

    func test_videoThumbnail_parDefaut_utiliseCoordinatorThumbnails() {
        let sut = MeeshyVideoThumbnail(attachment: makeAttachment(), accentColor: "FF0000")
        XCTAssertEqual(sut.imageLoader as? CoordinatorImageLoader, CoordinatorImageLoader.thumbnails)
    }
}
