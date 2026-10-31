import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le rail « SÉLECTION » du grand écran** (#13839, L6 ; #13957, R6).
///
/// Les options d'un objet sélectionné, composées par la MÊME loi (`ComposerSelectionActions`) et remises par le
/// même relais : Modifier · Dupliquer · Temps, puis Retirer en rouge, à l'écart. Il prend la place du rail des
/// outils, à gauche, tant que l'objet est sélectionné (`ComposerSelectionChrome.leadingRail`) ; à droite, il ne
/// porte plus que ↶ ↷, au pied, seulement avec un historique — sa place reste, la scène ne bouge pas.
struct ComposerSelectionRail: View {
    let selection: ComposerSelectionColumn?
    var onUndo: (() -> Void)?
    var onRedo: (() -> Void)?

    private static let inset: CGFloat = MeeshySpacing.xsPlus

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            if let selection { header(selection.level) }
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: MeeshySpacing.xs) { actions }
            }
            Spacer(minLength: 0)
            history
        }
        .padding(Self.inset)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous),
                       tint: Color.black.opacity(ComposerSceneRoundGlyph.veil))
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("composer.rail.selection")
    }

    private func header(_ level: ComposerEditRailLevel) -> some View {
        Text(level == .actions ? ComposerLabeledRailCopy.selection : ComposerEditRailCopy.railLabel(level))
            .font(.caption2.weight(.semibold))
            .foregroundStyle(ComposerFloatingRailInk.rest.opacity(0.6))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.top, MeeshySpacing.xs)
            .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder
    private var actions: some View {
        if let selection {
            ForEach(selection.items.filter { !$0.isDestructive }, id: \.self) { item in
                row(item, in: selection)
            }
            if let retirer = selection.items.first(where: \.isDestructive) {
                Divider().overlay(ComposerFloatingRailInk.rest.opacity(0.2)).padding(.vertical, MeeshySpacing.xs)
                row(retirer, in: selection)
            }
        }
    }

    private func row(_ item: ComposerEditRailItem, in selection: ComposerSelectionColumn) -> some View {
        let ouverte = selection.isOn(item)
        return Button { selection.onItem(item) } label: {
            ComposerLabeledRailRow(symbol: ComposerEditRailCopy.symbol(item), label: ComposerEditRailCopy.label(item),
                                   isOn: ouverte, tint: ComposerSelectionPaint.tint(item))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(ComposerEditRailCopy.label(item)))
        .accessibilityAddTraits(ouverte ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("composer.rail.selection.\(item.identifier)")
    }

    @ViewBuilder
    private var history: some View {
        if onUndo != nil || onRedo != nil {
            HStack(spacing: MeeshySpacing.sm) {
                if let onUndo {
                    historyButton(symbol: "arrow.uturn.backward", label: ComposerHistoryCopy.undo,
                                  id: "composer.history.undo", action: onUndo)
                }
                if let onRedo {
                    historyButton(symbol: "arrow.uturn.forward", label: ComposerHistoryCopy.redo,
                                  id: "composer.history.redo", action: onRedo)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func historyButton(symbol: String, label: String, id: String,
                               action: @escaping () -> Void) -> some View {
        Button {
            action()
            HapticFeedback.light()
        } label: {
            ComposerSceneRoundGlyph(symbol: symbol)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
        .accessibilityIdentifier(id)
    }
}
