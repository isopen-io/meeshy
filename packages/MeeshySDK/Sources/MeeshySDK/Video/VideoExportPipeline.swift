import Foundation
import AVFoundation

/// Async, cancelable, timeout-safe wrapper around `AVAssetExportSession`.
///
/// Pinned to `@MainActor` because the session, its progress and cancellation
/// must be touched from a single isolation domain — that removes a whole
/// class of races that otherwise surface as crashes when the app is
/// backgrounded mid-export.
@MainActor
public final class VideoExportPipeline {

    private var session: AVAssetExportSession?
    private var didTimeout = false
    private var isCancelledByCaller = false

    public init() {}

    /// Cancels an in-flight export. Safe to call when nothing is running.
    public func cancel() {
        isCancelledByCaller = true
        session?.cancelExport()
    }

    /// Flattens a composition `Plan` to a new file.
    ///
    /// - Throws: `VideoEditError.exportCancelled` / `.exportTimedOut` /
    ///   `.exportFailed` — never crashes, the watchdog guarantees termination.
    public func export(
        plan: VideoCompositionBuilder.Plan,
        timeout: TimeInterval = 300,
        onProgress: @escaping @Sendable (Double) -> Void
    ) async throws -> URL {
        isCancelledByCaller = false
        didTimeout = false

        let outputURL = Self.makeOutputURL()
        try? FileManager.default.removeItem(at: outputURL)

        guard let session = AVAssetExportSession(
            asset: plan.composition,
            presetName: AVAssetExportPresetHighestQuality
        ) else {
            throw VideoEditError.exportSetupFailed
        }
        session.outputURL = outputURL
        session.outputFileType = .mp4
        session.shouldOptimizeForNetworkUse = true
        session.videoComposition = plan.videoComposition
        session.audioMix = plan.audioMix
        self.session = session
        defer { self.session = nil }

        if isCancelledByCaller {
            throw VideoEditError.exportCancelled
        }

        let progressTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                guard let active = self?.session else { break }
                onProgress(min(1, max(0, Double(active.progress))))
                let status = active.status
                if status != .exporting && status != .waiting && status != .unknown { break }
                try? await Task.sleep(for: .milliseconds(150))
            }
        }
        defer { progressTask.cancel() }

        let watchdog = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(timeout))
            guard !Task.isCancelled, let self else { return }
            self.didTimeout = true
            self.session?.cancelExport()
        }
        defer { watchdog.cancel() }

        await withTaskCancellationHandler {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                session.exportAsynchronously {
                    continuation.resume()
                }
            }
        } onCancel: {
            Task { @MainActor [weak self] in
                self?.isCancelledByCaller = true
                self?.session?.cancelExport()
            }
        }

        switch session.status {
        case .completed:
            onProgress(1)
            return outputURL
        case .cancelled:
            try? FileManager.default.removeItem(at: outputURL)
            throw didTimeout ? VideoEditError.exportTimedOut : VideoEditError.exportCancelled
        default:
            try? FileManager.default.removeItem(at: outputURL)
            throw VideoEditError.exportFailed(session.error?.localizedDescription ?? "unknown error")
        }
    }

    private static func makeOutputURL() -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("MeeshyVideoEdits", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("edit_\(UUID().uuidString).mp4")
    }
}
