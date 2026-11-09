import Foundation
import UIKit
import MeeshySDK

/// Caches rasterized emoji glyphs (`emoji|sizePx → CGImage`) so a sticker is
/// drawn through Core Text at most once per (emoji, integer size) pair.
///
/// Storage: `NSCache<NSString, CGImage>` with a configurable `countLimit`
/// (default `100`). NSCache provides:
///   - automatic LRU-style eviction when `countLimit` is exceeded;
///   - thread-safe access without an external lock.
///
/// In addition, the rasterizer subscribes to
/// `UIApplication.didReceiveMemoryWarningNotification` and drops every cached
/// glyph on memory pressure — NSCache evicts opportunistically under
/// pressure but does not guarantee a flush tied to that notification, so we
/// drive it ourselves to make the behavior testable and deterministic.
///
/// `countLimit = 100` is sized for the worst-case sticker storyboard
/// (≈50 distinct emojis × 2 integer sizes per slide × a small reuse window
/// across slides). Beyond that, eviction is graceful: a re-rasterization
/// costs a single off-screen Core Text draw, which is cheap compared to the
/// memory pressure of holding unlimited `CGImage`s alive.
///
/// The rasterization itself is performed on the main thread (UIKit
/// `UIGraphicsImageRenderer`).
public final class StoryStickerRasterizer: @unchecked Sendable {
    public static let shared = StoryStickerRasterizer()

    /// Default upper bound on cached glyphs. See type-level doc for sizing.
    /// `nonisolated` so it can be referenced as a default value from the
    /// `nonisolated init(countLimit:)` below — under MeeshyUI's
    /// `defaultIsolation(MainActor)`, an unmarked static `let` is implicitly
    /// MainActor-isolated and rejected by the compiler in nonisolated context.
    public nonisolated static let defaultCountLimit: Int = 100

    private let cache: LockedCache<NSString, CGImage>
    // unchecked: jeton d'observateur, écrit à l'init et lu par deinit seulement
    private let memoryWarningObserver: Locked<NSObjectProtocol?>

    private nonisolated convenience init(countLimit: Int = StoryStickerRasterizer.defaultCountLimit) {
        let backing = NSCache<NSString, CGImage>()
        backing.countLimit = countLimit
        backing.totalCostLimit = 10 * 1024 * 1024
        self.init(backing: backing)
    }

    /// Test-only initializer that allows shrinking the cache to exercise the
    /// eviction path without rasterizing thousands of glyphs.
    internal nonisolated convenience init(countLimitForTesting: Int) {
        let backing = NSCache<NSString, CGImage>()
        backing.countLimit = countLimitForTesting
        self.init(backing: backing)
    }

    private nonisolated init(backing: NSCache<NSString, CGImage>) {
        let cache = LockedCache(backing)
        self.cache = cache
        let observer = NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: nil
        ) { _ in cache.removeAllObjects() }
        self.memoryWarningObserver = Locked<NSObjectProtocol?>(uncheckedState: observer)
    }

    nonisolated deinit {
        if let observer = memoryWarningObserver.mutateUnchecked({ $0 }) {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    @MainActor
    public func cgImage(for emoji: String, size: CGFloat) -> CGImage? {
        let key = Self.cacheKey(emoji: emoji, size: size)
        if let cached = cache.object(forKey: key) {
            return cached
        }

        let attributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: size)
        ]
        let attributed = NSAttributedString(string: emoji, attributes: attributes)
        let textSize = attributed.size()
        let format = UIGraphicsImageRendererFormat.preferred()
        format.scale = SceneRasterBudget.scale(for: textSize, preferred: format.scale)
        let renderer = UIGraphicsImageRenderer(size: textSize, format: format)
        let image = renderer.image { _ in attributed.draw(at: .zero) }
        guard let cgImage = image.cgImage else { return nil }

        let pixelCost = cgImage.width * cgImage.height * 4
        cache.setObject(cgImage, forKey: key, cost: pixelCost)
        return cgImage
    }

    public nonisolated func clear() {
        cache.removeAllObjects()
    }

    /// Test-only probe to assert membership without exposing the underlying
    /// `NSCache` instance. Returns `nil` when the glyph has been evicted.
    internal nonisolated func cachedImage(emoji: String, size: CGFloat) -> CGImage? {
        cache.object(forKey: Self.cacheKey(emoji: emoji, size: size))
    }

    private nonisolated static func cacheKey(emoji: String, size: CGFloat) -> NSString {
        "\(emoji)|\(Int(size.rounded()))" as NSString
    }
}
