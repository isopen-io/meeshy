import Foundation
import MeeshySDK

@MainActor
final class VoiceProfileWizardViewModel: ObservableObject {
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

    private let service: VoiceProfileService

    init(service: VoiceProfileService = .shared) {
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

    func grantConsent() async {
        isLoading = true
        defer { isLoading = false }
        error = nil

        do {
            _ = try await service.grantConsent(ageVerification: ageVerified)
            currentStep = .recording
        } catch {
            self.error = "Erreur lors de l'enregistrement du consentement."
        }
    }

    func confirmAgeVerification() {
        ageVerified = true
        currentStep = .consent
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
            self.error = "Erreur lors de l'envoi des echantillons vocaux."
            currentStep = .recording
        }

        isUploading = false
    }

    private func estimateDurationMs(from data: Data) -> Int {
        let bytesPerSecond = 16000
        return max(1000, (data.count * 1000) / bytesPerSecond)
    }
}
