import Foundation

/// Ce que l'interface DIT du chiffrement d'une conversation (décision porteur
/// #11374, #11381).
///
/// `e2ee` est le seul régime « de bout en bout » : le serveur n'y lit rien.
/// `server` et `hybrid` sont chiffrés AU REPOS — la passerelle stocke le chiffré
/// et le lit pour traduire et servir — et se disent « Chiffré sur le serveur ».
/// La loi d'actions (`DeviceTranslationEligibility.serverReadsMessage`) ne change
/// pas : ces deux modes restent lisibles par le serveur.
public enum ConversationEncryptionBadge: String, Sendable, Equatable, CaseIterable {
    case endToEnd
    case server

    /// Le mode arrive avec la casse et les blancs de son émetteur ; un mode
    /// inconnu ne s'annonce pas.
    public init?(encryptionMode: String?) {
        switch (encryptionMode ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "e2ee":
            self = .endToEnd
        case "server", "hybrid":
            self = .server
        default:
            return nil
        }
    }

    /// La clé du catalogue de l'application (`Localizable.xcstrings`).
    public var localizationKey: String {
        switch self {
        case .endToEnd:
            return "conversation.encryption.endToEnd"
        case .server:
            return "conversation.encryption.server"
        }
    }

    /// Le libellé source (français), repli de la clé.
    public var defaultLabel: String {
        switch self {
        case .endToEnd:
            return "Chiffré de bout en bout"
        case .server:
            return "Chiffré sur le serveur"
        }
    }

    /// Le symbole SF qui accompagne le libellé.
    public var systemImage: String {
        switch self {
        case .endToEnd:
            return "lock.fill"
        case .server:
            return "lock.icloud.fill"
        }
    }
}
