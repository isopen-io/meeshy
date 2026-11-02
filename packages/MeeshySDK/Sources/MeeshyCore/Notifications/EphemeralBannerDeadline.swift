import Foundation

/// L'échéance qu'une bannière DÉLIVRÉE transporte, et ce qu'on en fait
/// (#7453, contrat du fil #7451 point 7).
///
/// ## Pourquoi un balayage, et pourquoi dans le SDK
///
/// iOS n'offre **aucune échéance native** pour une notification déjà délivrée :
/// une bannière posée reste posée. Le retrait existait bien — le push silencieux
/// `notification_revoked` → `revokeDeliveredBanners` — mais il ne part qu'à la
/// DESTRUCTION du message côté serveur. Sans réseau, la bannière d'un message
/// éphémère survit donc indéfiniment au message qu'elle annonce, sur l'écran
/// verrouillé, avec le placeholder qui dit exactement qu'il y a quelque chose à
/// cacher.
///
/// Le seul retrait possible est un BALAYAGE, et il doit tourner à chaque
/// occasion où du code s'exécute — passage dans la NSE, retour de l'application
/// au premier plan, `message:expired` reçu. Ces trois chemins vivent dans TROIS
/// cibles différentes (extension, application, application) : la règle est donc
/// ici, dans le SDK que les trois partagent, et non recopiée dans chacune.
///
/// **Ne pas confondre avec `NotificationPayloadHelpers.ephemeralDeadline`** :
/// celui-là CALCULE une échéance à l'arrivée d'un push (`maintenant + durée`) ;
/// celui-ci LIT une échéance déjà gravée dans le `userInfo` d'une bannière
/// délivrée. Deux questions, deux moments.
public enum EphemeralBannerDeadline {

    /// La clé sous laquelle l'échéance locale voyage dans le `userInfo` d'une
    /// notification délivrée. Contrat entre la NSE, qui l'écrit, et les trois
    /// balayages, qui la lisent — donc nommée UNE fois.
    public static let userInfoKey = "ephemeralDeadline"

    /// L'échéance gravée dans ce `userInfo`, ou `nil`.
    ///
    /// La valeur voyage en secondes depuis 1970. Les deux formes (nombre ou
    /// chaîne) sont lues : un `userInfo` traverse une sérialisation APNs, et
    /// l'échéance ne doit pas dépendre du sérialiseur.
    public static func deadline(in userInfo: [AnyHashable: Any]) -> Date? {
        let raw = userInfo[userInfoKey]
        let seconds: Double?
        switch raw {
        case let value as Double: seconds = value
        case let value as Int: seconds = Double(value)
        case let value as NSNumber: seconds = value.doubleValue
        case let value as String: seconds = Double(value)
        default: seconds = nil
        }
        guard let seconds else { return nil }
        return Date(timeIntervalSince1970: seconds)
    }

    /// Cette bannière a-t-elle passé son échéance ?
    ///
    /// **Une bannière sans échéance n'est JAMAIS échue.** Ce balayage ne
    /// connaît que les éphémères ; confondre les deux effacerait des
    /// notifications que personne n'a demandé de retirer — et un retrait est
    /// irréversible pour l'utilisateur.
    public static func isExpired(userInfo: [AnyHashable: Any], now: Date = Date()) -> Bool {
        guard let deadline = deadline(in: userInfo) else { return false }
        return deadline <= now
    }

    /// Les identifiants des bannières à retirer.
    public static func expiredIdentifiers(
        from entries: [(id: String, userInfo: [AnyHashable: Any])],
        now: Date = Date()
    ) -> [String] {
        entries.compactMap { isExpired(userInfo: $0.userInfo, now: now) ? $0.id : nil }
    }
}
