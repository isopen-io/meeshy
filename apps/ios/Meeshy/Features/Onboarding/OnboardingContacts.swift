import Foundation
import Contacts
import MeeshySDK

// MARK: - Retrouver ses amis depuis le carnet (#8105)

/// Où en est la proposition « retrouver tes amis » de la carte 4.
///
/// Le carnet sert à DEUX choses, et deux seulement (décision porteur #8106) :
/// relier l'utilisateur aux amis qui sont déjà sur Meeshy, et le prévenir quand
/// un autre arrive (`contact_joined`). Aucun démarchage : « Inviter » reste un
/// SMS que l'utilisateur envoie lui-même.
enum OnboardingContactsPhase: Equatable {
    /// L'appareil interdit le carnet (contrôle parental, profil géré) : la
    /// proposition n'existe pas — aucun bouton sans effet.
    case unavailable
    /// La proposition : « Retrouver mes amis » ou « Plus tard ».
    case offer
    case searching
    /// Carnet rapproché. Vide : message positif et « Inviter ».
    case found([APIOnboardingSuggestion])
    /// « Plus tard » sur la proposition, ou refus à la fenêtre système : la
    /// carte retombe sur ses suggestions, inchangées.
    case declined
    /// Refus système ANTÉRIEUR au parcours : la fenêtre ne s'ouvrira plus, seul
    /// Réglages peut rendre l'accès — la carte y mène.
    case deniedBySystem
    /// La synchronisation a échoué : on peut réessayer.
    case failed
}

enum OnboardingContacts {
    /// La phase de départ, lue sur l'autorisation courante. Un accès DÉJÀ
    /// accordé part aussi de `.offer` : le modèle lance la recherche à
    /// l'arrivée sur la carte, sans rien redemander.
    static func initialPhase(for status: CNAuthorizationStatus) -> OnboardingContactsPhase {
        switch status {
        case .denied: return .deniedBySystem
        case .restricted: return .unavailable
        default: return .offer
        }
    }

    /// La proposition justifie à elle seule la carte 4, suggestions absentes :
    /// seulement si le geste peut aboutir sans passer par Réglages.
    static func isOfferable(_ status: CNAuthorizationStatus) -> Bool {
        switch status {
        case .denied, .restricted: return false
        default: return true
        }
    }

    /// Accès accordé AVANT la carte : la recherche part d'elle-même.
    static func searchesOnArrival(_ status: CNAuthorizationStatus) -> Bool {
        switch status {
        case .authorized: return true
        default:
            if #available(iOS 18.0, *), status == .limited { return true }
            return false
        }
    }

    /// Les amis trouvés, prêts pour la carte : un par compte, jamais soi-même,
    /// sous le nom que l'utilisateur leur donne dans SON carnet.
    static func friends(from contacts: [DirectoryContact], excluding selfId: String?) -> [APIOnboardingSuggestion] {
        var seen: Set<String> = []
        return contacts
            .compactMap { contact -> APIOnboardingSuggestion? in
                guard contact.isOnMeeshy, let user = contact.matchedUser, user.id != selfId else { return nil }
                return APIOnboardingSuggestion(
                    id: user.id,
                    username: user.username,
                    displayName: contact.resolvedName,
                    avatarUrl: user.avatar,
                    languages: []
                )
            }
            .filter { seen.insert($0.id).inserted }
            .sorted { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }
    }

    /// Les rangées de la carte : les amis trouvés d'abord, puis les suggestions
    /// qui ne les répètent pas.
    static func rows(found: [APIOnboardingSuggestion], suggestions: [APIOnboardingSuggestion]) -> [APIOnboardingSuggestion] {
        let foundIds = Set(found.map(\.id))
        return found + suggestions.filter { !foundIds.contains($0.id) }
    }
}
