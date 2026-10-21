import Foundation
import UIKit

/// Les DONNÉES de l'étage `fallback` — jamais une phrase.
///
/// Le client les formate avec sa propre i18n : la phrase naît déjà dans la
/// langue du lecteur, donc il n'y a rien à traduire et un changement de
/// langue la reformate sans aller-retour serveur.
///
/// Miroir Swift de `ConversationBridgeData`
/// (`packages/shared/types/conversation-bridge.ts`). `authors` est plafonné
/// à 2 côté serveur (`.max(2)` dans le schéma Zod) et le surplus voyage
/// dans `extraAuthorCount` — le « +N » de la ligne.
public struct ConversationBridgeData: Codable, Equatable, Sendable {
    public let authors: [String]
    public let extraAuthorCount: Int
    public let messageCount: Int
    public let mediaCounts: ConversationBridgeMediaCounts?

    public init(authors: [String] = [], extraAuthorCount: Int = 0,
                messageCount: Int = 0, mediaCounts: ConversationBridgeMediaCounts? = nil) {
        self.authors = authors
        self.extraAuthorCount = extraAuthorCount
        self.messageCount = messageCount
        self.mediaCounts = mediaCounts
    }

    private enum CodingKeys: String, CodingKey {
        case authors, extraAuthorCount, messageCount, mediaCounts
    }
}
