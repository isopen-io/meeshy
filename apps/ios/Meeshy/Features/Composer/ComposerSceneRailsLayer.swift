import SwiftUI
import MeeshyUI

/// **La géographie du grand écran** (#13839, L6, maquette validée) : le rail gauche libellé, la
/// colonne de la scène — la rangée des diapos au-dessus d'elle —, le rail droit « SÉLECTION ». La scène, elle, reste
/// le même nœud que sur le petit écran : la surface ne fait que lui rendre sa colonne (`ComposerSceneRailsInsets`).
///
/// Les rails se TAISENT pendant la frappe et au viseur, sans libérer leur place : la scène ne grandit pas sous le
/// doigt. Une feuille se pose sous la scène, dans sa colonne, et les laisse parler.
struct ComposerSceneRailsLayer: View {
    let leading: ComposerLabeledRail
    let selection: ComposerSelectionRail
    /// Un objet sélectionné (#13957, R6) : ses options prennent la place du rail des outils, à gauche, et le
    /// rail droit ne garde que l'historique.
    var objectSelection: ComposerSelectionRail?
    var selectionIsShown: Bool = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var slideRow: AnyView?
    var showsSlideRow: Bool = false
    let isServed: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            leadingRail.frame(width: ComposerSceneArrangement.railWidth)
            VStack(spacing: 0) {
                if showsSlideRow, let slideRow { slideRow.frame(height: 44) }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, ComposerSceneArrangement.margin)
            selection
                .frame(width: ComposerSceneArrangement.railWidth)
                .opacity(selectionIsShown ? 1 : 0)
                .allowsHitTesting(selectionIsShown)
                .accessibilityHidden(!selectionIsShown)
        }
        .padding(ComposerSceneArrangement.margin)
        .opacity(isServed ? 1 : 0)
        .allowsHitTesting(isServed)
        .accessibilityHidden(!isServed)
        .animation(.easeOut(duration: 0.18), value: isServed)
        .animation(ComposerSelectionChrome.transition(reduceMotion: reduceMotion), value: objectSelection != nil)
    }

    @ViewBuilder
    private var leadingRail: some View {
        ZStack {
            switch ComposerSelectionChrome.leadingRail(objectIsSelected: objectSelection != nil) {
            case .tools:
                leading.transition(.opacity)
            case .editing:
                objectSelection.transition(.opacity)
            }
        }
    }
}

/// Ce que la scène rend aux rails : leur couloir de chaque côté, la marge du haut (et la rangée des diapos dès deux
/// diapos), la marge du bas au-dessus de Publier.
nonisolated enum ComposerSceneRailsInsets {
    static func insets(arrangement: ComposerSceneArrangement, showsSlideRow: Bool) -> EdgeInsets {
        guard arrangement == .rails else { return EdgeInsets() }
        let couloir = ComposerSceneArrangement.railWidth + 2 * ComposerSceneArrangement.margin
        let haut = ComposerSceneArrangement.margin + (showsSlideRow ? ComposerSceneArrangement.slideRowReserve : 0)
        return EdgeInsets(top: haut, leading: couloir, bottom: ComposerSceneArrangement.margin, trailing: couloir)
    }

    /// Les panneaux du bas — bandes, frise, réglages d'un outil, barre de dessin — se posent sous la scène, dans
    /// sa colonne : jamais sous un rail, qui les couvrirait.
    static func lowerFloors(arrangement: ComposerSceneArrangement) -> EdgeInsets {
        guard arrangement == .rails else { return EdgeInsets() }
        let couloir = ComposerSceneArrangement.railWidth + 2 * ComposerSceneArrangement.margin
        return EdgeInsets(top: 0, leading: couloir, bottom: 0, trailing: couloir)
    }
}
