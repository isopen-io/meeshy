import Foundation
import MeeshySDK

/// La fenêtre système des notifications ne sert qu'UNE fois (#7915). Tant que
/// l'onboarding peut encore la proposer dans son contexte — la carte 5, après
/// un geste qui a produit de quoi être notifié —, aucune autre entrée ne la
/// consomme : ni la connexion, ni le premier message, ni le démarrage à froid.
@MainActor
protocol OnboardingPushPermissionGating: AnyObject {
    /// `reportPending` : un report posé à l'inscription attend encore son
    /// premier message — il garde la fenêtre à lui seul.
    func holdsPushPermission(reportPending: Bool) async -> Bool
}

@MainActor
final class OnboardingPushPermissionGate: OnboardingPushPermissionGating {
    nonisolated deinit {}

    private let service: any OnboardingServiceProviding
    private let settled: any OnboardingSettledStoring
    private let permission: any OnboardingNotificationPermitting
    private let currentUserId: () -> String?

    init(
        service: any OnboardingServiceProviding = OnboardingService.shared,
        settled: any OnboardingSettledStoring = UserDefaultsOnboardingSettledStore(),
        permission: (any OnboardingNotificationPermitting)? = nil,
        currentUserId: (() -> String?)? = nil
    ) {
        self.service = service
        self.settled = settled
        self.permission = permission ?? SystemOnboardingNotificationPermission()
        self.currentUserId = currentUserId ?? { AuthManager.shared.currentUser?.id }
    }

    /// Ne garde que ce qui peut se perdre : une fenêtre déjà tranchée (accordée
    /// ou refusée) ne se garde pas — la séquence doit pouvoir (re)déclarer
    /// l'appareil. Un état illisible GARDE : une demande reportée se rattrape
    /// au premier message, une fenêtre gaspillée jamais.
    func holdsPushPermission(reportPending: Bool) async -> Bool {
        guard await permission.currentStatus() == .notDetermined else { return false }
        if reportPending { return true }
        guard let userId = currentUserId(), !settled.isSettled(userId: userId) else { return false }
        guard let state = try? await service.fetchState() else { return true }
        return state.eligible && state.completedAt == nil && !state.seenSteps.contains(.notifications)
    }
}
