import XCTest
import UIKit
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// Verifies the P0 perf fix on `StoryMediaLayer.configureImage`.
///
/// The previous implementation called `Data(contentsOf:)` synchronously on
/// the main thread for `http(s)` URLs, blocking up to ~500 ms per 5 MB image
/// on a 4G connection (≈30 dropped frames). The fix routes remote URLs
/// through the cache coordinator's async pipeline and cancels any pending
/// load when `configure(with:geometry:mode:)` is called again — guaranteeing
/// the synchronous call returns within a frame budget regardless of the
/// network state, and that a recycled layer never stamps the previous URL's
/// CGImage into `contents`.
@MainActor
final class StoryMediaLayer_AsyncLoadTests: XCTestCase {

    // MARK: - Test doubles

    /// Deterministic in-process loader. Each `image(for:)` call suspends on
    /// a continuation we resolve from the test, so we can:
    ///  - assert that `configureImage` returns before the load completes;
    ///  - observe how many loads were started for a given URL;
    ///  - finish individual loads in a deterministic order.
    actor StubLoader: StoryMediaImageLoading {
        private var pending: [String: [CheckedContinuation<UIImage?, Never>]] = [:]
        private var startCounts: [String: Int] = [:]

        nonisolated func image(for urlString: String) async -> UIImage? {
            await suspend(urlString)
        }

        private func suspend(_ urlString: String) async -> UIImage? {
            startCounts[urlString, default: 0] += 1
            return await withCheckedContinuation { continuation in
                pending[urlString, default: []].append(continuation)
            }
        }

        func finish(_ urlString: String, with image: UIImage?) {
            guard var queue = pending[urlString], !queue.isEmpty else { return }
            let cont = queue.removeFirst()
            pending[urlString] = queue
            cont.resume(returning: image)
        }

        /// Resume every still-suspended continuation with `nil` — call from
        /// each test's teardown so the actor doesn't leak suspended tasks
        /// into the next test case.
        func drainAll() {
            for (_, queue) in pending {
                for cont in queue { cont.resume(returning: nil) }
            }
            pending.removeAll()
        }

        func pendingCount(_ urlString: String) -> Int {
            pending[urlString]?.count ?? 0
        }
    }

    // MARK: - Factories

    private func makeRemoteMedia(url: String = "https://cdn.example.test/big.jpg") -> StoryMediaObject {
        StoryMediaObject(id: "media-\(UUID().uuidString.prefix(8))",
                         postMediaId: "post-\(UUID().uuidString.prefix(6))",
                         mediaURL: url,
                         kind: .image,
                         aspectRatio: 1.0)
    }

    private func makeGeometry() -> CanvasGeometry {
        CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
    }

    private func makePixelImage(_ color: UIColor) -> UIImage {
        let size = CGSize(width: 4, height: 4)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            color.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
    }

    // MARK: - Tests

    /// Synchronous `configure(with:geometry:mode:)` MUST return within a
    /// frame budget even when the underlying loader never resolves. The
    /// previous synchronous `Data(contentsOf:)` path could block for
    /// hundreds of milliseconds on the same input.
    func test_configureImage_remoteURL_doesNotBlock() async {
        let layer = StoryMediaLayer()
        let stub = StubLoader()
        layer._setImageLoaderForTesting(stub)

        let media = makeRemoteMedia()
        let geometry = makeGeometry()

        let clock = ContinuousClock()
        let elapsed = clock.measure {
            layer.configure(with: media, geometry: geometry, mode: .edit)
        }

        XCTAssertLessThan(elapsed, .milliseconds(50),
                          "configure() must not block on network — measured \(elapsed)")

        // The stub never resolved → `contents` is still nil and a load is
        // pending under the hood. Cancel + drain so the test exits cleanly.
        layer._currentImageLoadTaskForTesting()?.cancel()
        await stub.drainAll()
        _ = await layer._currentImageLoadTaskForTesting()?.value
    }

    /// When a second `configure()` lands before the first load resolves, the
    /// stale fetch must be cancelled and only the latest URL's image must
    /// reach `contents`. Otherwise a recycled layer can flash A's bitmap
    /// over B's slide.
    func test_configureImage_supersededByNewLoad_cancelsPrevious() async {
        let layer = StoryMediaLayer()
        let stub = StubLoader()
        layer._setImageLoaderForTesting(stub)

        let urlA = "https://cdn.example.test/a.jpg"
        let urlB = "https://cdn.example.test/b.jpg"
        let mediaA = makeRemoteMedia(url: urlA)
        let mediaB = makeRemoteMedia(url: urlB)
        let geometry = makeGeometry()

        let imageA = makePixelImage(.red)
        let imageB = makePixelImage(.green)

        // Kick off load A and capture the in-flight Task so we can await its
        // cancellation deterministically.
        layer.configure(with: mediaA, geometry: geometry, mode: .edit)
        let taskA = layer._currentImageLoadTaskForTesting()
        XCTAssertNotNil(taskA, "Load A should have been started")

        // Immediately re-configure with B before A resolves. The fix must
        // cancel A and replace the current task.
        layer.configure(with: mediaB, geometry: geometry, mode: .edit)
        let taskB = layer._currentImageLoadTaskForTesting()
        XCTAssertNotNil(taskB)
        XCTAssertFalse(taskA == taskB,
                       "configure() must reassign currentLoadTask when superseded")

        // Drain A's cancellation: even if the stub resolves A with imageA, the
        // Task<Void, Never> continuation must observe `isCancelled` and NOT
        // touch `contents`.
        await stub.finish(urlA, with: imageA)
        _ = await taskA?.value
        XCTAssertNil(layer.contents,
                     "Cancelled load A must NOT stamp its CGImage into contents")

        // Finish B and confirm B's image lands.
        await stub.finish(urlB, with: imageB)
        _ = await taskB?.value
        XCTAssertNotNil(layer.contents,
                        "Load B must have set contents after resolving")

        // `layer.contents` is `Any?` boxing a `CGImage`. We confirm it is
        // the same Core Graphics object backing imageB (pointer identity
        // through ObjectIdentifier-equivalent CFType comparison).
        if let resolved = layer.contents {
            // swiftlint:disable:next force_cast
            let resolvedCG = resolved as! CGImage
            XCTAssertTrue(CFEqual(resolvedCG, imageB.cgImage!),
                          "Layer must end up displaying load B's bitmap, not A's")
        } else {
            XCTFail("layer.contents nil after load B resolution")
        }

        // No leftover pending entries for A or B.
        let leftoverA = await stub.pendingCount(urlA)
        let leftoverB = await stub.pendingCount(urlB)
        XCTAssertEqual(leftoverA, 0, "A's queue must be drained")
        XCTAssertEqual(leftoverB, 0, "B's queue must be drained")

        await stub.drainAll()
    }
}
