import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La scène LIBRE et la géométrie de ses rails**, sorties de `ComposerSceneSurface`
/// (seuil de découpe de 1 000 lignes) : le vide du calque de chrome, la frise qui
/// le remplace quand le temps s'ouvre, et les marges que les rails y prennent.
extension ComposerSceneSurface {

    var edge: CGFloat { ComposerRailGeometry.edgeMargin(roomy: isRoomy) }

    var railLaneLeading: CGFloat {
        ComposerSceneRailsInsets.insets(arrangement: arrangement, showsSlideRow: false).leading
    }

    var showsRailsSlideRow: Bool {
        ComposerRestChrome.showsSlideRow(slideCount: slideCount) && slideRailSlot != nil
    }

    var writing: ComposerWriting {
        ComposerWriting.resolve(editsSceneDescription: writesText, editsPostContent: writesPostBody)
    }

    /// **La scène LIBRE** — le vide du calque de chrome, où la scène se voit et
    /// se touche. Les deux rails y flottent au bas, à portée du pouce, avec les
    /// MÊMES marges ; le volet de description s'y pose entre eux.
    var freeZone: some View {
        ZStack(alignment: .bottom) {
            // **Frise ouverte, la scène se RÈGLE dans le temps** : les
            // rails et le volet s'effacent, et le canvas ne prend plus de geste.
            // La frise réécrit la slide à sa fermeture ; une pose ou un
            // déplacement faits pendant qu'elle est ouverte seraient écrasés.
            // Seul « Temps » y reste (maquette : le couloir droit ne part pas
            // avec la frise) — le geste qui la RANGE doit rester là où il l'a
            // ouverte.
            if timelinePanel == nil { composingFloors } else { friseRail }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .background {
            GeometryReader { geo in
                Color.clear.preference(key: ComposerFreeZoneFrameKey.self, value: geo.frame(in: .global))
            }
        }
        // **Les options du sous-outil ouvert, à droite depuis le haut**
        // — sur la scène libre, alignées sur le haut de la colonne droite.
        .overlay {
            if timelinePanel == nil, let inlinePanel {
                inlinePanel
                    // Aligné sur le haut de la colonne droite, donc de la carte
                    // — la plaque pose elle-même sa gouttière.
                    .padding(.top, trailingBand.top - ComposerRailGeometry.gutter)
                    .environment(\.composerSceneCardFrame, sceneCardFrame)
                    .transition(.opacity)
            }
        }
    }

    var friseRail: some View {
        ComposerFriseRail(plateauTint: plateauTint, onTime: onTimeButton, timeIsOpen: timeIsOpen,
                          reservesUndo: onUndo != nil, reservesRedo: onRedo != nil)
    }
}
