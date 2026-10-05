import CoreGraphics
import Foundation

/// #8626 — où vivent les commandes de MA caméra : autour de ma vignette,
/// en haut au centre quand mon image est en plein écran, et dans le (…)
/// seulement quand aucune vignette ne porte mon image (appel audio, caméra
/// coupée, grille de groupe). #8747 — autour, jamais DANS : Effets · Écran
/// au-dessus de la vignette, Retourner · Caméra en dessous.
enum CallCameraControlsPlacement: Equatable, Sendable {
    case selfTile
    case topCenter
    case menu
}

/// #8747 — les deux rangées posées hors de ma vignette : ce qui part AVEC
/// mon image (Effets, Écran) au-dessus, ce qui agit sur la caméra
/// (Retourner ou le choix de caméra, l'allumer ou l'éteindre) en dessous.
struct CallSelfTileControlRows: Equatable, Sendable {
    let effects: [CallAction]
    let camera: [CallAction]

    var isEmpty: Bool { effects.isEmpty && camera.isEmpty }
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
    static let effectsRow: [CallAction] = [.effects, .screenShare]
    static let cameraRow: [CallAction] = [.flipCamera, .cameraPicker, .camera]

    static func actions(from set: CallActionSet) -> [CallAction] {
        order.filter { set.myImage.contains($0) }
    }

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

    /// #8747 — les rangées vivent hors de la vignette : son coin haut-droit
    /// reste libre pour le bouton de zoom dès qu'une cible de 44 pt y tient.
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

    static func selfTileRows(_ actions: [CallAction]) -> CallSelfTileControlRows {
        CallSelfTileControlRows(
            effects: effectsRow.filter { actions.contains($0) },
            camera: cameraRow.filter { actions.contains($0) }
        )
    }

    static func menuRows(_ set: CallActionSet, placement: CallCameraControlsPlacement) -> [CallActionFamilyRow] {
        guard placement != .menu else { return set.familyRows }
        return set.familyRows.filter { $0.family != .myImage }
    }
}

// MARK: - #8747 — les rangées hors de la vignette

/// Le côté de la vignette où une rangée se pose.
nonisolated enum CallSelfTileControlSide: Equatable, Sendable {
    case above
    case below
}

nonisolated struct CallSelfTileControlRowFrame: Equatable, Sendable {
    let frame: CGRect
    let side: CallSelfTileControlSide
}

/// Où se posent les deux rangées : `nil` pour une rangée sans bouton.
nonisolated struct CallSelfTileControlsLayout: Equatable, Sendable {
    let effects: CallSelfTileControlRowFrame?
    let camera: CallSelfTileControlRowFrame?
}

/// #8747 — la règle de pose des commandes de ma caméra AUTOUR de ma vignette.
///
/// `bounds` est la zone où une rangée a le droit de vivre : l'écran moins
/// l'en-tête (en haut), la pilule (en bas) et les bords. Chaque rangée est
/// centrée sur la vignette, à `edgeGap` de son bord, et bornée à `bounds` en
/// largeur. Pour la hauteur, dans l'ordre :
/// 1. à SON côté (Effets · Écran au-dessus, Retourner · Caméra en dessous) ;
/// 2. sinon de l'AUTRE côté, au-delà de la rangée qui y vit déjà ;
/// 3. sinon à son côté, ramenée dans `bounds` — elle chevauche alors le bord
///    de la vignette du strict nécessaire.
/// Au repos, la vignette laisse la place d'une rangée entre elle et l'en-tête
/// comme entre elle et la pilule (`restingCenter`) : le cas 1 est la règle,
/// les cas 2 et 3 ne servent qu'au paysage et aux écrans courts.
nonisolated enum CallSelfTileControlsPlacement {
    static let buttonSide: CGFloat = 44
    static let buttonSpacing: CGFloat = 10
    static let edgeGap: CGFloat = 8
    static let rowGap: CGFloat = 8

    /// La hauteur qu'une rangée prend au bord de la vignette.
    static var rowSpan: CGFloat { buttonSide + edgeGap }

    static func rowWidth(count: Int) -> CGFloat {
        guard count > 0 else { return 0 }
        return CGFloat(count) * buttonSide + CGFloat(count - 1) * buttonSpacing
    }

    /// Le centre de repos d'une vignette, décalé pour laisser une rangée
    /// au-dessus d'elle ET une en dessous — quand la hauteur le permet ;
    /// sinon inchangé.
    static func restingCenter(_ center: CGPoint, tileSize: CGSize, bounds: CGRect) -> CGPoint {
        let lowest = bounds.minY + rowSpan + tileSize.height / 2
        let highest = bounds.maxY - rowSpan - tileSize.height / 2
        guard lowest <= highest else { return center }
        return CGPoint(x: center.x, y: min(max(center.y, lowest), highest))
    }

    static func layout(tile: CGRect, bounds: CGRect, effectsCount: Int, cameraCount: Int) -> CallSelfTileControlsLayout {
        let effectsAtHome = effectsCount > 0 && fits(.above, depth: 0, tile: tile, bounds: bounds)
        let cameraAtHome = cameraCount > 0 && fits(.below, depth: 0, tile: tile, bounds: bounds)
        let effects = effectsCount > 0
            ? row(count: effectsCount, home: .above, isAtHome: effectsAtHome, depthAway: cameraAtHome ? 1 : 0, tile: tile, bounds: bounds)
            : nil
        let camera = cameraCount > 0
            ? row(count: cameraCount, home: .below, isAtHome: cameraAtHome, depthAway: effectsAtHome ? 1 : 0, tile: tile, bounds: bounds)
            : nil
        return CallSelfTileControlsLayout(effects: effects, camera: camera)
    }

    /// Pendant le glissé, les rangées suivent la vignette du MÊME décalage —
    /// sans changer de côté sous le doigt — et restent dans `container`.
    static func following(_ layout: CallSelfTileControlsLayout, offset: CGSize, within container: CGRect) -> CallSelfTileControlsLayout {
        CallSelfTileControlsLayout(
            effects: layout.effects.map { moved($0, by: offset, within: container) },
            camera: layout.camera.map { moved($0, by: offset, within: container) }
        )
    }

    private static func distance(depth: Int) -> CGFloat {
        edgeGap + CGFloat(depth) * (buttonSide + rowGap)
    }

    private static func top(on side: CallSelfTileControlSide, depth: Int, tile: CGRect) -> CGFloat {
        switch side {
        case .above: return tile.minY - distance(depth: depth) - buttonSide
        case .below: return tile.maxY + distance(depth: depth)
        }
    }

    private static func fits(_ side: CallSelfTileControlSide, depth: Int, tile: CGRect, bounds: CGRect) -> Bool {
        let y = top(on: side, depth: depth, tile: tile)
        return y >= bounds.minY && y + buttonSide <= bounds.maxY
    }

    private static func row(
        count: Int,
        home: CallSelfTileControlSide,
        isAtHome: Bool,
        depthAway: Int,
        tile: CGRect,
        bounds: CGRect
    ) -> CallSelfTileControlRowFrame {
        let width = rowWidth(count: count)
        let x = clamped(tile.midX - width / 2, from: bounds.minX, to: bounds.maxX - width)
        if isAtHome {
            return CallSelfTileControlRowFrame(frame: CGRect(x: x, y: top(on: home, depth: 0, tile: tile), width: width, height: buttonSide), side: home)
        }
        let away = opposite(of: home)
        if fits(away, depth: depthAway, tile: tile, bounds: bounds) {
            return CallSelfTileControlRowFrame(frame: CGRect(x: x, y: top(on: away, depth: depthAway, tile: tile), width: width, height: buttonSide), side: away)
        }
        let y = clamped(top(on: home, depth: 0, tile: tile), from: bounds.minY, to: bounds.maxY - buttonSide)
        return CallSelfTileControlRowFrame(frame: CGRect(x: x, y: y, width: width, height: buttonSide), side: home)
    }

    private static func moved(_ row: CallSelfTileControlRowFrame, by offset: CGSize, within container: CGRect) -> CallSelfTileControlRowFrame {
        let frame = row.frame.offsetBy(dx: offset.width, dy: offset.height)
        let x = clamped(frame.minX, from: container.minX, to: container.maxX - frame.width)
        let y = clamped(frame.minY, from: container.minY, to: container.maxY - frame.height)
        return CallSelfTileControlRowFrame(frame: CGRect(x: x, y: y, width: frame.width, height: frame.height), side: row.side)
    }

    private static func opposite(of side: CallSelfTileControlSide) -> CallSelfTileControlSide {
        side == .above ? .below : .above
    }

    /// Borne `value` à `[low, high]` ; une plage vide (rangée plus large que
    /// la zone) se centre sur elle.
    private static func clamped(_ value: CGFloat, from low: CGFloat, to high: CGFloat) -> CGFloat {
        guard low <= high else { return (low + high) / 2 }
        return min(max(value, low), high)
    }
}
