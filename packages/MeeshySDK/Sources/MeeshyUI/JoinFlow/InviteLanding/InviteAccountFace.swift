import Foundation

/// Le visage du compte connecté sur le choix « Rejoindre avec mon compte » :
/// sa photo si elle est servie, sinon ses initiales (jamais les deux).
public struct InviteAccountFace: Equatable, Sendable {
    public let name: String
    public let avatarURL: String?

    public init(name: String, avatarURL: String?) {
        self.name = name
        self.avatarURL = avatarURL
    }
}
