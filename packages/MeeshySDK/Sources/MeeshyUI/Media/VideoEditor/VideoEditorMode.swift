import Foundation

/// Simple vs Pro editing surface — mirrors the Story timeline's
/// `TimelineMode`. `.simple` keeps a single clip and a curated tool set;
/// `.pro` unlocks splitting, per-segment editing and the full tool grid.
public nonisolated enum VideoEditorMode: String, CaseIterable, Sendable {
    case simple
    case pro

    public var toggled: VideoEditorMode {
        self == .simple ? .pro : .simple
    }

    public var isPro: Bool { self == .pro }
}

/// FAB-level grouping of tools — one floating action button per category,
/// exactly like the Story composer's Contenu / Effets split.
public nonisolated enum VideoEditorToolCategory: String, CaseIterable, Sendable {
    case edit
    case style

    public var title: String {
        switch self {
        case .edit:  return "Découpe"
        case .style: return "Habillage"
        }
    }

    public var icon: String {
        switch self {
        case .edit:  return "scissors"
        case .style: return "wand.and.stars"
        }
    }

    public var tools: [VideoEditorTool] {
        VideoEditorTool.allCases.filter { $0.category == self }
    }
}

/// A single editing capability. Selecting one opens its controller panel in
/// the bottom band.
public nonisolated enum VideoEditorTool: String, CaseIterable, Identifiable, Sendable {
    case trim
    case split
    case speed
    case crop
    case rotate
    case filter
    case adjust
    case audio
    case captions

    public var id: String { rawValue }

    public var category: VideoEditorToolCategory {
        switch self {
        case .trim, .split, .speed:
            return .edit
        case .crop, .rotate, .filter, .adjust, .audio, .captions:
            return .style
        }
    }

    public var title: String {
        switch self {
        case .trim:     return "Rogner"
        case .split:    return "Diviser"
        case .speed:    return "Vitesse"
        case .crop:     return "Cadrer"
        case .rotate:   return "Pivoter"
        case .filter:   return "Filtres"
        case .adjust:   return "Couleur"
        case .audio:    return "Audio"
        case .captions: return "Sous-titres"
        }
    }

    public var icon: String {
        switch self {
        case .trim:     return "selection.pin.in.out"
        case .split:    return "scissors"
        case .speed:    return "speedometer"
        case .crop:     return "crop"
        case .rotate:   return "rotate.right"
        case .filter:   return "camera.filters"
        case .adjust:   return "dial.medium"
        case .audio:    return "waveform"
        case .captions: return "captions.bubble"
        }
    }

    /// Tools only meaningful once the timeline can hold several segments.
    public var isProOnly: Bool {
        self == .split
    }

    public func isAvailable(in mode: VideoEditorMode) -> Bool {
        mode.isPro || !isProOnly
    }
}

/// Which controller (if any) the bottom band is currently showing.
public nonisolated enum VideoEditorPanel: Equatable, Sendable {
    case none
    case tiles(VideoEditorToolCategory)
    case tool(VideoEditorTool)

    public var activeCategory: VideoEditorToolCategory? {
        switch self {
        case .none:               return nil
        case .tiles(let c):       return c
        case .tool(let t):        return t.category
        }
    }

    public var activeTool: VideoEditorTool? {
        if case .tool(let t) = self { return t }
        return nil
    }

    public var isVisible: Bool {
        self != .none
    }
}
