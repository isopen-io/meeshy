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

    var isDrawnInThePill: Bool {
        switch self {
        case .react, .record: return true
        case .people, .journal: return false
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
        case .menu, .panel: return true
        case .idle, .mode: return false
        }
    }

    var pillPanel: CallScreenPanel? {
        guard let panel = openPanel, panel.isDrawnInThePill else { return nil }
        return panel
    }

    var showsFamilyRows: Bool {
        switch self {
        case .menu: return true
        case .panel(let panel): return !panel.isDrawnInThePill
        case .idle, .mode: return false
        }
    }

    var freesTheScreen: Bool {
        activeMode != nil
    }

    var mayAutoHide: Bool {
        switch self {
        case .idle, .menu: return true
        case .panel, .mode: return false
        }
    }

    func togglingMenu() -> CallScreenLayer {
        switch self {
        case .idle: return .menu
        case .menu, .panel: return .idle
        case .mode: return self
        }
    }

    func opening(_ panel: CallScreenPanel) -> CallScreenLayer {
        switch self {
        case .mode: return self
        case .panel(let current) where current == panel: return .menu
        case .idle, .menu, .panel: return .panel(panel)
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
        case .idle, .menu, .panel, .mode: return self
        }
    }
}

enum CallCameraRail {
    static let order: [CallAction] = [.flipCamera, .cameraPicker, .camera, .effects, .screenShare]

    static func actions(from set: CallActionSet) -> [CallAction] {
        order.filter { set.myImage.contains($0) }
    }

    static func isMyImageFullScreen(isGroupStage: Bool, isSelfFeatured: Bool, isLocalPrimary: Bool) -> Bool {
        isGroupStage ? isSelfFeatured : isLocalPrimary
    }

    static func isShown(isMyImageFullScreen: Bool, chrome: CallChromeVisibility) -> Bool {
        isMyImageFullScreen && chrome.isVisible(.controls)
    }
}
