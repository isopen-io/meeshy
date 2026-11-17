import Foundation

/// L'identifiant de compte tel que l'E2EE le COMPARE (IOS-18, #18950).
///
/// Un identifiant de compte est un ObjectId, qu'une base Mongo résout quelle
/// que soit sa casse : « moi » se reconnaît donc sans casse. Comparé à
/// l'octet près, mon identifiant servi en MAJUSCULES faisait passer un de mes
/// appareils non approuvés pour l'appareil d'un autre — hors de l'épingle
/// (`MeeshySignalProtocolStore.isTrustedIdentity`), hors du report de
/// l'ouvreur — et un tête-à-tête avec moi-même échappait au refus.
enum E2EEAccountId {
    static func normalized(_ userId: String) -> String {
        userId.lowercased()
    }

    static func same(_ lhs: String, _ rhs: String) -> Bool {
        normalized(lhs) == normalized(rhs)
    }
}
