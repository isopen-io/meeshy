import Foundation
import MeeshySDK

/// Ce que la carte d'un lien de fiche MONTRE (#19519, planche `Apercu-Lien` § 2) — décidé une fois, hors de la vue :
/// le nom, le pseudo, l'accent SERVI (choisi, sinon calculé), la bio dans la langue du lecteur, la présence servie
/// et les deux gestes. Sa propre carte ne propose pas « Écrire ».
public nonisolated struct ProfileLinkCardFace: Sendable, Equatable {
    public let userId: String
    public let username: String
    public let name: String
    public let handleText: String
    public let accentHex: String
    public let avatarURL: String?
    public let avatarThumbHash: String?
    public let avatarRing: ServedProfileDecorItem?
    public let bio: ProfileLinkBio?
    public let presence: PresenceState?
    public let offersWrite: Bool

    public init(card: ProfileLinkCard, prism: [String]) {
        userId = card.userId
        username = card.username
        name = card.name
        handleText = "@\(card.username)"
        accentHex = ProfileAccent.hex(chosen: card.profileAccentColor, userId: card.userId, name: card.name)
        avatarURL = card.avatarURL
        avatarThumbHash = card.avatarThumbHash
        avatarRing = card.avatarRing
        bio = card.servedBio(prism: prism)
        presence = card.isOnline.map { UserPresence(isOnline: $0).state }
        offersWrite = !card.isSelf
    }
}
