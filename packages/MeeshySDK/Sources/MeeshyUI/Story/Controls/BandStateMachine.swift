import Foundation

// MARK: - Category & ElementKind

public enum BandCategory: Equatable, Sendable {
    case contenu, effets

    public var swapped: BandCategory {
        switch self {
        case .contenu: return .effets
        case .effets: return .contenu
        }
    }
}

public enum BandElementKind: Equatable, Sendable {
    case text, media
}

// MARK: - BandState

public enum BandState: Equatable, Sendable {
    case hidden
    case tiles(BandCategory)
    case toolPanel(StoryToolMode)
    case formatPanel(BandElementKind, elementId: String)

    public var activeCategory: BandCategory? {
        switch self {
        case .hidden, .formatPanel: return nil
        case .tiles(let c): return c
        case .toolPanel(let t): return t.bandCategory
        }
    }
}

// MARK: - StoryToolMode.bandCategory

extension StoryToolMode {
    /// Bridges the existing `StoryToolMode` enum to `BandCategory` for the new layer.
    /// Kept separate from the existing `tab: StoryTab` property to avoid coupling
    /// the legacy `ContextualToolbar` symbol (`StoryTab`) with the new layer.
    public var bandCategory: BandCategory {
        switch self {
        case .media, .drawing, .text, .texture: return .contenu
        case .filters, .timeline: return .effets
        }
    }
}

// MARK: - BandStateMachine

public struct BandStateMachine: Equatable, Sendable {
    public private(set) var state: BandState = .hidden
    private var lastCategoryBeforeFormat: BandCategory? = nil

    public init() {}

    public mutating func tapFAB(_ category: BandCategory) {
        switch state {
        case .hidden:
            state = .tiles(category)
        case .tiles(let current):
            state = (current == category) ? .hidden : .tiles(category)
        case .toolPanel(let tool):
            state = (tool.bandCategory == category) ? .hidden : .tiles(category)
        case .formatPanel:
            // Format panel takes precedence — tap on FAB does not interrupt it.
            break
        }
    }

    public mutating func swipeUpOnFAB(_ category: BandCategory) {
        // Force open (idempotent on same category).
        switch state {
        case .formatPanel:
            break  // formatPanel takes precedence
        default:
            state = .tiles(category)
        }
    }

    public mutating func swipeDownOnBand() {
        switch state {
        case .hidden:
            break  // no-op
        case .tiles:
            state = .hidden
        case .toolPanel(let tool):
            state = .tiles(tool.bandCategory)
        case .formatPanel:
            closeFormatPanel()
        }
    }

    public mutating func swipeHorizontalOnBand() {
        switch state {
        case .tiles(let current):
            state = .tiles(current.swapped)
        case .hidden, .toolPanel, .formatPanel:
            break  // explicitly no-op (collision with sliders / format controls)
        }
    }

    public mutating func openFormatPanel(_ kind: BandElementKind, id: String) {
        // Save the current category if applicable, so closeFormatPanel can restore
        switch state {
        case .tiles(let c):
            lastCategoryBeforeFormat = c
        case .toolPanel(let t):
            lastCategoryBeforeFormat = t.bandCategory
        case .hidden, .formatPanel:
            lastCategoryBeforeFormat = nil
        }
        state = .formatPanel(kind, elementId: id)
    }

    public mutating func tapTile(_ tool: StoryToolMode) {
        switch state {
        case .formatPanel:
            break  // formatPanel takes precedence
        default:
            state = .toolPanel(tool)
        }
    }

    public mutating func closeFormatPanel() {
        switch state {
        case .formatPanel:
            if let last = lastCategoryBeforeFormat {
                state = .tiles(last)
            } else {
                state = .hidden
            }
            lastCategoryBeforeFormat = nil
        default:
            break
        }
    }

    public mutating func backFromToolPanel() {
        switch state {
        case .toolPanel(let tool):
            state = .tiles(tool.bandCategory)
        default:
            break
        }
    }

    public mutating func reset() {
        state = .hidden
        lastCategoryBeforeFormat = nil
    }
}
