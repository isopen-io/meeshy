import Foundation
import Combine
import os
@preconcurrency import AVFoundation
import MeeshySDK

// MARK: - Audio Editor Mode

/// Top-level layout of the editor — mirrors the timeline's Simple/Pro split.
public enum AudioEditorMode: String, Codable, Sendable, CaseIterable {
    case simple
    case pro

    public var toggled: AudioEditorMode { self == .simple ? .pro : .simple }
    public var isPro: Bool { self == .pro }
}

// MARK: - Audio Editor Tool

/// A contextual editing tool. Each tool, when active, reveals its own panel
/// and stages exactly one `AudioEditOperation`.
public enum AudioEditorTool: String, CaseIterable, Identifiable, Sendable {
    case trim
    case split
    case fade
    case speed
    case volume
    case transcribe

    public var id: String { rawValue }

    /// Tools surfaced in Simple mode. Pro mode surfaces all of them.
    public static let simpleTools: [AudioEditorTool] = [.trim, .transcribe]

    public var icon: String {
        switch self {
        case .trim: return "scissors"
        case .split: return "rectangle.split.2x1"
        case .fade: return "speaker.wave.2"
        case .speed: return "speedometer"
        case .volume: return "slider.horizontal.3"
        case .transcribe: return "captions.bubble"
        }
    }

    public var title: String {
        switch self {
        case .trim:
            return String(localized: "audio.editor.tool.trim", defaultValue: "Rogner", bundle: .module)
        case .split:
            return String(localized: "audio.editor.tool.split", defaultValue: "Couper", bundle: .module)
        case .fade:
            return String(localized: "audio.editor.tool.fade", defaultValue: "Fondu", bundle: .module)
        case .speed:
            return String(localized: "audio.editor.tool.speed", defaultValue: "Vitesse", bundle: .module)
        case .volume:
            return String(localized: "audio.editor.tool.volume", defaultValue: "Volume", bundle: .module)
        case .transcribe:
            return String(localized: "audio.editor.tool.transcribe", defaultValue: "Transcrire", bundle: .module)
        }
    }

    /// `true` when the tool bakes a new audio version (vs. metadata only).
    public var producesVersion: Bool { self != .transcribe }
}

// MARK: - Transcription State

public enum AudioTranscriptionState: Equatable, Sendable {
    case idle
    case running
    case done(text: String, language: String)
    case failed(reason: String)
    case permissionDenied
}

// MARK: - Audio Editor Result

/// The outcome handed back to the caller once the user confirms.
public struct AudioEditorResult: Sendable {
    public let url: URL
    public let transcription: StoryVoiceTranscription?
    public let duration: TimeInterval
}

// MARK: - Audio Editor Controller

/// Single source of truth for the consolidated audio editor.
///
/// Owns the non-destructive `AudioEditDocument`, the Simple/Pro mode, the
/// active tool + its staged parameters, and the transcription lifecycle. All
/// heavy work (AVFoundation export, speech recognition) is dispatched to
/// cancelable background tasks; the controller itself only mutates `@Published`
/// state on the main actor.
@MainActor
public final class AudioEditorController: ObservableObject {

    private static let log = Logger(subsystem: "me.meeshy.app", category: "audio-editor")
    private let transcriptionTimeout: TimeInterval = 90

    // MARK: Session

    public let sessionDirectory: URL
    private let manifestURL: URL
    private let sourceURL: URL

    // MARK: History

    @Published public private(set) var document: AudioEditDocument

    /// `true` until `prepare()` has copied in the source and loaded its
    /// duration. The view shows a placeholder rather than freezing.
    @Published public private(set) var isPreparing = true
    private var didPrepare = false

    // MARK: Mode & panels

    @Published public var mode: AudioEditorMode = .simple {
        didSet {
            if let tool = activeTool, !availableTools.contains(tool) {
                activeTool = nil
            }
        }
    }
    @Published public private(set) var activeTool: AudioEditorTool?

    // MARK: Staged parameters (one tool at a time)

    @Published public var trimStart: TimeInterval = 0
    @Published public var trimEnd: TimeInterval = 0
    @Published public var splitStart: TimeInterval = 0
    @Published public var splitEnd: TimeInterval = 0
    @Published public var fadeIn: Bool = false
    @Published public var fadeOut: Bool = false
    @Published public var speed: Double = 1.0
    @Published public var gain: Double = 1.0

    // MARK: Processing

    @Published public private(set) var isProcessing = false
    @Published public var lastError: String?

    // MARK: Transcription

    @Published public private(set) var transcription: AudioTranscriptionState = .idle
    @Published public private(set) var transcriptionSegments: [OnDeviceTranscriptionSegment] = []
    @Published public var transcriptionLanguage: String

    private var processingTask: Task<Void, Never>?
    private var transcriptionTask: Task<Void, Never>?

    // MARK: - Init

    /// Creates an editing session for `sourceURL`. Only cheap work runs here —
    /// the source file is copied into the private session directory off the
    /// main actor by `prepare()`, so presenting the editor never blocks the UI.
    public init(sourceURL: URL, defaultLanguage: String = "fr") {
        let sessionID = UUID()
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("audio-editor", isDirectory: true)
        let directory = root.appendingPathComponent(sessionID.uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        self.sessionDirectory = directory
        self.manifestURL = directory.appendingPathComponent("manifest.json")
        self.sourceURL = sourceURL
        self.transcriptionLanguage = defaultLanguage

        let ext = sourceURL.pathExtension.isEmpty ? "m4a" : sourceURL.pathExtension
        let originalName = "original.\(ext)"
        let original = AudioEditVersion(fileName: originalName, duration: 0, operation: .original)
        self.document = AudioEditDocument(sessionID: sessionID, original: original)

        Self.purgeStaleSessions(in: root, keeping: sessionID)
    }

    // MARK: - Lifecycle

    /// Copies in the source (off the main actor), loads its real duration and
    /// primes the staged parameters. Call once when the editor appears;
    /// repeated calls are ignored so staged edits are never reset.
    public func prepare() async {
        guard !didPrepare else { return }
        didPrepare = true

        let destination = activeURL
        let materialized = await Self.materializeOriginal(from: sourceURL, to: destination)
        if !materialized {
            lastError = String(localized: "audio.editor.error.load",
                               defaultValue: "Impossible de charger cet audio.", bundle: .module)
        }

        let duration = await Self.loadDuration(destination)
        document.updateDuration(duration, ofVersion: document.original.id)
        resetStaging(for: duration)
        isPreparing = false
        persist()
    }

    /// Cancels in-flight work. Safe to call repeatedly.
    public func cancelBackgroundWork() {
        processingTask?.cancel()
        processingTask = nil
        transcriptionTask?.cancel()
        transcriptionTask = nil
        EdgeTranscriptionService.shared.cancel()
    }

    // MARK: - Derived state

    public var activeURL: URL {
        sessionDirectory.appendingPathComponent(document.active.fileName)
    }

    public var activeDuration: TimeInterval {
        document.active.duration
    }

    public var availableTools: [AudioEditorTool] {
        mode == .simple ? AudioEditorTool.simpleTools : AudioEditorTool.allCases
    }

    public var canUndo: Bool { document.canUndo && !isProcessing }
    public var canRedo: Bool { document.canRedo && !isProcessing }
    public var isModified: Bool { document.isModified }

    /// The operation the active tool would bake, or `nil` if nothing meaningful
    /// is staged.
    public var pendingOperation: AudioEditOperation? {
        guard let tool = activeTool else { return nil }
        switch tool {
        case .trim:
            return isTrimMeaningful ? .trim(start: trimStart, end: trimEnd) : nil
        case .split:
            return isSplitMeaningful ? .removeRange(start: splitStart, end: splitEnd) : nil
        case .fade:
            return (fadeIn || fadeOut) ? .fade(fadeIn: fadeIn, fadeOut: fadeOut) : nil
        case .speed:
            return abs(speed - 1.0) > 0.001 ? .speed(rate: speed) : nil
        case .volume:
            return abs(gain - 1.0) > 0.001 ? .gain(multiplier: gain) : nil
        case .transcribe:
            return nil
        }
    }

    public var canApply: Bool {
        guard !isProcessing, let operation = pendingOperation else { return false }
        return !operation.isIdentity
    }

    private var isTrimMeaningful: Bool {
        let duration = activeDuration
        guard trimEnd - trimStart >= 0.3 else { return false }
        return trimStart > 0.05 || trimEnd < duration - 0.05
    }

    private var isSplitMeaningful: Bool {
        let duration = activeDuration
        guard splitEnd - splitStart >= 0.2 else { return false }
        return splitStart >= 0 && splitEnd <= duration + 0.01
    }

    // MARK: - Tool selection

    public func selectTool(_ tool: AudioEditorTool?) {
        activeTool = tool
        lastError = nil
        guard let tool else { return }
        let duration = activeDuration
        switch tool {
        case .trim:
            trimStart = 0
            trimEnd = duration
        case .split:
            splitStart = duration * 0.4
            splitEnd = duration * 0.6
        case .fade:
            fadeIn = false
            fadeOut = false
        case .speed:
            speed = 1.0
        case .volume:
            gain = 1.0
        case .transcribe:
            break
        }
    }

    public func toggleMode() {
        mode = mode.toggled
    }

    // MARK: - Apply / Undo / Redo

    /// Bakes the staged operation into a new version. Non-destructive: the
    /// prior version stays in history for undo.
    public func apply() {
        guard let operation = pendingOperation, !operation.isIdentity, !isProcessing else { return }
        let source = activeURL
        let sourceDuration = activeDuration
        let directory = sessionDirectory

        isProcessing = true
        lastError = nil
        processingTask = Task { [weak self] in
            let outcome: Result<URL, Error>
            do {
                let url = try await AudioEditEngine.apply(
                    operation, to: source, sourceDuration: sourceDuration, into: directory
                )
                outcome = .success(url)
            } catch {
                outcome = .failure(error)
            }
            await self?.finishApply(operation: operation, outcome: outcome)
        }
    }

    private func finishApply(operation: AudioEditOperation, outcome: Result<URL, Error>) async {
        isProcessing = false
        processingTask = nil
        switch outcome {
        case .success(let url):
            let duration = await Self.loadDuration(url)
            let version = AudioEditVersion(
                fileName: url.lastPathComponent, duration: duration, operation: operation
            )
            let discarded = document.commit(version)
            deleteFiles(discarded.map(\.fileName))
            onActiveVersionChanged(closeTool: true)
        case .failure(let error):
            if error is CancellationError { return }
            Self.log.error("Audio edit failed: \(error.localizedDescription, privacy: .public)")
            lastError = (error as? LocalizedError)?.errorDescription
                ?? String(localized: "audio.editor.error.generic",
                          defaultValue: "L'\u{00E9}dition a \u{00E9}chou\u{00E9}.", bundle: .module)
        }
    }

    public func undo() {
        guard canUndo else { return }
        document.undo()
        onActiveVersionChanged(closeTool: false)
    }

    public func redo() {
        guard canRedo else { return }
        document.redo()
        onActiveVersionChanged(closeTool: false)
    }

    /// Jumps directly to a version in the history list.
    public func selectVersion(_ versionID: UUID) {
        guard !isProcessing else { return }
        document.moveCursor(to: versionID)
        onActiveVersionChanged(closeTool: false)
    }

    private func onActiveVersionChanged(closeTool: Bool) {
        resetStaging(for: activeDuration)
        // Word timings belong to a specific audio render; invalidate them.
        transcription = .idle
        transcriptionSegments = []
        transcriptionTask?.cancel()
        transcriptionTask = nil
        if closeTool { activeTool = nil }
        persist()
    }

    private func resetStaging(for duration: TimeInterval) {
        trimStart = 0
        trimEnd = duration
        splitStart = duration * 0.4
        splitEnd = duration * 0.6
        fadeIn = false
        fadeOut = false
        speed = 1.0
        gain = 1.0
    }

    // MARK: - Finalize / Discard

    /// Confirms the active version for use. Copies it to a stable location,
    /// then deletes the whole session directory — the temporary history is
    /// cleared only here, once the edited audio is actually used.
    public func finalize() -> AudioEditorResult {
        cancelBackgroundWork()
        let active = document.active
        let activeFile = sessionDirectory.appendingPathComponent(active.fileName)
        let ext = activeFile.pathExtension.isEmpty ? "m4a" : activeFile.pathExtension
        let exported = FileManager.default.temporaryDirectory
            .appendingPathComponent("edited_audio_\(UUID().uuidString).\(ext)")

        let copied = (try? FileManager.default.copyItem(at: activeFile, to: exported)) != nil
        let resultURL = copied ? exported : activeFile

        var voice: StoryVoiceTranscription?
        if case .done(let text, let language) = transcription, !text.isEmpty {
            voice = StoryVoiceTranscription(language: language, content: text)
        }

        let result = AudioEditorResult(url: resultURL, transcription: voice, duration: active.duration)
        // Only wipe the session once the result is safely outside it.
        if copied { cleanupSession() }
        return result
    }

    /// Abandons the session and deletes all temporary files.
    public func discard() {
        cancelBackgroundWork()
        cleanupSession()
    }

    private func cleanupSession() {
        try? FileManager.default.removeItem(at: sessionDirectory)
    }

    // MARK: - Transcription

    public var transcribableLanguageCodes: Set<String> {
        Set(EdgeTranscriptionService.shared.supportedLocales.compactMap {
            $0.language.languageCode?.identifier
        })
    }

    /// All app languages, the single source of truth for linguistic idiom.
    public var languageCatalog: [LanguageInfo] { LanguageData.allLanguages }

    public func transcribe() {
        transcriptionTask?.cancel()
        EdgeTranscriptionService.shared.cancel()
        let url = activeURL
        let languageCode = transcriptionLanguage
        transcription = .running
        transcriptionSegments = []
        transcriptionTask = Task { [weak self] in
            await self?.runTranscription(url: url, languageCode: languageCode)
        }
    }

    private func runTranscription(url: URL, languageCode: String) async {
        let fileManager = FileManager.default
        guard url.isFileURL, fileManager.fileExists(atPath: url.path) else {
            transcription = .failed(reason: String(
                localized: "audio.editor.transcription.fileMissing",
                defaultValue: "Fichier audio introuvable.", bundle: .module))
            return
        }
        let size = ((try? fileManager.attributesOfItem(atPath: url.path))?[.size] as? NSNumber)?.intValue ?? 0
        guard size > 0 else {
            transcription = .failed(reason: String(
                localized: "audio.editor.transcription.empty",
                defaultValue: "L'enregistrement est vide.", bundle: .module))
            return
        }

        let locale = Locale(identifier: languageCode)

        // Watchdog: a recognizer that never finishes is forced to fail.
        let watchdog = Task { @MainActor in
            try? await Task.sleep(for: .seconds(transcriptionTimeout))
            if !Task.isCancelled { EdgeTranscriptionService.shared.cancel() }
        }
        defer { watchdog.cancel() }

        do {
            let result = try await withTaskCancellationHandler {
                try await EdgeTranscriptionService.shared.transcribe(audioURL: url, locale: locale)
            } onCancel: {
                Task { @MainActor in EdgeTranscriptionService.shared.cancel() }
            }
            if Task.isCancelled { return }
            let text = result.text.trimmingCharacters(in: .whitespacesAndNewlines)
            if text.isEmpty {
                transcription = .failed(reason: String(
                    localized: "audio.editor.transcription.noSpeech",
                    defaultValue: "Aucune parole d\u{00E9}tect\u{00E9}e.", bundle: .module))
            } else {
                transcription = .done(text: text, language: languageCode)
                transcriptionSegments = result.segments
            }
        } catch is CancellationError {
            // Superseded or dismissed — leave state to the newer request.
        } catch let error as EdgeTranscriptionError {
            if error == .notAuthorized {
                transcription = .permissionDenied
            } else {
                Self.log.error("Transcription failed: \(error.localizedDescription, privacy: .public)")
                transcription = .failed(reason: String(
                    localized: "audio.editor.transcription.failed",
                    defaultValue: "Transcription impossible.", bundle: .module))
            }
        } catch {
            Self.log.error("Transcription failed: \(error.localizedDescription, privacy: .public)")
            transcription = .failed(reason: String(
                localized: "audio.editor.transcription.failed",
                defaultValue: "Transcription impossible.", bundle: .module))
        }
    }

    // MARK: - Persistence (crash-recovery autosave)

    private func persist() {
        guard let data = try? JSONEncoder().encode(document) else { return }
        try? data.write(to: manifestURL, options: .atomic)
    }

    private func deleteFiles(_ fileNames: [String]) {
        for name in fileNames {
            try? FileManager.default.removeItem(at: sessionDirectory.appendingPathComponent(name))
        }
    }

    // MARK: - Helpers

    static func loadDuration(_ url: URL) async -> TimeInterval {
        let asset = AVURLAsset(url: url)
        guard let duration = try? await asset.load(.duration), duration.isNumeric else { return 0 }
        return max(0, duration.seconds)
    }

    /// Copies the caller's source into the session directory. Runs off the
    /// main actor so a multi-megabyte copy never freezes the UI. Idempotent.
    nonisolated private static func materializeOriginal(from source: URL,
                                                        to destination: URL) async -> Bool {
        let fileManager = FileManager.default
        if fileManager.fileExists(atPath: destination.path) { return true }

        // Files handed back by `.fileImporter` are security-scoped: without
        // claiming access first, both `copyItem` and `Data(contentsOf:)`
        // silently fail (the user saw "Impossible de charger cet audio." and
        // could neither play nor trim). Harmless for our own temp recordings —
        // `startAccessingSecurityScopedResource()` just returns `false` there.
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }

        do {
            try fileManager.copyItem(at: source, to: destination)
            return true
        } catch {
            // Cross-volume or sandbox edge cases: fall back to a buffered copy.
            if let data = try? Data(contentsOf: source) {
                return (try? data.write(to: destination)) != nil
            }
            return false
        }
    }

    /// Deletes session directories left behind by crashes (older than 24h).
    private static func purgeStaleSessions(in root: URL, keeping current: UUID) {
        let fileManager = FileManager.default
        guard let entries = try? fileManager.contentsOfDirectory(
            at: root, includingPropertiesForKeys: [.contentModificationDateKey], options: []
        ) else { return }
        let cutoff = Date().addingTimeInterval(-24 * 60 * 60)
        for entry in entries where entry.lastPathComponent != current.uuidString {
            let modified = (try? entry.resourceValues(forKeys: [.contentModificationDateKey]))?
                .contentModificationDate ?? .distantPast
            if modified < cutoff {
                try? fileManager.removeItem(at: entry)
            }
        }
    }
}

// MARK: - Operation Display

public extension AudioEditOperation {
    /// Short, user-facing label for the history list.
    var displayLabel: String {
        switch self {
        case .original:
            return String(localized: "audio.editor.op.original",
                          defaultValue: "Original", bundle: .module)
        case .trim:
            return String(localized: "audio.editor.op.trim",
                          defaultValue: "Rogn\u{00E9}", bundle: .module)
        case .removeRange:
            return String(localized: "audio.editor.op.removeRange",
                          defaultValue: "Section coup\u{00E9}e", bundle: .module)
        case .fade:
            return String(localized: "audio.editor.op.fade",
                          defaultValue: "Fondu", bundle: .module)
        case .speed:
            return String(localized: "audio.editor.op.speed",
                          defaultValue: "Vitesse", bundle: .module)
        case .gain:
            return String(localized: "audio.editor.op.gain",
                          defaultValue: "Volume", bundle: .module)
        }
    }

    var displayIcon: String {
        switch self {
        case .original: return "waveform"
        case .trim: return "scissors"
        case .removeRange: return "rectangle.split.2x1"
        case .fade: return "speaker.wave.2"
        case .speed: return "speedometer"
        case .gain: return "slider.horizontal.3"
        }
    }
}
