//
//  MediaPickerViewModel.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//  Updated: 2025-12-06 - Added video support and improved media handling
//

import SwiftUI
import Photos
import PhotosUI
import AVFoundation

enum MediaPickerTab {
    case photos
    case camera
    case files
}

/// Represents different media type filters for the picker
enum MediaFilterType: CaseIterable {
    case all
    case photos
    case videos

    var displayName: String {
        switch self {
        case .all: return "Tous"
        case .photos: return "Photos"
        case .videos: return "Vidéos"
        }
    }

    var systemImage: String {
        switch self {
        case .all: return "square.grid.2x2"
        case .photos: return "photo"
        case .videos: return "video"
        }
    }
}

struct PhotoItem: Identifiable, Equatable {
    let id: String
    let asset: PHAsset
    var thumbnail: UIImage?
    var isSelected: Bool = false

    /// True if this is a video asset
    var isVideo: Bool {
        asset.mediaType == .video
    }

    /// Duration in seconds for videos, nil for photos
    var duration: TimeInterval? {
        guard isVideo else { return nil }
        return asset.duration
    }

    /// Formatted duration string for display
    var durationFormatted: String? {
        guard let duration = duration else { return nil }
        let mins = Int(duration) / 60
        let secs = Int(duration) % 60
        return String(format: "%d:%02d", mins, secs)
    }

    static func == (lhs: PhotoItem, rhs: PhotoItem) -> Bool {
        lhs.id == rhs.id && lhs.isSelected == rhs.isSelected
    }
}

@MainActor
final class MediaPickerViewModel: ObservableObject {
    @Published var selectedTab: MediaPickerTab = .photos
    @Published var photoItems: [PhotoItem] = []
    @Published var selectedItems: [PhotoItem] = []
    @Published var isLoading = false
    @Published var showPermissionAlert = false
    @Published var mediaFilter: MediaFilterType = .all

    private let imageManager = PHCachingImageManager()
    private let maxSelectionCount = 10
    private var allAssets: [PhotoItem] = []  // Store all assets for filtering
    private var fetchResult: PHFetchResult<PHAsset>?

    init() {
        Task {
            await loadMediaAssets()
        }
    }

    // MARK: - Load All Media (Photos + Videos)

    func loadMediaAssets() async {
        guard await checkPhotoLibraryPermission() else {
            showPermissionAlert = true
            return
        }

        isLoading = true

        let fetchOptions = PHFetchOptions()
        fetchOptions.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        // Fetch both images AND videos
        fetchOptions.predicate = NSPredicate(format: "mediaType == %d OR mediaType == %d", PHAssetMediaType.image.rawValue, PHAssetMediaType.video.rawValue)

        fetchResult = PHAsset.fetchAssets(with: fetchOptions)

        guard let fetchResult = fetchResult else {
            isLoading = false
            return
        }

        var items: [PhotoItem] = []

        for index in 0..<fetchResult.count {
            let asset = fetchResult.object(at: index)
            let item = PhotoItem(
                id: asset.localIdentifier,
                asset: asset,
                thumbnail: nil,
                isSelected: false
            )
            items.append(item)
        }

        allAssets = items
        applyFilter()
        isLoading = false

        // Load thumbnails
        await loadThumbnails()
    }

    // MARK: - Filter Media

    func setFilter(_ filter: MediaFilterType) {
        mediaFilter = filter
        applyFilter()
    }

    private func applyFilter() {
        switch mediaFilter {
        case .all:
            photoItems = allAssets
        case .photos:
            photoItems = allAssets.filter { !$0.isVideo }
        case .videos:
            photoItems = allAssets.filter { $0.isVideo }
        }

        // Update selection state after filtering
        for index in 0..<photoItems.count {
            photoItems[index].isSelected = selectedItems.contains { $0.id == photoItems[index].id }
        }
    }

    // MARK: - Legacy method for compatibility

    func loadPhotos() async {
        await loadMediaAssets()
    }

    // MARK: - Load Thumbnails

    private func loadThumbnails() async {
        let size = CGSize(width: 200, height: 200)
        let options = PHImageRequestOptions()
        options.deliveryMode = .opportunistic
        options.isNetworkAccessAllowed = true

        for index in 0..<min(photoItems.count, 100) { // Load first 100 thumbnails
            let item = photoItems[index]

            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                imageManager.requestImage(
                    for: item.asset,
                    targetSize: size,
                    contentMode: .aspectFill,
                    options: options
                ) { [weak self] image, _ in
                    Task { @MainActor in
                        if let index = self?.photoItems.firstIndex(where: { $0.id == item.id }) {
                            self?.photoItems[index].thumbnail = image
                        }
                        continuation.resume()
                    }
                }
            }
        }
    }

    // MARK: - Selection

    func toggleSelection(_ item: PhotoItem) {
        guard let index = photoItems.firstIndex(where: { $0.id == item.id }) else { return }

        if photoItems[index].isSelected {
            // Deselect
            photoItems[index].isSelected = false
            selectedItems.removeAll { $0.id == item.id }
        } else {
            // Select (if under limit)
            if selectedItems.count < maxSelectionCount {
                photoItems[index].isSelected = true
                selectedItems.append(photoItems[index])
            }
        }
    }

    func clearSelection() {
        for index in 0..<photoItems.count {
            photoItems[index].isSelected = false
        }
        selectedItems.removeAll()
    }

    // MARK: - Get Full Image

    func getFullImage(for item: PhotoItem) async -> UIImage? {
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.isNetworkAccessAllowed = true
        options.isSynchronous = false

        return await withCheckedContinuation { continuation in
            imageManager.requestImage(
                for: item.asset,
                targetSize: PHImageManagerMaximumSize,
                contentMode: .aspectFit,
                options: options
            ) { image, _ in
                continuation.resume(returning: image)
            }
        }
    }

    // MARK: - Get Video URL

    func getVideoURL(for asset: PHAsset) async -> URL? {
        guard asset.mediaType == .video else { return nil }

        let options = PHVideoRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.isNetworkAccessAllowed = true

        return await withCheckedContinuation { continuation in
            imageManager.requestAVAsset(forVideo: asset, options: options) { avAsset, _, _ in
                if let urlAsset = avAsset as? AVURLAsset {
                    continuation.resume(returning: urlAsset.url)
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    // MARK: - Permission Check

    private func checkPhotoLibraryPermission() async -> Bool {
        await PermissionManager.shared.requestPhotoLibraryAccess()
    }

    // MARK: - Convert to Attachments

    func convertToAttachments() async -> [Attachment] {
        var attachments: [Attachment] = []

        for item in selectedItems {
            if item.isVideo {
                // Handle video asset
                if let videoURL = await getVideoURL(for: item.asset) {
                    // Copy to temp location for processing
                    let tempURL = FileManager.default.temporaryDirectory
                        .appendingPathComponent(UUID().uuidString)
                        .appendingPathExtension("mp4")

                    do {
                        try FileManager.default.copyItem(at: videoURL, to: tempURL)

                        let fileSize = (try? FileManager.default.attributesOfItem(atPath: tempURL.path)[.size] as? Int64) ?? 0

                        let attachment = Attachment(
                            id: UUID().uuidString,
                            type: .video,
                            url: "",
                            fileName: "video_\(Date().timeIntervalSince1970).mp4",
                            fileSize: fileSize,
                            mimeType: "video/mp4",
                            thumbnailUrl: nil,
                            metadata: nil,
                            localURL: tempURL,
                            createdAt: Date(),
                            duration: item.duration
                        )
                        attachments.append(attachment)
                    } catch {
                        mediaLogger.error("[MediaPickerVM] Failed to copy video: \(error.localizedDescription)")
                    }
                }
            } else {
                // Handle image asset
                if let image = await getFullImage(for: item) {
                    // Save image to temp file
                    let tempURL = FileManager.default.temporaryDirectory
                        .appendingPathComponent(UUID().uuidString)
                        .appendingPathExtension("jpg")

                    if let data = image.jpegData(compressionQuality: 0.9) {
                        try? data.write(to: tempURL)

                        let attachment = Attachment(
                            id: UUID().uuidString,
                            type: .image,
                            url: "",
                            fileName: "image_\(Date().timeIntervalSince1970).jpg",
                            fileSize: Int64(data.count),
                            mimeType: "image/jpeg",
                            thumbnailUrl: nil,
                            metadata: nil,
                            localURL: tempURL,
                            createdAt: Date()
                        )
                        attachments.append(attachment)
                    }
                }
            }
        }

        return attachments
    }

    // MARK: - Get Video Export URL

    /// Export video to a local file URL for processing
    func getVideoExportURL(for asset: PHAsset) async -> URL? {
        guard asset.mediaType == .video else { return nil }

        let options = PHVideoRequestOptions()
        options.version = .current
        options.deliveryMode = .highQualityFormat
        options.isNetworkAccessAllowed = true

        return await withCheckedContinuation { continuation in
            PHImageManager.default().requestExportSession(
                forVideo: asset,
                options: options,
                exportPreset: AVAssetExportPresetPassthrough
            ) { exportSession, info in
                guard let exportSession = exportSession else {
                    continuation.resume(returning: nil)
                    return
                }

                let outputURL = FileManager.default.temporaryDirectory
                    .appendingPathComponent(UUID().uuidString)
                    .appendingPathExtension("mp4")

                exportSession.outputURL = outputURL
                exportSession.outputFileType = .mp4

                exportSession.exportAsynchronously {
                    switch exportSession.status {
                    case .completed:
                        continuation.resume(returning: outputURL)
                    default:
                        continuation.resume(returning: nil)
                    }
                }
            }
        }
    }
}
