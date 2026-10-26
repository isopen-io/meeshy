import Foundation
import GRDB

/// **Une annonce du serveur ne vide jamais le coffre** (#13060, décision porteur
/// du 2026-10-26, option A). Le coffre E2EE est la seule copie d'un clair : la
/// passerelle qui annonce un message supprimé pour tous (`deletedAt`, socket ou
/// REST), une vue unique consommée (`consumedByMe`), un retrait pour moi depuis
/// un autre appareil ou une citation emportée peut au plus MASQUER la ligne. Le
/// clair ne quitte le coffre que pour un effacement AUTHENTIFIÉ :
/// - un geste de CET appareil (suppression, vue unique ouverte, retrait pour moi,
///   bulle d'envoi abandonnée) ;
/// - un signal chiffré libsignal de l'auteur du message (suppression pour tous)
///   ou d'un de MES appareils (vue unique ouverte), jugé par `E2EESignalAuthority`.
///
/// L'ÉCHÉANCE d'un éphémère n'est pas authentifiée non plus : `expiresAt` vient
/// de la passerelle (socket `message:expired`, page REST, compte à rebours servi),
/// qui pourrait déclarer échu n'importe quel message pour en faire effacer le
/// clair. La ligne échue se retire ou se masque, le clair reste au coffre, tant
/// que l'échéance ne voyage pas dans le chiffré et ne court pas sur l'appareil (#13103).
///
/// Les déclencheurs de #13001 inscrivent toujours chaque effacement, quel que
/// soit l'écrivain, mais NON authentifié ; seul le chemin authentifié lève le
/// drapeau. À la migration, seules les inscriptions déjà retirées du coffre
/// restent tenues pour authentifiées ; tout effacement encore en file a pu venir
/// du serveur : son clair reste au coffre.
struct MessagesPlaintextErasureAuthenticationMigration: DatabaseMigration {
    let identifier = "messages_e2ee_plaintext_erasures_authenticated_v1"

    func migrate(_ db: Database) throws {
        try db.alter(table: MessagePlaintextErasures.table) { t in
            t.add(column: "authenticated", .boolean).notNull().defaults(to: false)
        }
        try db.execute(sql: """
            UPDATE \(MessagePlaintextErasures.table) SET authenticated = 1 WHERE acknowledgedAt IS NOT NULL
            """)
    }
}

/// D'où vient un effacement : de la passerelle seule, ou d'un geste ou d'un signal authentifiés.
public enum PlaintextErasureOrigin: Sendable, Equatable {
    /// La passerelle l'annonce : la ligne se masque, le clair reste au coffre (#13060).
    case announced
    /// Un geste de cet appareil, ou un signal libsignal autorisé de l'auteur.
    case authenticated
}

extension MessagePlaintextErasures {
    /// Lève le drapeau d'authentification de l'effacement DÉJÀ INSCRIT de ce
    /// message pour cette cause, sous ses deux identifiants. N'inscrit rien : un
    /// message en clair, que les déclencheurs n'inscrivent pas, ne s'inscrit pas ici.
    static func authenticate(_ messageKey: String, cause: Cause, in db: Database) throws {
        try db.execute(
            sql: """
                UPDATE \(table) SET authenticated = 1 WHERE cause = ? AND messageKey IN (
                    SELECT localId FROM messages WHERE localId = ? OR serverId = ?
                    UNION SELECT serverId FROM messages WHERE serverId IS NOT NULL AND (localId = ? OR serverId = ?)
                    UNION SELECT ?
                )
                """,
            arguments: [cause.rawValue, messageKey, messageKey, messageKey, messageKey, messageKey]
        )
    }

    /// Le même, pour les lignes de ces identifiants locaux.
    static func authenticate(_ localIds: [String], cause: Cause, in db: Database) throws {
        try localIds.forEach { try authenticate($0, cause: cause, in: db) }
    }

    /// Selon son origine : authentifié, l'effacement vide le coffre ; annoncé, il le garde.
    static func settle(_ messageKey: String, cause: Cause, origin: PlaintextErasureOrigin, in db: Database) throws {
        guard origin == .authenticated else { return }
        try authenticate(messageKey, cause: cause, in: db)
    }
}
