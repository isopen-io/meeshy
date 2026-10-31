import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le rail droit du grand écran, « SÉLECTION »** (#13839, L6, maquette validée).
///
/// Les actions de la barre de sélection (L5), composées par la MÊME loi (`ComposerSelectionActions`) et remises
/// par le même relais : Modifier · Dupliquer · Temps, puis Retirer en rouge, à l'écart. Sans sélection, le
/// rail reste en place et vide — la scène ne bouge pas quand on sélectionne. ↶ ↷ au pied, seulement avec un
/// historique.
struct ComposerSelectionRail: View {
    let selection: ComposerSelectionBar?
    var onUndo: (() -> Void)?
    var onRedo: (() -> Void)?

    private static let inset: CGFloat = MeeshySpacing.xsPlus

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            Text(ComposerLabeledRailCopy.selection)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(ComposerFloatingRailInk.rest.opacity(0.6))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.horizontal, MeeshySpacing.sm)
                .padding(.top, MeeshySpacing.xs)
                .accessibilityAddTraits(.isHeader)
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

    @ViewBuilder
    private var actions: some View {
        if let selection {
            ForEach(selection.actions.filter { !$0.isDestructive }, id: \.self) { action in
                item(action, in: selection)
            }
            if let retirer = selection.actions.first(where: \.isDestructive) {
                Divider().overlay(ComposerFloatingRailInk.rest.opacity(0.2)).padding(.vertical, MeeshySpacing.xs)
                item(retirer, in: selection)
            }
        }
    }

    private func item(_ action: ComposerSelectionAction, in selection: ComposerSelectionBar) -> some View {
        Button { selection.onAction(action) } label: {
            ComposerLabeledRailRow(symbol: action.symbol, label: ComposerSelectionCopy.label(action),
                                   tint: ComposerSelectionBarPaint.tint(action))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(ComposerSelectionCopy.label(action)))
        .accessibilityIdentifier("composer.rail.selection.\(action.rawValue)")
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
