import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Chaque case d'un message flouté ouvre SA pièce** (#8340).
///
/// Le voile d'une bulle floutée couvre toute la grille : un seul bouton, qui
/// ouvrait la PREMIÈRE pièce quelle que soit la case touchée. Les cases
/// publient leur cadre (`protectedGridCellBounds`) ; ce calque pose, AU-DESSUS
/// du voile, un bouton transparent par case, qui ouvre cette pièce-là. Hors
/// des cases, le voile garde son geste.
struct ProtectedGridCellTapLayer: ViewModifier {
    let cells: [MessageAttachment]
    let open: (MessageAttachment) -> Void

    func body(content: Content) -> some View {
        content.overlayPreferenceValue(ProtectedGridCellBoundsKey.self) { anchors in
            if !cells.isEmpty {
                GeometryReader { proxy in
                    ForEach(cells.compactMap { cell in anchors[cell.id].map { (cell, proxy[$0]) } }, id: \.0.id) { cell, frame in
                        Button {
                            HapticFeedback.medium()
                            open(cell)
                        } label: {
                            Color.clear.contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .frame(width: frame.width, height: frame.height)
                        .position(x: frame.midX, y: frame.midY)
                        .accessibilityLabel(ProtectedVeilAffordance.hiddenLabel)
                        .accessibilityHint(ProtectedContentTap.openFullscreenHint)
                    }
                }
            }
        }
    }
}

/// Le cadre de chaque case de grille, par identifiant de pièce.
struct ProtectedGridCellBoundsKey: PreferenceKey {
    static let defaultValue: [String: Anchor<CGRect>] = [:]

    static func reduce(value: inout [String: Anchor<CGRect>], nextValue: () -> [String: Anchor<CGRect>]) {
        value.merge(nextValue()) { _, next in next }
    }
}

extension View {
    /// Publie le cadre de la case `attachmentId` pour `ProtectedGridCellTapLayer`.
    func protectedGridCellBounds(_ attachmentId: String) -> some View {
        anchorPreference(key: ProtectedGridCellBoundsKey.self, value: .bounds) { [attachmentId: $0] }
    }
}

extension BubbleContent {
    /// Les cases qui prennent leur propre toucher sous le voile : celles d'un
    /// message FLOUTÉ à plusieurs pièces visuelles. Une pièce seule s'ouvre
    /// déjà par le voile ; une vue unique garde son geste (elle se consomme).
    var veiledGridCells: [MessageAttachment] {
        guard case .openFullscreen = protectedTap(), visualMedia.count > 1 else { return [] }
        return visualMedia.filter(ProtectedContentTap.opensFullscreen)
    }
}
