import Foundation
import MeeshySDK
import os

/// **Ce que l'appareil retient du chiffrement d'une conversation** (#11380,
/// daté par l'époque depuis #12883).
///
/// Le régime vient du serveur. Une ligne servie SANS époque (`encryptionMode`,
/// `encryptionEnabledAt` de la liste ou du détail) ne fait qu'ajouter le bout
/// en bout : une passerelle compromise qui retirerait le régime d'une ligne ne
/// fait rien servir en clair sans marqueur. Une bascule DATÉE par son époque
/// (statut, réponse d'une bascule, événement socket — apprise par
/// `EndToEndRegimeLedger`, la même que l'envoi lit) fait foi dans les deux
/// sens : après une désactivation, les messages suivants retrouvent les
/// features serveur, ceux de l'ère chiffrée gardent leur verdict
/// (`EndToEndRegime`). Une ligne non datée ne réécrit jamais ce qu'une bascule
/// datée a établi : elle resserre la lecture le temps qu'elle est servie.
nonisolated protocol EndToEndRegimeMemoryProviding: Sendable {
    func resolve(conversationId: String, served: EndToEndRegime) -> EndToEndRegime
    /// Une bascule datée par son `epoch`. `changedAt` absent (statut servi) :
    /// l'instant où l'appareil l'apprend, plus tardif — fail-closed.
    func learn(isEndToEnd: Bool, epoch: Int, changedAt: Date?, enabledAt: Date?, for conversationId: String)
}

nonisolated final class EndToEndRegimeMemory: EndToEndRegimeMemoryProviding, @unchecked Sendable {
    static let shared = EndToEndRegimeMemory(defaults: .standard)

    static let storageKey = "meeshy.e2ee.regime.v1"

    private let defaults: UserDefaults?
    private let now: @Sendable () -> Date
    private let remembered: OSAllocatedUnfairLock<[String: EndToEndRegime]>

    /// `defaults: nil` : une mémoire du seul processus (tests, aperçus).
    init(defaults: UserDefaults?, now: @escaping @Sendable () -> Date = { Date() }) {
        self.defaults = defaults
        self.now = now
        self.remembered = OSAllocatedUnfairLock(initialState: defaults?.data(forKey: Self.storageKey)
            .flatMap { try? JSONDecoder().decode([String: EndToEndRegime].self, from: $0) } ?? [:])
    }

    func resolve(conversationId: String, served: EndToEndRegime) -> EndToEndRegime {
        let (merged, changed) = remembered.withLock { known -> (EndToEndRegime, [String: EndToEndRegime]?) in
            let previous = known[conversationId]
            let merged = served.merging(previous)
            guard previous?.epoch == nil, merged.isEndToEnd, merged != previous else { return (merged, nil) }
            known[conversationId] = merged
            return (merged, known)
        }
        persist(changed)
        return merged
    }

    func learn(isEndToEnd: Bool, epoch: Int, changedAt: Date?, enabledAt: Date?, for conversationId: String) {
        let observed = EndToEndRegime.dated(isEndToEnd: isEndToEnd, epoch: epoch, at: changedAt ?? now(), enabledAt: enabledAt)
        let changed = remembered.withLock { known -> [String: EndToEndRegime]? in
            let previous = known[conversationId]
            let learned = observed.superseding(previous)
            guard learned != previous, previous != nil || learned.hasEncryptedEra else { return nil }
            known[conversationId] = learned
            return known
        }
        persist(changed)
    }

    private func persist(_ known: [String: EndToEndRegime]?) {
        guard let known, let data = try? JSONEncoder().encode(known) else { return }
        defaults?.set(data, forKey: Self.storageKey)
    }
}
