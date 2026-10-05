import CoreGraphics
import Foundation

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
