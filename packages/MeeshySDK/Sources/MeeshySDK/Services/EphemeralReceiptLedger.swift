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
}

public extension EphemeralReceiptRecording {
    @discardableResult
    func noteReception(of messageId: String) -> Date {
        noteReception(of: messageId, at: Date())
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

    /// Oublie une entrée — appelé quand le message est détruit (`message:expired`),
    /// pour que le registre ne grossisse pas d'éphémères qui n'existent plus.
    public func forget(_ messageId: String) {
        lock.lock(); defer { lock.unlock() }
        var table = stored()
        guard table.removeValue(forKey: messageId) != nil else { return }
        write(table)
    }

    // MARK: - Stockage

    private func stored() -> [String: TimeInterval] {
        defaults.dictionary(forKey: Self.storageKey) as? [String: TimeInterval] ?? [:]
    }

    private func write(_ table: [String: TimeInterval]) {
        defaults.set(table, forKey: Self.storageKey)
    }

    private func prune(_ table: [String: TimeInterval], now: Date) -> [String: TimeInterval] {
        let floor = now.timeIntervalSince1970 - Self.retention
        return table.filter { $0.value >= floor }
    }
}
