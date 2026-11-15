import Foundation

/// Registre des issues terminales d'une mutation outbox : les observateurs
/// en attente (un `AsyncStream` par abonné, clés par jeton de souscription) et
/// les tombstones des issues déjà publiées (cap FIFO).
///
/// Valeur possédée par `OfflineQueue` — l'acteur sérialise tous les accès.
/// Un consommateur annulé ne retire QUE sa propre continuation : l'ancien
/// `[String: [Continuation]]` droppait tout le slot, orphelinant les autres
/// observateurs (await éternel + rétention de leur Task/ViewModel).
struct OutboxOutcomeRegistry {
    private var continuations: [String: [UUID: AsyncStream<OutboxOutcome>.Continuation]] = [:]
    /// Un abonné tardif reçoit l'outcome immédiatement au lieu d'attendre pour
    /// toujours un `publishOutcome` qui ne reviendra pas.
    private var tombstones = BoundedFIFOMap<String, OutboxOutcome>(capacity: 200)

    func firedOutcome(for cmid: String) -> OutboxOutcome? {
        tombstones[cmid]
    }

    mutating func register(_ continuation: AsyncStream<OutboxOutcome>.Continuation, for cmid: String, token: UUID) {
        continuations[cmid, default: [:]][token] = continuation
    }

    /// Retire la seule continuation identifiée par `token`. Idempotent : si le
    /// slot a déjà été vidé par `publish`, c'est un no-op. Ne touche PAS aux
    /// autres continuations du même cmid.
    mutating func drop(for cmid: String, token: UUID) {
        guard var slot = continuations[cmid] else { return }
        slot.removeValue(forKey: token)
        if slot.isEmpty {
            continuations.removeValue(forKey: cmid)
        } else {
            continuations[cmid] = slot
        }
    }

    /// Mémorise l'issue puis la remet à chaque observateur du cmid, dont les
    /// flux se terminent ; le slot est vidé.
    mutating func publish(_ outcome: OutboxOutcome) {
        tombstones[outcome.cmid] = outcome
        guard let observers = continuations.removeValue(forKey: outcome.cmid) else {
            return
        }
        for continuation in observers.values {
            continuation.yield(outcome)
            continuation.finish()
        }
    }

    /// Oublie l'issue mémorisée d'un identifiant que l'on vient de réarmer.
    mutating func forget(_ cmid: String) {
        tombstones.removeValue(forKey: cmid)
    }

    /// Termine, SANS outcome, les observateurs d'une mutation qui n'en aura jamais.
    mutating func end(_ cmid: String) {
        guard let observers = continuations.removeValue(forKey: cmid) else { return }
        for continuation in observers.values { continuation.finish() }
    }

    /// Wipe complet (logout, tests) : les tombstones d'une session ne doivent
    /// pas pouvoir rejouer un outcome dans la suivante, et les observateurs
    /// ne recevront jamais d'outcome — ils se terminent ici.
    mutating func reset() {
        tombstones.removeAll()
        for cmid in Array(continuations.keys) { end(cmid) }
    }

    /// Nombre de mutations encore observées — témoin de la purge (tests).
    var observedCount: Int { continuations.count }
}
