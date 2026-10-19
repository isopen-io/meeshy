import CoreGraphics
import MeeshySDK

// MARK: - FrameMotionPlan (#10935)
//
// MIROIR de `frameMotionLayers` (`packages/shared/utils/frame-motion-svg.ts`) : les
// mouvements déclarés d'un cadre (`FrameMotion`, #10932) deviennent des COUCHES. Les
// chemins qu'un mouvement anime quittent le dessin fixe pour une couche Core Animation
// (`FrameMotionLayers`), animée sur transform et opacity SEULS — jamais un redessin
// SwiftUI par image. Le reflet (`sweep`) laisse sa cible dans le dessin fixe et glisse
// au-dessus, découpé à sa forme.
//
// Les éléments qui bougent EXACTEMENT ensemble (même chaîne, même origine, même délai)
// partagent une couche ; un décalage (`stagger`) ou une origine propre (`self`) en fait
// des couches distinctes. Sur divergence, le TypeScript a raison.

nonisolated public enum FrameStepDirection: String, Hashable, Sendable {
    case normal
    case reverse
    case alternate
    case alternateReverse
}

/// Un mouvement appliqué à une couche, dans le repère du dessin (viewBox).
nonisolated public struct FrameMotionStep: Hashable, Sendable {
    public enum Kind: String, Hashable, Sendable { case rotate, pulse, twinkle, skew }

    public let kind: Kind
    public let duration: Double
    public let delay: Double
    public let direction: FrameStepDirection
    /// Degrés (rotation, inclinaison), échelle (pulsation) ou opacité (scintillement) : de `from` à `to`.
    public let from: Double
    public let to: Double
    /// `true` : vitesse constante (le tour complet) ; sinon accélère puis ralentit.
    public let linear: Bool
    public let origin: CGPoint
}

nonisolated public struct FrameMotionLayerPlan: Hashable, Sendable {
    public let elements: [Int]
    public let chain: [FrameMotionStep]
}

nonisolated public struct FrameSweepPlan: Hashable, Sendable {
    public let elements: [Int]
    public let duration: Double
    public let delay: Double
    public let reverse: Bool
}

nonisolated public struct FrameMotionPlan: Hashable, Sendable {
    public let layers: [FrameMotionLayerPlan]
    public let sweeps: [FrameSweepPlan]
    /// Les éléments qui quittent le dessin fixe (le reflet laisse sa cible en place).
    public let animated: Set<Int>

    public static let still = FrameMotionPlan(layers: [], sweeps: [], animated: [])

    public var isStill: Bool { layers.isEmpty && sweeps.isEmpty }

    public struct Element: Hashable, Sendable {
        public let group: String?
        public let bounds: CGRect?

        public init(group: String?, bounds: CGRect?) {
            self.group = group
            self.bounds = bounds
        }
    }

    public static func make(elements: [Element], motions: [FrameMotion], center: CGPoint) -> FrameMotionPlan {
        var chains = Array(repeating: [FrameMotionStep](), count: elements.count)
        var sweeps: [FrameSweepPlan] = []
        for motion in motions {
            let targets = motion.targets.flatMap { target in elements.indices.filter { elements[$0].group == target } }
            guard !targets.isEmpty else { continue }
            if motion.kind == .sweep {
                sweeps.append(FrameSweepPlan(elements: targets, duration: motion.duration, delay: motion.delay ?? 0, reverse: motion.direction == .reverse))
                continue
            }
            for (order, element) in targets.enumerated() {
                let delay = (motion.delay ?? 0) + Double(order) * (motion.stagger ?? 0)
                if let step = step(motion, delay: delay, origin: origin(motion, bounds: elements[element].bounds, center: center)) {
                    chains[element].append(step)
                }
            }
        }
        var layers: [FrameMotionLayerPlan] = []
        var index: [[FrameMotionStep]: Int] = [:]
        for (element, chain) in chains.enumerated() where !chain.isEmpty {
            if let existing = index[chain] {
                layers[existing] = FrameMotionLayerPlan(elements: layers[existing].elements + [element], chain: chain)
            } else {
                index[chain] = layers.count
                layers.append(FrameMotionLayerPlan(elements: [element], chain: chain))
            }
        }
        return FrameMotionPlan(layers: layers, sweeps: sweeps, animated: Set(layers.flatMap(\.elements)))
    }

    private static func origin(_ motion: FrameMotion, bounds: CGRect?, center: CGPoint) -> CGPoint {
        let fallback: FrameMotionOrigin
        switch motion.kind {
        case .twinkle, .sweep: return center
        case .rotate: fallback = .frame
        case .pulse: fallback = .own
        case .skew: fallback = .top
        }
        guard let bounds else { return center }
        switch motion.origin ?? fallback {
        case .frame: return center
        case .own: return CGPoint(x: bounds.midX, y: bounds.midY)
        case .top: return CGPoint(x: bounds.midX, y: bounds.minY)
        case .bottom: return CGPoint(x: bounds.midX, y: bounds.maxY)
        }
    }

    private static func step(_ motion: FrameMotion, delay: Double, origin: CGPoint) -> FrameMotionStep? {
        let reverse = motion.direction == .reverse
        func make(_ kind: FrameMotionStep.Kind, _ direction: FrameStepDirection, _ from: Double, _ to: Double, linear: Bool = false) -> FrameMotionStep {
            FrameMotionStep(kind: kind, duration: motion.duration, delay: delay, direction: direction, from: from, to: to, linear: linear, origin: origin)
        }
        switch motion.kind {
        case .rotate:
            let amplitude = motion.amplitude ?? 360
            if motion.direction == .alternate { return make(.rotate, .alternate, -amplitude, amplitude) }
            return make(.rotate, reverse ? .reverse : .normal, 0, amplitude, linear: amplitude == 360)
        case .pulse:
            return make(.pulse, .normal, 1, 1 + (motion.amplitude ?? 0.1))
        case .twinkle:
            return make(.twinkle, .normal, 1, 1 - (motion.amplitude ?? 0.75))
        case .skew:
            let amplitude = motion.amplitude ?? 7
            return make(.skew, reverse ? .alternateReverse : .alternate, -amplitude, amplitude)
        case .sweep:
            return nil
        }
    }
}
