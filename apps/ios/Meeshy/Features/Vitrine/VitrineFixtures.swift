#if DEBUG
import Foundation
import MeeshySDK

nonisolated enum VitrineFixturesErreur: Error, Equatable {
    case versionInconnue(Int)
}

/// Le contenu d'une vitrine, exporté par le kit (`scripts/marketing-kit/vitrine/fixtures.mjs`)
/// au format EXACT des réponses de la passerelle, et lu par le décodeur de PRODUCTION.
nonisolated struct VitrineFixtures: Decodable, Sendable {
    static let versionAttendue = 1

    let version: Int
    let lang: String
    let lecteur: MeeshyUser
    let conversations: [APIConversation]
    let messages: [String: [APIMessage]]
    let progression: APIEngagementProgress
    let lienInvitation: ShareLinkInfo
    let modesDeLecture: [String: String]

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
