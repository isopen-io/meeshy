import CoreGraphics
import Foundation

/// #8626 — où vit le ZOOM de MA caméra : en haut au centre quand mon image
/// est en plein écran, dans ma vignette sinon, nulle part quand aucune vignette
/// ne porte mon image. #17327 — les COMMANDES de ma caméra (Caméra, Retourner,
/// Effets, Écran) ne vivent plus autour de ma vignette : en duo elles sont le
/// rail gauche (`CallControlsDisposition.rails`), en groupe la rangée « Mon
/// image » de la pilule.
enum CallCameraControlsPlacement: Equatable, Sendable {
    case selfTile
    case topCenter
    case menu
}

enum CallCameraFoldedTap: Equatable, Sendable {
    case button
    case action
    case elsewhere
}

/// #8441 — le zoom dans les commandes de MA caméra : les pastilles des
/// facteurs quand mon image est en plein écran, un seul bouton de 44 pt qui
/// passe au facteur suivant dans ma vignette.
enum CallZoomControl: Equatable, Sendable {
    case lensChips([CGFloat])
    case cycleButton
}

enum CallCameraRail {
    static let targetSide: CGFloat = 44
    static let tileInset: CGFloat = 4

    static func isMyImageFullScreen(isGroupStage: Bool, isSelfFeatured: Bool, isLocalPrimary: Bool) -> Bool {
        isGroupStage ? isSelfFeatured : isLocalPrimary
    }

    static func placement(isMyImageFullScreen: Bool, showsMyImageTile: Bool) -> CallCameraControlsPlacement {
        if isMyImageFullScreen { return .topCenter }
        return showsMyImageTile ? .selfTile : .menu
    }

    static func foldedMenu(isOpen: Bool, after tap: CallCameraFoldedTap) -> Bool {
        tap == .button ? !isOpen : false
    }

    static func consumesTapElsewhere(isFoldedMenuOpen: Bool) -> Bool {
        isFoldedMenuOpen
    }

    static func isShown(_ placement: CallCameraControlsPlacement, at site: CallCameraControlsPlacement, chrome: CallChromeVisibility) -> Bool {
        placement == site && chrome.isVisible(.controls)
    }

    /// #17327 — la vignette ne porte plus de commande : son coin haut-droit
    /// est libre pour le bouton de zoom dès qu'une cible de 44 pt y tient.
    static func zoomControl(profile: CameraZoomProfile?, placement: CallCameraControlsPlacement, tileSize: CGSize?) -> CallZoomControl? {
        guard let profile, profile.quickStops.count > 1 else { return nil }
        switch placement {
        case .topCenter:
            return .lensChips(profile.quickStops)
        case .selfTile:
            guard let tileSize,
                  tileSize.width >= targetSide + 2 * tileInset,
                  tileSize.height >= targetSide + 2 * tileInset else { return nil }
            return .cycleButton
        case .menu:
            return nil
        }
    }
}
