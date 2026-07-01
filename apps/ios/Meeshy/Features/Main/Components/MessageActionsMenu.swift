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

    private var accent: Color { Color(hex: accentHex) }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(actions.enumerated()), id: \.element) { index, action in
                if action == .delete {
                    Divider().overlay(accent.opacity(0.12))
                }
                row(action)
                if index < actions.count - 1 && actions[index + 1] != .delete {
                    Divider().overlay(accent.opacity(0.08)).padding(.leading, 52)
                }
            }
        }
        .padding(.vertical, 4)
        .frame(width: 240)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 16, style: .continuous), tint: accent.opacity(0.14))
        .shadow(color: accent.opacity(0.18), radius: 12, x: 0, y: 4)
        .shadow(color: .black.opacity(0.18), radius: 18, x: 0, y: 8)
        .accessibilityElement(children: .contain)
    }

    private func row(_ action: PrimaryAction) -> some View {
        let isDestructive = action == .delete
        let tint = isDestructive ? MeeshyColors.error : accent
        return Button {
            HapticFeedback.light()
            onSelect(action)
        } label: {
            HStack(spacing: 14) {
                Image(systemName: symbol(action))
                    .font(.system(size: 17, weight: .medium))
                    .symbolRenderingMode(.hierarchical)
                    .frame(width: 24)
                Text(label(action))
                    .font(.system(size: 16, weight: .regular))
                Spacer(minLength: 0)
                if action == .more {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .opacity(0.4)
                }
            }
            .foregroundStyle(tint)
            .padding(.horizontal, 16)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label(action))
        .accessibilityAddTraits(.isButton)
    }

    private func symbol(_ a: PrimaryAction) -> String {
        switch a {
        case .edit: return "pencil"
        case .translate: return "globe"
        case .copy: return "doc.on.doc"
        case .pin: return "pin.fill"
        case .unpin: return "pin.slash.fill"
        case .star: return "star.fill"
        case .unstar: return "star.slash.fill"
        case .more: return "ellipsis"
        case .delete: return "trash"
        }
    }

    private func label(_ a: PrimaryAction) -> String {
        switch a {
        case .edit: return String(localized: "action.edit", defaultValue: "Éditer", bundle: .main)
        case .translate: return String(localized: "action.translate", defaultValue: "Traduire", bundle: .main)
        case .copy: return String(localized: "action.copy", defaultValue: "Copier", bundle: .main)
        case .pin: return String(localized: "action.pin", defaultValue: "Épingler", bundle: .main)
        case .unpin: return String(localized: "action.unpin", defaultValue: "Désépingler", bundle: .main)
        case .star: return String(localized: "action.star", defaultValue: "Favori", bundle: .main)
        case .unstar: return String(localized: "action.unstar", defaultValue: "Retirer des favoris", bundle: .main)
        case .more: return String(localized: "action.more", defaultValue: "Plus…", bundle: .main)
        case .delete: return String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main)
        }
    }
}
