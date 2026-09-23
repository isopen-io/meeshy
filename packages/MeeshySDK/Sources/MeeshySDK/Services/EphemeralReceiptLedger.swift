import Foundation

/// Qui sait QUAND cet appareil a vu un message pour la première fois (#7452).
///
/// La réception est la seule horloge qui puisse démarrer le décompte d'un
/// éphémère (contrat #7451 point 2), et elle doit SURVIVRE au redémarrage de
/// l'application : un message de vingt-quatre heures dont l'horloge repartirait
/// à chaque lancement ne mourrait jamais. D'où un registre persisté, et non un
/// dictionnaire en mémoire.
///
/// Le protocole précède l'implémentation (convention iOS du dépôt) et permet
/// aux témoins d'injecter un registre sans toucher aux `UserDefaults` réels.
public protocol EphemeralReceiptRecording: Sendable {
    /// La première réception connue pour ce message, ou `nil`.
    func firstReception(of messageId: String) -> Date?
    /// Enregistre une réception. **Idempotent et monotone** : un second appel
    /// ne recule ni n'avance la date déjà écrite. Sans cette garantie, un
    /// resync REST relancerait l'horloge de chaque éphémère à l'écran.
    @discardableResult
    func noteReception(of messageId: String, at date: Date) -> Date
    /// L'instant où ce message a été DÉTRUIT sur cet appareil, ou `nil`.
    ///
    /// C'est la mémoire qui interdit à un mort de renaître (#7552) : elle se
    /// consulte AVANT de stamper quoi que ce soit, et rien ne l'efface.
    func destruction(of messageId: String) -> Date?
    /// Enregistre la destruction d'un message. **Monotone** : la première
    /// mort gravée est la seule ; un second appel ne la déplace pas.
    func noteDestruction(of messageId: String, at date: Date)
}

public extension EphemeralReceiptRecording {
    @discardableResult
    func noteReception(of messageId: String) -> Date {
        noteReception(of: messageId, at: Date())
    }

    func noteDestruction(of messageId: String) {
        noteDestruction(of: messageId, at: Date())
    }
}

/// Registre persisté dans les `UserDefaults` du groupe d'application, pour que
/// l'extension de notification et l'application partagent la MÊME première
/// réception : la NSE voit le message avant l'application quand celle-ci est
/// fermée, et c'est bien cette arrivée-là qui démarre le décompte.
public final class EphemeralReceiptLedger: EphemeralReceiptRecording, @unchecked Sendable {

    /// Le groupe partagé par l'application et ses extensions.
    public static let appGroupSuiteName = "group.me.meeshy.apps"

    /// Singleton de l'application. Les témoins construisent le leur avec des
    /// `UserDefaults` dédiés.
    public static let shared = EphemeralReceiptLedger()

    private static let storageKey = "meeshy.ephemeral.receipts.v1"

    /// La table des MORTS. Distincte de celle des réceptions parce qu'elle
    /// répond à une AUTRE question — « ce message a-t-il déjà vécu ? » — et
    /// qu'un registre qui mêlerait les deux devrait inventer une valeur
    /// sentinelle pour dire la seconde.
    private static let destructionsKey = "meeshy.ephemeral.destructions.v1"

    /// Plafond de rétention du contrat (#7451 point 9) : au-delà, une entrée
    /// ne peut plus servir à personne et le registre doit rester borné.
    private static let retention: TimeInterval = 7 * 24 * 3600

    private let defaults: UserDefaults
    private let lock = NSLock()

    public init(defaults: UserDefaults? = nil) {
        self.defaults = defaults
            ?? UserDefaults(suiteName: Self.appGroupSuiteName)
            ?? .standard
    }

    public func firstReception(of messageId: String) -> Date? {
        lock.lock(); defer { lock.unlock() }
        guard let stamp = stored()[messageId] else { return nil }
        return Date(timeIntervalSince1970: stamp)
    }

    @discardableResult
    public func noteReception(of messageId: String, at date: Date) -> Date {
        lock.lock(); defer { lock.unlock() }
        var table = stored()
        if let existing = table[messageId] {
            return Date(timeIntervalSince1970: existing)
        }
        table[messageId] = date.timeIntervalSince1970
        write(prune(table, now: date))
        return date
    }

    public func destruction(of messageId: String) -> Date? {
        lock.lock(); defer { lock.unlock() }
        guard let stamp = storedDestructions()[messageId] else { return nil }
        return Date(timeIntervalSince1970: stamp)
    }

    /// Grave la mort d'un message — appelé quand il est DÉTRUIT (`message:expired`
    /// reçu, ou combustion locale menée à son terme).
    ///
    /// **Il remplace un `forget(_:)` qui EFFAÇAIT la réception (#7552).** Cet
    /// oubli n'était qu'une économie de place, et il coûtait la protection : la
    /// ligne reste dans le fil quelques instants après l'annonce de sa
    /// destruction, et la projection suivante — trouvant un registre VIDE pour
    /// cet identifiant — stampait une réception NEUVE. Mesuré en recette le
    /// 2026-09-22 : un éphémère de 30 s atteignait 0:00, puis REMONTAIT à 0:06,
    /// une fenêtre de 30 s entière repartie.
    ///
    /// La pierre tombale coûte exactement la place que la réception libère —
    /// une entrée pour une entrée, même clé, même `TimeInterval` — et elle
    /// répond à la seule question qui reste : ce message a déjà vécu. Elle est
    /// bornée par la même rétention de 7 jours que les réceptions, largement
    /// au-delà du plus long éphémère du produit (24 h).
    public func noteDestruction(of messageId: String, at date: Date) {
        lock.lock(); defer { lock.unlock() }

        var deaths = storedDestructions()
        if deaths[messageId] == nil {
            deaths[messageId] = date.timeIntervalSince1970
            writeDestructions(prune(deaths, now: date))
        }

        var receipts = stored()
        guard receipts.removeValue(forKey: messageId) != nil else { return }
        write(receipts)
    }

    // MARK: - Stockage

    private func stored() -> [String: TimeInterval] {
        defaults.dictionary(forKey: Self.storageKey) as? [String: TimeInterval] ?? [:]
    }

    private func write(_ table: [String: TimeInterval]) {
        defaults.set(table, forKey: Self.storageKey)
    }

    private func storedDestructions() -> [String: TimeInterval] {
        defaults.dictionary(forKey: Self.destructionsKey) as? [String: TimeInterval] ?? [:]
    }

    private func writeDestructions(_ table: [String: TimeInterval]) {
        defaults.set(table, forKey: Self.destructionsKey)
    }

    private func prune(_ table: [String: TimeInterval], now: Date) -> [String: TimeInterval] {
        let floor = now.timeIntervalSince1970 - Self.retention
        return table.filter { $0.value >= floor }
    }
}
