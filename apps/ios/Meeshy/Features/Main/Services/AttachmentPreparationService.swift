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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = AttachmentPreparationService()
    private let log = MeeshyLog.logger(.attachmentPrep)

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

    // MARK: Image bytes (original file data — recent-media grid, #9683)

    /// Une photo de la photothèque remise en OCTETS d'origine : même chemin
    /// que le sélecteur système, sans `UIImage` 2048 décodée en amont.
    func prepareImageData(_ data: Data,
                          context: MediaContext = .message,
                          accentColor: String = MeeshyColors.brandPrimaryHex) -> PreparingAttachment {
        let prep = PreparingAttachment(kind: .image, accentColor: accentColor)
        prep.stage = .loading
        Task { [weak self] in
            await self?.runPickedImageData(data, prep: prep, context: context)
        }
        return prep
    }

    /// **Une prise du viseur part par ses OCTETS** (#9885, #11847) : ceux que
    /// `PhotoCaptureProcessor` a écrits une fois, carte de gain HDR comprise.
    /// L'image ne sert que si la prise n'en a pas (rendu peint par le composer).
    func prepareCapture(_ image: UIImage, data: Data?,
                        context: MediaContext,
                        accentColor: String) -> PreparingAttachment {
        guard let data else { return prepareImage(image, context: context, accentColor: accentColor) }
        return prepareImageData(data, context: context, accentColor: accentColor)
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

    /// Une image RENDUE (retouche, scène) n'a pas d'octets d'origine : elle
    /// s'encode une fois, au budget que la préférence de compression autorise.
    private func runImagePreparation(prep: PreparingAttachment,
                                     image: UIImage,
                                     context: MediaContext) async {
        let policy = context.storedOutgoingImagePolicy()
        let result = await MediaCompressor.shared.compressImage(image, maxDimension: policy.pixelBudget,
                                                                quality: policy.quality)
        await populateImage(prep: prep, result: result, preview: image)
    }

    private func populateImage(prep: PreparingAttachment,
                               result: CompressedImageResult,
                               preview: UIImage) async {
        let fileName = "image_\(prep.id).\(result.fileExtension)"
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)

        prep.stage = .hashing
        // Écriture + ThumbHash hors MainActor : une sélection multi-photos
        // empile plusieurs `populateImage` en vol, et ces deux étapes n'ont
        // besoin d'aucune isolation — seul le retour à `prep.finish`/`prep.fail`
        // doit se faire sur MainActor. Le ThumbHash se calcule sur l'APERÇU
        // (1 024 px), jamais sur la pleine définition (#9885). `imageBox` suit
        // la discipline de `StickerSendPipeline.SendableStickerImage` : l'image
        // n'est que LUE (encodage du hash), jamais mutée.
        let data = result.data
        let imageBox = SendableAttachmentImage(image: preview)
        let thumbHash: String?
        do {
            thumbHash = try await Task.detached(priority: .userInitiated) {
                try data.write(to: tempURL)
                return imageBox.image.toThumbHash()
            }.value
        } catch {
            log.error("image write failed: \(error.localizedDescription)")
            prep.fail("Échec d'écriture de l'image")
            return
        }

        let attachment = MessageAttachment(
            id: prep.id,
            fileName: fileName,
            originalName: fileName,
            mimeType: result.mimeType,
            fileSize: result.data.count,
            fileUrl: tempURL.absoluteString,
            width: result.pixelSize.map { Int($0.width) },
            height: result.pixelSize.map { Int($0.height) },
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
            compressedURL = try await MediaCompressor.shared.compressVideo(sourceURL, context: context,
                                                                           budget: context.storedVideoSendBudget())
            if deleteSource, compressedURL != sourceURL {
                FileManager.default.removeItemLogging(at: sourceURL, context: "post-compression source cleanup", logger: log)
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
        let durationMs = await Self.videoDurationMs(url: compressedURL)

        let fileSize = Self.fileSize(at: compressedURL)
        let attachment = MessageAttachment(
            id: prep.id,
            fileName: compressedURL.lastPathComponent,
            originalName: compressedURL.lastPathComponent,
            mimeType: "video/mp4",
            fileSize: fileSize,
            fileUrl: compressedURL.absoluteString,
            thumbHash: thumbHash,
            duration: durationMs,
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
            guard let data = try await PickedMedia.loadImageData(item) else {
                prep.fail("Image illisible")
                return
            }
            await runPickedImageData(data, prep: prep, context: context)
        } catch {
            log.error("picker image load failed: \(error.localizedDescription)")
            prep.fail("Échec du chargement de l'image")
        }
    }

    /// Les OCTETS d'une photo — sélecteur, grille des récents, prise de
    /// l'objectif, fichier déposé : jamais décodés sur le fil principal (#9885).
    /// L'aperçu 1 024 px s'affiche dès qu'il est prêt et sert au ThumbHash ; le
    /// fichier qui part est celui de `compressImageData` — les octets d'origine
    /// tant qu'ils tiennent dans le budget.
    private func runPickedImageData(_ data: Data,
                                    prep: PreparingAttachment,
                                    context: MediaContext) async {
        let policy = context.storedOutgoingImagePolicy()
        let preview = await Task.detached(priority: .userInitiated) {
            Self.downsampledPreview(from: data).map(SendableAttachmentImage.init(image:))
        }.value
        guard let preview else {
            prep.fail("Image illisible")
            return
        }
        prep.thumbnail = preview.image
        prep.stage = .compressing
        guard let result = await MediaCompressor.shared.compressImageData(data, policy: policy) else {
            log.error("image preparation refused: location could not be removed")
            prep.fail("Image illisible")
            return
        }
        await populateImage(prep: prep, result: result, preview: preview.image)
    }

    private func loadPickerVideo(item: PhotosPickerItem,
                                 prep: PreparingAttachment,
                                 context: MediaContext) async {
        do {
            // Un FICHIER, jamais `Data` : le film ne traverse pas la mémoire (#9870).
            guard let rawURL = try await PickedMedia.loadVideoFile(item) else {
                prep.fail("Vidéo illisible")
                return
            }
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
        await VideoThumbnailGenerator.shared.image(for: .firstFrame(of: url, maxDimension: 200))
    }

    /// Feeds `ReelComposition`'s 3-second qualification floor (règle produit
    /// durée minimale) — a video attachment carried no duration before this,
    /// so a short clip could never be told apart from a long one at the
    /// composer level. `nil` on read failure (non-blocking, same posture as
    /// `generateVideoThumbnail` above): the gateway's own ffprobe-derived
    /// `PostMedia.duration` remains the authoritative check either way.
    static func videoDurationMs(url: URL) async -> Int? {
        let asset = AVURLAsset(url: url)
        do {
            let duration = try await asset.load(.duration)
            guard duration.isValid, !duration.isIndefinite else { return nil }
            return Int(CMTimeGetSeconds(duration) * 1000)
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
    /// the bytes can't be decoded: the caller then refuses the image.
    nonisolated static func downsampledPreview(from data: Data, maxPixelSize: CGFloat = 1024) -> UIImage? {
        ImageDownsampler.thumbnail(data: data, maxPixelSize: maxPixelSize, decodeImmediately: false)
            .map { UIImage(cgImage: $0) }
    }
}

// MARK: - Sendable image box (Task.detached crossing)

/// Traversée d'une `UIImage` vers une tâche détachée — même discipline que
/// `StickerSendPipeline.SendableStickerImage` : l'image n'est que LUE
/// (encodage ThumbHash des pixels), jamais mutée, donc la faire voyager est
/// sûr. Redite plutôt qu'exportée : une boîte partagée inviterait à faire
/// voyager n'importe quelle image, y compris une image qu'on mute.
private nonisolated struct SendableAttachmentImage: @unchecked Sendable {
    let image: UIImage
}
