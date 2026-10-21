import Foundation
import MeeshySDK

protocol VoiceConsentGateProviding {
    var isKnownGranted: Bool { get }
    func fetchMissing() async -> Bool
    func grant() async throws
}

/// Le consentement au clonage vocal, lu et octroyé : les consentements que la
/// passerelle a CONFIRMÉS d'abord (`PUT /me/consents` à l'octroi, `GET
/// /me/consents` à chaque relecture des préférences — #6624), le statut REST
/// voice-profile en repli, pour un compte dont la relecture n'a pas encore eu
/// lieu sur cet appareil.
struct VoiceConsentGate: VoiceConsentGateProviding {
    var knownGranted: () -> Bool = { UserPreferencesManager.shared.voiceConsentGranted }
    var fetchHasConsent: () async throws -> Bool = { try await VoiceProfileService.shared.getConsentStatus().hasConsent }
    var route: () async throws -> Void = { try await UserPreferencesManager.shared.grantVoiceAutoTranslationConsent() }

    var isKnownGranted: Bool { knownGranted() }

    func fetchMissing() async -> Bool {
        await Self.missing(fetchHasConsent)
    }

    func grant() async throws {
        try await route()
    }

    /// Pure, testable: maps a `hasConsent` fetch to "missing", fail-safe to false.
    nonisolated static func missing(_ fetchHasConsent: () async throws -> Bool) async -> Bool {
        do { return try await !fetchHasConsent() } catch { return false }
    }
}
