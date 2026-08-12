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

        // Breadcrumb so the diagnostic shows up in the issue's session log
        // even if Crashlytics merges it under an existing fingerprint.
        crashlytics.log("[\(diagnostic.kind.rawValue)] \(diagnostic.summary)")

        // All per-diagnostic metadata travels inside NSError.userInfo so
        // that batch delivery (MetricKit often sends N diagnostics in one
        // payload) doesn't overwrite global custom keys — each
        // `record(error:)` carries its own self-contained context.
        let truncatedDetails = String(diagnostic.details.prefix(900))
        let error = NSError(
            domain: Self.errorDomain,
            code: diagnostic.kind.errorCode,
            userInfo: [
                NSLocalizedDescriptionKey: diagnostic.summary,
                "diagnostic_id": diagnostic.id.uuidString,
                "diagnostic_kind": diagnostic.kind.rawValue,
                "diagnostic_timestamp": diagnostic.timestamp.formatted(.iso8601),
                "metrickit_details": truncatedDetails
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

extension CrashDiagnostic.Kind {
    /// Stable numeric identity per kind so dashboard grouping survives
    /// rawValue rename. Append-only — never reuse a code.
    nonisolated var errorCode: Int {
        switch self {
        case .nsException:          return 1001
        case .crash:                return 1002
        case .hang:                 return 1003
        case .cpuException:         return 1004
        case .diskWriteException:   return 1005
        }
    }
}
