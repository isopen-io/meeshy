import SwiftUI
import UIKit
import MeeshyUI

// #17327 — À DEUX, `(…)` fait sortir deux rails verticaux sur les bords :
// « Mon image » d'un côté, « L'appel » de l'autre, centrés verticalement, et la
// pilule ne grandit pas. À plusieurs, les mêmes actions restent en rangées
// légendées dans la pilule (`CallView+Pill.swift`) : aucun rail par-dessus la
// grille. `CallControlsDisposition` décide, depuis le nombre de participants ;
// l'état du `(…)` (`CallScreenLayer`) ne change pas quand la disposition change.
// Chaque bouton est celui des rangées (`railActionButton`) : même verre,
// mêmes libellés VoiceOver, même ordre.

extension CallView {
    /// Les participants de l'appel, moi compris : deux hors grille, sinon moi et le maillage.
    var callParticipantCount: Int {
        isGroupStage ? mesh.roster.members.count + 1 : 2
    }

    var controlsDisposition: CallControlsDisposition {
        CallControlsDisposition.resolve(participantCount: callParticipantCount, showsGroupGrid: isGroupStage)
    }

    /// Le retrait de la zone sûre horizontale, identique des deux côtés : la
    /// fenêtre donne des bords physiques, pas des bords de lecture.
    private static var railsSafeHorizontal: CGFloat {
        guard let insets = DeviceLayout.measurementWindow?.safeAreaInsets else { return 0 }
        return max(insets.left, insets.right)
    }

    /// Ce que ma caméra et `(…)` posent sur les bords de l'écran d'appel établi :
    /// les pastilles de zoom de mon image en plein écran, et les rails du duo.
    @ViewBuilder
    var callEdgeControls: some View {
        zoomLensRail
        callActionRails
    }

    /// Les rails que `(…)` fait sortir en duo. Rien en groupe : la grille garde
    /// toutes ses vignettes visibles.
    @ViewBuilder
    var callActionRails: some View {
        let rows = controlsDisposition.railRows(currentActionSet, layer: layer)
        GeometryReader { geo in
            let safeHorizontal = Self.railsSafeHorizontal
            let bottom = Self.chromeBottomInset
                + CallRailsLayout.bottomClearance(containerWidth: geo.size.width, safeHorizontal: safeHorizontal)
            ZStack {
                // Construits ici, sur le fil principal : le `ForEach` ne fait que les relire (#9456, `AsyncRenderRow`).
                ForEach(rows.map { row in
                    AsyncRenderRow(id: row.family, content: positionedRail(row, safeHorizontal: safeHorizontal, bottom: bottom))
                }, content: asyncRenderRowContent)
            }
            .animation(disclosureAnimation, value: rows)
        }
    }

    private func positionedRail(_ row: CallActionFamilyRow, safeHorizontal: CGFloat, bottom: CGFloat) -> some View {
        let side = row.family.railSide
        return actionRail(row)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: side == .leading ? .leading : .trailing)
            .padding(.horizontal, safeHorizontal + CallRailsLayout.edgeInset)
            .padding(.top, Self.chromeTopInset + 52)
            .padding(.bottom, bottom)
            .callChromeVisibility(isChromeVisible)
            .modifier(CallRailStow(side: side, safeHorizontal: safeHorizontal, isVisible: isChromeVisible, reduceMotion: reduceMotion))
            .transition(CallRailSlide.transition(side, safeHorizontal: safeHorizontal, reduceMotion: reduceMotion))
    }

    /// Une capsule de verre verticale : ses boutons de 44 pt se composent dans un
    /// même conteneur ; trop haute (paysage, écran court), elle défile.
    private func actionRail(_ row: CallActionFamilyRow) -> some View {
        let cells = row.actions.map { action in
            AsyncRenderRow(id: action, content: railActionButton(action))
        }
        let column = VStack(spacing: CallRailsLayout.buttonSpacing) {
            ForEach(cells, content: asyncRenderRowContent)
        }
        .padding(CallRailsLayout.padding)
        return AdaptiveGlassContainer(spacing: CallControlGlassMetrics.containerSpacing) {
            ViewThatFits(in: .vertical) {
                column
                ScrollView(.vertical, showsIndicators: false) { column }.mask { ScrollEdgeFadeMask(axis: .vertical, start: true, end: true) }
            }
        }
        .clipShape(Capsule())
        .callControlsGlass(in: Capsule())
        .accessibilityElement(children: .contain)
        .accessibilityLabel(CallControlsCopy.familyTitle(row.family))
    }
}

/// G1.11 · G2.8 — rangé, le rail sort par son bord de l'écran et en revient (transformation
/// et opacité seulement) ; Réduire les animations : un fondu, rien ne se déplace.
private struct CallRailStow: ViewModifier {
    let side: CallRailSide
    let safeHorizontal: CGFloat
    let isVisible: Bool
    let reduceMotion: Bool

    func body(content: Content) -> some View {
        content
            .modifier(CallRailSlide(side: side, safeHorizontal: safeHorizontal, isAway: CallChromeStow.leavesByItsEdge(isVisible: isVisible, reduceMotion: reduceMotion)))
            .animation(CallChromeStow.animation(reduceMotion: reduceMotion), value: isVisible)
    }
}

/// Le décalage d'entrée et de sortie d'un rail : de son bord de l'écran à sa
/// place, par une simple translation.
private struct CallRailSlide: ViewModifier {
    let side: CallRailSide
    let safeHorizontal: CGFloat
    let isAway: Bool

    @Environment(\.layoutDirection) private var layoutDirection

    func body(content: Content) -> some View {
        content.offset(x: isAway ? CallRailsLayout.slideOffset(side: side, isRightToLeft: layoutDirection == .rightToLeft, safeHorizontal: safeHorizontal) : 0)
    }

    /// Le rail entre par le bord de l'écran et en sort par lui, vers l'extérieur
    /// (transformation et opacité seulement). Réduire les animations le remplace
    /// par un fondu.
    static func transition(_ side: CallRailSide, safeHorizontal: CGFloat, reduceMotion: Bool) -> AnyTransition {
        guard !reduceMotion else { return .opacity }
        return .modifier(
            active: CallRailSlide(side: side, safeHorizontal: safeHorizontal, isAway: true),
            identity: CallRailSlide(side: side, safeHorizontal: safeHorizontal, isAway: false)
        )
        .combined(with: .opacity)
    }
}
