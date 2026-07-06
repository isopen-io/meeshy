import Foundation

// MARK: - Category & ElementKind

public nonisolated enum BandCategory: Equatable, Sendable {
    case media, son, text, drawing, filters, timeline, texture
}

public nonisolated enum BandElementKind: Equatable, Sendable {
    case text, media
}

// MARK: - BandState

public nonisolated enum BandState: Equatable, Sendable {
    case hidden
    case toolPanel(StoryToolMode)
    case formatPanel(BandElementKind, elementId: String)

    public var activeCategory: BandCategory? {
        switch self {
        case .hidden, .formatPanel: return nil
        case .toolPanel(let t): return t.bandCategory
        }
    }

    /// Whether the bottom band can be dragged via its grabber to resize and
    /// collapse to a handle (canvas-full) — for ANY tool panel, not just drawing.
    /// Historically only `.drawing` was resizable; the user wants the retract
    /// handle on every editing tool (2026-06-02). The format sub-panel and the
    /// hidden state keep their non-resizable behaviour.
    public var allowsCollapsibleDrawer: Bool {
        switch self {
        case .toolPanel: return true
        case .hidden, .formatPanel: return false
        }
    }
}

// MARK: - StoryToolMode.bandCategory

nonisolated extension StoryToolMode {
    /// Bridges the existing `StoryToolMode` enum to `BandCategory` for the new layer.
    public var bandCategory: BandCategory {
        switch self {
        case .media: return .media
        case .texture: return .texture
        case .audio: return .son
        case .drawing: return .drawing
        case .text: return .text
        case .filters: return .filters
        case .timeline: return .timeline
        }
    }

    /// Helper to convert category back to a default tool mode.
    public static func from(category: BandCategory) -> StoryToolMode {
        switch category {
        case .media: return .media
        case .texture: return .texture
        case .son: return .audio
        case .text: return .text
        case .drawing: return .drawing
        case .filters: return .filters
        case .timeline: return .timeline
        }
    }
}

// MARK: - BandStateMachine

public nonisolated struct BandStateMachine: Equatable, Sendable {
    public private(set) var state: BandState = .hidden

    public init() {}

    public mutating func tapFAB(_ category: BandCategory) {
        // La timeline se présente en SHEET (ComposerToolPanelHost la rend en
        // EmptyView, panelHeight 0) — le band ne doit jamais atteindre
        // .toolPanel(.timeline). Les call sites ouvrent la sheet à la place.
        guard category != .timeline else { return }
        switch state {
        case .hidden:
            state = .toolPanel(StoryToolMode.from(category: category))
        case .toolPanel(let tool):
            if tool.bandCategory == category {
                state = .hidden
            } else {
                state = .toolPanel(StoryToolMode.from(category: category))
            }
        case .formatPanel:
            // Format panel takes precedence — tap on FAB does not interrupt it.
            break
        }
    }

    public mutating func swipeUpOnFAB(_ category: BandCategory) {
        guard category != .timeline else { return }  // sheet-only (cf. tapFAB)
        // Force open (idempotent on same category).
        switch state {
        case .formatPanel:
            break  // formatPanel takes precedence
        default:
            state = .toolPanel(StoryToolMode.from(category: category))
        }
    }

    public mutating func swipeDownOnBand() {
        switch state {
        case .hidden:
            break  // no-op
        case .toolPanel:
            state = .hidden
        case .formatPanel:
            closeFormatPanel()
        }
    }

    public mutating func openFormatPanel(_ kind: BandElementKind, id: String) {
        state = .formatPanel(kind, elementId: id)
    }

    public mutating func tapTile(_ tool: StoryToolMode) {
        guard tool != .timeline else { return }  // sheet-only (cf. tapFAB)
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
            state = .hidden
        default:
            break
        }
    }

    public mutating func backFromToolPanel() {
        switch state {
        case .toolPanel:
            state = .hidden
        default:
            break
        }
    }

    public mutating func reset() {
        state = .hidden
    }
}
