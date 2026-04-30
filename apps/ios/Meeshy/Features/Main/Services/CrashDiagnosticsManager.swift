import Foundation
import MetricKit
import os

/// Captures, persists and surfaces crash & hang reports without depending on
/// any third-party SDK. The app shipped with `FirebaseCrashlytics` listed in
/// `Package.swift` but it was never imported nor configured (no
/// `FirebaseApp.configure()`, no `GoogleService-Info.plist`), so background
/// crashes were silently lost. This manager fills that gap with the native
/// stack:
///
/// - `MetricKit` (`MXCrashDiagnostic`, `MXHangDiagnostic`) catches OS-recorded
///   incidents — including `0x8BADF00D` watchdog terminations and
///   `0xDEAD10CC` background-task overruns, which are the most likely culprits
///   for "the app crashes when backgrounded". Diagnostics are delivered by
///   the OS at the next launch.
/// - `NSSetUncaughtExceptionHandler` covers Obj-C exceptions and Swift
///   force-unwraps that bridge through `NSException` in real time.
///
/// Reports are written as JSON to `Documents/crash_diagnostics/`. On the next
/// foreground, `consumePending()` returns and clears them so the UI can show
/// a single toast and log them via `Logger.crash` (visible in Console.app).
@MainActor
final class CrashDiagnosticsManager: NSObject {
    static let shared = CrashDiagnosticsManager()

    /// Reports captured in previous sessions, ordered most-recent first.
    /// Drained exactly once by `consumePending()` so the toast doesn't fire
    /// on every relaunch.
    private(set) var pending: [Diagnostic] = []

    private nonisolated static let directoryName = "crash_diagnostics"
    private nonisolated static let maxStoredReports = 50

    private var installed = false

    private override init() {
        super.init()
    }

    // MARK: - Public

    /// Wires up the OS-level crash & hang observers and reloads any reports
    /// persisted from previous sessions. Idempotent.
    func install() {
        guard !installed else { return }
        installed = true
        loadPersisted()
        installNSExceptionHandler()
        MXMetricManager.shared.add(self)
        Logger.crash.info("CrashDiagnostics installed (\(self.pending.count, privacy: .public) pending report(s))")
    }

    /// Returns and clears the queue of previously-captured reports. Reports
    /// are also deleted from disk so the same crash isn't surfaced twice.
    func consumePending() -> [Diagnostic] {
        let snapshot = pending
        pending.removeAll()
        clearPersisted()
        return snapshot
    }

    // MARK: - Diagnostic model

    struct Diagnostic: Codable, Identifiable, Sendable {
        let id: UUID
        let timestamp: Date
        let kind: Kind
        /// One-line headline suitable for a toast / log subject.
        let summary: String
        /// Multi-line technical detail (call stack, raw JSON payload).
        let details: String

        enum Kind: String, Codable, Sendable {
            case nsException
            case crash
            case hang
            case cpuException
            case diskWriteException
        }
    }

    // MARK: - NSException

    /// `@convention(c)` is required by `NSSetUncaughtExceptionHandler`'s C
    /// signature and also makes the closure provably non-isolated under
    /// Swift 6 strict concurrency (SE-0466 default-MainActor isolation would
    /// otherwise lift this closure onto the MainActor, which is wrong: the
    /// handler runs on the crashing thread, not on main). Stored as a static
    /// constant so the function pointer outlives any single call site.
    private nonisolated static let uncaughtExceptionHandler: @convention(c) (NSException) -> Void = { exception in
        let summary = "\(exception.name.rawValue): \(exception.reason ?? "no reason")"
        let details = exception.callStackSymbols.joined(separator: "\n")
        CrashDiagnosticsManager.writeSync(kind: .nsException, summary: summary, details: details)
    }

    private func installNSExceptionHandler() {
        // Runs on the crashing thread with no actor isolation. The process is
        // about to be terminated, so we intentionally avoid spawning Tasks or
        // hopping actors — just fsync a JSON blob and return so the OS can
        // continue its termination sequence.
        NSSetUncaughtExceptionHandler(Self.uncaughtExceptionHandler)
    }

    // MARK: - Persistence

    private func loadPersisted() {
        guard let dir = Self.directoryURL() else { return }
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: dir,
            includingPropertiesForKeys: [.contentModificationDateKey]
        ) else { return }

        let sorted = files.sorted { lhs, rhs in
            let l = (try? lhs.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            let r = (try? rhs.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return l > r
        }

        let decoder = Self.makeDecoder()
        let isoFormatter = ISO8601DateFormatter()
        var loaded: [Diagnostic] = []
        for url in sorted.prefix(Self.maxStoredReports) {
            guard let data = try? Data(contentsOf: url),
                  let diag = try? decoder.decode(Diagnostic.self, from: data) else { continue }
            loaded.append(diag)
            let when = isoFormatter.string(from: diag.timestamp)
            Logger.crash.error("Restored \(diag.kind.rawValue, privacy: .public) @ \(when, privacy: .public): \(diag.summary, privacy: .public)")
        }
        pending = loaded
    }

    private func clearPersisted() {
        guard let dir = Self.directoryURL() else { return }
        guard let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { return }
        for url in files {
            try? FileManager.default.removeItem(at: url)
        }
    }

    private nonisolated static func directoryURL() -> URL? {
        guard let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return nil }
        let dir = docs.appendingPathComponent(directoryName, isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    private nonisolated static func makeEncoder() -> JSONEncoder {
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        return enc
    }

    private nonisolated static func makeDecoder() -> JSONDecoder {
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        return dec
    }

    /// Writes a single diagnostic to disk synchronously. Thread-safe and
    /// callable from the NSException handler and from MetricKit callbacks.
    nonisolated static func writeSync(kind: Diagnostic.Kind, summary: String, details: String) {
        guard let dir = directoryURL() else { return }
        let id = UUID()
        let diag = Diagnostic(id: id, timestamp: Date(), kind: kind, summary: summary, details: details)
        guard let data = try? makeEncoder().encode(diag) else { return }
        let url = dir.appendingPathComponent("\(id.uuidString).json")
        try? data.write(to: url, options: .atomic)
    }
}

// MARK: - MXMetricManagerSubscriber

extension CrashDiagnosticsManager: MXMetricManagerSubscriber {
    /// Called by MetricKit on a background queue, typically at the next
    /// launch following a recorded incident. Each payload aggregates one or
    /// more diagnostics from a single OS-recorded session.
    nonisolated func didReceive(_ payloads: [MXDiagnosticPayload]) {
        for payload in payloads {
            for diag in payload.crashDiagnostics ?? [] {
                let typeCode = diag.exceptionType?.intValue ?? 0
                let signalCode = diag.signal?.intValue ?? 0
                let termination = diag.terminationReason ?? "unknown"
                let summary = "Crash exc=\(typeCode) sig=\(signalCode) reason=\(termination)"
                let details = String(data: diag.jsonRepresentation(), encoding: .utf8) ?? "<binary>"
                Self.writeSync(kind: .crash, summary: summary, details: details)
            }

            for diag in payload.hangDiagnostics ?? [] {
                // Hang duration is the headline number for ranking severity:
                // `0x8BADF00D` watchdog kills and `0xDEAD10CC` background-task
                // overruns both surface here, and the wall-clock duration is
                // the single most useful signal to triage them.
                let value = diag.hangDuration.value
                let unit = diag.hangDuration.unit.symbol
                let summary = "Hang \(value)\(unit)"
                let details = String(data: diag.jsonRepresentation(), encoding: .utf8) ?? "<binary>"
                Self.writeSync(kind: .hang, summary: summary, details: details)
            }

            for diag in payload.cpuExceptionDiagnostics ?? [] {
                let summary = "CPU exception"
                let details = String(data: diag.jsonRepresentation(), encoding: .utf8) ?? "<binary>"
                Self.writeSync(kind: .cpuException, summary: summary, details: details)
            }

            for diag in payload.diskWriteExceptionDiagnostics ?? [] {
                let summary = "Disk-write exception"
                let details = String(data: diag.jsonRepresentation(), encoding: .utf8) ?? "<binary>"
                Self.writeSync(kind: .diskWriteException, summary: summary, details: details)
            }
        }
    }
}
