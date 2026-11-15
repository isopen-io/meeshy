import Foundation

/// **Le mode de chiffrement d'une conversation se choisit à sa CRÉATION**
/// (directive porteur ; décision « le mode de chiffrement se choisit à la
/// création » sous `packages/shared/decisions/`).
///
/// Miroir de `creationEncryptionOffer`
/// (`packages/shared/utils/conversation-creation-encryption.ts`) et d'Android
/// `ConversationCreationEncryption.kt` — toute évolution touche les TROIS.
///
/// Le serveur chiffre toujours au repos : « sans chiffrement » n'est pas un
/// choix. Trois modes s'offrent, dans cet ordre :
/// - `server` : le choix de tous, et le défaut d'un utilisateur ordinaire ;
/// - `hybrid` : visible pour tous, il chiffre aujourd'hui comme `server` ;
/// - `e2ee` : réservé, pendant la phase de test, au rôle de plateforme qui peut
///   déjà l'activer (`ANALYST` et plus, #12588). Il est le défaut de ces rôles
///   LÀ OÙ IL FONCTIONNE : un tête-à-tête, sur un client qui sait chiffrer.
///   Ailleurs (groupe, client qui ne lit pas encore le bout en bout) il paraît
///   « bientôt » et le défaut reste `server`.
///
/// Une conversation créée en `e2ee` ne repasse jamais en clair (#12949) : pour
/// échanger autrement, on crée une autre conversation.
public enum ConversationCreationEncryption {

    /// Les modes que `POST /conversations` accepte (`encryptionMode`), dans
    /// l'ordre où l'écran de création les propose.
    public enum Mode: String, CaseIterable, Codable, Sendable, Equatable {
        case server
        case hybrid
        case e2ee
    }

    /// Pourquoi le bout en bout paraît « bientôt » au lieu d'être choisissable.
    public enum Unavailability: String, Sendable, Equatable {
        /// Aucun client n'écrit encore dans un groupe chiffré de bout en bout.
        case groupsNotYet = "groups-not-yet"
        /// Le client qui crée ne sait pas encore lire ET écrire le bout en bout.
        case clientNotYet = "client-not-yet"
    }

    /// Un mode proposé, choisissable ou « bientôt ».
    public struct Choice: Sendable, Equatable {
        public let mode: Mode
        public let available: Bool
        public let unavailability: Unavailability?

        public init(mode: Mode, available: Bool, unavailability: Unavailability?) {
            self.mode = mode
            self.available = available
            self.unavailability = unavailability
        }
    }

    /// Ce que l'écran de création propose, et ce qu'il présélectionne.
    public struct Offer: Sendable, Equatable {
        public let choices: [Choice]
        public let defaultMode: Mode

        public init(choices: [Choice], defaultMode: Mode) {
            self.choices = choices
            self.defaultMode = defaultMode
        }

        /// Le mode `mode` est-il proposé ET choisissable ?
        public func isAvailable(_ mode: Mode) -> Bool {
            choices.contains { $0.mode == mode && $0.available }
        }
    }

    /// Le mode d'une création SANS choix : un ancien client, et toute création
    /// qui ne passe pas par l'écran de création (ouvrir la conversation depuis
    /// un profil, un partage, un transfert). Jamais `e2ee` d'office : ces
    /// chemins portent des pièces jointes que le bout en bout ne scelle pas
    /// encore. La passerelle le pose d'elle-même quand le corps n'en dit rien.
    public static let implicitMode: Mode = .server

    /// Le rôle de plateforme qui peut activer — et donc choisir — le bout en bout.
    public static let endToEndMinimumPlatformRole: PlatformRole = .analyst

    /// `mayChooseEndToEnd` : la casse pliée, un rôle absent ou inconnu fermé
    /// (`globalRoleLevel`, comme `PlatformRole.level(ofRaw:)`).
    public static func mayChooseEndToEnd(platformRole: String?) -> Bool {
        PlatformRole.level(ofRaw: platformRole) >= endToEndMinimumPlatformRole.level
    }

    /// Ce que l'écran de création propose, et ce qu'il présélectionne.
    /// `conversationType` se compare EXACTEMENT à `"direct"`, comme la règle
    /// partagée ; `endToEndSupported` dit si le client qui crée sait lire ET
    /// écrire le bout en bout.
    public static func offer(platformRole: String?, conversationType: String, endToEndSupported: Bool) -> Offer {
        let readable = [offered(.server), offered(.hybrid)]
        guard mayChooseEndToEnd(platformRole: platformRole) else {
            return Offer(choices: readable, defaultMode: .server)
        }
        let unavailability = endToEndUnavailability(conversationType: conversationType, endToEndSupported: endToEndSupported)
        let endToEnd = Choice(mode: .e2ee, available: unavailability == nil, unavailability: unavailability)
        return Offer(choices: readable + [endToEnd], defaultMode: unavailability == nil ? .e2ee : .server)
    }

    private static func offered(_ mode: Mode) -> Choice {
        Choice(mode: mode, available: true, unavailability: nil)
    }

    private static func endToEndUnavailability(conversationType: String, endToEndSupported: Bool) -> Unavailability? {
        if conversationType != "direct" { return .groupsNotYet }
        if !endToEndSupported { return .clientNotYet }
        return nil
    }
}
