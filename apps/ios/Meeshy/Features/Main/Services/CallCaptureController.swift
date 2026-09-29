import CoreGraphics
import Foundation
import MeeshySDK
import MeeshyUI
import UIKit
import Vision

nonisolated struct CallCaptureSubject: Equatable, Sendable {
    let id: String
    let name: String
    let isMirrored: Bool
    let showsVideo: Bool
}

enum CallCaptureStatus: Equatable, Sendable {
    case idle
    case working
    case saved
    case facesSaved(Int)
    case videoSaved
    case denied
    case noVideo
    case failed
}

nonisolated struct CallCaptureImages: @unchecked Sendable {
    let images: [CGImage]
}

nonisolated struct CallMontagePreviews: @unchecked Sendable {
    let thumbnails: [CallMontageStyle: CGImage]
    let preview: CGImage?
}

@MainActor
protocol CallCapturePhotoSaving: AnyObject {
    func requestAccess() async -> Bool
    func save(_ image: CGImage) async -> Bool
    func saveVideo(at url: URL) async -> Bool
}

protocol CallFaceLocating: AnyObject, Sendable {
    nonisolated func faceRect(in image: CGImage) -> CGRect?
}

@MainActor
final class PhotoLibraryCaptureSaver: CallCapturePhotoSaving {
    static let shared = PhotoLibraryCaptureSaver()

    nonisolated deinit {}

    func requestAccess() async -> Bool {
        await PhotoLibraryManager.shared.requestAuthorization()
    }

    func save(_ image: CGImage) async -> Bool {
        await PhotoLibraryManager.shared.saveImage(UIImage(cgImage: image))
    }

    func saveVideo(at url: URL) async -> Bool {
        await PhotoLibraryManager.shared.saveVideo(at: url)
    }
}

nonisolated final class VisionFaceLocator: CallFaceLocating, @unchecked Sendable {
    static let shared = VisionFaceLocator()

    func faceRect(in image: CGImage) -> CGRect? {
        let request = VNDetectFaceRectanglesRequest()
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        guard (try? handler.perform([request])) != nil else { return nil }
        return request.results?
            .max { $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height }?
            .boundingBox
    }
}

/// L'aperçu du montage change à chaque trame (5 i/s, 15 pendant le film) : il
/// se publie à part, pour que seule la scène qui l'affiche se redessine —
/// jamais l'écran d'appel qui tient le contrôleur (#8625).
@MainActor
final class CallCapturePreviewFeed: ObservableObject {
    @Published fileprivate(set) var image: CGImage?

    nonisolated deinit {}
}

/// Le propriétaire de la capture pour l'écran d'appel : il ne publie RIEN, donc
/// l'écran d'appel ne se redessine jamais au rythme de la capture.
@MainActor
final class CallCaptureHost: ObservableObject {
    let controller: CallCaptureController

    init(controller: CallCaptureController = CallCaptureController()) {
        self.controller = controller
    }

    nonisolated deinit {}
}

@MainActor
final class CallCaptureController: ObservableObject {
    @Published private(set) var style: CallMontageStyle = .screen
    @Published private(set) var thumbnails: [CallMontageStyle: CGImage] = [:]
    let previewFeed = CallCapturePreviewFeed()
    @Published private(set) var status: CallCaptureStatus = .idle
    @Published private(set) var flashCount = 0
    /// #8625 — l'instant où l'appui long a lancé le film ; `nil` hors film.
    @Published private(set) var recordingStartedAt: Date?
    private(set) var subjects: [CallCaptureSubject] = []

    nonisolated static let previewIntervalNanoseconds: UInt64 = 200_000_000
    nonisolated static let thumbnailEveryPreviews = 5
    nonisolated static let statusDisplayNanoseconds: UInt64 = 2_500_000_000
    nonisolated static let previewMaxDimension: CGFloat = 640
    nonisolated static let thumbnailCanvas = CGSize(width: 108, height: 192)
    nonisolated static let previewCanvas = CGSize(width: 540, height: 960)
    nonisolated static let brand = "Meeshy"
    nonisolated static let recordingCanvas = CGSize(width: 720, height: 1280)
    nonisolated static let recordingFrameIntervalNanoseconds: UInt64 = 66_666_666

    private let grabber: any CallFrameGrabbing
    private let saver: any CallCapturePhotoSaving
    private let faceLocator: any CallFaceLocating
    private let recorder: any CallMontageRecordingProviding
    private let now: () -> Date
    private var previewTask: Task<Void, Never>?
    private var recordingTask: Task<Void, Never>?
    private var statusTask: Task<Void, Never>?
    private var previewsSinceThumbnails = 0

    // Sous SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor, la deinit synthétisée
    // est isolée et double-libère sur iOS 26.1 (abrt au démontage).
    nonisolated deinit {}

    init(
        grabber: any CallFrameGrabbing = CallFrameGrabber(),
        saver: any CallCapturePhotoSaving = PhotoLibraryCaptureSaver.shared,
        faceLocator: any CallFaceLocating = VisionFaceLocator.shared,
        recorder: any CallMontageRecordingProviding = CallMontageRecorder(),
        now: @escaping () -> Date = Date.init
    ) {
        self.grabber = grabber
        self.saver = saver
        self.faceLocator = faceLocator
        self.recorder = recorder
        self.now = now
    }

    var isRunning: Bool { previewTask != nil }

    var isRecording: Bool { recordingStartedAt != nil }

    var preview: CGImage? { previewFeed.image }

    var caption: CallMontageCaption {
        CallMontageCaption(title: Self.brand, subtitle: now().formatted(date: .abbreviated, time: .shortened))
    }

    func start(subjects: [CallCaptureSubject], tracks: [String: Any]) {
        update(subjects: subjects, tracks: tracks)
        guard previewTask == nil else { return }
        previewTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let controller = self else { return }
                await controller.refreshPreviews()
                try? await Task.sleep(nanoseconds: Self.previewIntervalNanoseconds)
            }
        }
    }

    func update(subjects: [CallCaptureSubject], tracks: [String: Any]) {
        self.subjects = subjects
        grabber.keepOnly(Set(subjects.map(\.id)))
        subjects.forEach { subject in
            grabber.attach(track: tracks[subject.id], id: subject.id, isMirrored: subject.isMirrored)
        }
    }

    func stop() {
        if isRecording { Task { await stopRecording() } }
        previewTask?.cancel()
        previewTask = nil
        grabber.detachAll()
        thumbnails = [:]
        previewFeed.image = nil
        previewsSinceThumbnails = 0
    }

    func select(_ newStyle: CallMontageStyle) {
        guard newStyle != style else { return }
        style = newStyle
        previewFeed.image = thumbnails[newStyle]
    }

    func refreshPreviews() async {
        guard !isRecording else { return }
        let snapshot = await grabber.snapshot(maxDimension: Self.previewMaxDimension)
        let portraits = portraits(from: snapshot)
        let selected = style
        let caption = caption
        let includesThumbnails = Self.rendersThumbnails(hasThumbnails: !thumbnails.isEmpty, previewsSinceThumbnails: previewsSinceThumbnails)
        previewsSinceThumbnails = includesThumbnails ? 1 : previewsSinceThumbnails + 1
        let rendered = await Task.detached(priority: .userInitiated) {
            Self.renderPreviews(portraits: portraits, selected: selected, caption: caption, includesThumbnails: includesThumbnails)
        }.value
        guard !Task.isCancelled else { return }
        if includesThumbnails { thumbnails = rendered.thumbnails }
        previewFeed.image = rendered.preview
    }

    nonisolated static func rendersThumbnails(hasThumbnails: Bool, previewsSinceThumbnails: Int) -> Bool {
        !hasThumbnails || previewsSinceThumbnails >= thumbnailEveryPreviews
    }

    /// `style` impose un rendu (le mode Effets capture mon image seule) ;
    /// sinon, le style choisi dans le carrousel.
    func capture(style fixed: CallMontageStyle? = nil) async {
        guard status != .working else { return }
        begin()
        guard await saver.requestAccess() else { return finish(.denied) }
        let snapshot = await grabber.snapshot(maxDimension: nil)
        guard !snapshot.images.isEmpty else { return finish(.noVideo) }
        let portraits = portraits(from: snapshot)
        let selected = fixed ?? style
        let caption = caption
        let rendered = await Task.detached(priority: .userInitiated) {
            CallCaptureImages(images: [
                CallMontageRenderer.render(style: selected, portraits: portraits, canvas: CallMontageLayout.captureSize, caption: caption)
            ].compactMap { $0 })
        }.value
        guard let image = rendered.images.first else { return finish(.failed) }
        finish(await saver.save(image) ? .saved : .failed)
    }

    // MARK: - Filmer (#8625)

    func startRecording(style fixed: CallMontageStyle? = nil) async {
        guard !isRecording, status != .working else { return }
        guard await saver.requestAccess() else { return finish(.denied) }
        guard !isRecording else { return }
        do {
            try recorder.start(canvas: Self.recordingCanvas)
        } catch {
            return finish(.failed)
        }
        statusTask?.cancel()
        status = .idle
        recordingStartedAt = now()
        HapticFeedback.medium()
        recordingTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let controller = self else { return }
                await controller.recordFrame(style: fixed)
                try? await Task.sleep(nanoseconds: Self.recordingFrameIntervalNanoseconds)
            }
        }
    }

    func recordFrame(style fixed: CallMontageStyle?) async {
        guard isRecording else { return }
        let snapshot = await grabber.snapshot(maxDimension: Self.previewMaxDimension)
        let portraits = portraits(from: snapshot)
        let selected = fixed ?? style
        let caption = caption
        let rendered = await Task.detached(priority: .userInitiated) {
            CallCaptureImages(images: [
                CallMontageRenderer.render(style: selected, portraits: portraits, canvas: Self.recordingCanvas, caption: caption)
            ].compactMap { $0 })
        }.value
        guard isRecording, let frame = rendered.images.first else { return }
        recorder.append(frame)
        if fixed == nil { previewFeed.image = frame }
    }

    func stopRecording() async {
        guard isRecording else { return }
        recordingTask?.cancel()
        recordingTask = nil
        recordingStartedAt = nil
        statusTask?.cancel()
        status = .working
        HapticFeedback.medium()
        guard let url = await recorder.finish() else { return finish(.failed) }
        let saved = await saver.saveVideo(at: url)
        try? FileManager.default.removeItem(at: url)
        finish(saved ? .videoSaved : .failed)
    }

    func captureFaces() async {
        guard status != .working else { return }
        begin()
        guard await saver.requestAccess() else { return finish(.denied) }
        let snapshot = await grabber.snapshot(maxDimension: nil)
        let sources = CallCaptureImages(images: subjects.filter(\.showsVideo).compactMap { snapshot.images[$0.id] })
        guard !sources.images.isEmpty else { return finish(.noVideo) }
        let locator = faceLocator
        let faces = await Task.detached(priority: .userInitiated) {
            CallCaptureImages(images: sources.images.compactMap { source in
                CallMontageRenderer.faceSquare(from: source, face: locator.faceRect(in: source), side: CallMontageLayout.faceSide)
            })
        }.value
        var saved = 0
        for face in faces.images {
            if await saver.save(face) { saved += 1 }
        }
        finish(saved > 0 ? .facesSaved(saved) : .failed)
    }

    func portraits(from snapshot: CallFrameSnapshot) -> [CallMontagePortrait] {
        subjects.map { subject in
            CallMontagePortrait(id: subject.id, name: subject.name, image: subject.showsVideo ? snapshot.images[subject.id] : nil)
        }
    }

    nonisolated static func renderPreviews(portraits: [CallMontagePortrait], selected: CallMontageStyle, caption: CallMontageCaption, includesThumbnails: Bool = true) -> CallMontagePreviews {
        guard !portraits.isEmpty else { return CallMontagePreviews(thumbnails: [:], preview: nil) }
        let styles = includesThumbnails ? CallMontageStyle.allCases : []
        let thumbnails = styles.reduce(into: [CallMontageStyle: CGImage]()) { result, style in
            result[style] = CallMontageRenderer.render(style: style, portraits: portraits, canvas: thumbnailCanvas, caption: caption)
        }
        let preview = CallMontageRenderer.render(style: selected, portraits: portraits, canvas: previewCanvas, caption: caption)
        return CallMontagePreviews(thumbnails: thumbnails, preview: preview)
    }

    private func begin() {
        statusTask?.cancel()
        status = .working
        flashCount += 1
        HapticFeedback.medium()
    }

    private func finish(_ outcome: CallCaptureStatus) {
        status = outcome
        if case .saved = outcome { HapticFeedback.success() }
        if case .facesSaved = outcome { HapticFeedback.success() }
        if case .videoSaved = outcome { HapticFeedback.success() }
        statusTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: Self.statusDisplayNanoseconds)
            guard !Task.isCancelled else { return }
            self?.status = .idle
        }
    }
}
