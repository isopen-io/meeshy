import Foundation
import Combine
import MeeshySDK

@MainActor
final class VoiceProfileWizardViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var currentStep: VoiceProfileWizardStep = .consent
    @Published var consentStatus: VoiceConsentStatus?
    @Published var profile: VoiceProfile?
    @Published var isLoading = false
    @Published var isUploading = false
    @Published var uploadedCount = 0
    @Published var totalToUpload = 0
    @Published var error: String?
    @Published var ageVerified = false
    @Published var birthDate = Date()

    private let service: VoiceProfileServiceProviding

    init(service: VoiceProfileServiceProviding = VoiceProfileService.shared) {
        self.service = service
    }

    func checkConsent() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let status = try await service.getConsentStatus()
            consentStatus = status
            if status.hasConsent {
                currentStep = .recording
            }
        } catch {
            // First time — no consent yet
        }
    }

    /// Étape 1 → 2 : après acceptation des conditions, on passe à la saisie de la
    /// date de naissance (l'ordre de l'enum est consent → ageVerification →
    /// recording). Le consentement n'est envoyé qu'APRÈS la vérification d'âge.
    func proceedToAgeVerification() {
        error = nil
        currentStep = .ageVerification
    }

    /// Étape 2 → 3 : envoie le consentement AVEC la date de naissance saisie
    /// (YYYY-MM-DD) pour que le gateway porte la vérification d'âge (mineurs),
    /// puis passe à l'enregistrement. Appelé depuis le bouton « Confirmer » de
    /// l'étape de vérification d'âge.
    func grantConsent() async {
        isLoading = true
        defer { isLoading = false }
        error = nil

        do {
            _ = try await service.grantConsent(
                voiceCloningConsent: false,
                birthDate: Self.formatBirthDate(birthDate)
            )
            ageVerified = true
            currentStep = .recording
        } catch {
            self.error = String(localized: "voice.profile.wizard.error.consent", defaultValue: "Erreur lors de l'enregistrement du consentement.", bundle: .main)
        }
    }

    /// Formate une date en `YYYY-MM-DD` (calendrier grégorien, UTC, POSIX) —
    /// le format attendu par le gateway pour `VoiceConsentRequest.birthDate`.
    static func formatBirthDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    func uploadSamples(_ audioDataList: [Data]) async {
        isUploading = true
        uploadedCount = 0
        totalToUpload = audioDataList.count
        error = nil

        currentStep = .processing

        do {
            for audioData in audioDataList {
                let durationMs = estimateDurationMs(from: audioData)
                _ = try await service.uploadSample(audioData: audioData, durationMs: durationMs)
                uploadedCount += 1
            }

            try await Task.sleep(for: .seconds(1))
            let fetchedProfile = try await service.getProfile()
            profile = fetchedProfile
            currentStep = .complete
        } catch {
            self.error = String(localized: "voice.profile.wizard.error.uploadSamples", defaultValue: "Erreur lors de l'envoi des échantillons vocaux.", bundle: .main)
            currentStep = .recording
        }

        isUploading = false
    }

    private func estimateDurationMs(from data: Data) -> Int {
        let bytesPerSecond = 16000
        return max(1000, (data.count * 1000) / bytesPerSecond)
    }
}
