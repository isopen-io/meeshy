import Foundation
import FirebaseCrashlytics

/// `CrashReporting` backend that forwards diagnostics to Firebase
/// Crashlytics. Only instantiated by `AppDelegate` after
/// `FirebaseApp.configure()` has succeeded, so by the time any method
/// runs the underlying Crashlytics instance is guaranteed to exist.
///
/// MetricKit diagnostics are recorded as **non-fatal** errors so they
/// surface in the dashboard alongside live crashes (which Crashlytics
/// captures automatically via its signal/NSException handlers). Each
/// `CrashDiagnostic.Kind` maps to a stable error code so server-side
/// grouping stays sane across releases.
nonisolated struct CrashlyticsReporter: CrashReporting {
    private static let errorDomain = "Meeshy.MetricKit"

    init() {}

    func record(_ diagnostic: CrashDiagnostic) {
        let crashlytics = Crashlytics.crashlytics()

        // The full MetricKit JSON payload is too large for the dashboard
        // summary, but we attach it as a custom key so it shows up under
        // "Keys" on the issue detail page. Truncated to 1024 chars to
        // stay under Crashlytics' per-key limit.
        let truncatedDetails = String(diagnostic.details.prefix(1024))
        crashlytics.setCustomValue(truncatedDetails, forKey: "metrickit_details")
        crashlytics.setCustomValue(diagnostic.kind.rawValue, forKey: "diagnostic_kind")
        crashlytics.setCustomValue(
            ISO8601DateFormatter().string(from: diagnostic.timestamp),
            forKey: "diagnostic_timestamp"
        )

        // Breadcrumb so the diagnostic shows up in the issue's session log
        // even if Crashlytics merges it under an existing fingerprint.
        crashlytics.log("[\(diagnostic.kind.rawValue)] \(diagnostic.summary)")

        let error = NSError(
            domain: Self.errorDomain,
            code: diagnostic.kind.errorCode,
            userInfo: [
                NSLocalizedDescriptionKey: diagnostic.summary,
                "id": diagnostic.id.uuidString
            ]
        )
        crashlytics.record(error: error)
    }

    func setUserID(_ userID: String?) {
        Crashlytics.crashlytics().setUserID(userID ?? "")
    }

    func log(_ message: String) {
        Crashlytics.crashlytics().log(message)
    }
}

private extension CrashDiagnostic.Kind {
    /// Stable numeric identity per kind so dashboard grouping survives
    /// rawValue rename. Append-only — never reuse a code.
    var errorCode: Int {
        switch self {
        case .nsException:          return 1001
        case .crash:                return 1002
        case .hang:                 return 1003
        case .cpuException:         return 1004
        case .diskWriteException:   return 1005
        }
    }
}
