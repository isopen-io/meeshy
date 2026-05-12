import Foundation
import os
import MeeshySDK
import MeeshyUI

// MARK: - StoryUploadPhase (P3 placeholder)
//
// Spec : docs/superpowers/specs/2026-05-12-story-publish-exporter-wiring-design.md §3.5
//
// Minimal placeholder enum so P3 can publish a `.exporting` signal to its
// caller before P6 wires the full `StoryUploadPhase` lifecycle into
// `StoryViewModel.StoryUploadState` and `StoryTrayView`. P6 will move this
// declaration to the SDK side (alongside `StoryUploadState`) and add the
// remaining cases (`.preparingMedia`, `.uploadingMedia`, `.publishingStory`,
// `.completed`, `.failed`) per the spec. Until then, only the case this
// service actually emits is declared — keeping the surface area small
// avoids speculative API churn we'd have to migrate again at P6 time.
//
// TODO (P6) : promote to SDK, add remaining lifecycle cases, reconcile with
// `StoryViewModel.StoryUploadState.UploadPhase`.

/// Coarse-grained phase emitted by `StoryVideoExportService` so callers
/// (StoryViewModel, future StoryTrayView badge) can surface "Export en
/// cours …" feedback without coupling to AVAssetExportSession internals.
public enum StoryUploadPhase: Sendable, Equatable {
    /// Running `StoryExporter.export(_:to:progress:)`. Progress fraction
    /// is delivered separately via `onProgress` so consumers can drive a
    /// `ProgressView` without re-creating one phase per percentage point.
    case exporting
}

// MARK: - Errors

/// Errors surfaced by `StoryVideoExportService` itself (NOT the underlying
/// `StoryExporterError`). When export fails internally we log the inner
/// error and return `nil` from `prepareExport` so the caller falls back to
/// the legacy asset path — robustness over surfacing AVFoundation noise.
enum StoryVideoExportServiceError: Error, LocalizedError {
    /// Raised when the system temporary directory is unreachable (sandbox
    /// misconfiguration, simulator wedge). Should never happen in practice
    /// — kept as a typed error for diagnostic clarity.
    case temporaryDirectoryUnavailable

    var errorDescription: String? {
        switch self {
        case .temporaryDirectoryUnavailable:
            return "Le dossier temporaire n'est pas accessible."
        }
    }
}

// MARK: - Protocol

/// Decision orchestrator + cleanup owner for the Story video export
/// pipeline. Wraps `StoryExporter.export` with three responsibilities the
/// raw exporter must not carry :
///
///   1. **Routing** — inspects `slide.needsVideoExport` and returns `nil`
///      for static slides so callers stay on the legacy asset path
///      without a separate `if` at every call site.
///   2. **Fallback** — when the underlying export throws, swallows the
///      error (logged) and returns `nil` so the publish flow degrades
///      gracefully to the asset path rather than failing the whole story.
///   3. **Tmp-file lifecycle** — generates a unique temp MP4 URL per
///      invocation, cleans it on internal failure, and exposes
///      `cleanupTempExport(at:)` for the caller to invoke after the TUS
///      upload either succeeds (delete) or terminally fails. On a
///      resume-eligible failure (e.g. TUS chunk uploaded but app killed)
///      the caller deliberately does NOT call cleanup so the queue can
///      replay the MP4 from disk on relaunch (spec §3.4).
///
/// The protocol exists to enable test-side substitution from
/// `StoryViewModel` once P4 wires this in — the production singleton
/// uses the real `StoryExporter`, tests pass a `MockStoryExporter` via
/// `init(exporter:)`.
@MainActor
protocol StoryVideoExportServiceProviding {
    /// Decides export vs asset path. If `slide.needsVideoExport == false`,
    /// returns `nil` IMMEDIATELY without touching disk. Otherwise drives
    /// `StoryExporter.export` against a fresh temp MP4 URL and returns the
    /// URL on success, or `nil` on failure (fall back to legacy path).
    ///
    /// - Parameters:
    ///   - slide: Slide to inspect + export. Read-only.
    ///   - onProgress: Optional callback receiving export progress
    ///     `0.0...1.0` at ~10Hz (forwarded from `StoryExporter`). Invoked
    ///     on the `@MainActor` so consumers can mutate `@Published`
    ///     properties directly without a hop.
    ///   - onPhaseChange: Optional callback signalling phase transitions
    ///     (currently only `.exporting` once at the start of an actual
    ///     export — static slides emit nothing). Invoked on the
    ///     `@MainActor`.
    /// - Returns: Local file URL to the baked MP4, or `nil` if the slide
    ///   doesn't need an export OR the export failed.
    func prepareExport(
        slide: StorySlide,
        onProgress: ((Double) -> Void)?,
        onPhaseChange: ((StoryUploadPhase) -> Void)?
    ) async -> URL?

    /// Deletes the temp MP4 at `url` if it exists. Safe to call multiple
    /// times. No-op if the file is already gone. Use this after a
    /// successful TUS upload (or a terminal upload failure where the user
    /// is told to retry from a fresh draft) — NOT after a resumable
    /// failure where the queue may need to replay the MP4.
    func cleanupTempExport(at url: URL)
}

// MARK: - StoryVideoExportService

/// Production singleton. Routes through `StoryExporter` for the real
/// export, with the routing/fallback/cleanup responsibilities above.
///
/// Concurrency : `@MainActor` matches the surrounding Service pattern
/// (`AttachmentSendService`, `StoryPublishService`). The actual heavy
/// lifting (`AVAssetExportSession`) runs inside `StoryExporter.export`,
/// which is async and explicitly NOT main-actor-bound. The progress
/// callback hops back to the main actor via the wrapped closure below.
@MainActor
final class StoryVideoExportService: StoryVideoExportServiceProviding {
    static let shared = StoryVideoExportService()

    private let exporter: StoryExporting
    private let fileManager: FileManager
    private let logger = Logger.stories

    init(
        exporter: StoryExporting = SystemStoryExporter(),
        fileManager: FileManager = .default
    ) {
        self.exporter = exporter
        self.fileManager = fileManager
    }

    // MARK: - StoryVideoExportServiceProviding

    func prepareExport(
        slide: StorySlide,
        onProgress: ((Double) -> Void)? = nil,
        onPhaseChange: ((StoryUploadPhase) -> Void)? = nil
    ) async -> URL? {
        guard slide.needsVideoExport else {
            logger.debug("StoryVideoExportService : slide \(slide.id, privacy: .public) does not need video export — skipping")
            return nil
        }

        let outputURL: URL
        do {
            outputURL = try makeTempExportURL(for: slide)
        } catch {
            logger.error("StoryVideoExportService : temp URL creation failed for slide \(slide.id, privacy: .public) — \(error.localizedDescription, privacy: .public)")
            return nil
        }

        onPhaseChange?(.exporting)
        logger.info("StoryVideoExportService : starting export for slide \(slide.id, privacy: .public) at \(outputURL.path, privacy: .public)")

        // Trampoline the caller's `@MainActor` progress closure through
        // a `@Sendable` wrapper. `StoryExporter.export` invokes the
        // closure on its polling task (NOT main), and the public API
        // contract says callers receive on `@MainActor` — the inner
        // `Task { @MainActor in ... }` enforces that hop.
        let progressTrampoline: (@Sendable (Double) -> Void)?
        if let sink = onProgress {
            progressTrampoline = { @Sendable (fraction: Double) in
                Task { @MainActor in
                    sink(fraction)
                }
            }
        } else {
            progressTrampoline = nil
        }

        do {
            // `StoryExporter` itself throttles `progress` at ~10Hz
            // (cf. exporter docstring §3.6). We forward the fraction
            // verbatim — no further throttling/smoothing here.
            try await exporter.export(
                slide: slide,
                to: outputURL,
                progress: progressTrampoline
            )
            logger.info("StoryVideoExportService : export complete for slide \(slide.id, privacy: .public)")
            return outputURL
        } catch {
            // Spec §3.7 / D-7 : transparent fallback. Caller stays on
            // the legacy asset path and the story still publishes.
            logger.error("StoryVideoExportService : export FAILED for slide \(slide.id, privacy: .public) — \(error.localizedDescription, privacy: .public) — falling back to asset path")
            cleanupTempExport(at: outputURL)
            return nil
        }
    }

    func cleanupTempExport(at url: URL) {
        guard fileManager.fileExists(atPath: url.path) else { return }
        do {
            try fileManager.removeItem(at: url)
            logger.debug("StoryVideoExportService : cleaned up temp export at \(url.path, privacy: .public)")
        } catch {
            // Non-fatal — temp files get reaped by the OS eventually.
            // We log so leaks show up in production diagnostics rather
            // than going silent.
            logger.warning("StoryVideoExportService : cleanup failed at \(url.path, privacy: .public) — \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Private helpers

    /// Builds a fresh, collision-proof temp MP4 path for a single export
    /// invocation. The slide id is embedded for diagnostic clarity
    /// (Console.app filtering by slide id) ; the UUID suffix guarantees
    /// concurrent exports of the same slide (rare but possible during
    /// queue replay races) never overwrite each other.
    private func makeTempExportURL(for slide: StorySlide) throws -> URL {
        let tmp = fileManager.temporaryDirectory
        var isDir: ObjCBool = false
        guard fileManager.fileExists(atPath: tmp.path, isDirectory: &isDir), isDir.boolValue else {
            throw StoryVideoExportServiceError.temporaryDirectoryUnavailable
        }
        let safeSlideId = slide.id.replacingOccurrences(of: "/", with: "-")
        let filename = "meeshy-story-export-\(safeSlideId)-\(UUID().uuidString).mp4"
        return tmp.appendingPathComponent(filename)
    }
}

// MARK: - StoryExporting (test seam)

/// Abstraction over `StoryExporter.export` so tests can inject a stub
/// without touching `AVAssetExportSession`. The default production
/// implementation (`SystemStoryExporter`) trampolines straight to the
/// real exporter. Lives in this file because it has no other consumer
/// — promoting it to a top-level protocol would over-share API surface
/// the rest of the app has no business calling.
///
/// The `progress` parameter is declared `@Sendable` to match the real
/// `StoryExporter.export(_:to:progress:)` signature exactly. Callers in
/// the service wrap their (typically `@MainActor`) sink in a Sendable
/// trampoline before invoking — see `StoryVideoExportService.prepareExport`.
protocol StoryExporting: Sendable {
    func export(
        slide: StorySlide,
        to outputURL: URL,
        progress: (@Sendable (Double) -> Void)?
    ) async throws
}

/// Production implementation : forwards to the real exporter. A `struct`
/// with no stored state is implicitly `Sendable`, so the service can
/// hold it without an actor hop and it survives strict concurrency
/// checks.
struct SystemStoryExporter: StoryExporting {
    func export(
        slide: StorySlide,
        to outputURL: URL,
        progress: (@Sendable (Double) -> Void)?
    ) async throws {
        try await StoryExporter.export(slide, to: outputURL, progress: progress)
    }
}
