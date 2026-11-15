import Foundation
import LocalAuthentication

// MARK: - La biométrie (#11388)

nonisolated enum BiometricKind: Equatable, Sendable {
    case faceID
    case touchID
    case other

    var systemImage: String {
        switch self {
        case .faceID: return "faceid"
        case .touchID: return "touchid"
        case .other: return "person.badge.key.fill"
        }
    }
}

@MainActor
protocol BiometricUnlocking {
    func availableKind() -> BiometricKind?
    /// Empreinte de l'ensemble des visages / doigts enrôlés : elle change dès
    /// qu'on en ajoute ou retire un.
    func enrollmentState() -> Data?
    func authenticate(reason: String) async -> Bool
}

struct DeviceBiometricUnlocker: BiometricUnlocking {
    func availableKind() -> BiometricKind? {
        let context = LAContext()
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else { return nil }
        switch context.biometryType {
        case .faceID: return .faceID
        case .touchID: return .touchID
        case .none: return nil
        default: return .other
        }
    }

    func enrollmentState() -> Data? {
        let context = LAContext()
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else { return nil }
        return context.evaluatedPolicyDomainState
    }

    func authenticate(reason: String) async -> Bool {
        let context = LAContext()
        context.localizedFallbackTitle = ""
        let verdict = try? await context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason)
        return verdict ?? false
    }
}
