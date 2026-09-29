import CoreGraphics
import Foundation

/// #8626 — où vivent les commandes de MA caméra : dans ma vignette, quelle que
/// soit sa taille, en haut au centre quand mon image est en plein écran, et
/// dans le (…) seulement quand aucune vignette ne porte mon image (appel
/// audio, caméra coupée, grille de groupe).
enum CallCameraControlsPlacement: Equatable, Sendable {
    case selfTile
    case topCenter
    case menu
}

struct CallCameraTileGrid: Equatable, Sendable {
    let columns: Int
    let rows: Int
}

/// La vignette pose la grille quand ses cibles de 44 pt y tiennent ; sinon un
/// seul bouton caméra, qui déploie la grille par-dessus elle.
enum CallCameraTileLayout: Equatable, Sendable {
    case grid(CallCameraTileGrid)
    case folded(expanded: CallCameraTileGrid)
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
    static let order: [CallAction] = [.flipCamera, .cameraPicker, .camera, .effects, .screenShare]
    static let targetSide: CGFloat = 44
    static let tileInset: CGFloat = 4

    static func actions(from set: CallActionSet) -> [CallAction] {
        order.filter { set.myImage.contains($0) }
    }

    static func isMyImageFullScreen(isGroupStage: Bool, isSelfFeatured: Bool, isLocalPrimary: Bool) -> Bool {
        isGroupStage ? isSelfFeatured : isLocalPrimary
    }

    static func tileGrid(tileSize: CGSize, count: Int) -> CallCameraTileGrid? {
        guard count > 0, tileSize.width.isFinite, tileSize.height.isFinite else { return nil }
        let fitting = Int(((tileSize.width - 2 * tileInset) / targetSide).rounded(.down))
        let columns = min(count, fitting)
        guard columns > 0 else { return nil }
        let rows = (count + columns - 1) / columns
        guard CGFloat(rows) * targetSide + 2 * tileInset <= tileSize.height else { return nil }
        return CallCameraTileGrid(columns: columns, rows: rows)
    }

    static func placement(isMyImageFullScreen: Bool, showsMyImageTile: Bool) -> CallCameraControlsPlacement {
        if isMyImageFullScreen { return .topCenter }
        return showsMyImageTile ? .selfTile : .menu
    }

    static func tileLayout(tileSize: CGSize, count: Int) -> CallCameraTileLayout? {
        guard count > 0 else { return nil }
        if let grid = tileGrid(tileSize: tileSize, count: count) { return .grid(grid) }
        return .folded(expanded: expandedGrid(count: count))
    }

    static func expandedGrid(count: Int) -> CallCameraTileGrid {
        let columns = max(1, min(count, 2))
        return CallCameraTileGrid(columns: columns, rows: (max(count, 1) + columns - 1) / columns)
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

    static func zoomControl(profile: CameraZoomProfile?, placement: CallCameraControlsPlacement, tileSize: CGSize?) -> CallZoomControl? {
        guard let profile, profile.quickStops.count > 1 else { return nil }
        switch placement {
        case .topCenter:
            return .lensChips(profile.quickStops)
        case .selfTile:
            guard let tileSize,
                  tileSize.width >= targetSide + 2 * tileInset,
                  tileSize.height >= 2 * targetSide + 2 * tileInset else { return nil }
            return .cycleButton
        case .menu:
            return nil
        }
    }

    static func menuRows(_ set: CallActionSet, placement: CallCameraControlsPlacement) -> [CallActionFamilyRow] {
        guard placement != .menu else { return set.familyRows }
        return set.familyRows.filter { $0.family != .myImage }
    }
}
