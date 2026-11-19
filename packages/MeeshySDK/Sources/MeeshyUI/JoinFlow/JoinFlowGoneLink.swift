import Foundation
import MeeshySDK

/// Ce que l'écran « Ce lien n'est plus valable » (planche `Etat-Erreur` vue 3) sait du lien perdu. Rien quand le
/// lien est mort dès l'ouverture : la réponse 410 ne porte encore ni titre, ni adresse, ni créateur. L'aperçu déjà
/// servi quand il meurt entre l'aperçu et l'envoi. Chaque morceau absent retire sa pièce de l'écran, jamais l'écran.
public nonisolated struct JoinFlowGoneLink: Equatable, Sendable {
    public nonisolated struct Creator: Equatable, Sendable {
        public let name: String
        public let firstName: String
        public let username: String
        public let avatar: String?
    }

    public let title: String?
    public let linkId: String
    public let creator: Creator?

    public init?(info: ShareLinkInfo?) {
        guard let info else { return nil }
        title = Self.trimmed(info.conversation.title) ?? Self.trimmed(info.name)
        linkId = info.linkId
        creator = Creator(info.creator)
    }

    static func trimmed(_ text: String?) -> String? {
        guard let value = text?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
        return value
    }
}

extension JoinFlowGoneLink.Creator {
    nonisolated init?(_ creator: ShareLinkCreator) {
        let username = creator.username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !username.isEmpty else { return nil }
        let firstName = JoinFlowGoneLink.trimmed(creator.firstName)
            ?? creator.name.split(separator: " ").first.map(String.init)
            ?? username
        self.init(name: creator.name, firstName: firstName, username: username, avatar: creator.avatar)
    }
}
