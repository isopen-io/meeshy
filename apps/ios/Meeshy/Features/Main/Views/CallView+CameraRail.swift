import SwiftUI
import MeeshyUI

// #8626 — les commandes de MA caméra (retourner, couper, effets, écran) vivent
// dans ma vignette ; quand mon image passe en plein écran, en haut au centre.
// Le (…) ne les porte plus que quand aucun des deux ne le peut
// (`CallCameraRail.placement`) : jamais deux boutons pour la même action.

extension CallView {
    private static let cameraControlsTopOffset: CGFloat = 56

    var isMyImageFullScreen: Bool {
        CallCameraRail.isMyImageFullScreen(
            isGroupStage: isGroupStage,
            isSelfFeatured: isSelfFeatured,
            isLocalPrimary: effectiveSwapStreams
        )
    }

    /// La vignette perso du duo porte-t-elle MON image ? Même garde que
    /// `duoOverlays`, qui la monte.
    private var showsMyImageTile: Bool {
        !isGroupStage && callManager.isVideoEnabled && callManager.hasLocalVideoTrack
    }

    var cameraControlsPlacement: CallCameraControlsPlacement {
        CallCameraRail.placement(
            isMyImageFullScreen: isMyImageFullScreen,
            selfTileSize: showsMyImageTile ? selfTileScale.size : nil,
            actionCount: CallCameraRail.actions(from: currentActionSet).count
        )
    }

    /// Mon image en plein écran : la rangée se pose en haut au centre, sous
    /// l'en-tête et la zone sûre ; le zoom reste réservé à ce plein écran.
    @ViewBuilder
    var cameraRail: some View {
        let actions = CallCameraRail.actions(from: currentActionSet)
        if cameraControlsPlacement == .topCenter && !actions.isEmpty {
            HStack(spacing: 10) {
                ForEach(actions, id: \.self) { action in
                    railActionButton(action)
                }
            }
            .background(CallCameraZoomAccessibilityElement())
            .padding(.vertical, 6)
            .padding(.horizontal, 10)
            .callChromeGlass(in: Capsule())
            .accessibilityElement(children: .contain)
            .accessibilityLabel(CallControlsCopy.cameraRail)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .padding(.top, Self.chromeTopInset + Self.cameraControlsTopOffset)
            .callChromeVisibility(CallCameraRail.isShown(.topCenter, at: cameraControlsPlacement, chrome: chromeVisibility))
            .transition(.opacity)
        }
    }

    /// Mon image dans la vignette : les mêmes commandes, en bas de la vignette,
    /// en rangées de cibles de 44 pt tant que la vignette peut les porter.
    @ViewBuilder
    func selfTileCameraControls(tileSize: CGSize) -> some View {
        let actions = CallCameraRail.actions(from: currentActionSet)
        if cameraControlsPlacement == .selfTile,
           let grid = CallCameraRail.tileGrid(tileSize: tileSize, count: actions.count) {
            VStack(spacing: 0) {
                ForEach(0 ..< grid.rows, id: \.self) { row in
                    HStack(spacing: 0) {
                        ForEach(Array(actions.dropFirst(row * grid.columns).prefix(grid.columns)), id: \.self) { action in
                            railActionButton(action)
                                .frame(width: CallCameraRail.targetSide, height: CallCameraRail.targetSide)
                        }
                    }
                }
            }
            .padding(CallCameraRail.tileInset)
            .callChromeGlass(in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .accessibilityElement(children: .contain)
            .accessibilityLabel(CallControlsCopy.cameraRail)
            .callChromeVisibility(CallCameraRail.isShown(.selfTile, at: cameraControlsPlacement, chrome: chromeVisibility))
            .transition(.opacity)
        }
    }
}
