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
/// **La suspension n'est effective que sur les bases ouvertes avec
/// `Configuration.observesSuspensionNotifications`, et ce drapeau est POSÉ PAR
/// POOL** (`DatabasePool.setupSuspension`, `DatabaseQueue.setupSuspension`).
/// C'est ce qui a fait survivre le défaut à son propre correctif : #7059 a armé
/// `AppDatabase`, l'application en ouvre un SECOND sur
/// `meeshy_messages.sqlite`, et le kill est revenu à l'identique en build 1827
/// — deux fils `GRDB.DatabasePool.writer` actifs au moment de la suppression,
/// l'un en `sqlite3_wal_checkpoint_v2`, l'autre dans un `write` synchrone.
///
/// D'où `arm(_:)` : **aucun appelant ne pose le drapeau lui-même.** Un drapeau
/// recopié sur chaque site d'ouverture est un inventaire à tenir à jour, et
/// celui-ci a déjà divergé une fois (#7160).
public enum DatabaseSuspension {

    private static let logger = Logger(subsystem: "com.meeshy.sdk", category: "grdb-suspension")

    /// L'état de suspension est celui du PROCESSUS, pas d'une base : il est
    /// donc tenu ici, à l'unique endroit qui poste les notifications.
    /// `reveils` compte les parenthèses `duringBackgroundWake` ouvertes.
    private struct Etat {
        var suspendue = false
        var reveils = 0
        var reposerApresLesReveils = false
    }

    private static let etat = OSAllocatedUnfairLock(initialState: Etat())

    // MARK: - Armement des bases

    /// **Arme une configuration GRDB pour qu'elle écoute la suspension** (#7160).
    ///
    /// Passer par ici plutôt que de poser `observesSuspensionNotifications`
    /// à la main est la seule chose qui empêche la divergence mesurée : le
    /// drapeau vit sur la configuration, donc sur CHAQUE pool, et un site
    /// d'ouverture oublié ne se voit nulle part — ni à la compilation, ni au
    /// démarrage, ni dans un journal. Il se voit sur l'appareil du porteur,
    /// trois semaines plus tard, sous la forme d'un `0xDEAD10CC`.
    public static func arm(_ configuration: inout Configuration) {
        configuration.observesSuspensionNotifications = true
    }

    /// **Une interruption n'est pas une corruption** (#7059, #7160).
    ///
    /// Armer la suspension fait apparaître une erreur qui n'existait pas avant.
    /// Tout chemin de récupération qui lit « la base a refusé » comme « la base
    /// est illisible » EFFACERA le store local pendant une simple fenêtre de
    /// suspension — on aurait troqué une suppression par le système contre une
    /// perte de données, strictement pire.
    ///
    /// `SQLITE_INTERRUPT` / `SQLITE_ABORT` disent « pas maintenant », jamais
    /// « ce fichier est illisible ».
    public static func isSuspensionInterruption(_ error: Error) -> Bool {
        guard let erreur = error as? DatabaseError else { return false }
        return erreur.resultCode == .SQLITE_INTERRUPT || erreur.resultCode == .SQLITE_ABORT
    }

    /// À appeler au tout DERNIER moment avant que le processus ne se suspende,
    /// c'est-à-dire après le travail d'arrière-plan et juste avant de rendre la
    /// garde `beginBackgroundTask` — et aussi depuis le gestionnaire
    /// d'expiration de cette garde, qui est précisément le cas où l'OS annonce
    /// qu'il va suspendre.
    ///
    /// Après cet appel, toute écriture lève `SQLITE_INTERRUPT` ou
    /// `SQLITE_ABORT` ; les lectures en WAL passent encore.
    public static func suspend() {
        etat.withLock { courant in
            courant.suspendue = true
            courant.reposerApresLesReveils = courant.reveils > 0
        }
        logger.notice("Database suspended — no lock will be taken until resume")
        NotificationCenter.default.post(name: Database.suspendNotification, object: nil)
    }

    /// À appeler au tout PREMIER moment du retour au premier plan, avant tout
    /// travail qui écrit. Une reprise oubliée ne plante pas : elle rend
    /// l'application incapable d'enregistrer quoi que ce soit, ce qui est plus
    /// difficile à diagnostiquer qu'un plantage.
    public static func resume() {
        etat.withLock { courant in
            courant.suspendue = false
            // Le premier plan ANNULE toute re-suspension programmée par un
            // réveil encore ouvert : une tâche d'arrière-plan qui se termine
            // après que l'utilisateur a rouvert l'application ne doit pas
            // refermer la base sous ses doigts.
            courant.reposerApresLesReveils = false
        }
        logger.notice("Database resumed")
        NotificationCenter.default.post(name: Database.resumeNotification, object: nil)
    }

    // MARK: - Réveils d'arrière-plan

    /// **Un réveil d'arrière-plan LÈVE la suspension le temps de son travail**
    /// (#7160).
    ///
    /// `suspend()` est posé à la fin de l'entrée en arrière-plan et `resume()`
    /// au retour au premier plan : entre les deux, le processus est censé être
    /// gelé. Il ne l'est pas toujours — `BGAppRefreshTask` et
    /// `BGProcessingTask` le réveillent précisément là, et c'est LEUR raison
    /// d'être d'écrire (drainer l'outbox, préfetcher les messages).
    ///
    /// Sans cette parenthèse, le correctif du `0xDEAD10CC` rendait toutes ces
    /// écritures muettes : elles levaient `SQLITE_INTERRUPT` et les journaux
    /// annonçaient un succès. Un défaut plus difficile à voir que le plantage
    /// qu'on venait de corriger — rien ne plante, rien n'arrive.
    ///
    /// La parenthèse est RÉENTRANTE (les deux tâches BG peuvent se recouvrir)
    /// et elle ne repose la suspension que si personne n'est repassé au premier
    /// plan entre-temps.
    public static func duringBackgroundWake<T>(
        _ work: () async throws -> T
    ) async rethrows -> T {
        beginWake()
        defer { endWake() }
        return try await work()
    }

    private static func beginWake() {
        let lever = etat.withLock { courant -> Bool in
            if courant.reveils == 0 {
                courant.reposerApresLesReveils = courant.suspendue
            }
            courant.reveils += 1
            guard courant.suspendue else { return false }
            courant.suspendue = false
            return true
        }
        guard lever else { return }
        logger.notice("Database resumed for a background wake")
        NotificationCenter.default.post(name: Database.resumeNotification, object: nil)
    }

    private static func endWake() {
        let reposer = etat.withLock { courant -> Bool in
            guard courant.reveils > 0 else { return false }
            courant.reveils -= 1
            guard courant.reveils == 0, courant.reposerApresLesReveils, !courant.suspendue else {
                return false
            }
            courant.reposerApresLesReveils = false
            courant.suspendue = true
            return true
        }
        guard reposer else { return }
        logger.notice("Database suspended again — background wake finished")
        NotificationCenter.default.post(name: Database.suspendNotification, object: nil)
    }
}
