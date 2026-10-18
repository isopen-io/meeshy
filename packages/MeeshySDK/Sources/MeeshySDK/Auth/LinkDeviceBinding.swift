import Foundation
import CryptoKit
import Security

/// Le lien de connexion est LIÉ À L'APPAREIL qui l'a demandé (#10872).
///
/// À la demande, l'appareil tire un secret (32 octets aléatoires), le garde au
/// trousseau (`ThisDeviceOnly`) et n'envoie que son EMPREINTE ; à l'ouverture
/// du lien, il présente le secret. Un lien ouvert ailleurs — ou forgé par un
/// tiers qui l'a demandé pour SON compte — ne porte pas ce secret : la
/// passerelle n'ouvre alors aucune session sans confirmation explicite
/// (« login CSRF », OWASP Cross-Site Request Forgery Prevention Cheat Sheet,
/// § Login CSRF).
public protocol LinkDeviceBindingProviding: Sendable {
    /// Tire un secret neuf, le garde, et rend son empreinte (`nil` si l'aléa
    /// ou le trousseau manquent : la demande part sans liaison, le lien
    /// passera par la confirmation).
    func issueHash() -> String?
    /// Le secret à présenter avec le jeton d'un lien, s'il y en a un.
    func presentedSecret() -> String?
    /// Oublie le secret — une fois la preuve rendue définitive.
    func forget()
}

public enum LinkDeviceBinding {
    static let secretByteCount = 32

    /// 32 octets de `SecRandomCopyBytes`, en base64url sans remplissage (43 car.).
    static func newSecret() -> String? {
        var bytes = [UInt8](repeating: 0, count: secretByteCount)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { return nil }
        return Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    /// SHA-256 de la chaîne UTF-8 du secret, en hexadécimal minuscule — la
    /// forme que la passerelle recalcule à la consommation.
    public static func hash(of secret: String) -> String {
        SHA256.hash(data: Data(secret.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

public final class KeychainLinkDeviceBinding: LinkDeviceBindingProviding, @unchecked Sendable {
    static let key = "auth.linkDeviceSecret"
    private let keychain: any KeychainStoring

    public init(keychain: any KeychainStoring = KeychainManager.shared) {
        self.keychain = keychain
    }

    public func issueHash() -> String? {
        guard let secret = LinkDeviceBinding.newSecret() else { return nil }
        do {
            try keychain.save(secret, forKey: Self.key, account: nil)
        } catch {
            return nil
        }
        return LinkDeviceBinding.hash(of: secret)
    }

    public func presentedSecret() -> String? {
        keychain.load(forKey: Self.key, account: nil).flatMap { $0.isEmpty ? nil : $0 }
    }

    public func forget() {
        keychain.delete(forKey: Self.key, account: nil)
    }
}

/// L'identité du compte qu'un lien ouvrirait, servie SANS session quand le
/// lien n'a pas été demandé par cet appareil (#10872).
public struct LinkSignInAccount: Decodable, Equatable, Sendable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?

    public init(id: String, username: String, displayName: String? = nil, avatar: String? = nil) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.avatar = avatar
    }
}

/// Ce que fera le « oui » à la question d'un lien (#10879, #10883).
public enum LinkSignInIntent: String, Equatable, Sendable {
    /// Le oui ouvre le compte.
    case signIn = "sign-in"
    /// Le oui ouvre le compte ET lui rattache l'adresse revendiquée (#8214) :
    /// elle quitte le compte qui la porte aujourd'hui.
    case claimEmail = "claim-email"

    /// Absent (passerelle d'avant #10879), inconnu ou illisible ⇒ `signIn`.
    public init(served raw: String?) {
        self = raw.flatMap(LinkSignInIntent.init(rawValue:)) ?? .signIn
    }
}

/// La passerelle n'a ouvert AUCUNE session : le lien n'a pas été demandé par
/// cet appareil (ou a été forgé), et elle attend que l'utilisateur confirme le
/// compte qu'il ouvrirait (#10872). Le jeton n'est pas consommé.
public struct LinkConfirmationRequired: Error, Equatable, Sendable {
    public let account: LinkSignInAccount
    /// #10883 — ce que fera le oui.
    public let intent: LinkSignInIntent
    /// #10883 — l'adresse en jeu, MASQUÉE par la passerelle ; `nil` sur une
    /// passerelle d'avant #10879.
    public let maskedEmail: String?

    public init(account: LinkSignInAccount, intent: LinkSignInIntent = .signIn, maskedEmail: String? = nil) {
        self.account = account
        self.intent = intent
        self.maskedEmail = maskedEmail
    }
}
