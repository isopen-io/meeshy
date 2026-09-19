import Foundation
import GRDB
import os

/// **Le commutateur de suspension de la base** (#7059).
///
/// iOS supprime — `0xDEAD10CC` — un processus suspendu qui retient un verrou
/// sur un fichier SQLite. Mesuré cinq fois sur l'appareil du porteur, toujours
/// avec `GRDB.DatabasePool.writer` actif, sur trois sites d'appel différents.
/// La parade n'est pas d'écrire plus vite : c'est de DIRE à la base que
/// l'application se suspend, pour qu'elle cesse de prendre des verrous.
///
/// Ce type existe pour qu'il y ait **un seul endroit** qui poste ces deux
/// notifications. Les poster à la main depuis chaque bascule de cycle de vie
/// aurait produit la même divergence que les cinq compteurs de non-lus : un
/// site qui suspend sans reprendre laisse l'application muette pour le reste
/// de la session, et rien ne le dirait.
///
/// La suspension n'est effective que sur les bases ouvertes avec
/// `Configuration.observesSuspensionNotifications` — `AppDatabase` le pose.
public enum DatabaseSuspension {

    private static let logger = Logger(subsystem: "com.meeshy.sdk", category: "grdb-suspension")

    /// À appeler au tout DERNIER moment avant que le processus ne se suspende,
    /// c'est-à-dire après le travail d'arrière-plan et juste avant de rendre la
    /// garde `beginBackgroundTask` — et aussi depuis le gestionnaire
    /// d'expiration de cette garde, qui est précisément le cas où l'OS annonce
    /// qu'il va suspendre.
    ///
    /// Après cet appel, toute écriture lève `SQLITE_INTERRUPT` ou
    /// `SQLITE_ABORT` ; les lectures en WAL passent encore.
    public static func suspend() {
        logger.notice("Database suspended — no lock will be taken until resume")
        NotificationCenter.default.post(name: Database.suspendNotification, object: nil)
    }

    /// À appeler au tout PREMIER moment du retour au premier plan, avant tout
    /// travail qui écrit. Une reprise oubliée ne plante pas : elle rend
    /// l'application incapable d'enregistrer quoi que ce soit, ce qui est plus
    /// difficile à diagnostiquer qu'un plantage.
    public static func resume() {
        logger.notice("Database resumed")
        NotificationCenter.default.post(name: Database.resumeNotification, object: nil)
    }
}
