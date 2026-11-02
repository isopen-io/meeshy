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
    /// Sur le rail libellé du grand écran (#13839, L6), la face est la rangée « ⋯ Plus ».
    var railLabel: String? = nil
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
        if let railLabel {
            Menu(content: items) { ComposerLabeledRailRow(symbol: ComposerRestTool.more.symbol, label: railLabel) }
                .accessibilityLabel(Text(label))
                .accessibilityIdentifier("composer.rail.plus")
        } else {
            roundFace
        }
    }

    @ViewBuilder
    private var roundFace: some View {
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
    let onEntry: (ComposerMoreMenuEntry) -> Void
    let onAnimation: () -> Void
    let onTimeline: () -> Void

    var body: some View {
        ForEach(entries, id: \.self) { entree in item(entree) }
    }

    @ViewBuilder
    private func item(_ entree: ComposerMoreMenuEntry) -> some View {
        let libelle = Label(ComposerMoreMenuCopy.label(entree), systemImage: ComposerMoreMenuCopy.icon(entree))
        switch entree {
        case .animation:
            Menu { animationItems } label: { libelle }
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
}

/// **Qui PEINT le visage d'un menu rond** (#10542) — le ⋯ de la colonne, depuis
/// que la barre haute qui l'a vu naître a quitté le projet (#13907).
///
/// Retour porteur 2026-10-13, iOS 17.5 : le `⋯` se lisait plus bas que la croix
/// et le `(+)`, dans une rangée qui les centre pourtant tous les trois. La
/// croix et le `(+)` sont des `Button`, mis en page par SwiftUI de bout en
/// bout ; le libellé d'un `Menu` est peint par le système, qui n'en garantit
/// pas la place là où la barre monte dans la zone sûre. Sans verre natif, le
/// visage sort donc du `Menu` : une vue ordinaire de la rangée, comme ses
/// voisins. iOS 26 garde le verre interactif sur le libellé.
nonisolated enum ComposerTopBarMenuFace: Equatable, Sendable {
    /// Le visage est le libellé du `Menu`.
    case label
    /// Le visage est peint HORS du `Menu`, qui ne garde qu'une cible vide.
    case detached

    static func resolve(nativeGlass: Bool) -> ComposerTopBarMenuFace {
        nativeGlass ? .label : .detached
    }

    static var current: ComposerTopBarMenuFace {
        if #available(iOS 26.0, *) { return resolve(nativeGlass: true) }
        return resolve(nativeGlass: false)
    }
}
