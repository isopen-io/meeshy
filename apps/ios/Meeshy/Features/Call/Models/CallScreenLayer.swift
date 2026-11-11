import Foundation

enum CallScreenPanel: String, CaseIterable, Sendable {
    case react
    case record
    case people
    case journal

    var action: CallAction {
        switch self {
        case .react: return .react
        case .record: return .recording
        case .people: return .addPeople
        case .journal: return .journal
        }
    }

    /// #17343 — Enregistrer, Réagir ET le Journal s'ouvrent dans la pilule ; Ajouter,
    /// qui présente la liste des amis, reste une feuille sous les rangées.
    var isDrawnInThePill: Bool {
        switch self {
        case .react, .record, .journal: return true
        case .people: return false
        }
    }
}

enum CallScreenMode: String, CaseIterable, Sendable {
    case effects
    case montage

    var action: CallAction {
        switch self {
        case .effects: return .effects
        case .montage: return .capture
        }
    }
}

enum CallScreenLayer: Equatable, Sendable {
    case idle
    case menu
    /// #17343 — le (…) ouvert PAR-DESSUS un journal : le journal est rangé, pas fermé ;
    /// refermer les actions le rend.
    case menuOverJournal
    case panel(CallScreenPanel)
    case mode(CallScreenMode)

    var openPanel: CallScreenPanel? {
        guard case .panel(let panel) = self else { return nil }
        return panel
    }

    var activeMode: CallScreenMode? {
        guard case .mode(let mode) = self else { return nil }
        return mode
    }

    var isExpanded: Bool {
        switch self {
        case .menu, .menuOverJournal, .panel: return true
        case .idle, .mode: return false
        }
    }

    var pillPanel: CallScreenPanel? {
        guard let panel = openPanel, panel.isDrawnInThePill else { return nil }
        return panel
    }

    var showsFamilyRows: Bool {
        switch self {
        case .menu, .menuOverJournal: return true
        case .panel(let panel): return !panel.isDrawnInThePill
        case .idle, .mode: return false
        }
    }

    var freesTheScreen: Bool {
        activeMode != nil
    }

    var mayAutoHide: Bool {
        switch self {
        case .idle, .menu, .menuOverJournal: return true
        case .panel, .mode: return false
        }
    }

    func togglingMenu() -> CallScreenLayer {
        switch self {
        case .idle: return .menu
        case .menu: return .idle
        case .panel(.journal): return .menuOverJournal
        case .menuOverJournal: return .panel(.journal)
        case .panel: return .idle
        case .mode: return self
        }
    }

    func opening(_ panel: CallScreenPanel) -> CallScreenLayer {
        switch self {
        case .mode: return self
        case .panel(let current) where current == panel: return .menu
        case .idle, .menu, .menuOverJournal, .panel: return .panel(panel)
        }
    }

    func backToMenu() -> CallScreenLayer {
        guard openPanel != nil else { return self }
        return .menu
    }

    func closed() -> CallScreenLayer {
        .idle
    }

    func entering(_ mode: CallScreenMode) -> CallScreenLayer {
        .mode(mode)
    }

    func exitingMode() -> CallScreenLayer {
        activeMode == nil ? self : .idle
    }

    func reconciled(with actions: CallActionSet) -> CallScreenLayer {
        switch self {
        case .panel(let panel) where !actions.contains(panel.action): return .menu
        case .mode(let mode) where !actions.contains(mode.action): return .idle
        case .idle, .menu, .menuOverJournal, .panel, .mode: return self
        }
    }
}
