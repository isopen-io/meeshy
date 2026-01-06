//
//  PerformanceOptimizer.swift
//  Meeshy
//
//  Performance optimizations: batching, compression, debouncing
//  Swift 6 compliant with MainActor isolation
//

import Foundation
import Combine
import UIKit

@MainActor
class PerformanceOptimizer {

    // MARK: - Singleton

    static let shared = PerformanceOptimizer()

    // MARK: - Properties

    private var pendingBatchRequests: [BatchRequest] = []
    private var batchTimer: Timer?
    private let batchDelay: TimeInterval = 0.5
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Batch Request

    struct BatchRequest {
        let id: String
        let endpoint: APIEndpoint
        let completion: (Result<Any, MeeshyError>) -> Void
    }

    // MARK: - Initialization

    private init() {}

    // MARK: - Request Batching

    /// Batch multiple requests together
    func batchRequest<T: Decodable>(
        _ endpoint: APIEndpoint,
        completion: @escaping (Result<T, MeeshyError>) -> Void
    ) {
        let request = BatchRequest(
            id: UUID().uuidString,
            endpoint: endpoint,
            completion: { result in
                switch result {
                case .success(let value):
                    if let typedValue = value as? T {
                        completion(.success(typedValue))
                    } else {
                        completion(.failure(MeeshyError.network(.decodingFailed)))
                    }
                case .failure(let error):
                    completion(.failure(error))
                }
            }
        )

        pendingBatchRequests.append(request)

        // Reset timer
        batchTimer?.invalidate()
        batchTimer = Timer.scheduledTimer(withTimeInterval: batchDelay, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.executeBatch()
            }
        }
    }

    private func executeBatch() {
        guard !pendingBatchRequests.isEmpty else { return }

        let requests = pendingBatchRequests
        pendingBatchRequests.removeAll()

        // Group requests by endpoint type
        let groupedRequests = Dictionary(grouping: requests) { request in
            request.endpoint.path.components(separatedBy: "/").prefix(2).joined(separator: "/")
        }

        // Execute each group
        for (_, groupRequests) in groupedRequests {
            if groupRequests.count == 1 {
                // Single request - execute normally
                executeSingleRequest(groupRequests[0])
            } else {
                // Multiple requests - batch them
                executeBatchedRequests(groupRequests)
            }
        }
    }

    private func executeSingleRequest(_ request: BatchRequest) {
        // Note: Batch requests need to be handled with actual endpoint implementation
        // For now, execute individual requests with proper error handling
        // The API client would need to support dynamic response types
        // This is a simplified implementation for MVP

        // Since we can't decode to Any, we'll need to handle this differently
        // In a real implementation, batch requests would be sent to a specific batch endpoint
        // For now, just fail with an error
        request.completion(.failure(MeeshyError.network(.unknown)))
    }

    private func executeBatchedRequests(_ requests: [BatchRequest]) {
        // In a real implementation, this would create a single batch request
        // For now, execute individually
        requests.forEach { executeSingleRequest($0) }
    }

    // MARK: - Image Optimization

    /// Optimize image before upload
    func optimizeImage(_ image: UIImage, maxSize: CGSize = CGSize(width: 1920, height: 1920), quality: CGFloat = 0.8) -> Data? {
        // Resize image if needed
        let resizedImage = resizeImage(image, targetSize: maxSize)

        // Compress to JPEG
        return resizedImage.jpegData(compressionQuality: quality)
    }

    private func resizeImage(_ image: UIImage, targetSize: CGSize) -> UIImage {
        let size = image.size

        let widthRatio  = targetSize.width  / size.width
        let heightRatio = targetSize.height / size.height

        var newSize: CGSize
        if widthRatio > heightRatio {
            newSize = CGSize(width: size.width * heightRatio, height: size.height * heightRatio)
        } else {
            newSize = CGSize(width: size.width * widthRatio, height: size.height * widthRatio)
        }

        let rect = CGRect(origin: .zero, size: newSize)

        UIGraphicsBeginImageContextWithOptions(newSize, false, 1.0)
        image.draw(in: rect)
        let newImage = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()

        return newImage ?? image
    }

    /// Generate thumbnail for image
    func generateThumbnail(_ image: UIImage, size: CGSize = CGSize(width: 200, height: 200)) -> UIImage? {
        return resizeImage(image, targetSize: size)
    }

    // MARK: - Debouncing

    /// Debounce search queries
    func debounce<T>(
        for duration: TimeInterval = 0.3,
        action: @escaping (T) -> Void
    ) -> (T) -> Void {
        var workItem: DispatchWorkItem?

        return { value in
            workItem?.cancel()
            let newWorkItem = DispatchWorkItem {
                action(value)
            }
            workItem = newWorkItem
            DispatchQueue.main.asyncAfter(deadline: .now() + duration, execute: newWorkItem)
        }
    }

    // MARK: - Pagination Helper

    /// Load more items with pagination
    func loadMoreIfNeeded<T>(
        currentItems: [T],
        currentPage: Int,
        totalCount: Int,
        limit: Int,
        threshold: Int = 10,
        loadMore: @escaping (Int) -> Void
    ) {
        let currentCount = currentItems.count
        let shouldLoadMore = currentCount >= (currentPage * limit) - threshold && currentCount < totalCount

        if shouldLoadMore {
            loadMore(currentPage + 1)
        }
    }

    // MARK: - Response Compression

    /// Decompress gzipped response
    func decompressResponse(_ data: Data) -> Data? {
        // In a real implementation, use zlib or similar
        return data
    }

    // MARK: - Memory Management

    /// Clear caches to free memory
    func clearMemoryCache() {
        CacheManager.shared.clearAll()
        URLCache.shared.removeAllCachedResponses()
    }

    /// Handle memory warning
    func handleMemoryWarning() {
        // Clear image cache
        URLCache.shared.removeAllCachedResponses()

        // Clear in-memory cache
        NotificationCenter.default.post(name: .memoryWarningReceived, object: nil)
    }
}

// MARK: - Debouncer Publisher

extension Publisher where Failure == Never {
    func debounce(for duration: TimeInterval) -> AnyPublisher<Output, Failure> {
        return self
            .debounce(for: .seconds(duration), scheduler: DispatchQueue.main)
            .eraseToAnyPublisher()
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let memoryWarningReceived = Notification.Name("memoryWarningReceived")
}
