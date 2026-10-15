import Foundation
import os

// MARK: - « Ce compte a été supprimé » (#10482, contrat passerelle #10264)
//
// Le seul refus qui dise quelque chose du COMPTE plutôt que du jeton. L'appareil
// y retire le compte NOMMÉ — du sélecteur, du trousseau, et avec ses données
// locales (le carnet du jeu, des photos sans autre exemplaire). D'où deux bornes :
//
// - le SIGNAL : `code == "ACCOUNT_DELETED"` avec `accountId` (401 de toute
//   requête, refus de `/auth/refresh`, `error` du socket), ou `deletedAccountId`
//   (`auth:session-revoked` à la purge). Ni `AUTH_FAILED`, ni `SESSION_REVOKED`,
//   ni un 401 sans code : un jeton expiré ou une session révoquée ne disent rien
//   du compte ;
// - le COMPTE : celui que le signal nomme, et seulement s'il est le PROPRIÉTAIRE
//   du jeton présenté (requête) ou de la connexion (socket) — jamais le compte
//   actif au moment de la réponse, une bascule a pu se faire pendant le vol.
//
// Ce type ne fait que LIRE le signal et le poster ; le geste est à l'app.

public extension Notification.Name {
    /// Postée quand la passerelle dit qu'un compte de l'appareil est supprimé.
    static let meeshyAccountDeleted = Notification.Name("me.meeshy.accountDeleted")
}

nonisolated public enum AccountDeletedSignal {
    public static let code = "ACCOUNT_DELETED"
    static let accountKey = "accountId"

    /// Un identifiant de compte a la forme d'un ObjectId ou d'un jeton d'URL :
    /// ce qui n'en a pas la forme ne nomme aucun compte — il devient un nom de
    /// dossier à effacer.
    public static func isAccountId(_ value: String?) -> Bool {
        guard let value, !value.isEmpty, value.count <= 128 else { return false }
        return value.unicodeScalars.allSatisfy { scalar in
            scalar.isASCII && (CharacterSet.alphanumerics.contains(scalar) || scalar == "-" || scalar == "_")
        }
    }

    private static func named(_ value: Any?) -> String? {
        guard let value = value as? String, isAccountId(value) else { return nil }
        return value
    }

    /// Le compte nommé par un refus `{ code: "ACCOUNT_DELETED", accountId }`.
    public static func namedAccount(in payload: [String: Any]?) -> String? {
        guard let payload, payload["code"] as? String == code else { return nil }
        return named(payload[accountKey])
    }

    /// Le compte nommé par une réponse REST — sous 401 seulement.
    public static func namedAccount(statusCode: Int, body: Data?) -> String? {
        guard statusCode == 401, let body,
              let payload = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else { return nil }
        return namedAccount(in: payload)
    }

    /// Le compte nommé par l'événement socket `error` (premier argument).
    public static func namedAccount(socketErrorPayload data: [Any]) -> String? {
        namedAccount(in: data.first as? [String: Any])
    }

    /// Le compte nommé par `auth:session-revoked` (`deletedAccountId`, purge confirmée seulement).
    public static func namedAccount(sessionRevokedPayload data: [Any]) -> String? {
        named((data.first as? [String: Any])?["deletedAccountId"])
    }

    /// Le compte d'un JWT de session (`userId`, `services/auth/session-jwt.ts`).
    /// Lu sans vérifier la signature : la passerelle l'a vérifiée, l'appareil
    /// ne s'en sert que pour savoir AU NOM DE QUI il a parlé.
    public static func owner(ofJWT token: String?) -> String? {
        guard let token else { return nil }
        let bare = token.hasPrefix("Bearer ") ? String(token.dropFirst(7)) : token
        let parts = bare.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3 else { return nil }
        var base64 = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        guard let data = Data(base64Encoded: base64),
              let claims = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return named(claims["userId"])
    }

    /// Le propriétaire de ce qu'une requête PRÉSENTE : le JWT d'`Authorization`
    /// et, pour `/auth/refresh`, celui du corps (`token`). Deux propriétaires
    /// différents ne désignent personne.
    public static func presentedOwner(authorization: String?, body: Data?) -> String? {
        let bodyToken = body
            .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            .flatMap { $0["token"] as? String }
        let owners = Set([owner(ofJWT: authorization), owner(ofJWT: bodyToken)].compactMap { $0 })
        return owners.count == 1 ? owners.first : nil
    }

    /// La loi : le compte nommé n'est retenu que s'il est le propriétaire.
    public static func owned(_ namedAccount: String?, by owner: String?) -> String? {
        guard let namedAccount, let owner, namedAccount == owner else { return nil }
        return namedAccount
    }

    /// Les comptes signalés dont le retrait n'est pas encore fait : marqués
    /// AVANT que la notification ne parte, depuis n'importe quel contexte, pour
    /// qu'aucun refus arrivé entre-temps n'invite à se reconnecter au compte.
    private static let awaitingRetirement = OSAllocatedUnfairLock<Set<String>>(initialState: [])

    public static func isAwaitingRetirement(_ accountId: String) -> Bool {
        awaitingRetirement.withLock { $0.contains(accountId) }
    }

    static func retirementDone(_ accountId: String) {
        _ = awaitingRetirement.withLock { $0.remove(accountId) }
    }

    #if DEBUG
    static func forgetAwaitingRetirementForTesting() {
        awaitingRetirement.withLock { $0.removeAll() }
    }
    #endif

    public static func signal(accountId: String, center: NotificationCenter = .default) {
        _ = awaitingRetirement.withLock { $0.insert(accountId) }
        center.post(name: .meeshyAccountDeleted, object: nil, userInfo: [accountKey: accountId])
    }

    /// Poste le retrait — et rend le compte — UNIQUEMENT sur un 401
    /// `ACCOUNT_DELETED` qui nomme le propriétaire de la requête.
    @discardableResult
    public static func signal(
        statusCode: Int,
        body: Data?,
        presentedOwner: String?,
        center: NotificationCenter = .default
    ) -> String? {
        guard let accountId = owned(namedAccount(statusCode: statusCode, body: body), by: presentedOwner) else { return nil }
        signal(accountId: accountId, center: center)
        return accountId
    }

    /// Le compte porté par une notification `meeshyAccountDeleted`.
    public static func accountId(in notification: Notification) -> String? {
        guard notification.name == .meeshyAccountDeleted else { return nil }
        return named(notification.userInfo?[accountKey])
    }
}
