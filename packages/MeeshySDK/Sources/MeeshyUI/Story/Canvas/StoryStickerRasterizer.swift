import Foundation
import UIKit

/// Caches rasterized emoji glyphs (`emoji|sizePx → CGImage`) so a sticker is
/// drawn through Core Text at most once per (emoji, integer size) pair.
///
/// Thread-safety: backed by an `NSLock`; the rasterization itself is performed
/// on the main thread (UIKit `UIGraphicsImageRenderer`). The cache is small
/// (one slide rarely uses more than a few sticker sizes) so unbounded growth
/// is acceptable for Phase 2; an LRU policy can be layered in later if needed.
public final class StoryStickerRasterizer: @unchecked Sendable {
    public static let shared = StoryStickerRasterizer()

    private nonisolated(unsafe) var cache: [String: CGImage] = [:]
    private nonisolated let lock = NSLock()

    private nonisolated init() {}

    @MainActor
    public func cgImage(for emoji: String, size: CGFloat) -> CGImage? {
        let key = Self.cacheKey(emoji: emoji, size: size)
        lock.lock()
        let cached = cache[key]
        lock.unlock()
        if let cached { return cached }

        let attributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: size)
        ]
        let attributed = NSAttributedString(string: emoji, attributes: attributes)
        let textSize = attributed.size()
        let renderer = UIGraphicsImageRenderer(size: textSize)
        let image = renderer.image { _ in attributed.draw(at: .zero) }
        guard let cgImage = image.cgImage else { return nil }

        lock.lock()
        cache[key] = cgImage
        lock.unlock()
        return cgImage
    }

    public nonisolated func clear() {
        lock.lock()
        cache.removeAll()
        lock.unlock()
    }

    private nonisolated static func cacheKey(emoji: String, size: CGFloat) -> String {
        "\(emoji)|\(Int(size.rounded()))"
    }
}
