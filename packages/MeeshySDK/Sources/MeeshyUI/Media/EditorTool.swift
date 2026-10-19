import Foundation

// MARK: - Editor Tool

/// One tool reachable from the floating FAB cluster. `CaseIterable` drives the
/// FAB column and the in-controller tool switcher.
enum EditorTool: String, CaseIterable, Identifiable {
    case crop, filters, adjust, effects

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .crop: return "crop"
        case .filters: return "camera.filters"
        case .adjust: return "slider.horizontal.3"
        case .effects: return "sparkles"
        }
    }

    var label: String {
        switch self {
        case .crop: return String(localized: "media.editor.tool.crop", defaultValue: "Recadrer", bundle: .module)
        case .filters: return String(localized: "media.editor.tool.filters", defaultValue: "Filtres", bundle: .module)
        case .adjust: return String(localized: "media.editor.tool.adjust", defaultValue: "Ajuster", bundle: .module)
        case .effects: return String(localized: "media.editor.tool.effects", defaultValue: "Effets", bundle: .module)
        }
    }

    /// Tools available in Simple mode. Pro mode exposes every tool.
    var isEssential: Bool { self != .effects }

    static func rail(for mode: ImageEditorMode) -> [EditorTool] {
        mode.isPro ? allCases : allCases.filter(\.isEssential)
    }
}
