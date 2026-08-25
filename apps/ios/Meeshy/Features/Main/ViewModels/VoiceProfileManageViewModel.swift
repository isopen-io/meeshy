import Foundation
import Combine
import MeeshySDK

@MainActor
final class VoiceProfileManageViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var profile: VoiceProfile?
    @Published var samples: [VoiceSample] = []
    @Published var consentStatus: VoiceConsentStatus?
    @Published var isLoading = false
    @Published var isCloningEnabled = false
    @Published var isVoicePublic = false
    @Published var error: String?

    private let service: VoiceProfileServiceProviding
    private let userService: UserServiceProviding
    private let authManager: AuthManaging

    init(
        service: VoiceProfileServiceProviding = VoiceProfileService.shared,
        userService: UserServiceProviding = UserService.shared,
        authManager: AuthManaging = AuthManager.shared
    ) {
        self.service = service
        self.userService = userService
        self.authManager = authManager
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
            isVoicePublic = authManager.currentUser?.voicePublic ?? false
        } catch {
            self.error = String(localized: "voice.profile.error.load", defaultValue: "Impossible de charger le profil vocal.", bundle: .main)
        }
    }

    func toggleVoicePublic(enabled: Bool) async {
        let previous = isVoicePublic
        isVoicePublic = enabled

        do {
            _ = try await userService.updateProfile(UpdateProfileRequest(voicePublic: enabled))
            // Refléter le changement confirmé sur currentUser : sinon une réouverture
            // (loadProfile lit authManager.currentUser?.voicePublic) restaurerait la
            // valeur stale et le toggle « sauterait » en arrière.
            authManager.applyLocalVoicePublicChange(enabled)
        } catch {
            isVoicePublic = previous
            self.error = String(localized: "voice.profile.error.visibility", defaultValue: "Erreur lors du changement de visibilité du profil vocal.", bundle: .main)
        }
    }

    func toggleCloning(enabled: Bool) async {
        let previous = isCloningEnabled
        isCloningEnabled = enabled

        do {
            try await service.toggleVoiceCloning(enabled: enabled)
        } catch {
            isCloningEnabled = previous
            self.error = String(localized: "voice.profile.error.cloning", defaultValue: "Erreur lors du changement de statut du clonage.", bundle: .main)
        }
    }

    func deleteSample(id: String) async {
        let snapshot = samples
        samples.removeAll { $0.id == id }

        do {
            try await service.deleteSample(sampleId: id)
        } catch {
            samples = snapshot
            self.error = String(localized: "voice.profile.error.deleteSample", defaultValue: "Erreur lors de la suppression de l'échantillon.", bundle: .main)
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
            self.error = String(localized: "voice.profile.error.deleteProfile", defaultValue: "Erreur lors de la suppression du profil.", bundle: .main)
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
            self.error = String(localized: "voice.profile.error.uploadSamples", defaultValue: "Erreur lors de l'envoi des échantillons.", bundle: .main)
        }
    }
}
