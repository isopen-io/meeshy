import SwiftUI
import MeeshySDK
import MeeshyUI

/// Cibles de tap invisibles posées sur les pastilles de lieu d'une story en
/// LECTURE. Le canvas du reader est du pur CALayer sans callback d'item (la
/// chaîne d'interaction de `StoryCanvasUIView` est gatée `.edit`), et le
/// `StoryGestureOverlayView` transforme tout tap en navigation prev/next —
/// une pastille touchée faisait donc simplement avancer la story (constat
/// user 2026-07-30). Même règle d'empilement que les chips audio
/// (Layer 6.5) : rendu AU-DESSUS de l'overlay gestuel, le tap est consommé
/// avant d'atteindre la navigation.
///
/// Le cadre de chaque cible vient de `StoryLocationLayer.badgeFrame` — la
/// mesure EXACTE du rendu (mêmes constantes, mêmes projections
/// `CanvasGeometry`) — pour que la zone touchable coïncide avec le badge
/// dessiné. La vue doit être posée avec le MÊME cadrage que le canvas
/// (frame `canvasFitSize` + scale/offset carte), à la charge de l'appelant.
struct StoryLocationReaderTapOverlay: View {
    let locations: [StoryLocationObject]
    let onTap: (SharedPlace) -> Void

    /// Côté minimal d'une cible : un badge à petite échelle reste touchable
    /// (HIG : 44 pt), sans jamais rétrécir la zone d'un badge plus grand.
    private static let minimumTouchSide: CGFloat = 44

    var body: some View {
        GeometryReader { geo in
            ForEach(locations, id: \.id) { location in
                let frame = StoryLocationLayer.badgeFrame(for: location, canvasSize: geo.size)
                Button {
                    onTap(location.place)
                } label: {
                    Color.clear
                        .frame(width: max(frame.width, Self.minimumTouchSide),
                               height: max(frame.height, Self.minimumTouchSide))
                        .contentShape(Rectangle())
                }
                .position(x: frame.midX, y: frame.midY)
                .accessibilityLabel(StoryLocationLayer.resolvedLabel(for: location.place))
                .accessibilityHint(String(
                    localized: "story.location.open.hint",
                    defaultValue: "Ouvre le lieu sur la carte",
                    bundle: .main
                ))
            }
        }
    }
}
