import Foundation

// MARK: - L'accusé d'une invitation présentée (#20649, `photoMomentsPresentedRequestSchema`)
//
// Un protocole à part, jamais une extension de `GameServiceProviding` : les doubles de test existants n'ont pas à
// le connaître. Le `requestId` est généré UNE fois par intention ; un rejeu rend la date de la PREMIÈRE présentation.

public struct PhotoMomentsPresentedResponse: Codable, Sendable, Equatable {
    public struct Entry: Codable, Sendable, Equatable {
        public let stepId: String
        public let presentedAt: String

        public init(stepId: String, presentedAt: String) {
            self.stepId = stepId
            self.presentedAt = presentedAt
        }
    }

    public let presented: [Entry]

    public init(presented: [Entry]) {
        self.presented = presented
    }
}

struct PhotoMomentsPresentedRequest: Encodable {
    let requestId: String
    let stepIds: [String]
}

public protocol GamePhotoRegistryProviding: Sendable {
    /// Un lot de `GamePhotoRegistry.presentedBatches` : une présentation sur un appareil ne repart ni sur un autre,
    /// ni en push.
    func acknowledgePhotoMomentsPresented(_ stepIds: [String], requestId: String) async throws -> PhotoMomentsPresentedResponse
}
