import CoreGraphics
import Foundation

/// #8626 — où vivent les commandes de MA caméra : dans ma vignette, en haut au
/// centre quand mon image est en plein écran, et dans le (…) seulement quand
/// ni l'une ni l'autre ne peut les porter (appel audio, caméra coupée,
/// vignette trop petite pour des cibles de 44 pt, grille de groupe).
enum CallCameraControlsPlacement: Equatable, Sendable {
    case selfTile
    case topCenter
    case menu
}

struct CallCameraTileGrid: Equatable, Sendable {
    let columns: Int
    let rows: Int
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

    static func placement(isMyImageFullScreen: Bool, selfTileSize: CGSize?, actionCount: Int) -> CallCameraControlsPlacement {
        if isMyImageFullScreen { return .topCenter }
        guard let selfTileSize, tileGrid(tileSize: selfTileSize, count: actionCount) != nil else { return .menu }
        return .selfTile
    }

    static func isShown(_ placement: CallCameraControlsPlacement, at site: CallCameraControlsPlacement, chrome: CallChromeVisibility) -> Bool {
        placement == site && chrome.isVisible(.controls)
    }

    static func menuRows(_ set: CallActionSet, placement: CallCameraControlsPlacement) -> [CallActionFamilyRow] {
        guard placement != .menu else { return set.familyRows }
        return set.familyRows.filter { $0.family != .myImage }
    }
}
