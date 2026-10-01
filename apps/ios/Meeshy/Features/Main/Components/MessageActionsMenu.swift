import SwiftUI
import MeeshySDK
import MeeshyUI

/// Liste d'actions verticale de l'overlay appui-long.
///
/// **Sans cadre** (directive porteur 2026-10-01, #9043 — « enlever le cadre
/// comme pour les story ») : ni carte de verre, ni bordure, ni séparateurs.
/// Les rangées se posent NUES sur le voile de l'overlay, exactement comme la
/// rangée d'émojis et le rail d'une story se posent nus sur leur scène
/// (`FullscreenReactionStrip`, `chrome: .none` ; `FullscreenActionStyle.floating`).
/// Le voile étant toujours sombre, le libellé est clair et porte le halo de
/// lisibilité des rails de story (`legibleOverCanvas`) ; l'icône garde l'accent
/// de la conversation.
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
            ForEach(actions, id: \.self) { action in
                row(action)
            }
        }
        .padding(.vertical, MeeshySpacing.xsPlus)
        .frame(width: Self.menuWidth)
        .accessibilityElement(children: .contain)
    }

    private func row(_ action: PrimaryAction) -> some View {
        Button {
            HapticFeedback.light()
            onSelect(action)
        } label: {
            HStack(spacing: MeeshySpacing.mdPlus) {
                Image(systemName: symbol(action))
                    .font(MeeshyFont.relative(17, weight: .medium))
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(accent)
                    .frame(width: iconColumnWidth)
                Text(label(action))
                    .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .medium))
                    .foregroundStyle(MeeshyColors.textPrimary(isDark: true))
                Spacer(minLength: 0)
                if action == .more {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundStyle(MeeshyColors.textPrimary(isDark: true))
                        .opacity(0.5)
                }
            }
            .legibleOverCanvas()
            .padding(.horizontal, MeeshySpacing.lg)
            .frame(minHeight: rowMinHeight)
            .contentShape(Rectangle())
        }
        // Parité menus système : highlight de la ligne pressée (UIMenu /
        // Liquid Glass iOS 26). Style interne partagé avec le menu conversation.
        .buttonStyle(MenuRowHighlightButtonStyle())
        .accessibilityLabel(label(action))
        .accessibilityAddTraits(.isButton)
    }

    /// La hauteur d'une rangée — celle du menu système. Elle est PRÉSERVÉE
    /// (directive porteur 2026-10-01, #9043) : seule la bande d'emojis
    /// s'allonge (`MessageOverlayMenu.emojiBandLengthFactor`).
    static let rowHeight: CGFloat = 44
    static let menuWidth: CGFloat = 240

    /// Taille déterministe pour un nombre d'actions donné — utilisée par le
    /// conteneur de l'overlay pour positionner le menu sans PreferenceKey.
    /// La hauteur de référence est scalée par `UIFontMetrics` pour rester
    /// cohérente avec le rendu Dynamic Type (`@ScaledMetric` côté vue).
    static func estimatedSize(actionCount: Int) -> CGSize {
        let count = max(1, actionCount)
        let scaledRow = UIFontMetrics.default.scaledValue(for: rowHeight)
        // +20 : rembourrage vertical de référence (6+6) + marge d'arrondi.
        return CGSize(width: menuWidth, height: CGFloat(count) * scaledRow + 20)
    }

    private func symbol(_ a: PrimaryAction) -> String {
        switch a {
        case .edit: return "pencil"
        case .translate: return "globe"
        case .copy: return "doc.on.doc"
        case .saveMedia: return "arrow.down.to.line"
        case .compose: return "wand.and.stars"
        case .more: return "ellipsis"
        case .callDetail: return "info.circle"
        case .select: return "checkmark.circle"
        case .exportImage: return MessageCardExportMenu.imageSymbol
        case .exportQuick: return MessageCardExportMenu.quickSymbol
        }
    }

    private func label(_ a: PrimaryAction) -> String {
        switch a {
        case .edit: return String(localized: "action.edit", defaultValue: "Modifier", bundle: .main)
        case .translate: return String(localized: "action.translate", defaultValue: "Traduire", bundle: .main)
        case .copy: return String(localized: "action.copy", defaultValue: "Copier", bundle: .main)
        case .saveMedia: return String(localized: "media.save.title", defaultValue: "Enregistrer", bundle: .main)
        case .compose: return String(localized: "message.compose.title", defaultValue: "Composer", bundle: .main)
        case .more: return String(localized: "action.more", defaultValue: "Plus…", bundle: .main)
        case .callDetail: return String(localized: "bubble.call.details.action", defaultValue: "Détails de l'appel", bundle: .main)
        case .select: return String(localized: "action.select", defaultValue: "Sélectionner", bundle: .main)
        case .exportImage: return MessageCardExportMenu.imageLabel
        case .exportQuick: return MessageCardExportMenu.quickLabel
        }
    }
}
