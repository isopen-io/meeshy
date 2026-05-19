import SwiftUI
import UIKit

// MARK: - Image Editor View Model

/// Owns the editor's mutable state, undo/redo history and the (debounced)
/// render loop. Strictly separated from the renderer (`ImageFilterEngine`,
/// stateless) and the view (`MeeshyImageEditorView`, presentation only).
///
/// Memory model: the full-resolution `original` is kept once and never copied
/// or mutated. A downscaled `working` copy backs every live preview so editing
/// a 48-megapixel import is as smooth as a 2-megapixel one. The full original
/// is rendered exactly once, on `export()`.
@MainActor
public final class ImageEditorViewModel: ObservableObject {

    /// Longest side, in pixels, of the working copy used for live preview.
    private static let workingMaxPixel: CGFloat = 2400

    /// Untouched, full-resolution source. Never mutated.
    public let original: UIImage

    /// Downscaled copy that backs the live render loop.
    public let working: UIImage

    /// Where the edited media is headed — drives the default crop ratio and
    /// the context badge.
    public let context: MediaPreviewContext

    private let engine: ImageFilterEngine

    @Published public private(set) var state: ImageEditState
    @Published public private(set) var previewImage: UIImage
    @Published public private(set) var canUndo = false
    @Published public private(set) var canRedo = false
    /// Bumped on every history mutation so views observing the scrubber refresh.
    @Published public private(set) var historyRevision = 0
    @Published public var mode: ImageEditorMode
    @Published public private(set) var filterThumbnails: [ImageFilter: UIImage] = [:]

    private var history: ImageEditHistory
    private var renderTask: Task<Void, Never>?

    public init(image: UIImage, context: MediaPreviewContext) {
        let engine = ImageFilterEngine()
        let working = engine.downscaled(image, maxPixel: Self.workingMaxPixel) ?? image
        self.engine = engine
        self.original = image
        self.context = context
        self.working = working
        self.state = .identity
        self.previewImage = working
        self.history = ImageEditHistory(initial: .identity)
        self.mode = Self.loadMode()
    }

    // MARK: - Derived state

    public var hasEdits: Bool { state.hasEdits }
    public var historySteps: [ImageEditHistoryStep] { history.steps }
    public var currentHistoryStepID: UUID { history.currentStepID }

    // MARK: - Editing

    /// Applies `mutation` to the live state and schedules a preview re-render.
    /// Does **not** record history — pair with `commit` once a gesture settles
    /// so a continuous slider drag collapses into a single undo step.
    public func update(_ mutation: (inout ImageEditState) -> Void) {
        var next = state
        mutation(&next)
        guard next != state else { return }
        state = next
        scheduleRender()
    }

    /// Records the current state into the undo history under `label`.
    public func commit(_ label: String) {
        history.record(state, label: label)
        historyRevision += 1
        refreshHistoryFlags()
    }

    /// Mutation + commit in one step, for discrete actions (pick a filter,
    /// rotate, choose a ratio).
    public func perform(_ label: String, _ mutation: (inout ImageEditState) -> Void) {
        update(mutation)
        commit(label)
    }

    public func reset() {
        guard state.hasEdits else { return }
        perform("R\u{00E9}initialisation") { $0 = .identity }
    }

    // MARK: - History navigation

    public func undo() {
        guard let restored = history.undo() else { return }
        applyHistoryState(restored)
    }

    public func redo() {
        guard let restored = history.redo() else { return }
        applyHistoryState(restored)
    }

    public func jump(to id: UUID) {
        guard let restored = history.jump(to: id) else { return }
        applyHistoryState(restored)
    }

    private func applyHistoryState(_ restored: ImageEditState) {
        state = restored
        historyRevision += 1
        refreshHistoryFlags()
        scheduleRender()
    }

    private func refreshHistoryFlags() {
        canUndo = history.canUndo
        canRedo = history.canRedo
    }

    // MARK: - Mode

    public func setMode(_ newMode: ImageEditorMode) {
        guard newMode != mode else { return }
        mode = newMode
        Self.saveMode(newMode)
    }

    public func toggleMode() { setMode(mode.toggled) }

    // MARK: - Render outputs

    /// Oriented, uncropped, colour-free image — the backdrop the crop tool
    /// draws its selection over.
    public func cropBackdrop() -> UIImage {
        engine.renderGeometryOnly(working, state: state, applyCrop: false)
    }

    /// Oriented + cropped image with no colour edits — the "before" frame of
    /// the hold-to-compare gesture.
    public func comparisonImage() -> UIImage {
        engine.renderGeometryOnly(working, state: state, applyCrop: true)
    }

    /// Full-resolution final render from the untouched original.
    public func export() -> UIImage {
        engine.render(original, state: state)
    }

    /// Rebuilds the per-filter preview thumbnails from the current framing.
    public func loadFilterThumbnails() {
        let framed = engine.renderGeometryOnly(working, state: state, applyCrop: true)
        filterThumbnails = engine.filterThumbnails(for: framed)
    }

    // MARK: - Render loop

    private func scheduleRender() {
        renderTask?.cancel()
        let snapshot = state
        renderTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 90_000_000)
            guard !Task.isCancelled, let self else { return }
            let rendered = self.engine.render(self.working, state: snapshot)
            guard !Task.isCancelled else { return }
            self.previewImage = rendered
        }
    }

    // MARK: - Mode persistence

    private static let modeKey = "meeshy.imageEditor.mode"

    private static func loadMode() -> ImageEditorMode {
        guard let raw = UserDefaults.standard.string(forKey: modeKey),
              let mode = ImageEditorMode(rawValue: raw) else { return .simple }
        return mode
    }

    private static func saveMode(_ mode: ImageEditorMode) {
        UserDefaults.standard.set(mode.rawValue, forKey: modeKey)
    }
}
