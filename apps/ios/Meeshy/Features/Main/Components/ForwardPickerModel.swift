import Foundation

/// Machine à états PURE du picker de transfert — la sémantique hybride exacte
/// décidée par le user (spec 2026-08-19, Volet A.6) :
/// 1. le bouton par-ligne envoie IMMÉDIATEMENT à cette seule cible ;
/// 2. toucher la ligne sélectionne (mode multi) — un bouton global envoie aux
///    sélectionnées ;
/// 3. une cible déjà servie n'est plus sélectionnable ;
/// 4. envoyer par-ligne une cible sélectionnée la retire de la sélection —
///    l'envoi groupé ne peut JAMAIS produire un doublon, par construction.
/// RÈGLE JUMELLE : apps/web/lib/forward-picker-model.ts — toute évolution
/// touche les deux sites.
struct ForwardPickerModel: Equatable {
    enum TargetState: Equatable {
        case idle
        case selected
        case sending
        case sent
        case failed(String)
    }

    private(set) var states: [String: TargetState] = [:]

    func state(of id: String) -> TargetState { states[id] ?? .idle }

    var selectedIds: [String] {
        states.filter { $0.value == .selected }.map(\.key).sorted()
    }

    var hasSelection: Bool { states.contains { $0.value == .selected } }

    mutating func tapRow(_ id: String) {
        switch state(of: id) {
        case .idle, .failed: states[id] = .selected
        case .selected: states[id] = .idle
        case .sending, .sent: break
        }
    }

    @discardableResult
    mutating func beginSend(_ id: String) -> Bool {
        switch state(of: id) {
        case .idle, .selected, .failed:
            states[id] = .sending
            return true
        case .sending, .sent:
            return false
        }
    }

    mutating func finishSend(_ id: String, outcome: ForwardOutcome) {
        guard state(of: id) == .sending else { return }
        switch outcome {
        case .sent, .queuedOffline: states[id] = .sent
        case .failed(let reason): states[id] = .failed(reason)
        }
    }

    mutating func beginBatch() -> [String] {
        let ids = selectedIds
        for id in ids { states[id] = .sending }
        return ids
    }
}
