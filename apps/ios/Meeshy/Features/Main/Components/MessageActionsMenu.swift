import SwiftUI
import MeeshySDK
import MeeshyUI

/// Liste d'actions verticale de l'overlay appui-long (style iMessage).
/// Icône monochrome à l'accent de la conversation, sauf destructif rouge.
/// Une seule capsule glass ; remplace la quick action bar + la grille.
struct MessageActionsMenu: View {
    let actions: [PrimaryAction]
    let accentHex: String
    let onSelect: (PrimaryAction) -> Void

    // Dynamic Type : la hauteur de row et la colonne d'icône scalent avec la
    // taille de texte préférée. `estimatedSize` (statique, utilisée par
    // l'overlay pour positionner le menu sans PreferenceKey) applique le même
    // facteur via `UIFontMetrics` → le calcul de layout reste cohérent avec le
    // rendu quelle que soit la taille Dynamic Type.
    @ScaledMetric(relativeTo: .body) private var rowMinHeight: CGFloat = MessageActionsMenu.rowHeight
    @ScaledMetric(relativeTo: .body) private var iconColumnWidth: CGFloat = 24

    private var accent: Color { Color(hex: accentHex) }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(actions.enumerated()), id: \.element) { index, action in
                row(action)
                if index < actions.count - 1 {
                    Divider().overlay(accent.opacity(MeeshyOpacity.subtle)).padding(.leading, 52)
                }
            }
        }
        .padding(.vertical, MeeshySpacing.xsPlus)
        .frame(width: Self.menuWidth)
        // Design système par version d'iOS : Liquid Glass natif iOS 26
        // (`.regular` pur, sans teinte ni ombre manuelle) / fallback material
        // avant — MÊME rendu que le menu des lignes de conversation
        // (`ConversationContextMenuView`, validé par les guards). L'ancienne
        // teinte à l'accent + double ombre faisaient un chrome maison qui
        // divergeait du menu système ; la séparation avec le fond vient
        // désormais du voile de l'overlay, comme pour le menu conversation.
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xlPlus, style: .continuous))
        .accessibilityElement(children: .contain)
    }

    private func row(_ action: PrimaryAction) -> some View {
        // Le destructif en rouge, isolé du reste de la liste (#9908) : la pièce
        // comme le message (`PrimaryAction.isDestructive`).
        let tint = action.isDestructive ? MeeshyColors.error : accent
        return Button {
            HapticFeedback.light()
            onSelect(action)
        } label: {
            HStack(spacing: MeeshySpacing.mdPlus) {
                Image(systemName: action.verb.symbol)
                    .font(MeeshyFont.relative(17, weight: .medium))
                    .symbolRenderingMode(.hierarchical)
                    .frame(width: iconColumnWidth)
                Text(action.verb.label)
                    .font(MeeshyFont.relative(MeeshyFont.calloutSize))
                Spacer(minLength: 0)
                if action == .more {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .opacity(0.4)
                }
            }
            .foregroundStyle(tint)
            .padding(.horizontal, MeeshySpacing.lg)
            .frame(minHeight: rowMinHeight)
            .contentShape(Rectangle())
        }
        // Parité menus système : highlight de la ligne pressée (UIMenu /
        // Liquid Glass iOS 26). Style interne partagé avec le menu conversation.
        .buttonStyle(MenuRowHighlightButtonStyle())
        .accessibilityLabel(action.verb.label)
        .accessibilityAddTraits(.isButton)
    }

    static let rowHeight: CGFloat = 44
    static let menuWidth: CGFloat = 240

    /// Taille déterministe pour un nombre d'actions donné — utilisée par le
    /// conteneur de l'overlay pour positionner le menu sans PreferenceKey.
    /// La hauteur de row est scalée par `UIFontMetrics` pour rester cohérente
    /// avec le rendu Dynamic Type (`@ScaledMetric` côté vue). À la taille par
    /// défaut, `scaledValue(for: 44) == 44` → aucun changement de layout.
    static func estimatedSize(actionCount: Int) -> CGSize {
        let count = max(1, actionCount)
        let scaledRow = UIFontMetrics.default.scaledValue(for: rowHeight)
        // +20 : padding vertical (6+6) + marge des séparateurs/divider delete.
        return CGSize(width: menuWidth, height: CGFloat(count) * scaledRow + 20)
    }
}
