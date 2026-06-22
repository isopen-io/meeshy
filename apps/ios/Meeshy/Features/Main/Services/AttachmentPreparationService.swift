import Foundation
import AVFoundation
import PhotosUI
import SwiftUI
import UIKit
import ImageIO
import MeeshySDK
import MeeshyUI
import os

// MARK: - Preparation Stage

/// State machine for a media attachment moving from raw selection to
/// upload-ready. Single source of truth across messages, posts and stories so
/// the loading tile shows the same stage labels and progression everywhere.
enum AttachmentPreparationStage: Equatable, Sendable {
    case loading        // Pulling bytes from PhotosPicker / disk
    case compressing    // MediaCompressor running
    case thumbnailing   // Extracting still frame (video) or decoding image
    case hashing        // Computing ThumbHash
    case ready
    case failed(String)
}

// MARK: - Prepared Attachment (final value)

/// Fully prepared attachment with everything the composer / uploader needs.
struct PreparedAttachment: Sendable {
    let attachment: MessageAttachment
    let fileURL: URL
    let thumbHash: String?
    let thumbnailData: Data?    // JPEG bytes for renderer cache seeding

    init(attachment: MessageAttachment, fileURL: URL, thumbHash: String?, thumbnailData: Data?) {
        self.attachment = attachment
        self.fileURL = fileURL
        self.thumbHash = thumbHash
        self.thumbnailData = thumbnailData
    }
}

// MARK: - Preparing Attachment (observable in-flight)

/// Observable handle for an in-flight attachment preparation. The composer
/// stores these in a `[PreparingAttachment]` array and renders one
/// `AttachmentLoadingTile` per entry until it transitions to `.ready`, at
/// which point the caller transfers the result into its pending state and
/// drops the handle.
@MainActor
final class PreparingAttachment: ObservableObject, Identifiable {
    let id: String
    let kind: MessageAttachment.AttachmentType
    @Published var stage: AttachmentPreparationStage = .loading
    @Published var thumbnail: UIImage?
    @Published private(set) var prepared: PreparedAttachment?
    let accentColor: String

    /// Continuations parked in `awaitCompletion()`. We resume them all once
    /// the preparation transitions to a terminal state (.ready / .failed) so
    /// callers can drive UI side-effects without polling `@Published` values.
    private var waiters: [CheckedContinuation<Result<PreparedAttachment, AttachmentPreparationError>, Never>] = []

    init(id: String = UUID().uuidString,
                kind: MessageAttachment.AttachmentType,
                initialThumbnail: UIImage? = nil,
                accentColor: String) {
        self.id = id
        self.kind = kind
        self.thumbnail = initialThumbnail
        self.accentColor = accentColor
    }

    /// Suspend until the preparation reaches a terminal state. Multiple
    /// callers can wait concurrently — all are resumed with the same result.
    /// If the preparation has already finished, the continuation resumes
    /// immediately on the next runloop tick.
    func awaitCompletion() async -> Result<PreparedAttachment, AttachmentPreparationError> {
        if case .ready = stage, let prep = prepared {
            return .success(prep)
        }
        if case .failed(let message) = stage {
            return .failure(.preparationFailed(message))
        }
        return await withCheckedContinuation { continuation in
            waiters.append(continuation)
        }
    }

    fileprivate func finish(_ prep: PreparedAttachment) {
        self.prepared = prep
        self.stage = .ready
        let pending = waiters
        waiters.removeAll()
        for waiter in pending { waiter.resume(returning: .success(prep)) }
    }

    fileprivate func fail(_ message: String) {
        fail_internal(message)
    }

    /// Internal hook used by the unit tests to drive the state machine
    /// without spinning up the full preparation pipeline.
    internal func fail_internal(_ message: String) {
        self.stage = .failed(message)
        let pending = waiters
        waiters.removeAll()
        for waiter in pending { waiter.resume(returning: .failure(.preparationFailed(message))) }
    }
}

enum AttachmentPreparationError: Error, Sendable {
    case preparationFailed(String)
}

// MARK: - Service

/// Unified pipeline that turns raw user-picked media (PhotosPickerItem,
/// camera capture, recorded audio, file import) into a `PreparedAttachment`
/// ready to be uploaded and rendered. Each entry point returns a
/// `PreparingAttachment` immediately so the composer can show a loading tile
/// while compression, thumbnail extraction and ThumbHash encoding run in the
/// background.
@MainActor
final class AttachmentPreparationService {
    static let shared = AttachmentPreparationService()
    private let log = Logger(subsystem: "me.meeshy.app", category: "attachment-prep")

    init() {}

    // MARK: Image (already-decoded UIImage — camera capture / image editor)

    func prepareImage(_ image: UIImage,
                             context: MediaContext = .message,
                             accentColor: String = MeeshyColors.brandPrimaryHex) -> PreparingAttachment {
        let prep = PreparingAttachment(kind: .image, initialThumbnail: image, accentColor: accentColor)
        prep.stage = .compressing
        Task { [weak self] in
            await self?.runImagePreparation(prep: prep, image: image, context: context)
        }
        return prep
    }

    // MARK: Image data (PhotosPicker / share extension)

    func prepareImageData(_ data: Data,
                                 image: UIImage,
                                 context: MediaContext = .message,
                                 accentColor: String = MeeshyColors.brandPrimaryHex) -> PreparingAttachment {
        let prep = PreparingAttachment(kind: .image, initialThumbnail: image, accentColor: accentColor)
        prep.stage = .compressing
        Task { [weak self] in
            await self?.runImageDataPreparation(prep: prep, data: data, image: image, context: context)
        }
        return prep
    }

    // MARK: Video (URL on disk — camera or already-extracted picker payload)

    func prepareVideo(sourceURL: URL,
                             deleteSourceAfterCompression: Bool,
                             context: MediaContext = .message,
                             accentColor: String = MeeshyColors.brandDeepHex) -> PreparingAttachment {
        let prep = PreparingAttachment(kind: .video, accentColor: accentColor)
        prep.stage = .compressing
        Task { [weak self] in
            await self?.runVideoPreparation(prep: prep,
                                            sourceURL: sourceURL,
                                            deleteSource: deleteSourceAfterCompression,
                                            context: context)
        }
        return prep
    }

    // MARK: Audio (recorded clip — already produced by AudioRecorderManager)

    func prepareAudio(url: URL,
                             durationMs: Int,
                             accentColor: String) -> PreparingAttachment {
        let prep = PreparingAttachment(kind: .audio, accentColor: accentColor)
        let attachment = MessageAttachment(
            id: prep.id,
            mimeType: "audio/mp4",
            duration: max(durationMs, 500),
            channels: 2,
            thumbnailColor: accentColor
        )
        prep.finish(PreparedAttachment(
            attachment: attachment,
            fileURL: url,
            thumbHash: nil,
            thumbnailData: nil
        ))
        return prep
    }

    // MARK: PhotosPicker (unified entry — auto-detects image vs video)

    func preparePhotosPickerItem(_ item: PhotosPickerItem,
                                        context: MediaContext = .message,
                                        accentColor: String) -> PreparingAttachment {
        let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) }
        let resolvedColor = accentColor.isEmpty
            ? (isVideo ? MeeshyColors.brandDeepHex : MeeshyColors.brandPrimaryHex)
            : accentColor
        let prep = PreparingAttachment(
            kind: isVideo ? .video : .image,
            accentColor: resolvedColor
        )
        prep.stage = .loading
        Task { [weak self] in
            guard let self else { return }
            if isVideo {
                await self.loadPickerVideo(item: item, prep: prep, context: context)
            } else {
                await self.loadPickerImage(item: item, prep: prep, context: context)
            }
        }
        return prep
    }

    // MARK: - Private: Image pipeline

    private func runImagePreparation(prep: PreparingAttachment,
                                     image: UIImage,
                                     context: MediaContext) async {
        let result = await MediaCompressor.shared.compressImage(image, maxDimension: context.maxImageDimension)
        await populateImage(prep: prep, result: result, sourceImage: image)
    }

    private func runImageDataPreparation(prep: PreparingAttachment,
                                         data: Data,
                                         image: UIImage,
                                         context: MediaContext) async {
        let result = await MediaCompressor.shared.compressImageData(data, maxDimension: context.maxImageDimension)
        await populateImage(prep: prep, result: result, sourceImage: image)
    }

    private func populateImage(prep: PreparingAttachment,
                               result: CompressedImageResult,
                               sourceImage: UIImage) async {
        let fileName = "image_\(prep.id).\(result.fileExtension)"
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        do {
            try result.data.write(to: tempURL)
        } catch {
            log.error("image write failed: \(error.localizedDescription)")
            prep.fail("Échec d'écriture de l'image")
            return
        }

        prep.stage = .hashing
        let thumbHash = sourceImage.toThumbHash()

        let attachment = MessageAttachment(
            id: prep.id,
            fileName: fileName,
            originalName: fileName,
            mimeType: result.mimeType,
            fileSize: result.data.count,
            fileUrl: tempURL.absoluteString,
            width: Int(sourceImage.size.width),
            height: Int(sourceImage.size.height),
            thumbHash: thumbHash,
            thumbnailColor: prep.accentColor
        )

        prep.finish(PreparedAttachment(
            attachment: attachment,
            fileURL: tempURL,
            thumbHash: thumbHash,
            thumbnailData: result.data
        ))
    }

    // MARK: - Private: Video pipeline

    private func runVideoPreparation(prep: PreparingAttachment,
                                     sourceURL: URL,
                                     deleteSource: Bool,
                                     context: MediaContext) async {
        let compressedURL: URL
        do {
            compressedURL = try await MediaCompressor.shared.compressVideo(sourceURL, context: context)
            if deleteSource, compressedURL != sourceURL {
                try? FileManager.default.removeItem(at: sourceURL)
            }
        } catch {
            log.error("video compression failed: \(error.localizedDescription) — falling back to source")
            compressedURL = sourceURL
        }

        prep.stage = .thumbnailing
        let thumb = await Self.generateVideoThumbnail(url: compressedURL)
        if let thumb { prep.thumbnail = thumb }

        prep.stage = .hashing
        let thumbHash = thumb?.toThumbHash()
        let thumbnailData = thumb?.jpegData(compressionQuality: 0.8)

        let fileSize = Self.fileSize(at: compressedURL)
        let attachment = MessageAttachment(
            id: prep.id,
            fileName: compressedURL.lastPathComponent,
            originalName: compressedURL.lastPathComponent,
            mimeType: "video/mp4",
            fileSize: fileSize,
            fileUrl: compressedURL.absoluteString,
            thumbHash: thumbHash,
            thumbnailColor: prep.accentColor
        )

        prep.finish(PreparedAttachment(
            attachment: attachment,
            fileURL: compressedURL,
            thumbHash: thumbHash,
            thumbnailData: thumbnailData
        ))
    }

    // MARK: - Private: PhotosPicker loaders

    private func loadPickerImage(item: PhotosPickerItem,
                                 prep: PreparingAttachment,
                                 context: MediaContext) async {
        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let fullImage = UIImage(data: data) else {
                prep.fail("Image illisible")
                return
            }
            // Pose immédiatement un aperçu léger (downsampling ImageIO, faible
            // empreinte mémoire) pour que l'image sélectionnée apparaisse
            // « directement » dans la zone d'attachement. La décompression
            // pleine résolution + le ThumbHash restent réservés au pipeline de
            // traitement en arrière-plan ci-dessous.
            prep.thumbnail = Self.downsampledPreview(from: data) ?? fullImage
            prep.stage = .compressing
            await runImageDataPreparation(prep: prep, data: data, image: fullImage, context: context)
        } catch {
            log.error("picker image load failed: \(error.localizedDescription)")
            prep.fail("Échec du chargement de l'image")
        }
    }

    private func loadPickerVideo(item: PhotosPickerItem,
                                 prep: PreparingAttachment,
                                 context: MediaContext) async {
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                prep.fail("Vidéo illisible")
                return
            }
            let rawURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("video_raw_\(prep.id).mp4")
            try data.write(to: rawURL)
            prep.stage = .compressing
            await runVideoPreparation(prep: prep,
                                      sourceURL: rawURL,
                                      deleteSource: true,
                                      context: context)
        } catch {
            log.error("picker video load failed: \(error.localizedDescription)")
            prep.fail("Échec du chargement de la vidéo")
        }
    }

    // MARK: - Helpers

    /// Extract a frame at t=0 from a video file. Mirrors the historical 200x200
    /// budget used by the message and feed composers so the tray thumbnail
    /// keeps the same on-disk footprint after the unification.
    static func generateVideoThumbnail(url: URL) async -> UIImage? {
        // Modern async AVFoundation API (iOS 16+): `image(at:)` decodes the frame
        // on AVFoundation's own queue, so it neither blocks the caller nor needs a
        // manually-detached thread, and replaces the deprecated synchronous
        // `copyCGImage` and `AVAsset(url:)`.
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 200, height: 200)
        do {
            let cgImage = try await generator.image(at: .zero).image
            return UIImage(cgImage: cgImage)
        } catch {
            return nil
        }
    }

    private static func fileSize(at url: URL) -> Int {
        (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
    }

    /// Decode a downsampled, transform-corrected preview straight from encoded
    /// bytes via ImageIO. 2-4× faster and far lighter than holding a full-res
    /// `UIImage` just to fill a ~56pt tray tile (cf. SOTA image audit). Used to
    /// surface the picked photo in the attachment zone the instant its bytes
    /// land, before the heavier compression pipeline runs. Returns `nil` when
    /// the bytes can't be decoded, so the caller falls back to the full image.
    static func downsampledPreview(from data: Data, maxPixelSize: CGFloat = 1024) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: false
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }
}
