import Foundation
import MetricKit
import os

/// Captures, persists and surfaces crash & hang reports through two layers:
///
/// 1. **On-device** — `MetricKit` (`MXCrashDiagnostic`, `MXHangDiagnostic`)
///    catches OS-recorded incidents including `0x8BADF00D` watchdog
///    terminations and `0xDEAD10CC` background-task overruns, delivered by
///    the OS at the next launch. `NSSetUncaughtExceptionHandler` covers
///    Obj-C exceptions and Swift force-unwraps that bridge through
///    `NSException` in real time. Reports are persisted to
///    `Documents/crash_diagnostics/` and surfaced via a one-shot toast.
///
/// 2. **Remote (optional)** — A pluggable `CrashReporting` reporter is
///    invoked for every MetricKit diagnostic so server-side aggregators
///    (Crashlytics in production) get the same data with full
///    symbolication. The default `NoOpCrashReporter` keeps everything on
///    device when no reporter is wired up (debug builds without a
///    `GoogleService-Info.plist`). NSExceptions are NOT forwarded
///    explicitly: Crashlytics installs its own `NSUncaughtExceptionHandler`
///    during `FirebaseApp.configure()`, and our handler chains to it via
///    `previousExceptionHandler`, so forwarding manually would
///    double-count.

// MARK: - Crash reporter protocol

/// Surface where MetricKit diagnostics are forwarded after they've been
/// persisted locally. Implementations MUST be thread-safe — `record(_:)`
/// is invoked on the MetricKit background queue.
protocol CrashReporting: Sendable {
    /// Forward a captured diagnostic. Invoked on a background queue.
    nonisolated func record(_ diagnostic: CrashDiagnostic)

    /// Associate subsequent diagnostics with a user. Pass `nil` on logout.
    nonisolated func setUserID(_ userID: String?)

    /// Free-form breadcrumb attached to the next crash report.
    nonisolated func log(_ message: String)
}

/// Default reporter when no remote backend is configured. Every call is a
/// no-op; on-device persistence still happens via the manager itself.
///
/// Marked `nonisolated` so MetricKit's background queue can invoke
/// `record(_:)` without hopping through the default-MainActor isolation
/// SE-0466 imposes on this package.
nonisolated struct NoOpCrashReporter: CrashReporting {
    init() {}
    func record(_ diagnostic: CrashDiagnostic) {}
    func setUserID(_ userID: String?) {}
    func log(_ message: String) {}
}

// MARK: - Diagnostic model (top-level so Codable is nonisolated)

nonisolated struct CrashDiagnostic: Codable, Identifiable, Sendable {
    let id: UUID
    let timestamp: Date
    let kind: Kind
    let summary: String
    let details: String

    enum Kind: String, Codable, Sendable {
        case nsException
        case crash
        case hang
        case cpuException
        case diskWriteException
    }
}

extension CrashDiagnostic.Kind {
    /// Localized, human-facing label. Single source of truth shared by the
    /// one-shot crash toast (`MeeshyApp`) and the crash-report sheet badge
    /// (`CrashReportSheet`) so the naming never drifts between the two.
    var localizedLabel: String {
        switch self {
        case .nsException:
            String(localized: "crash.kind.exception", defaultValue: "Exception", bundle: .main)
        case .crash:
            String(localized: "crash.kind.crash", defaultValue: "Crash", bundle: .main)
        case .hang:
            String(localized: "crash.kind.hang", defaultValue: "Blocage", bundle: .main)
        case .cpuException:
            String(localized: "crash.kind.cpu", defaultValue: "CPU", bundle: .main)
        case .diskWriteException:
            String(localized: "crash.kind.disk", defaultValue: "Disque", bundle: .main)
        }
    }
}

/// Reports are written as JSON to `Documents/crash_diagnostics/`. On the next
/// foreground, `consumePending()` returns and clears them so the UI can show
/// a single toast and log them via `Logger.crash` (visible in Console.app).
@MainActor
final class CrashDiagnosticsManager: NSObject {
    static let shared = CrashDiagnosticsManager()

    /// Reports captured in previous sessions, ordered most-recent first.
    /// Drained exactly once by `consumePending()` so the toast doesn't fire
    /// on every relaunch.
    private(set) var pending: [CrashDiagnostic] = []

    private nonisolated static let directoryName = "crash_diagnostics"
    private nonisolated static let maxStoredReports = 50
    private nonisolated static let fileExtension = "json"

    private var installed = false
    /// File URLs we've already pulled into `pending`. Tracked so
    /// `consumePending()` only deletes files we own — not anything else that
    /// happens to live in the directory — and so reports written by a live
    /// MetricKit callback during this session aren't wiped before being
    /// surfaced (they're picked up by the rescan inside `consumePending()`).
    private var loadedFileURLs: Set<URL> = []

    private override init() {
        super.init()
    }

    // MARK: - Public

    /// Wires up the OS-level crash & hang observers and reloads any reports
    /// persisted from previous sessions. Idempotent.
    ///
    /// - Parameter crashReporter: Remote forwarder for MetricKit
    ///   diagnostics. Defaults to `NoOpCrashReporter`; production wires a
    ///   `CrashlyticsReporter` once `FirebaseApp.configure()` has run.
    func install(crashReporter: CrashReporting = NoOpCrashReporter()) {
        guard !installed else { return }
        installed = true
        Self.setReporter(crashReporter)
        loadPersisted()
        installNSExceptionHandler()
        MXMetricManager.shared.add(self)
        Logger.crash.info("CrashDiagnostics installed (\(self.pending.count, privacy: .public) pending report(s))")
    }

    /// Returns and clears the queue of previously-captured reports. Also
    /// rescans the on-disk store for any reports written by a live MetricKit
    /// callback since `install()` ran — without this rescan, a hang/crash
    /// diagnostic delivered mid-session would land on disk but `clearPersisted`
    /// would wipe it before the user ever saw it. Files we wrote are deleted
    /// at the end so the same incident isn't surfaced twice.
    func consumePending() -> [CrashDiagnostic] {
        let live = loadFreshFromDisk()
        let combined = pending + live
        pending.removeAll()
        clearLoadedFiles()
        return combined
    }

    /// Tag every subsequent diagnostic with a user identifier on the
    /// remote reporter (cleared on logout via `nil`). No-op when the
    /// reporter is `NoOpCrashReporter`.
    func setUserID(_ userID: String?) {
        Self.reporter.setUserID(userID)
    }

    /// Free-form breadcrumb attached to the next crash report. Use sparingly
    /// — Crashlytics caps the per-session log so noisy callers crowd out
    /// useful signal.
    nonisolated func log(_ message: String) {
        Self.reporter.log(message)
    }


    // MARK: - NSException

    /// Captured at install time so we can chain to whatever handler was
    /// installed before us (Crashlytics, Sentry, the OS default, etc.). Marked
    /// `nonisolated(unsafe)` because it's set exactly once, on the main thread,
    /// before the handler can ever fire — at which point we only read it.
    private nonisolated(unsafe) static var previousExceptionHandler: (@convention(c) (NSException) -> Void)?

    /// Remote forwarder used by `capture(...)` for MetricKit diagnostics.
    /// Protected by `OSAllocatedUnfairLock` so reads from the MetricKit
    /// background queue and the single write from `install(crashReporter:)`
    /// are data-race free. Available iOS 16+.
    private nonisolated static let _reporter = OSAllocatedUnfairLock<any CrashReporting>(initialState: NoOpCrashReporter())

    private nonisolated static var reporter: any CrashReporting {
        _reporter.withLock { $0 }
    }

    private nonisolated static func setReporter(_ newValue: any CrashReporting) {
        _reporter.withLock { $0 = newValue }
    }

    #if DEBUG
    /// Test-only override that bypasses `install()`'s idempotency guard so
    /// each test can swap in a fresh mock. Production code MUST go through
    /// `install(crashReporter:)` once at launch.
    nonisolated static func setReporterForTesting(_ reporter: any CrashReporting) {
        setReporter(reporter)
    }
    #endif

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
        // Hand off to whatever was registered before us so we don't clobber
        // a sibling reporter (e.g. a future Crashlytics integration).
        CrashDiagnosticsManager.previousExceptionHandler?(exception)
    }

    private func installNSExceptionHandler() {
        // Runs on the crashing thread with no actor isolation. The process is
        // about to be terminated, so we intentionally avoid spawning Tasks or
        // hopping actors — just fsync a JSON blob and return so the OS can
        // continue its termination sequence.
        Self.previousExceptionHandler = NSGetUncaughtExceptionHandler()
        NSSetUncaughtExceptionHandler(Self.uncaughtExceptionHandler)
    }

    // MARK: - Persistence

    private func loadPersisted() {
        let isoFormatter = ISO8601DateFormatter()
        var loaded: [CrashDiagnostic] = []
        for (url, diag) in decodeAllReports() {
            loaded.append(diag)
            loadedFileURLs.insert(url)
            let when = isoFormatter.string(from: diag.timestamp)
            Logger.crash.error("Restored \(diag.kind.rawValue, privacy: .public) @ \(when, privacy: .public): \(diag.summary, privacy: .public)")
        }
        pending = loaded
    }

    /// Picks up reports written to disk *since* `loadPersisted()` ran — i.e.
    /// reports MetricKit delivered during the live session. Without this,
    /// `clearLoadedFiles()` could wipe a fresh diagnostic before the user
    /// ever sees it.
    private func loadFreshFromDisk() -> [CrashDiagnostic] {
        var fresh: [CrashDiagnostic] = []
        for (url, diag) in decodeAllReports() where !loadedFileURLs.contains(url) {
            fresh.append(diag)
            loadedFileURLs.insert(url)
        }
        return fresh
    }

    /// Returns every persisted report ordered most-recent first, paired with
    /// its on-disk URL. Caps the result at `maxStoredReports` and proactively
    /// garbage-collects any older overflow so a runaway crash loop can't bloat
    /// `Documents/` indefinitely (the surfacing pipeline only ever deletes
    /// files it loaded, so the tail beyond the cap would otherwise leak).
    private func decodeAllReports() -> [(URL, CrashDiagnostic)] {
        guard let dir = Self.directoryURL() else { return [] }
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: dir,
            includingPropertiesForKeys: [.contentModificationDateKey]
        ) else { return [] }

        let jsonFiles = files.filter { $0.pathExtension == Self.fileExtension }
        let sorted = jsonFiles.sorted { lhs, rhs in
            let l = (try? lhs.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            let r = (try? rhs.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return l > r
        }

        if sorted.count > Self.maxStoredReports {
            for url in sorted.dropFirst(Self.maxStoredReports) {
                try? FileManager.default.removeItem(at: url)
            }
        }

        let decoder = Self.makeDecoder()
        var result: [(URL, CrashDiagnostic)] = []
        for url in sorted.prefix(Self.maxStoredReports) {
            guard let data = try? Data(contentsOf: url),
                  let diag = try? decoder.decode(CrashDiagnostic.self, from: data) else { continue }
            result.append((url, diag))
        }
        return result
    }

    /// Deletes only the files we've actually loaded into memory, leaving any
    /// unrelated content in the directory untouched and any reports that
    /// arrive *after* this call intact for the next launch.
    private func clearLoadedFiles() {
        for url in loadedFileURLs {
            try? FileManager.default.removeItem(at: url)
        }
        loadedFileURLs.removeAll()
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
    /// Use `capture(...)` instead when remote forwarding is also desired —
    /// `writeSync` exists for the crashing-thread NSException path, where
    /// the chained `previousExceptionHandler` already forwards to
    /// Crashlytics so an additional `reporter.record(...)` would
    /// double-count.
    nonisolated static func writeSync(kind: CrashDiagnostic.Kind, summary: String, details: String) {
        let diag = CrashDiagnostic(id: UUID(), timestamp: Date(), kind: kind, summary: summary, details: details)
        persist(diag)
    }

    /// Persists a diagnostic to disk AND forwards it to the configured
    /// remote reporter. Used from MetricKit callbacks where there's no
    /// upstream handler chain to rely on for server-side delivery.
    nonisolated static func capture(kind: CrashDiagnostic.Kind, summary: String, details: String) {
        let diag = CrashDiagnostic(id: UUID(), timestamp: Date(), kind: kind, summary: summary, details: details)
        persist(diag)
        reporter.record(diag)
    }

    private nonisolated static func persist(_ diag: CrashDiagnostic) {
        guard let dir = directoryURL() else { return }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = .prettyPrinted
        guard let data = try? encoder.encode(diag) else { return }
        let url = dir.appendingPathComponent("\(diag.id.uuidString).json")
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
                Self.capture(kind: .crash, summary: summary, details: details)
            }

            for diag in payload.hangDiagnostics ?? [] {
                // Hang duration is the headline number for ranking severity:
                // `0x8BADF00D` watchdog kills and `0xDEAD10CC` background-task
                // overruns both surface here, and the wall-clock duration is
                // the single most useful signal to triage them. Normalise to
                // seconds with one decimal so the toast reads "Hang 5.3s"
                // instead of "Hang 5.341277ms" or similar raw-unit ugliness.
                let seconds = diag.hangDuration.converted(to: .seconds).value
                let summary = String(format: "Hang %.1fs", seconds)
                let details = String(data: diag.jsonRepresentation(), encoding: .utf8) ?? "<binary>"
                Self.capture(kind: .hang, summary: summary, details: details)
            }

            for diag in payload.cpuExceptionDiagnostics ?? [] {
                let summary = "CPU exception"
                let details = String(data: diag.jsonRepresentation(), encoding: .utf8) ?? "<binary>"
                Self.capture(kind: .cpuException, summary: summary, details: details)
            }

            for diag in payload.diskWriteExceptionDiagnostics ?? [] {
                let summary = "Disk-write exception"
                let details = String(data: diag.jsonRepresentation(), encoding: .utf8) ?? "<binary>"
                Self.capture(kind: .diskWriteException, summary: summary, details: details)
            }
        }
    }

    /// MetricKit MÉTRIQUES (distinct des diagnostics) : agrégats DEVICE-RÉELS
    /// livrés ~1×/jour par l'OS. On logge les headline (scrollHitchTimeRatio,
    /// CPU, mémoire pic) et on persiste le JSON complet dans
    /// `Documents/metrickit/` pour export + analyse offline. Le ratio de hitch
    /// scroll est LE signal de jank de rendu sur device réel — impossible à
    /// mesurer sur simulateur (cf. pipeline perf : signposts + MetricKit + xctrace).
    nonisolated func didReceive(_ payloads: [MXMetricPayload]) {
        for payload in payloads {
            let hitch = payload.animationMetrics?.scrollHitchTimeRatio
            let cpu = payload.cpuMetrics?.cumulativeCPUTime
            let peak = payload.memoryMetrics?.peakMemoryUsage
            Logger.crash.info("""
            MetricKit metrics: scrollHitchTimeRatio=\(hitch?.description ?? "n/a", privacy: .public) \
            cpuTime=\(cpu?.description ?? "n/a", privacy: .public) \
            peakMemory=\(peak?.description ?? "n/a", privacy: .public)
            """)
            Self.persistMetricPayload(payload.jsonRepresentation(), end: payload.timeStampEnd)
        }
    }

    /// Écrit le JSON MetricKit dans `Documents/metrickit/` (exportable via
    /// Xcode → Devices & Simulators → Container, ou partagé pour analyse).
    nonisolated private static func persistMetricPayload(_ json: Data, end: Date) {
        guard let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let dir = docs.appendingPathComponent("metrickit", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let name = "metric-\(Int(end.timeIntervalSince1970)).json"
        try? json.write(to: dir.appendingPathComponent(name))
    }
}
