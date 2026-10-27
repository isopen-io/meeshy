import Foundation
import MeeshySDK
import os

/// **Ce que l'appareil retient du chiffrement d'une conversation, pour un
/// compte** (#11380, #12937, #12949).
///
/// Une conversation vue chiffrée de bout en bout le reste, pour la lecture
/// comme pour l'envoi : la mémoire est MONOTONE (`EndToEndRegime.merging`).
/// Aucune rétrogradation servie — ligne sans mode, statut, événement socket,
/// avis de désactivation — ne l'efface ; seule la frontière d'activation peut
/// reculer vers une date plus ancienne, ce qui ferme davantage.
///
/// Elle est rangée PAR COMPTE (`bind(account:)`, environnement et
/// utilisateur) : un compte ne lit jamais ce qu'un autre a vu. Ce qu'elle garde
/// ne peut que fermer (des identifiants de conversation et une date
/// d'activation, aucun contenu) : elle survit à la déconnexion, pour qu'un
/// serveur ne puisse pas rouvrir le clair d'un compte qui se reconnecte. Sans
/// compte lié, elle ne retient que pour le processus, et ce qu'elle a appris
/// rejoint le compte qui se lie. La mémoire de l'appareil d'avant le
/// rangement par compte (`legacyStorageKey`) valait pour tout l'appareil :
/// chaque compte la reprend à sa liaison, aucun ne la perd parce qu'un autre
/// s'est lié avant lui.
nonisolated protocol EndToEndRegimeMemoryProviding: Sendable {
    func resolve(conversationId: String, served: EndToEndRegime) -> EndToEndRegime
    func bind(account: String?)
    /// Un compte est-il lié ? Sans lui, la mémoire ne relit rien de ce que
    /// l'appareil a vu (réveil à froid en arrière-plan, #12985).
    var isBound: Bool { get }
}

nonisolated final class EndToEndRegimeMemory: EndToEndRegimeMemoryProviding, @unchecked Sendable {
    static let shared = EndToEndRegimeMemory(
        defaults: .standard, mirror: UserDefaults(suiteName: EndToEndShareMemory.appGroupIdentifier)
    )

    static let legacyStorageKey = "meeshy.e2ee.regime.v1"

    static func storageKey(account: String) -> String { "meeshy.e2ee.regime.v2.\(account)" }

    /// Le compte d'une base locale : son environnement et son utilisateur.
    static func account(of key: MessageStoreAccountKey) -> String { "\(key.environmentHost)/\(key.userId)" }

    private struct State {
        var account: String?
        var known: [String: EndToEndRegime]
    }

    private let defaults: UserDefaults?
    /// Le reflet que l'extension de partage lit (`EndToEndShareMemory`, #12985).
    private let mirror: UserDefaults?
    private let state = OSAllocatedUnfairLock(initialState: State(account: nil, known: [:]))

    /// `defaults: nil` : une mémoire du seul processus (tests, aperçus).
    init(defaults: UserDefaults?, mirror: UserDefaults? = nil) {
        self.defaults = defaults
        self.mirror = mirror
    }

    var isBound: Bool { state.withLock { $0.account != nil } }

    func bind(account: String?) {
        state.withLock { current in
            guard account == nil || account != current.account else { return }
            guard let account else {
                current = State(account: nil, known: [:])
                return
            }
            let learnedUnbound = current.account == nil ? current.known : [:]
            let known = [load(account), legacy(), learnedUnbound].reduce(into: [String: EndToEndRegime]()) { known, more in
                known.merge(more) { $0.merging($1) }
            }
            current = State(account: account, known: known)
            persist(known, for: account)
        }
    }

    func resolve(conversationId: String, served: EndToEndRegime) -> EndToEndRegime {
        state.withLock { current in
            let previous = current.known[conversationId]
            let merged = served.merging(previous)
            guard merged.isEndToEnd, merged != previous else { return merged }
            current.known[conversationId] = merged
            if let account = current.account { persist(current.known, for: account) }
            return merged
        }
    }

    private func load(_ account: String) -> [String: EndToEndRegime] {
        decode(defaults?.data(forKey: Self.storageKey(account: account)))
    }

    private func legacy() -> [String: EndToEndRegime] {
        decode(defaults?.data(forKey: Self.legacyStorageKey))
    }

    /// Une entrée illisible ne fait pas perdre les autres ; une date retenue
    /// dans le futur est bornée à l'instant de la relecture (#12936).
    private func decode(_ data: Data?) -> [String: EndToEndRegime] {
        data.flatMap { try? JSONDecoder().decode([String: RetainedRegime].self, from: $0) }?
            .compactMapValues(\.regime) ?? [:]
    }

    private func persist(_ known: [String: EndToEndRegime], for account: String) {
        guard let data = try? JSONEncoder().encode(known) else { return }
        defaults?.set(data, forKey: Self.storageKey(account: account))
        reflect(known, for: account)
    }

    /// Le compte lié dépose, pour l'extension de partage, les conversations
    /// qu'il a vues chiffrées de bout en bout — des identifiants, rien d'autre.
    private func reflect(_ known: [String: EndToEndRegime], for account: String) {
        guard let mirror, let owner = EndToEndShareMemory.ownerUserId(ofAccount: account) else { return }
        EndToEndShareMemory(ownerUserId: owner, conversationIds: known.filter { $0.value.isEndToEnd }.map(\.key))
            .write(to: mirror)
    }
}

/// Un régime retenu, y compris sous la forme des versions où le chiffrement se
/// désactivait (#12883) : une conversation qui a connu une ère chiffrée, même
/// close, reste chiffrée de bout en bout depuis le début de sa première ère.
/// Un champ illisible ne fait pas perdre les autres conversations.
private nonisolated struct RetainedRegime: Decodable {
    let regime: EndToEndRegime?

    private struct Era: Decodable {
        let start: Date?
    }

    private enum CodingKeys: String, CodingKey { case isEndToEnd, enabledAt, closedEras }

    init(from decoder: Decoder) {
        guard let container = try? decoder.container(keyedBy: CodingKeys.self) else {
            regime = nil
            return
        }
        let eras = (try? container.decodeIfPresent([Era].self, forKey: .closedEras)) ?? []
        let isEndToEnd = (try? container.decode(Bool.self, forKey: .isEndToEnd)) ?? false
        let enabledAt = try? container.decodeIfPresent(Date.self, forKey: .enabledAt)
        guard isEndToEnd || !eras.isEmpty else {
            regime = nil
            return
        }
        let starts: [Date?] = (isEndToEnd ? [enabledAt] : []) + eras.map(\.start)
        let earliest = starts.contains(nil) ? nil : starts.compactMap { $0 }.min()
        regime = EndToEndRegime(isEndToEnd: true, enabledAt: earliest.map { min($0, Date()) })
    }
}
