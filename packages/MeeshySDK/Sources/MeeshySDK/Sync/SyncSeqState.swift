import Foundation

/// SyncEngine unifié (spec §7.5, sous-tâche A5) — état PUR de suivi du numéro
/// de séquence monotone per-user (`_seq`) tamponné par le gateway sur les
/// events Socket.IO user-scoped (`emitWithSeq`, A2.1).
///
/// Le client applique chaque event en temps réel ET avance son `lastSeq`. La
/// détection de gap est EXACTE : un event arrivant avec `next > lastSeq + 1`
/// signale des events manqués (`lastSeq+1 .. next-1`) — supérieure au gap
/// recovery temporel (watermarks `updatedSince`/`after`) qui rate les events
/// à timestamp identique et sur-fetch. C'est le cœur du bénéfice multi-device.
///
/// Valeur pure (struct), triviale à tester en isolation. Le câblage sur le
/// vrai flux + le déclenchement d'une resync sur gap détecté = A5.2.
public struct SyncSeqState: Sendable, Equatable {
    /// Dernier `_seq` observé, `nil` avant tout event.
    public private(set) var lastSeq: Int64?

    public init(lastSeq: Int64? = nil) {
        self.lastSeq = lastSeq
    }

    /// Retourne `true` si `next` est en avance de plus d'UN cran sur le dernier
    /// seq observé (⇒ events manqués). Ne rapporte JAMAIS un gap sur le tout
    /// premier event (aucun point de référence) ni sur un seq `<= lastSeq`
    /// (doublon socket / réordonnancement — pas un trou en avant). Requête
    /// pure : ne mute pas l'état (appeler `record` pour avancer).
    public func detectGap(next: Int64) -> Bool {
        guard let last = lastSeq else { return false }
        return next > last + 1
    }

    /// Avance le curseur au `seq` observé. Monotone en pratique ; on n'écrase
    /// pas volontairement avec une valeur inférieure (un event réordonné ne
    /// doit pas faire régresser le curseur et re-déclencher un faux gap).
    public mutating func record(_ seq: Int64) {
        if let last = lastSeq, seq <= last { return }
        lastSeq = seq
    }
}

/// Wrapper actor pour l'état partagé du tracker de séquence (thread-safe).
/// Le pilote A5 suit les `notification:new` ; d'autres collections viendront
/// avec la migration (A6). `reset()` au logout (purge cross-compte).
public actor SyncSeqTracker {
    public static let shared = SyncSeqTracker()

    private var state = SyncSeqState()

    public init() {}

    /// Observe un `_seq` : retourne `true` si un gap est détecté AVANT
    /// d'avancer le curseur, puis enregistre. Un `nil` (event sans `_seq`,
    /// gateway antérieur) est un no-op qui ne rapporte pas de gap.
    @discardableResult
    public func observe(_ seq: Int64?) -> Bool {
        guard let seq else { return false }
        let gap = state.detectGap(next: seq)
        state.record(seq)
        return gap
    }

    public var lastSeq: Int64? { state.lastSeq }

    public func reset() { state = SyncSeqState() }
}
