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

    static func liveSize(pinch magnification: CGFloat, from current: CallSelfTileScale) -> CGSize {
        guard magnification.isFinite, magnification > 0 else { return current.size }
        let width = min(max(current.width * magnification, CallSelfTileScale.x1.width), CallSelfTileScale.x3.width)
        return CGSize(width: width, height: width * aspectRatio)
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
