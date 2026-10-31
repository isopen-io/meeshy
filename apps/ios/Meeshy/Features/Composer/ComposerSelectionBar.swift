import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La barre d'un élément sélectionné** (#13839, L5, maquette validée, état
/// 3) — une rangée de verre sombre, posée sur la scène
/// au-dessus de Public et Publier : chaque action a son glyphe ET son mot,
/// Retirer, en rouge, à l'autre bout, loin de tout ✕. « Ordre » ouvre ses
/// choix en menu. Rien n'y est décidé : les actions arrivent composées par
/// `ComposerSelectionActions`.
struct ComposerSelectionBar: View {
    let actions: [ComposerSelectionAction]
    let orders: [ComposerSelectionOrder]
    let onAction: (ComposerSelectionAction) -> Void
    let onOrder: (ComposerSelectionOrder) -> Void

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        HStack(spacing: 0) {
            ForEach(actions.filter { !$0.isDestructive }, id: \.self) { action in
                item(action)
            }
            if let retirer = actions.first(where: \.isDestructive) {
                Spacer(minLength: MeeshySpacing.sm)
                item(retirer)
            }
        }
        .padding(.horizontal, MeeshySpacing.xs)
        .frame(minHeight: 44)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous),
                       tint: Color.black.opacity(ComposerSceneRoundGlyph.veil))
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(ComposerSelectionCopy.bar))
        .accessibilityIdentifier("composer.selection.bar")
    }

    @ViewBuilder
    private func item(_ action: ComposerSelectionAction) -> some View {
        if action == .order {
            Menu {
                ForEach(orders, id: \.self) { choix in
                    Button { onOrder(choix) } label: {
                        Label(ComposerSelectionCopy.label(choix), systemImage: ComposerSelectionCopy.symbol(choix))
                    }
                }
            } label: {
                label(action)
            }
            .accessibilityIdentifier("composer.selection.order")
        } else {
            Button { onAction(action) } label: { label(action) }
                .buttonStyle(.plain)
                .accessibilityIdentifier("composer.selection.\(action.rawValue)")
        }
    }

    private func label(_ action: ComposerSelectionAction) -> some View {
        VStack(spacing: 2) {
            Image(systemName: action.symbol)
                .font(.body.weight(.semibold))
            if !dynamicTypeSize.isAccessibilitySize {
                Text(ComposerSelectionCopy.label(action))
                    .font(.caption2.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .foregroundStyle(ComposerSelectionBarPaint.tint(action))
        .padding(.horizontal, MeeshySpacing.sm)
        .frame(minWidth: 44, minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(ComposerSelectionCopy.label(action)))
        .accessibilityAddTraits(.isButton)
    }
}

/// Ce que la barre PEINT : l'encre blanche du chrome, le rouge sémantique pour
/// la seule action qui détruit.
nonisolated enum ComposerSelectionBarPaint {
    static func tint(_ action: ComposerSelectionAction) -> Color {
        action.isDestructive ? MeeshyColors.error : ComposerFloatingRailInk.rest
    }
}

/// **L'en-tête des feuilles Modifier et Temps** (#13839, L5) : le titre, OK,
/// puis les puces LIBELLÉES — les sous-outils de l'objet, qui n'étaient au
/// rail droit que des glyphes — et les compléments d'un média.
struct ComposerSelectionSheetHeader: View {
    let title: String
    let chips: [ComposerObjectEditorSection]
    let open: ComposerObjectEditorSection?
    let extras: [ComposerSelectionMediaExtra]
    let keyframes: (() -> Void)?
    let onChip: (ComposerObjectEditorSection) -> Void
    let onExtra: (ComposerSelectionMediaExtra) -> Void
    let onDone: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            HStack {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(MeeshyColors.textPrimary(isDark: true))
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: MeeshySpacing.sm)
                Button(ComposerAnchoredSheetCopy.ok, action: onDone)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(MeeshyColors.brandPrimary)
                    .frame(minWidth: 44, minHeight: 44)
                    .keyboardShortcut(.defaultAction)
                    .accessibilityIdentifier("composer.selection.sheet.done")
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.xs) {
                    ForEach(chips, id: \.identifier) { section in
                        chip(symbol: ComposerObjectEditorRail.symbolName(section),
                             label: ComposerObjectEditorCopy.entry(section),
                             isOn: section == open) { onChip(section) }
                    }
                    ForEach(extras, id: \.self) { extra in
                        chip(symbol: extra.symbol, label: ComposerSelectionCopy.label(extra), isOn: false) {
                            onExtra(extra)
                        }
                    }
                    if let keyframes {
                        chip(symbol: "diamond", label: ComposerSelectionCopy.keyframes, isOn: false, action: keyframes)
                    }
                }
            }
        }
        .environment(\.colorScheme, .dark)
    }

    private func chip(symbol: String, label: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(label, systemImage: symbol)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .padding(.horizontal, MeeshySpacing.md)
                .frame(minHeight: 44)
                .foregroundStyle(isOn ? Color.black : MeeshyColors.textPrimary(isDark: true))
                .background(Capsule().fill(isOn ? Color.white : Color.white.opacity(0.14)))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}
