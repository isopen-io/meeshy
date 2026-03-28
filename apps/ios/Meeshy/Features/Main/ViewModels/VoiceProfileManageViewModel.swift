import Foundation
import MeeshySDK

@MainActor
final class VoiceProfileManageViewModel: ObservableObject {
    @Published var profile: VoiceProfile?
    @Published var samples: [VoiceSample] = []
    @Published var consentStatus: VoiceConsentStatus?
    @Published var isLoading = false
    @Published var isCloningEnabled = false
    @Published var error: String?

    private let service: VoiceProfileService

    init(service: VoiceProfileService = .shared) {
        self.service = service
    }

    func loadProfile() async {
        isLoading = true
        defer { isLoading = false }

        do {
            async let fetchedProfile = service.getProfile()
            async let fetchedSamples = service.getSamples()
            async let fetchedConsent = service.getConsentStatus()

            let (p, s, c) = try await (fetchedProfile, fetchedSamples, fetchedConsent)
            profile = p
            samples = s
            consentStatus = c
            isCloningEnabled = c.voiceCloningEnabled
        } catch {
            self.error = "Impossible de charger le profil vocal."
        }
    }

    func toggleCloning(enabled: Bool) async {
        let previous = isCloningEnabled
        isCloningEnabled = enabled

        do {
            try await service.toggleVoiceCloning(enabled: enabled)
        } catch {
            isCloningEnabled = previous
            self.error = "Erreur lors du changement de statut du clonage."
        }
    }

    func deleteSample(id: String) async {
        let snapshot = samples
        samples.removeAll { $0.id == id }

        do {
            try await service.deleteSample(sampleId: id)
        } catch {
            samples = snapshot
            self.error = "Erreur lors de la suppression de l'echantillon."
        }
    }

    func deleteProfile() async {
        isLoading = true
        defer { isLoading = false }

        do {
            try await service.deleteProfile()
            profile = nil
            samples = []
            isCloningEnabled = false
        } catch {
            self.error = "Erreur lors de la suppression du profil."
        }
    }

    func uploadAdditionalSamples(_ audioDataList: [Data]) async {
        do {
            for audioData in audioDataList {
                let durationMs = max(1000, (audioData.count * 1000) / 16000)
                _ = try await service.uploadSample(audioData: audioData, durationMs: durationMs)
            }
            await loadProfile()
        } catch {
            self.error = "Erreur lors de l'envoi des echantillons."
        }
    }
}
