import CoreGraphics
import Foundation
import MeeshySDK
import MeeshyUI
import UIKit
import Vision

/// Une personne de l'appel pour la capture. #8743 — son @pseudo quand il est connu, et
/// `isSelf` pour moi : un cadre les écrit (`CallCaptureIdentity` les remplit).
nonisolated struct CallCaptureSubject: Equatable, Sendable {
    let id: String
    let name: String
    let handle: String?
    let isSelf: Bool
    let isMirrored: Bool
    let showsVideo: Bool

    init(id: String, name: String, handle: String? = nil, isSelf: Bool = false, isMirrored: Bool, showsVideo: Bool) {
        self.id = id
        self.name = name
        self.handle = handle
        self.isSelf = isSelf
        self.isMirrored = isMirrored
        self.showsVideo = showsVideo
    }
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

nonisolated struct CallCaptureFrame: @unchecked Sendable {
    let image: CGImage
}

protocol CallFaceLocating: AnyObject, Sendable {
    nonisolated func faceRect(in image: CGImage) -> CGRect?
}

@MainActor
final class PhotoLibraryCaptureSaver: CallCapturePhotoSaving {
    static let shared = PhotoLibraryCaptureSaver()

    private let photoProcessor: any PhotoCaptureProcessorProviding

    nonisolated deinit {}

    init(photoProcessor: any PhotoCaptureProcessorProviding = PhotoCaptureProcessor.shared) {
        self.photoProcessor = photoProcessor
    }

    func requestAccess() async -> Bool {
        await PhotoLibraryManager.shared.requestAuthorization()
    }

    /// #8695 — une capture d'appel est une prise photo : le même traitement,
    /// hors du thread principal, puis les octets encodés tels quels.
    func save(_ image: CGImage) async -> Bool {
        let processor = photoProcessor
        let frame = CallCaptureFrame(image: image)
        let processed = await Task.detached(priority: .userInitiated) {
            processor.process(image: frame.image, settings: .callCapture)
        }.value
        guard let processed else { return await PhotoLibraryManager.shared.saveImage(UIImage(cgImage: image)) }
        let name = "Meeshy-\(UUID().uuidString).\(processed.format.fileExtension)"
        return await PhotoLibraryManager.shared.saveImageFile(processed.data, fileName: name)
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
    /// #8742 — le cadre choisi ; `nil` : le montage classique `style`.
    @Published private(set) var frameId: String?
    @Published private(set) var thumbnails: [CallMontageStyle: CGImage] = [:]
    /// #8743 — avance quand des vignettes de cadres entrent dans leur cache borné.
    @Published private(set) var frameThumbnailRevision = 0
    let previewFeed = CallCapturePreviewFeed()
    @Published private(set) var status: CallCaptureStatus = .idle
    @Published private(set) var flashCount = 0
    /// #8625 — l'instant où l'appui long a lancé le film ; `nil` hors film.
    @Published private(set) var recordingStartedAt: Date?
    private(set) var subjects: [CallCaptureSubject] = []
    /// #8743 — le nom du groupe, la date, l'accent : ce qu'un cadre écrit hors des visages.
    private(set) var frameTexts: CallFrameTexts
    let frameThumbnails: any CallFrameThumbnailCacheProviding
    /// Le dernier choix fait dans chaque ambiance, pour y revenir d'un toucher de puce.
    private var rememberedChoices: [CallMontageMoodChip: CallMontageChoice] = [:]

    nonisolated static let previewIntervalNanoseconds: UInt64 = 200_000_000
    nonisolated static let thumbnailEveryPreviews = 5
    /// #8736 — seules les vignettes autour du style choisi se refont : le
    /// coût ne grandit plus avec le catalogue.
    nonisolated static let thumbnailRadius = 3
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
    private var selectionRefresh: Task<Void, Never>?

    // Sous SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor, la deinit synthétisée
    // est isolée et double-libère sur iOS 26.1 (abrt au démontage).
    nonisolated deinit {}

    init(
        grabber: any CallFrameGrabbing = CallFrameGrabber(),
        saver: any CallCapturePhotoSaving = PhotoLibraryCaptureSaver.shared,
        faceLocator: any CallFaceLocating = VisionFaceLocator.shared,
        recorder: any CallMontageRecordingProviding = CallMontageRecorder(),
        frameThumbnails: any CallFrameThumbnailCacheProviding = CallFrameThumbnailCache(),
        now: @escaping () -> Date = Date.init
    ) {
        self.grabber = grabber
        self.saver = saver
        self.faceLocator = faceLocator
        self.recorder = recorder
        self.frameThumbnails = frameThumbnails
        self.now = now
        self.frameTexts = CallFrameTexts(groupName: nil, isGroup: false, date: CallFrameTextsRule.dateText(now()), accentHex: nil)
    }

    var isRunning: Bool { previewTask != nil }

    var isRecording: Bool { recordingStartedAt != nil }

    var preview: CGImage? { previewFeed.image }

    /// Ce que le carrousel montre comme choisi : le cadre s'il y en a un, sinon le classique.
    var choice: CallMontageChoice {
        frameId.map { CallMontageChoice.frame($0) } ?? .classic(style)
    }

    var caption: CallMontageCaption {
        CallMontageCaption(title: Self.brand, subtitle: now().formatted(date: .abbreviated, time: .shortened))
    }

    func start(subjects: [CallCaptureSubject], tracks: [String: Any]) {
        update(subjects: subjects, tracks: tracks)
        reconcileFrame()
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
        selectionRefresh?.cancel()
        selectionRefresh = nil
        grabber.detachAll()
        thumbnails = [:]
        frameThumbnails.removeAll()
        CallFrameRenderer.purgeLayers()
        previewFeed.image = nil
        previewsSinceThumbnails = 0
    }

    /// #8736 — le style choisi se rend tout de suite, avec les vignettes de
    /// son voisinage, sans attendre le prochain tour de l'aperçu.
    func select(_ newStyle: CallMontageStyle) {
        select(choice: .classic(newStyle))
    }

    /// #8742 — un classique ou un cadre : même réponse immédiate, même rendu du voisinage.
    func select(choice newChoice: CallMontageChoice) {
        guard newChoice != choice else { return }
        rememberedChoices[CallMontageFrameRule.chip(of: newChoice)] = newChoice
        switch newChoice {
        case .classic(let newStyle):
            style = newStyle
            frameId = nil
        case .frame(let id):
            frameId = id
        }
        previewFeed.image = placeholder(for: newChoice) ?? previewFeed.image
        previewsSinceThumbnails = Self.thumbnailEveryPreviews
        refreshSoon()
    }

    /// #8742 — toucher une puce : le carrousel change dans la même image, et son choix se
    /// rend tout de suite — le dernier fait dans cette ambiance, sinon son premier élément.
    func show(_ chip: CallMontageMoodChip, people: Int) {
        select(choice: CallMontageFrameRule.entering(chip, people: people, remembered: rememberedChoices[chip]))
    }

    /// `n` a changé pendant le mode : le cadre passe à la variante du même motif, sinon au
    /// premier cadre de l'ambiance, sinon au premier classique.
    func reconcileFrame() {
        let reconciled = CallMontageFrameRule.reconcile(choice, people: subjects.count)
        guard reconciled != choice else { return }
        select(choice: reconciled)
    }

    /// #8743 — le nom du groupe ou l'accent arrivent du cache : le cadre choisi se refait.
    func setFrameTexts(_ texts: CallFrameTexts) {
        guard texts != frameTexts else { return }
        frameTexts = texts
        guard frameId != nil else { return }
        previewsSinceThumbnails = Self.thumbnailEveryPreviews
        refreshSoon()
    }

    private func refreshSoon() {
        guard isRunning, !isRecording else { return }
        selectionRefresh?.cancel()
        selectionRefresh = Task { [weak self] in
            await self?.refreshPreviews()
        }
    }

    private func keepFrameThumbnails(_ rendered: [String: CGImage], people: Int) {
        guard !rendered.isEmpty else { return }
        rendered.forEach { frameThumbnails.store($0.value, frameId: $0.key, people: people, size: Self.thumbnailCanvas) }
        frameThumbnailRevision &+= 1
    }

    func refreshPreviews() async {
        guard !isRecording else { return }
        let snapshot = await grabber.snapshot(maxDimension: Self.previewMaxDimension)
        let faces = portraitSet(from: snapshot)
        let selected = choice
        let look = captureLook(for: selected)
        let caption = caption
        let texts = frameTexts
        let includesThumbnails = Self.rendersThumbnails(hasThumbnails: hasThumbnails(for: selected), previewsSinceThumbnails: previewsSinceThumbnails)
        previewsSinceThumbnails = includesThumbnails ? 1 : previewsSinceThumbnails + 1
        let request = CallCaptureLiveRequest(
            look: look,
            classics: includesThumbnails ? classicWindow(for: selected) : [],
            frames: includesThumbnails ? frameWindow(for: selected) : []
        )
        let rendered = await Task.detached(priority: .userInitiated) {
            Self.renderLive(request, faces: faces, caption: caption, texts: texts)
        }.value
        guard !Task.isCancelled, !isRecording else { return }
        if !rendered.thumbnails.isEmpty { thumbnails.merge(rendered.thumbnails) { _, fresh in fresh } }
        keepFrameThumbnails(rendered.frameThumbnails, people: faces.frame.count)
        guard selected == choice else { return }
        previewFeed.image = rendered.preview
    }

    nonisolated static func rendersThumbnails(hasThumbnails: Bool, previewsSinceThumbnails: Int) -> Bool {
        !hasThumbnails || previewsSinceThumbnails >= thumbnailEveryPreviews
    }

    /// Les styles dont la vignette se refait : `radius` de part et d'autre du
    /// style choisi, jamais plus de `2 × radius + 1`, quel que soit le
    /// catalogue.
    nonisolated static func thumbnailWindow(selected: CallMontageStyle, in styles: [CallMontageStyle], radius: Int) -> [CallMontageStyle] {
        thumbnailWindow(around: selected, in: styles, radius: radius)
    }

    /// #8743 — la même fenêtre pour tout carrousel : les cadres d'une ambiance comme les classiques.
    nonisolated static func thumbnailWindow<Item: Equatable>(around selected: Item, in items: [Item], radius: Int) -> [Item] {
        guard !items.isEmpty else { return [] }
        let reach = max(radius, 0)
        let centre = items.firstIndex(of: selected) ?? 0
        let lower = max(centre - reach, 0)
        let upper = min(centre + reach, items.count - 1)
        return Array(items[lower ... upper])
    }

    /// `style` impose un rendu (le mode Effets capture mon image seule) ;
    /// sinon, le style choisi dans le carrousel.
    func capture(style fixed: CallMontageStyle? = nil) async {
        guard status != .working else { return }
        begin()
        guard await saver.requestAccess() else { return finish(.denied) }
        let snapshot = await grabber.snapshot(maxDimension: nil)
        guard !snapshot.images.isEmpty else { return finish(.noVideo) }
        let faces = portraitSet(from: snapshot)
        let look = fixed.map { CallCaptureLook.classic($0) } ?? captureLook(for: choice)
        let caption = caption
        let texts = frameTexts
        let rendered = await Task.detached(priority: .userInitiated) {
            CallCaptureImages(images: [
                Self.render(look, faces: faces, caption: caption, texts: texts, size: CallMontageLayout.captureSize)
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
        let faces = portraitSet(from: snapshot)
        let look = fixed.map { CallCaptureLook.classic($0) } ?? captureLook(for: choice)
        let caption = caption
        let texts = frameTexts
        let rendered = await Task.detached(priority: .userInitiated) {
            CallCaptureImages(images: [
                Self.render(look, faces: faces, caption: caption, texts: texts, size: Self.recordingCanvas)
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
        let styles = includesThumbnails ? thumbnailWindow(selected: selected, in: CallMontageStyle.allCases, radius: thumbnailRadius) : []
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
