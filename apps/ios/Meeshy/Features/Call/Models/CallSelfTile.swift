import CoreGraphics
import Foundation
import SwiftUI

enum CallSelfTileScale: Int, CaseIterable, Comparable, Sendable {
    case x1 = 1
    case x2 = 2
    case x3 = 3

    static let standard: CallSelfTileScale = .x2
    static let aspectRatio: CGFloat = 1.4
    static let stepUpThreshold: CGFloat = 1.12
    static let stepDownThreshold: CGFloat = 0.89

    static func < (lhs: CallSelfTileScale, rhs: CallSelfTileScale) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    var width: CGFloat {
        switch self {
        case .x1: return 72
        case .x2: return 100
        case .x3: return 150
        }
    }

    var size: CGSize {
        CGSize(width: width, height: width * Self.aspectRatio)
    }

    /// L1.5 — dans une fenêtre plus large que haute, ma vignette se couche : 130 × 96 au palier
    /// standard. La loi lit la forme de la fenêtre, jamais le device (iPad, fenêtres redimensionnées).
    static let landscapeWidthFactor: CGFloat = 1.3
    static let landscapeAspectRatio: CGFloat = 96.0 / 130.0

    static func isLandscape(_ window: CGSize) -> Bool {
        window.width > window.height
    }

    func width(isLandscape: Bool) -> CGFloat {
        isLandscape ? width * Self.landscapeWidthFactor : width
    }

    func size(isLandscape: Bool) -> CGSize {
        isLandscape
            ? CGSize(width: width(isLandscape: true), height: width(isLandscape: true) * Self.landscapeAspectRatio)
            : size
    }

    var larger: CallSelfTileScale {
        Self(rawValue: rawValue + 1) ?? self
    }

    var smaller: CallSelfTileScale {
        Self(rawValue: rawValue - 1) ?? self
    }

    static func selfTileScale(fromPinch magnification: CGFloat, from current: CallSelfTileScale) -> CallSelfTileScale {
        guard magnification.isFinite, magnification > 0 else { return current }
        let target = current.width * magnification
        let nearest = allCases.min { abs(log($0.width / target)) < abs(log($1.width / target)) } ?? current
        guard nearest == current else { return nearest }
        if magnification >= stepUpThreshold { return current.larger }
        if magnification <= stepDownThreshold { return current.smaller }
        return current
    }

    static func liveSize(pinch magnification: CGFloat, from current: CallSelfTileScale, isLandscape: Bool = false) -> CGSize {
        guard magnification.isFinite, magnification > 0 else { return current.size(isLandscape: isLandscape) }
        let width = min(
            max(current.width(isLandscape: isLandscape) * magnification, CallSelfTileScale.x1.width(isLandscape: isLandscape)),
            CallSelfTileScale.x3.width(isLandscape: isLandscape)
        )
        return CGSize(width: width, height: width * (isLandscape ? landscapeAspectRatio : aspectRatio))
    }

    /// #16663 — un toucher range le chrome : ma vignette passe à sa petite
    /// taille ; le chrome revenu, elle reprend celle que j'avais choisie.
    static func resting(_ chosen: CallSelfTileScale, isChromeVisible: Bool) -> CallSelfTileScale {
        isChromeVisible ? chosen : .x1
    }

    /// G1.11 — le rangement est une TRANSFORMATION : le cadre reste celui du palier choisi et la
    /// vignette est mise à l'échelle de sa petite taille, jamais relayoutée.
    static func restingFactor(_ chosen: CallSelfTileScale, isChromeVisible: Bool) -> CGFloat {
        resting(chosen, isChromeVisible: isChromeVisible).width / chosen.width
    }

    /// Ce qui ne doit pas rapetisser avec la vignette rangée (liseré, coins, badge) : divisé par
    /// le facteur d'échelle, il est dessiné à sa taille de petite vignette (lois 4, 11).
    static func counterScaled(_ length: CGFloat, by factor: CGFloat) -> CGFloat {
        factor.isFinite && factor > 0 ? length / factor : length
    }

    /// L'ancre du rangement : le coin de l'écran le plus proche du centre de la vignette, qui garde
    /// ainsi sa marge pendant la réduction.
    static func anchor(of center: CGPoint, in container: CGSize) -> UnitPoint {
        UnitPoint(x: center.x < container.width / 2 ? 0 : 1, y: center.y < container.height / 2 ? 0 : 1)
    }

    static func fitted(_ size: CGSize, in available: CGSize) -> CGSize {
        guard size.width > 0, size.height > 0, available.width > 0, available.height > 0 else { return size }
        let ratio = min(1, available.width / size.width, available.height / size.height)
        return CGSize(width: size.width * ratio, height: size.height * ratio)
    }
}

@MainActor
protocol CallSelfTileRemembering: AnyObject {
    func scale(for callId: String?) -> CallSelfTileScale
    func remember(_ scale: CallSelfTileScale, for callId: String?)
}

@MainActor
final class CallSelfTileMemory: CallSelfTileRemembering {
    static let shared = CallSelfTileMemory()

    private var callId: String?
    private var stored: CallSelfTileScale = .standard

    nonisolated deinit {}

    func scale(for callId: String?) -> CallSelfTileScale {
        guard let callId, callId == self.callId else { return .standard }
        return stored
    }

    func remember(_ scale: CallSelfTileScale, for callId: String?) {
        guard let callId else { return }
        self.callId = callId
        stored = scale
    }
}

/// Loi 4 — le liseré de la vignette porte la couleur de la personne qu'elle
/// montre : la mienne, ou celle de l'autre quand les flux sont permutés.
/// Pas d'identifiant ⇒ pas de couleur inventée.
nonisolated enum CallSelfTileStroke {
    static let lineWidth: CGFloat = 2

    static func colorKey(showsLocal: Bool, myId: String?, peerId: String?) -> String? {
        let key = showsLocal ? myId : peerId
        guard let key, !key.isEmpty else { return nil }
        return key
    }
}

/// #17982 — la plaque de ma vignette de duo : le composant de plaque du groupe (`CallTileNameplate`),
/// au pied de la vignette. Elle nomme la personne montrée, comme le liseré (loi 4) : « Vous », ou
/// l'autre après une permutation. Sa largeur suit la vignette VISIBLE (rangée, loi 11) et laisse le
/// liseré et le badge micro coupé du correspondant à découvert.
nonisolated enum CallSelfTilePlate {
    static let sideInset: CGFloat = 6
    static let badgeReserve: CGFloat = 28

    static func title(showsLocal: Bool, you: String, peer: String) -> String {
        showsLocal ? you : peer
    }

    static func maxWidth(tileWidth: CGFloat, stowFactor: CGFloat, reservesBadge: Bool) -> CGFloat {
        let factor = stowFactor.isFinite && stowFactor > 0 ? stowFactor : 1
        let inset = reservesBadge ? badgeReserve : sideInset
        return max(0, tileWidth * factor - 2 * inset)
    }

    static func accessibilityValue(name: String, size: String) -> String {
        [name, size].joined(separator: ", ")
    }
}

/// Loi 17.10 — ma vignette se déplace, change de palier et se permute par un ressort ; Réduire les
/// animations le remplace par le fondu court du chrome, jamais par une bascule sèche.
enum CallSelfTileMotion {
    static func spring(response: Double, dampingFraction: Double, reduceMotion: Bool) -> Animation {
        reduceMotion
            ? .easeInOut(duration: CallChromeStow.reducedFadeDuration)
            : .spring(response: response, dampingFraction: dampingFraction)
    }
}

/// §7.2 — les quatre coins où ma vignette s'aimante. Son centre se pose à la distance de chaque bord
/// (zone sûre, en-tête et pile au-dessus, pilule au-dessous, rail quand elle lui cède le coin).
nonisolated enum CallSelfTileCorner: CaseIterable, Sendable {
    case topLeading, topTrailing, bottomLeading, bottomTrailing

    var isTop: Bool { self == .topLeading || self == .topTrailing }

    var isLeading: Bool { self == .topLeading || self == .bottomLeading }

    func center(of size: CGSize, in container: CGSize, insets: EdgeInsets) -> CGPoint {
        CGPoint(
            x: isLeading ? insets.leading + size.width / 2 : container.width - insets.trailing - size.width / 2,
            y: isTop ? insets.top + size.height / 2 : container.height - insets.bottom - size.height / 2
        )
    }

    /// Le coin le plus proche d'un point : celui où la vignette lâchée s'aimante.
    static func nearest(to point: CGPoint, center: (CallSelfTileCorner) -> CGPoint) -> CallSelfTileCorner {
        allCases.min { hypot(point.x - center($0).x, point.y - center($0).y) < hypot(point.x - center($1).x, point.y - center($1).y) } ?? .topTrailing
    }
}

/// Loi 17.1 · 17.12 (#18206) — ce que montre ma vignette de duo : ma caméra (avec sa piste, même gelée
/// par la survie réseau, L6-1), la tuile « en pause » quand la piste a disparu, ou rien (caméra éteinte,
/// groupe, mode, cadre en direct). Elle paraît, part et change de face en fondu, jamais d'un coup.
nonisolated enum CallSelfViewPresence: Equatable, Sendable {
    case hidden
    case camera
    case paused

    static func resolve(isShown: Bool, isVideoEnabled: Bool, hasLocalVideoTrack: Bool, isVideoSuspended: Bool) -> CallSelfViewPresence {
        guard isShown, isVideoEnabled else { return .hidden }
        if hasLocalVideoTrack { return .camera }
        return isVideoSuspended ? .paused : .hidden
    }
}
