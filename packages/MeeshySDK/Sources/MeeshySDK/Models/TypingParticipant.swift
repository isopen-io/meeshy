import Foundation

/// Quelqu'un en train d'écrire, tel que les surfaces de frappe l'affichent.
///
/// Le fil ne transporte PAS d'avatar : `TypingEvent` (gateway) ne porte que
/// `userId`, `username` et `displayName`. L'avatar est donc résolu LOCALEMENT
/// par le client, depuis ce qu'il connaît déjà de cette personne — le
/// `senderAvatarURL` de ses messages en mémoire. Local-First : aucune requête
/// n'est déclenchée pour afficher un indicateur de frappe, et `avatarURL` reste
/// `nil` quand rien de local ne le renseigne (l'auteur n'a encore rien écrit
/// dans ce fil). Les vues retombent alors sur les initiales déterministes.
///
/// Un seul type pour les deux surfaces qui montrent une frappe DANS une
/// conversation — la rangée en bas du fil (`TypingIndicatorBubble`) et le
/// bouton de retour au bas (`ConversationScrollControlsView`). Elles montraient
/// auparavant deux projections différentes d'un même `[String]` de noms, ce qui
/// interdisait à l'une comme à l'autre de porter un visage.
public struct TypingParticipant: Identifiable, Equatable, Sendable {
    /// `userId` — jamais le nom : deux membres d'un groupe peuvent partager un
    /// nom d'affichage, et c'est par cette clé que le roster les distingue.
    public let id: String
    public let displayName: String
    public let avatarURL: String?

    public init(id: String, displayName: String, avatarURL: String? = nil) {
        self.id = id
        self.displayName = displayName
        self.avatarURL = avatarURL
    }
}

public extension Array where Element == TypingParticipant {
    /// Noms seuls — pour les consommateurs qui n'affichent pas de visage
    /// (libellé d'accessibilité, empreinte de roster du diffable datasource).
    var displayNames: [String] { map(\.displayName) }
}
