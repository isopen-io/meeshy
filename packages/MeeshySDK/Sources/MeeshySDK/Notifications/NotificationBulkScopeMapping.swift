import Foundation

/// Forme SERVEUR du prédicat de masse porté par `notification:read-bulk` et
/// `notification:deleted-bulk` (`{ scope }`).
///
/// Union DISCRIMINÉE côté gateway (`NotificationReadBulkScope` /
/// `NotificationDeletedBulkScope`, `packages/shared/types/notification.ts`),
/// décodée ici telle quelle — `kind` porte le discriminant, les autres champs
/// sont les membres de chaque branche. Le passage à l'énumération iOS est fait
/// par `NotificationBulkScopeMapping`, pure et testable isolément : c'est la
/// SEULE pièce neuve du câblage, le prédicat lui-même vivant déjà dans
/// `NotificationCachePatch`.
public struct NotificationBulkScopePayload: Decodable, Sendable, Equatable {
    public let kind: String
    public let contextKey: String?
    public let contextValue: String?
    public let types: [String]?

    public init(
        kind: String,
        contextKey: String? = nil,
        contextValue: String? = nil,
        types: [String]? = nil
    ) {
        self.kind = kind
        self.contextKey = contextKey
        self.contextValue = contextValue
        self.types = types
    }
}

/// Traduction PURE de la forme serveur vers les types de cache iOS.
///
/// Un marquage en masse ne renvoie aucun id : le gateway annonce le PRÉDICAT
/// qu'il vient d'appliquer, et chaque client le rejoue sur son propre cache.
/// Rejouer un prédicat qu'on n'a pas su traduire serait pire que ne rien
/// faire — d'où le `nil` sur toute forme non représentable, jamais un repli
/// vers `.all`.
public enum NotificationBulkScopeMapping {

    /// `nil` = portée non traduisible → ne rien appliquer.
    ///
    /// `contextKey == "friendRequestId"` tombe dans ce cas : `NotificationReadScope`
    /// n'a pas de branche pour cette clé de contexte, et la fabriquer depuis
    /// `.types([...])` marquerait lues des lignes d'une AUTRE demande.
    public static func readScope(from payload: NotificationBulkScopePayload) -> NotificationReadScope? {
        switch payload.kind {
        case "all":
            return .all
        case "context":
            guard let value = payload.contextValue, !value.isEmpty else { return nil }
            switch payload.contextKey {
            case "conversationId": return .conversation(id: value)
            case "postId": return .post(id: value)
            default: return nil
            }
        case "types":
            guard let types = payload.types, !types.isEmpty else { return nil }
            return .types(types)
        default:
            return nil
        }
    }

    /// La purge en masse n'a qu'UNE forme (`{kind:'read'}`) : elle retire les
    /// lignes DÉJÀ LUES. Toute autre valeur est ignorée plutôt que traitée
    /// comme une purge totale.
    public static func purgesReadRows(_ payload: NotificationBulkScopePayload) -> Bool {
        payload.kind == "read"
    }

    /// Contrepartie pure de `purgesReadRows` sur l'instantané cache : seules
    /// les lignes non lues survivent, dans l'ordre.
    public static func removingRead(_ items: [APINotification]) -> [APINotification] {
        items.filter { !$0.isRead }
    }
}
