import SwiftUI
import MeeshySDK

// MARK: - « Envoyer son profil » sur la fiche d'un autre (#19442, planches `Autre-Liens` et `Autre-Actions`)
//
// La feuille d'envoi Meeshy (« Voilà ce que ton ami recevra », la carte, les amis suggérés, « Envoyer à … ») vit dans
// l'app, comme pour ma propre fiche. Le SDK remet à l'hôte ce qui compose la carte de la personne ; sans hôte, le geste
// garde la feuille de partage du système. Sans pseudo, il n'y a pas d'adresse, donc rien à envoyer.

/// La carte de profil que l'hôte envoie : son identifiant, son nom, son pseudo, son avatar, sa bio et son adresse.
public nonisolated struct ProfileSendRequest: Equatable, Sendable {
    public let userId: String
    public let displayName: String
    public let username: String
    public let avatarURL: String?
    public let bio: String?
    public let url: URL

    public init(userId: String, displayName: String, username: String, avatarURL: String?, bio: String?, url: URL) {
        self.userId = userId
        self.displayName = displayName
        self.username = username
        self.avatarURL = avatarURL
        self.bio = bio
        self.url = url
    }
}

/// Les sorties de la feuille d'envoi : la refermer, ou quitter aussi la fiche (« Ouvrir » la conversation envoyée).
public struct ProfileSendExits {
    public let close: () -> Void
    public let closeProfile: () -> Void

    public init(close: @escaping () -> Void, closeProfile: @escaping () -> Void) {
        self.close = close
        self.closeProfile = closeProfile
    }
}

/// La feuille d'envoi que l'app fournit : pour une carte de profil et ses sorties, sa vue.
public struct ProfileSendSheet {
    public let build: (ProfileSendRequest, ProfileSendExits) -> AnyView

    public init(build: @escaping (ProfileSendRequest, ProfileSendExits) -> AnyView) {
        self.build = build
    }
}

private struct ProfileSendSheetKey: EnvironmentKey {
    static let defaultValue: ProfileSendSheet? = nil
}

public extension EnvironmentValues {
    /// La feuille d'envoi Meeshy de l'app ; `nil` : « Envoyer son profil » ouvre la feuille de partage du système.
    var profileSendSheet: ProfileSendSheet? {
        get { self[ProfileSendSheetKey.self] }
        set { self[ProfileSendSheetKey.self] = newValue }
    }
}

/// Par où part un profil : la feuille Meeshy de l'app, sinon celle du système.
nonisolated enum ProfileSendRoute: Equatable, Sendable {
    case meeshy(ProfileSendRequest)
    case system(URL)

    /// Sans pseudo, rien ; sans hôte ou sans identifiant (la carte n'aurait pas de contenu), la feuille du système.
    static func resolve(userId: String?, displayName: String, link: ProfileLink?, avatarURL: String?, bio: String?,
                        hostOffered: Bool) -> ProfileSendRoute? {
        guard let link else { return nil }
        guard hostOffered, let userId = present(userId) else { return .system(link.url) }
        return .meeshy(ProfileSendRequest(
            userId: userId, displayName: present(displayName) ?? link.username, username: link.username,
            avatarURL: present(avatarURL), bio: present(bio), url: link.url
        ))
    }

    private static func present(_ value: String?) -> String? {
        let trimmed = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

/// Le contenu de la feuille « Envoyer son profil » : la feuille Meeshy de l'hôte, sinon celle du système.
struct ProfileSendPresentation: View {
    let route: ProfileSendRoute?
    let host: ProfileSendSheet?
    let exits: ProfileSendExits

    var body: some View {
        switch route {
        case .some(.meeshy(let request)):
            if let host {
                host.build(request, exits)
            } else {
                ProfileActivitySheet(items: [request.url])
                    .presentationDetents([.medium, .large])
            }
        case .some(.system(let url)):
            ProfileActivitySheet(items: [url])
                .presentationDetents([.medium, .large])
        case .none:
            EmptyView()
        }
    }
}
