#if DEBUG
import Foundation
import MeeshySDK

nonisolated enum VitrineFixturesErreur: Error, Equatable {
    case versionInconnue(Int)
}

/// Le contenu d'une vitrine, exporté par le kit (`scripts/marketing-kit/vitrine/fixtures.mjs`)
/// au format EXACT des réponses de la passerelle, et lu par le décodeur de PRODUCTION.
nonisolated struct VitrineFixtures: Decodable, Sendable {
    static let versionAttendue = 2

    /// Un média que le script de capture dépose dans `Documents/vitrine/medias/`, et que l'app range
    /// sous l'URL que portent ses messages et ses posts.
    nonisolated struct Media: Decodable, Sendable, Equatable {
        nonisolated enum Genre: String, Decodable, Sendable {
            case image
            case audio
            /// La vidéo du réel que la scène `interaction-reel` publie (#9820).
            case video
            /// Un genre qu'un kit plus récent émet et que cette app ne connaît pas encore : le média est ignoré, jamais
            /// la vitrine entière — une valeur inconnue faisait tomber le décodage, donc TOUTES les scènes.
            case inconnu

            init(from decoder: Decoder) throws {
                self = Genre(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .inconnu
            }
        }

        let url: String
        let fichier: String
        let genre: Genre
    }

    /// Ce qu'une scène ouvre : sa conversation, et le message ou la pièce qu'elle met en avant.
    nonisolated struct Destination: Decodable, Sendable, Equatable {
        let conversationId: String
        let messageId: String?
        let attachmentId: String?
    }

    let version: Int
    let lang: String
    let lecteur: MeeshyUser
    let conversations: [APIConversation]
    let messages: [String: [APIMessage]]
    let progression: APIEngagementProgress
    let lienInvitation: ShareLinkInfo
    let modesDeLecture: [String: String]
    let medias: [Media]
    let posts: [APIPost]
    /// Les réels drôles que la scène `interaction-defilement` fait défiler (#9904) — absents d'un kit plus ancien.
    let reels: [APIPost]?
    /// La story que la scène `interaction-story` ouvre (#9904) — absente d'un kit plus ancien.
    let stories: [APIPost]?
    let scenes: [String: Destination]

    func destination(_ scene: VitrineScene) -> Destination? {
        scenes[scene.rawValue]
    }

    /// Les conversations telles que la vitrine les range et les ouvre : sans mode de chiffrement.
    /// `toConversation` en pose un sur toute conversation directe ; la traduction serveur est coupée
    /// en E2EE, et un cadenas sur un écran traduit est hors champ (spec § 2).
    func conversationsServies() -> [MeeshyConversation] {
        conversations.map { api in
            var conversation = api.toConversation(currentUserId: lecteur.id)
            conversation.encryptionMode = nil
            return conversation
        }
    }

    static func decoder(_ data: Data) throws -> VitrineFixtures {
        let fixtures = try APIClient.makeAPIPayloadDecoder().decode(VitrineFixtures.self, from: data)
        guard fixtures.version == versionAttendue else { throw VitrineFixturesErreur.versionInconnue(fixtures.version) }
        return fixtures
    }

    static func charger(depuis url: URL = VitrineLaunch.fichierFixtures) throws -> VitrineFixtures {
        try decoder(Data(contentsOf: url))
    }
}
#endif
