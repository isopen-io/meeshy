import Foundation
import UserNotifications
import MeeshySDK

// MARK: - Ce que le parcours montre

/// La carte à l'écran : une des cinq étapes du contrat, ou le récapitulatif
/// final (qui n'est pas une étape — le serveur ne le compte pas).
enum OnboardingCard: Hashable {
    case step(OnboardingStepId)
    case recap
}

/// L'état de l'envoi du salut dans Meeshy Global.
enum OnboardingSendState: Equatable {
    case idle
    case sending
    case sent
    case failed
}

/// Un « +N » à faire s'envoler vers la pastille de points. L'identité change à
/// chaque gain : deux gains égaux de suite restent deux envolées.
struct OnboardingReward: Equatable, Identifiable {
    let id: Int
    let points: Int
}

/// Ce que le récapitulatif affiche. `streakDays` et `badges` sont `nil` quand
/// la progression serveur n'a pas pu être relue : on n'affiche alors QUE les
/// points gagnés pendant la session, jamais une série ou des badges inventés.
struct OnboardingRecap: Equatable {
    let points: Int
    let level: Int
    let streakDays: Int?
    let badges: Int?
}

// MARK: - Le barème, lu depuis le catalogue d'engagement

/// Les gains annoncés par les cartes. Ils ne sont pas recopiés : ils se
/// DÉRIVENT du barème par famille (`EngagementCatalog.familyWeights`, miroir
/// gardé du catalogue TypeScript). Un réglage du barème change donc aussi ce
/// que l'onboarding annonce, sans qu'il faille s'en souvenir ici.
enum OnboardingRewards {
    private static func weight(_ family: EngagementAxisFamily) -> Int {
        EngagementCatalog.familyWeights[family] ?? 0
    }

    /// Premier message (contenu) + premier message dans cette conversation.
    static var greeting: Int { weight(.content) + weight(.conversation) }
    /// Première story (contenu) + publication directe (outil).
    static var story: Int { weight(.content) + weight(.tool) }
    /// Une amitié acceptée — créditée aux DEUX, à l'acceptation seulement.
    static var friendship: Int { weight(.social) }
    /// Le seuil du premier niveau.
    static var firstLevel: Int { EngagementCatalog.levelThresholds.first ?? 10 }

    static func level(for score: Int) -> Int {
        EngagementCatalog.levelThresholds.filter { $0 <= score }.count
    }
}

// MARK: - L'ordre des cartes

/// La règle pure qui décide quelles cartes restent à montrer.
enum OnboardingFlow {
    /// Les étapes « geste », dans l'ordre. La carte notifications n'en fait pas
    /// partie : elle n'est proposée qu'APRÈS, et seulement si un geste a produit
    /// de quoi être notifié (leçon du carrousel #5218).
    static let gestureSteps: [OnboardingStepId] = [.languages, .global, .story, .friends]

    /// Les étapes qui PEUVENT appeler une réponse — celles qui justifient de
    /// proposer les notifications.
    static let productiveSteps: Set<OnboardingStepId> = [.global, .story, .friends]

    static func pendingGestureSteps(for state: APIOnboardingState) -> [OnboardingStepId] {
        let settled = Set(state.seenSteps).union(state.prefilledSteps)
        return gestureSteps.filter { step in
            guard !settled.contains(step) else { return false }
            switch step {
            case .global: return state.globalConversationId != nil
            case .friends: return !state.suggestions.isEmpty
            case .languages, .story, .notifications: return true
            }
        }
    }

    static func alreadyProduced(_ state: APIOnboardingState) -> Bool {
        !productiveSteps.isDisjoint(with: state.prefilledSteps)
    }
}

// MARK: - La permission de notification

enum OnboardingNotificationStatus: Equatable {
    case notDetermined
    case authorized
    case denied
}

/// La fenêtre système ne sert qu'UNE fois : on ne la gaspille pas. Ce protocole
/// sépare « savoir si elle a déjà servi » de « l'ouvrir », pour qu'un témoin
/// prouve qu'un « Pas maintenant » ne l'ouvre jamais.
protocol OnboardingNotificationPermitting: AnyObject {
    func currentStatus() async -> OnboardingNotificationStatus
    func request() async -> Bool
}

final class SystemOnboardingNotificationPermission: OnboardingNotificationPermitting {
    nonisolated deinit {}

    func currentStatus() async -> OnboardingNotificationStatus {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined: return .notDetermined
        case .denied: return .denied
        default: return .authorized
        }
    }

    /// Le « Oui » de la carte. Le report posé à l'inscription
    /// (`PushPermissionDeferral`) est soldé ICI : sinon le premier message
    /// envoyé plus tard redemanderait une permission déjà tranchée.
    func request() async -> Bool {
        PushPermissionDeferral.shared.resolve()
        await PushPermissionPrompt.requestIfNeeded()
        return PushNotificationManager.shared.isAuthorized
    }
}
