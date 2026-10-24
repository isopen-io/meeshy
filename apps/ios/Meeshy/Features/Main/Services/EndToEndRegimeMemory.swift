import Foundation
import MeeshySDK
import os

/// **Ce que l'appareil retient du chiffrement d'une conversation** (#11380).
///
/// Le régime vient du serveur (`encryptionMode`, `encryptionEnabledAt`) : une
/// passerelle compromise peut le retirer d'une ligne pour faire servir en clair,
/// sans marqueur, ce que le chiffrement interdit. Le chiffrement ne se désactive
/// jamais, donc ce que l'appareil a vu une fois tient : `resolve` fusionne le
/// régime servi avec celui qu'il retient (`EndToEndRegime.merging`), retient le
/// résultat, et le rend. Une conversation absente de la liste ou pas encore
/// hydratée se lit aussi par ce qu'il retient.
nonisolated protocol EndToEndRegimeMemoryProviding: Sendable {
    func resolve(conversationId: String, served: EndToEndRegime) -> EndToEndRegime
}

nonisolated final class EndToEndRegimeMemory: EndToEndRegimeMemoryProviding, @unchecked Sendable {
    static let shared = EndToEndRegimeMemory(defaults: .standard)

    static let storageKey = "meeshy.e2ee.regime.v1"

    private let defaults: UserDefaults?
    private let remembered: OSAllocatedUnfairLock<[String: EndToEndRegime]>

    /// `defaults: nil` : une mémoire du seul processus (tests, aperçus).
    init(defaults: UserDefaults?) {
        self.defaults = defaults
        self.remembered = OSAllocatedUnfairLock(initialState: defaults?.data(forKey: Self.storageKey)
            .flatMap { try? JSONDecoder().decode([String: EndToEndRegime].self, from: $0) } ?? [:])
    }

    func resolve(conversationId: String, served: EndToEndRegime) -> EndToEndRegime {
        let (merged, changed) = remembered.withLock { known -> (EndToEndRegime, [String: EndToEndRegime]?) in
            let merged = served.merging(known[conversationId])
            guard merged.isEndToEnd, merged != known[conversationId] else { return (merged, nil) }
            known[conversationId] = merged
            return (merged, known)
        }
        if let changed, let data = try? JSONEncoder().encode(changed) {
            defaults?.set(data, forKey: Self.storageKey)
        }
        return merged
    }
}
