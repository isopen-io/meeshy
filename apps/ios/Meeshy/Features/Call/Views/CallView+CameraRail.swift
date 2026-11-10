import SwiftUI
import MeeshyUI

// #8626 — où vit le ZOOM de MA caméra : en haut au centre quand mon image est
// en plein écran, dans ma vignette sinon. #17327 — les commandes de ma caméra
// ne vivent plus ici : en duo elles sont le rail gauche (`callActionRails`,
// `CallView+Rails.swift`), en groupe la rangée « Mon image » de la pilule.

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
        !isGroupStage && callManager.isVideoEnabled && callManager.hasLocalVideoTrack && !isLiveFrameShown
    }

    var cameraControlsPlacement: CallCameraControlsPlacement {
        CallCameraRail.placement(isMyImageFullScreen: isMyImageFullScreen, showsMyImageTile: showsMyImageTile)
    }

    /// Mon image en plein écran : les pastilles de zoom se posent en haut au
    /// centre, sous l'en-tête et la zone sûre. Rien d'autre : les commandes de
    /// ma caméra sont dans leur rail (#17327).
    @ViewBuilder
    var zoomLensRail: some View {
        if cameraControlsPlacement == .topCenter {
            CallZoomLensCapsule()
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .padding(.top, Self.chromeTopInset + Self.cameraControlsTopOffset)
                .callChromeVisibility(CallCameraRail.isShown(.topCenter, at: cameraControlsPlacement, chrome: chromeVisibility))
                .transition(.opacity)
        }
    }

    /// Le bouton de zoom reste DANS la vignette, en haut à droite : elle ne
    /// porte aucune commande, la place est libre.
    @ViewBuilder
    func selfTileZoomSlot(tileSize: CGSize) -> some View {
        if cameraControlsPlacement == .selfTile {
            CallZoomRailSlot(placement: .selfTile, tileSize: tileSize)
                .callChromeVisibility(CallCameraRail.isShown(.selfTile, at: cameraControlsPlacement, chrome: chromeVisibility))
                .transition(.opacity)
        }
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

/// #17327 — les pastilles de zoom de MA caméra en plein écran, dans leur
/// capsule de verre. Elle n'existe que si la caméra est zoomable : seule cette
/// vue observe le contrôleur de zoom, l'écran d'appel ne se redessine pas à
/// chaque cran.
struct CallZoomLensCapsule: View {
    @ObservedObject var zoom: CameraZoomController

    init(zoom: CameraZoomController = .shared) {
        self.zoom = zoom
    }

    var body: some View {
        if CallCameraRail.zoomControl(profile: zoom.profile, placement: .topCenter, tileSize: nil) != nil {
            CallZoomRailSlot(placement: .topCenter, zoom: zoom)
                .background(CallCameraZoomAccessibilityElement())
                .padding(.horizontal, MeeshySpacing.smPlus)
                .padding(.vertical, MeeshySpacing.xs)
                .callChromeGlass(in: Capsule())
                .accessibilityElement(children: .contain)
        }
    }
}

/// Les libellés des commandes de MA caméra — mêmes clés que les boutons du
/// (…) (`CallView+Pill.swift`), qui les portent quand aucune vignette ne
/// montre mon image.
enum CallMyImageCopy {
    static var flip: String {
        String(localized: "call.control.flipCamera", defaultValue: "Basculer la caméra avant/arrière", bundle: .main)
    }

    static var flipHint: String {
        String(localized: "call.control.flipCamera.hint", defaultValue: "Bascule entre la caméra avant et arrière", bundle: .main)
    }

    static func video(isEnabled: Bool, isPaused: Bool) -> String {
        if isPaused {
            return String(localized: "call.control.video.paused", defaultValue: "Vidéo en pause (connexion faible)", bundle: .main)
        }
        return isEnabled
            ? String(localized: "call.control.videoOff", defaultValue: "Désactiver la vidéo", bundle: .main)
            : String(localized: "call.control.videoOn", defaultValue: "Activer la vidéo", bundle: .main)
    }

    static var videoPausedHint: String {
        String(localized: "call.control.video.paused.hint", defaultValue: "Touchez pour éteindre la caméra. La vidéo reprend automatiquement si la connexion s'améliore.", bundle: .main)
    }

    static var cameraPicker: String {
        String(localized: "call.control.camera", defaultValue: "Choisir la caméra", bundle: .main)
    }
}
