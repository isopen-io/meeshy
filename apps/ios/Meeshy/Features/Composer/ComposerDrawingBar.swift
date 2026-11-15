import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Un contrôle de la barre de dessin** (#13839) — l'état **D** de la maquette :
/// la scène entière, et une seule barre en bas. Le trio stylo · marqueur · gomme
/// remplace la carte « Pinceau » ; couleur, épaisseur et lissage déplient leur
/// panneau ; ↶ défait le dernier trait ; OK termine (l'ancien ✕ « Terminer
/// l'outil »).
enum ComposerDrawingBarItem: Hashable, Sendable {
    case brush(StrokeTool)
    case option(DrawingEditTool)
    case undo
    case done

    static let all: [ComposerDrawingBarItem] = [
        .brush(.pen), .brush(.marker), .brush(.eraser),
        .option(.color), .option(.thickness), .option(.smoothing),
        .undo, .done
    ]

    var symbol: String {
        switch self {
        case .brush(.pen): return "pencil.tip"
        case .brush(.marker): return "highlighter"
        case .brush(.eraser): return "eraser"
        case .option(.smoothing): return "point.topleft.down.curvedto.point.bottomright.up"
        case .option(let outil): return outil.sfSymbol
        case .undo: return "arrow.uturn.backward"
        case .done: return "checkmark"
        }
    }

    func isOn(brush: StrokeTool, expanded: DrawingEditTool?) -> Bool {
        switch self {
        case .brush(let pinceau): return pinceau == brush && expanded == nil
        case .option(let outil): return outil == expanded
        case .undo, .done: return false
        }
    }
}

enum ComposerDrawingBarCopy {

    static func label(_ item: ComposerDrawingBarItem) -> String {
        switch item {
        case .brush(.pen):
            return String(localized: "composer.drawing.pen", defaultValue: "Stylo", bundle: .main)
        case .brush(.marker):
            return String(localized: "composer.drawing.marker", defaultValue: "Marqueur", bundle: .main)
        case .brush(.eraser):
            return String(localized: "composer.drawing.eraser", defaultValue: "Gomme", bundle: .main)
        case .option(let outil):
            return outil.accessibilityLabel
        case .undo:
            return String(localized: "composer.drawing.undo", defaultValue: "Défaire le trait", bundle: .main)
        case .done:
            return String(localized: "composer.drawing.done", defaultValue: "OK", bundle: .main)
        }
    }

    static var bar: String {
        String(localized: "composer.drawing.bar", defaultValue: "Barre de dessin", bundle: .main)
    }
}

/// La barre elle-même. Elle reçoit des primitives et des fermetures : elle
/// n'observe pas le viewmodel, et ne se redessine que si ce qu'elle montre
/// change.
struct ComposerDrawingBar: View, Equatable {
    let brush: StrokeTool
    let expanded: DrawingEditTool?
    let canUndo: Bool
    let onItem: (ComposerDrawingBarItem) -> Void

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.brush == rhs.brush && lhs.expanded == rhs.expanded && lhs.canUndo == rhs.canUndo
    }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(ComposerDrawingBarItem.all, id: \.self) { item in
                button(item).frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, MeeshySpacing.xs)
        .adaptiveGlass(in: Capsule(), tint: Color.black.opacity(ComposerSceneRoundGlyph.veil))
        .padding(.horizontal, MeeshySpacing.smPlus)
        .padding(.bottom, MeeshySpacing.sm)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(ComposerDrawingBarCopy.bar))
    }

    private func button(_ item: ComposerDrawingBarItem) -> some View {
        let actif = item.isOn(brush: brush, expanded: expanded)
        let inerte = item == .undo && !canUndo
        return Button {
            onItem(item)
            HapticFeedback.light()
        } label: {
            Image(systemName: item.symbol)
                .font(.body.weight(.semibold))
                .foregroundStyle(ComposerFloatingRailInk.floating(active: actif))
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(inerte)
        .opacity(inerte ? 0.4 : 1)
        .accessibilityLabel(Text(ComposerDrawingBarCopy.label(item)))
        .accessibilityAddTraits(actif ? .isSelected : [])
        .accessibilityIdentifier("composer.drawing.\(ComposerDrawingBarCopy.identifier(item))")
    }
}

extension ComposerDrawingBarCopy {
    static func identifier(_ item: ComposerDrawingBarItem) -> String {
        switch item {
        case .brush(let pinceau): return "brush.\(pinceau.rawValue)"
        case .option(let outil): return "option.\(outil.rawValue)"
        case .undo: return "undo"
        case .done: return "done"
        }
    }
}

/// Ce que chaque contrôle de la barre fait au viewmodel. `false` ⇒ OK : le
/// meuble referme l'outil par son chemin unique (`handleRailExitTool`).
enum ComposerDrawingBarDispatch {
    static func apply(_ item: ComposerDrawingBarItem, to viewModel: StoryComposerViewModel) -> Bool {
        switch item {
        case .brush(let pinceau):
            // Le pinceau règle le PROCHAIN trait : la sélection d'un trait posé
            // est levée, le panneau replié, et le doigt trace.
            if viewModel.drawingEditingMode.selectedStrokeId != nil { viewModel.selectStroke(nil) }
            viewModel.setExpandedDrawingTool(nil)
            viewModel.activeBrushTool = pinceau
            viewModel.enterImmersiveDrawing()
        case .option(let outil):
            if viewModel.drawingEditingMode.selectedStrokeId != nil { viewModel.selectStroke(nil) }
            viewModel.setExpandedDrawingTool(viewModel.drawingEditingMode.expandedTool == outil ? nil : outil)
        case .undo:
            viewModel.undoLastStroke()
        case .done:
            return false
        }
        return true
    }
}
