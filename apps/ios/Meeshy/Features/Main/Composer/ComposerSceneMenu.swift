import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le menu d'appui long de la scène, en verre (#8717)
//
// > Directive porteur 2026-09-29 : « Le menu du longpress, que ce soit sur
// > n'importe quel objet, doit être Liquid Glass, ou adaptatif Liquid Glass si
// > pas sur iOS 26 (réutilise le système de compatibilité existant). »
//
// Le `UIMenu` du canvas et le `confirmationDialog` du fond étaient des menus
// SYSTÈME : ni l'un ni l'autre ne se peint au verre du composer, et avant
// iOS 26 ils n'ont rien de Liquid Glass. Le menu est désormais une vue du
// composer posée sur `adaptiveGlass` — Liquid Glass sur iOS 26, matériau
// translucide avant, par l'UNIQUE implémentation du verre du dépôt.
//
// Ses entrées ne sont pas une liste de plus : un objet offre ce que
// `StoryCanvasContextAction.offered` lui accorde (filtré par
// `ComposerTrailingRailPolicy`), un fond ce que `ComposerBackgroundMenuAction`
// sert — les deux inventaires qui décidaient déjà des deux menus système.

/// **Ce que le doigt a désigné.**
nonisolated enum ComposerSceneMenuTarget: Equatable {
    case object(id: String, kind: StoryCanvasUIView.CanvasItemKind)
    case background(id: String)
}

/// **La demande de menu** : la cible, et le point du doigt normalisé sur la
/// carte (0…1). Le fond n'a pas de point — son menu se pose au centre.
nonisolated struct ComposerSceneMenuRequest: Equatable {
    let target: ComposerSceneMenuTarget
    var anchor: CGPoint = CGPoint(x: 0.5, y: 0.5)
}

nonisolated enum ComposerSceneMenu {

    enum Entry: Equatable, Identifiable {
        case object(StoryCanvasContextAction)
        case background(ComposerBackgroundMenuAction)

        var id: String {
            switch self {
            case .object(let action):     return "object.\(String(describing: action))"
            case .background(let action): return "background.\(action.rawValue)"
            }
        }

        /// La seule entrée qui DÉTRUIT se peint en couleur d'erreur et se range
        /// en dernier — les deux inventaires la placent déjà ainsi.
        var isDestructive: Bool {
            switch self {
            case .object(let action):     return action == .delete
            case .background(let action): return action.isDestructive
            }
        }
    }

    static func entries(objectActions: [StoryCanvasContextAction]) -> [Entry] {
        objectActions.map(Entry.object)
    }

    static func entries(backgroundActions: [ComposerBackgroundMenuAction]) -> [Entry] {
        backgroundActions.map(Entry.background)
    }

    /// **Où le menu se pose** : centré sur le doigt, sous lui s'il tient,
    /// au-dessus sinon — et toujours DANS l'écran, à `margin` des bords. Un
    /// menu qui déborde se lit à moitié et se touche encore moins.
    static func frame(anchor: CGPoint, menu: CGSize, container: CGSize, margin: CGFloat) -> CGRect {
        let largeur = min(menu.width, max(0, container.width - 2 * margin))
        let hauteur = min(menu.height, max(0, container.height - 2 * margin))
        let x = min(max(anchor.x - largeur / 2, margin), max(margin, container.width - margin - largeur))
        let sous = anchor.y + 12
        let dessus = anchor.y - 12 - hauteur
        let y0 = sous + hauteur <= container.height - margin ? sous : dessus
        let y = min(max(y0, margin), max(margin, container.height - margin - hauteur))
        return CGRect(x: x, y: y, width: largeur, height: hauteur)
    }

    /// Le point du doigt, de la carte (0…1) à l'écran.
    static func screenPoint(_ normalized: CGPoint, card: CGRect) -> CGPoint {
        CGPoint(x: card.minX + normalized.x * card.width,
                y: card.minY + normalized.y * card.height)
    }

    static let margin: CGFloat = 12
    static let width: CGFloat = 250
}

/// **Le menu, en verre** — une colonne de lignes (glyphe + verbe), 44 pt
/// minimum chacune, Dynamic Type compris ; VoiceOver le lit comme un groupe
/// modal, et le geste d'échappement le referme.
struct ComposerSceneContextMenu: View {
    let title: String?
    let entries: [ComposerSceneMenu.Entry]
    let plateauTint: Color
    let onSelect: (ComposerSceneMenu.Entry) -> Void
    let onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let title {
                Text(title)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(MeeshyColors.textSecondary(isDark: true))
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 4)
                    .accessibilityAddTraits(.isHeader)
            }
            ForEach(entries) { entree in
                Button {
                    onSelect(entree)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: ComposerSceneMenuPaint.symbol(entree))
                            .font(.body.weight(.semibold))
                            .frame(width: 24)
                        Text(ComposerSceneMenuPaint.label(entree))
                            .font(.body)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                    .foregroundStyle(entree.isDestructive
                                     ? MeeshyColors.error
                                     : MeeshyColors.textPrimary(isDark: true))
                    .padding(.horizontal, 16)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if entree != entries.last {
                    Divider().overlay(MeeshyColors.textSecondary(isDark: true).opacity(0.2))
                        .padding(.leading, 52)
                }
            }
        }
        .padding(.vertical, 4)
        .frame(width: ComposerSceneMenu.width)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 20, style: .continuous),
                       tint: plateauTint.opacity(0.55))
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape) { onDismiss() }
    }
}

/// Ce qu'une entrée PEINT — lu des deux inventaires qui la nomment déjà.
enum ComposerSceneMenuPaint {
    static func symbol(_ entry: ComposerSceneMenu.Entry) -> String {
        switch entry {
        case .object(let action):     return action.systemImage
        case .background(let action): return action.symbol
        }
    }

    static func label(_ entry: ComposerSceneMenu.Entry) -> String {
        switch entry {
        case .object(let action):     return action.title
        case .background(let action): return ComposerBackgroundMenuCopy.label(for: action)
        }
    }
}
