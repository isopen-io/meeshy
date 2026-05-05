import Foundation
import CoreGraphics

/// NSObject wrapper for CGImage (required by NSCache)
public final class CGImageRef: NSObject {
    public let image: CGImage
    public init(_ image: CGImage) { self.image = image }
}

/// (O3) NSCache cost-based for decoded CGImages
/// Auto-evicts on memory warning without NotificationCenter
public final class DecodedImageCache: @unchecked Sendable {
    public static let shared = DecodedImageCache()

    private let cache: NSCache<NSString, CGImageRef>

    public init(totalCostLimit: Int = 50 * 1024 * 1024, countLimit: Int = 300) {
        cache = NSCache()
        cache.totalCostLimit = totalCostLimit
        cache.countLimit = countLimit
    }

    public func get(_ key: String) -> CGImage? {
        cache.object(forKey: key as NSString)?.image
    }

    public func set(_ image: CGImage, forKey key: String) {
        let cost = image.bytesPerRow * image.height
        cache.setObject(CGImageRef(image), forKey: key as NSString, cost: cost)
    }

    public func remove(_ key: String) {
        cache.removeObject(forKey: key as NSString)
    }
}
