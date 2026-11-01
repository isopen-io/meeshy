import UIKit
import MeeshySDK

nonisolated public protocol MediaImageLoading: Sendable {
    func image(for urlString: String) async -> UIImage?
    func image(for urlString: String, maxPixelSize: CGFloat) async -> UIImage?
    func data(for urlString: String) async throws -> Data
    func store(_ data: Data, for key: String) async
    func persistedFileURL(for key: String) async -> URL?
}

nonisolated public struct CoordinatorImageLoader: MediaImageLoading, Equatable {
    private enum Slot: Equatable, Sendable {
        case images
        case thumbnails
    }

    public static let images = CoordinatorImageLoader(slot: .images)
    public static let thumbnails = CoordinatorImageLoader(slot: .thumbnails)

    private let slot: Slot

    private init(slot: Slot) {
        self.slot = slot
    }

    private func diskStore() async -> DiskCacheStore {
        switch slot {
        case .images: return await CacheCoordinator.shared.images
        case .thumbnails: return await CacheCoordinator.shared.thumbnails
        }
    }

    public func image(for urlString: String) async -> UIImage? {
        await diskStore().image(for: urlString)
    }

    public func image(for urlString: String, maxPixelSize: CGFloat) async -> UIImage? {
        await diskStore().image(for: urlString, maxPixelSize: maxPixelSize)
    }

    public func data(for urlString: String) async throws -> Data {
        try await diskStore().data(for: urlString)
    }

    public func store(_ data: Data, for key: String) async {
        await diskStore().store(data, for: key)
    }

    public func persistedFileURL(for key: String) async -> URL? {
        await diskStore().cachedFileURL(for: key)
    }
}

enum CachedImageFetch {
    static func load(_ resolved: String, targetSize: CGSize?, using loader: any MediaImageLoading) async -> UIImage? {
        guard let targetSize else { return await loader.image(for: resolved) }
        let maxPixel = DecodeBudget.maxPixelWidth(for: .fitting(targetSize))
        return await loader.image(for: resolved, maxPixelSize: maxPixel)
    }
}
