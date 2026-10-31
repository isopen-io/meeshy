import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le ⋯ de la colonne : un `Menu` dont la face est le bouton rond de 44 pt.
/// Avant iOS 26, le libellé d'un `Menu` se détache de son verre ; la face est
/// alors peinte à côté et le `Menu` posé dessus, transparent, à la même taille.
struct ComposerSceneMoreMenu<Items: View>: View {
    let label: String
    @Binding var clearAllAsked: Bool
    let onClearAll: () -> Void
    @ViewBuilder let items: () -> Items

    var body: some View {
        face.confirmationDialog(ComposerMoreMenuCopy.clearAllConfirm, isPresented: $clearAllAsked,
                                titleVisibility: .visible) {
            Button(ComposerOverflowCopy.label(.clearAll), role: .destructive, action: onClearAll)
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
        }
    }

    @ViewBuilder
    private var face: some View {
        switch ComposerTopBarMenuFace.current {
        case .label:
            Menu(content: items) { ComposerSceneRoundGlyph(symbol: ComposerRestTool.more.symbol) }
                .accessibilityLabel(Text(label))
                .accessibilityIdentifier("composer.rest.more")
        case .detached:
            ComposerSceneRoundGlyph(symbol: ComposerRestTool.more.symbol)
                .accessibilityHidden(true)
                .overlay {
                    Menu(content: items) {
                        Color.clear
                            .frame(width: ComposerSceneRoundGlyph.size, height: ComposerSceneRoundGlyph.size)
                            .contentShape(Circle())
                    }
                    .accessibilityLabel(Text(label))
                    .accessibilityIdentifier("composer.rest.more")
                }
        }
    }
}

/// Les entrées de ⋯, servies par `ComposerMoreMenuPolicy`. Animation et Durée
/// ouvrent un sous-menu ; les autres remettent leur entrée au meuble, qui
/// l'aiguille vers la fonction qui l'exécutait déjà ailleurs.
struct ComposerSceneMoreMenuItems: View {
    let entries: [ComposerMoreMenuEntry]
    let isAnimated: Bool
    let duration: TimeInterval
    let onEntry: (ComposerMoreMenuEntry) -> Void
    let onAnimation: () -> Void
    let onTimeline: () -> Void
    let onDuration: (TimeInterval) -> Void

    var body: some View {
        ForEach(entries, id: \.self) { entree in item(entree) }
    }

    @ViewBuilder
    private func item(_ entree: ComposerMoreMenuEntry) -> some View {
        let libelle = Label(ComposerMoreMenuCopy.label(entree), systemImage: ComposerMoreMenuCopy.icon(entree))
        switch entree {
        case .animation:
            Menu { animationItems } label: { libelle }
        case .slideDuration:
            Menu { durationItems } label: { libelle }
        default:
            Button(role: entree.isDestructive ? .destructive : nil) { onEntry(entree) } label: { libelle }
        }
    }

    @ViewBuilder
    private var animationItems: some View {
        if isAnimated {
            Button(ComposerMoreMenuCopy.animationTimeline, action: onTimeline)
            Button(ComposerMoreMenuCopy.animationOff, role: .destructive, action: onAnimation)
        } else {
            Button(ComposerMoreMenuCopy.animationOn, action: onAnimation)
        }
    }

    @ViewBuilder
    private var durationItems: some View {
        let menu = ComposerMoreMenuPolicy.durationMenu(current: duration)
        ForEach(menu.choices, id: \.self) { secondes in
            Button {
                onDuration(secondes)
                HapticFeedback.light()
            } label: {
                if secondes == menu.selected {
                    Label(ComposerMoreMenuCopy.seconds(secondes), systemImage: "checkmark")
                } else {
                    Text(ComposerMoreMenuCopy.seconds(secondes))
                }
            }
        }
    }
}
