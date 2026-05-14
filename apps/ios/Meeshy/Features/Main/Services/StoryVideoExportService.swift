import Foundation
import os
import MeeshySDK
import MeeshyUI

// MARK: - StoryExportPhase

/// Coarse-grained phase emitted by `StoryVideoExportService` so the
/// author-only share UI can surface "Export en cours …" feedback without
/// coupling to AVAssetExportSession internals.
public enum StoryExportPhase: Sendable, Equatable {
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

/// Orchestrator for the **author-only** Story export flow. Wraps
/// `StoryExporter.export` with three responsibilities :
///
///   1. **Routing** — inspects `slide.needsVideoExport` and returns `nil`
///      for static slides so the share UI can hint "rien à exporter".
///   2. **Fallback** — when the underlying export throws, swallows the
///      error (logged) and returns `nil` so the share UI can surface a
///      friendly toast rather than AVFoundation noise.
///   3. **Tmp-file lifecycle** — generates a unique temp MP4 URL per
///      invocation, cleans it on internal failure, and exposes
///      `cleanupExport(at:)` for the caller to invoke after the
///      `UIActivityViewController` flow either completes (delete) or is
///      cancelled (delete). The caller is responsible for keeping the
///      file alive while the share sheet holds the URL.
///
/// The service is NOT wired into the publish path : stories publish RAW
/// (assets + JSON effects) so the Prisme Linguistique can retranslate
/// text/audio per viewer. The baked MP4 is only ever surfaced through
/// `UIActivityViewController` for partage externe (Photos, Messages,
/// WhatsApp, AirDrop). See `docs/superpowers/plans/2026-05-14-story-export-realignment-plan.md`.
@MainActor
protocol StoryVideoExportServiceProviding {
    /// Drives `StoryExporter.export` for an author-triggered share. If
    /// `slide.needsVideoExport == false`, returns `nil` IMMEDIATELY
    /// without touching disk so the caller can hint "rien à exporter".
    ///
    /// - Parameters:
    ///   - slide: Slide to inspect + export. Read-only.
    ///   - languages: Preferred languages threaded to `StoryRenderer.render`
    ///     so the baked MP4 reflects the author's chosen export language
    ///     (Prisme Linguistique). Empty array bakes the original source
    ///     text.
    ///   - onProgress: Optional callback receiving export progress
    ///     `0.0...1.0` at ~10Hz (forwarded from `StoryExporter`). Invoked
    ///     on the `@MainActor` so consumers can mutate `@Published`
    ///     properties directly without a hop.
    ///   - onPhaseChange: Optional callback signalling phase transitions
    ///     (currently only `.exporting` once at the start of an actual
    ///     export). Invoked on the `@MainActor`.
    /// - Returns: Local file URL to the baked MP4, or `nil` if the slide
    ///   doesn't need an export OR the export failed.
    func prepareExport(
        slide: StorySlide,
        languages: [String],
        onProgress: ((Double) -> Void)?,
        onPhaseChange: ((StoryExportPhase) -> Void)?
    ) async -> URL?

    /// Deletes the temp MP4 at `url` if it exists. Safe to call multiple
    /// times. No-op if the file is already gone. Called by the share VM
    /// after `UIActivityViewController` either completes (success) or
    /// is dismissed (cancel).
    func cleanupExport(at url: URL)
}

// MARK: - StoryVideoExportService

/// Production singleton driving the author-only "Export to share" flow.
/// Routes through `StoryExporter` for the real bake, with the
/// routing/fallback/cleanup responsibilities above. Never invoked from
/// the publish path — see CLAUDE.md "Story Architecture".
///
/// Concurrency : `@MainActor` matches the surrounding Service pattern.
/// The actual heavy lifting (`AVAssetExportSession`) runs inside
/// `StoryExporter.export`, which is async and explicitly NOT
/// main-actor-bound. The progress callback hops back to the main actor
/// via the wrapped closure below.
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
        languages: [String] = [],
        onProgress: ((Double) -> Void)? = nil,
        onPhaseChange: ((StoryExportPhase) -> Void)? = nil
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
        // onProgress is a non-Sendable closure (MainActor closure typically
        // captures self / @Published). StoryExporter's progress parameter
        // is @Sendable. Bridge via an @unchecked Sendable box: the box's
        // contents are only ever invoked on the MainActor via the inner
        // Task hop, so the unchecked annotation is safe.
        final class ProgressSinkBox: @unchecked Sendable {
            let sink: (Double) -> Void
            init(_ sink: @escaping (Double) -> Void) { self.sink = sink }
        }
        let progressTrampoline: (@Sendable (Double) -> Void)?
        if let sink = onProgress {
            let box = ProgressSinkBox(sink)
            progressTrampoline = { @Sendable (fraction: Double) in
                Task { @MainActor in
                    box.sink(fraction)
                }
            }
        } else {
            progressTrampoline = nil
        }

        do {
            // `StoryExporter` itself throttles `progress` at ~10Hz.
            try await exporter.export(
                slide: slide,
                to: outputURL,
                languages: languages,
                progress: progressTrampoline
            )
            logger.info("StoryVideoExportService : export complete for slide \(slide.id, privacy: .public)")
            return outputURL
        } catch {
            logger.error("StoryVideoExportService : export FAILED for slide \(slide.id, privacy: .public) — \(error.localizedDescription, privacy: .public)")
            cleanupExport(at: outputURL)
            return nil
        }
    }

    func cleanupExport(at url: URL) {
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
        languages: [String],
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
        languages: [String],
        progress: (@Sendable (Double) -> Void)?
    ) async throws {
        try await StoryExporter.export(slide, to: outputURL, languages: languages, progress: progress)
    }
}
