import SwiftUI
import MeeshyUI

// #8626 — les commandes de MA caméra (retourner, couper, effets, écran) vivent
// dans ma vignette, quelle que soit sa taille ; quand mon image passe en plein
// écran, en haut au centre. Le (…) ne les porte que sans vignette
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
        CallCameraRail.placement(isMyImageFullScreen: isMyImageFullScreen, showsMyImageTile: showsMyImageTile)
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
    /// en cibles de 44 pt ; une vignette trop petite pour elles pose un seul
    /// bouton caméra, qui déploie la grille par-dessus elle.
    @ViewBuilder
    func selfTileCameraControls(tileSize: CGSize) -> some View {
        let actions = CallCameraRail.actions(from: currentActionSet)
        if cameraControlsPlacement == .selfTile,
           let layout = CallCameraRail.tileLayout(tileSize: tileSize, count: actions.count) {
            Group {
                switch layout {
                case .grid(let grid):
                    cameraControlsGrid(actions, grid: grid, closesMenu: false)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                case .folded(let expanded):
                    if isCameraMenuUnfolded {
                        cameraControlsGrid(actions, grid: expanded, closesMenu: true)
                            .accessibilityAction(.escape) { tapCameraMenu(.elsewhere) }
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                            .transition(.scale(scale: 0.85).combined(with: .opacity))
                    } else {
                        foldedCameraButton
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                            .transition(.opacity)
                    }
                }
            }
            .callChromeVisibility(CallCameraRail.isShown(.selfTile, at: cameraControlsPlacement, chrome: chromeVisibility))
            .transition(.opacity)
        }
    }

    private func cameraControlsGrid(_ actions: [CallAction], grid: CallCameraTileGrid, closesMenu: Bool) -> some View {
        VStack(spacing: 0) {
            ForEach(0 ..< grid.rows, id: \.self) { row in
                HStack(spacing: 0) {
                    ForEach(Array(actions.dropFirst(row * grid.columns).prefix(grid.columns)), id: \.self) { action in
                        railActionButton(action)
                            .frame(width: CallCameraRail.targetSide, height: CallCameraRail.targetSide)
                            .simultaneousGesture(TapGesture().onEnded {
                                if closesMenu { tapCameraMenu(.action) }
                            })
                    }
                }
            }
        }
        .padding(CallCameraRail.tileInset)
        .callChromeGlass(in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(CallControlsCopy.cameraRail)
    }

    private var foldedCameraButton: some View {
        CallPillButton(
            symbol: "camera.fill",
            kind: .normal,
            label: CallControlsCopy.cameraRail,
            hint: CallControlsCopy.cameraRailUnfoldHint,
            diameter: CallCameraRail.targetSide
        ) {
            tapCameraMenu(.button)
        }
        .frame(width: CallCameraRail.targetSide, height: CallCameraRail.targetSide)
        .padding(CallCameraRail.tileInset)
        .callChromeGlass(in: Circle())
    }

    func tapCameraMenu(_ tap: CallCameraFoldedTap) {
        let next = CallCameraRail.foldedMenu(isOpen: isCameraMenuUnfolded, after: tap)
        guard next != isCameraMenuUnfolded else { return }
        withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.85)) {
            isCameraMenuUnfolded = next
        }
        if tap == .button { HapticFeedback.light() }
    }
}
