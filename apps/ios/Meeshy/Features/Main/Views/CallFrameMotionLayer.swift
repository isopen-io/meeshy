import QuartzCore
import UIKit

/// **LES ANIMATIONS D'UN ORNEMENT** (#12683) — des `CAAnimation` jouées par le serveur de
/// composition : l'app ne calcule rien par image, ne redessine rien, et tout s'arrête avec la couche.
nonisolated enum CallFrameMotionAnimations {
    static let key = "meeshy.frame.motion"

    /// Les animations du groupe `index` (sur `partitions`) d'un ornement, à une toile de `size`.
    static func animations(for track: CallFrameMotionTrack, index: Int, size: CGSize, unit: CGFloat) -> [CAAnimation] {
        let phase = Double(index) / Double(max(1, track.partitions))
        let looping = loop(track.style, phase: phase, size: size, unit: unit)
        guard track.repeats else { return [entrance(unit: unit)] }
        return looping
    }

    static func loop(_ style: CallFrameMotionStyle, phase: Double, size: CGSize, unit: CGFloat) -> [CAAnimation] {
        switch style {
        case .fall(let period):
            return [linear("transform.translation.y", from: 0, to: size.height, period: period)]
        case .rise(let period):
            return [linear("transform.translation.y", from: 0, to: -size.height, period: period)]
        case .twinkle(let period):
            return [keyframes("opacity", values: [1, 0.2, 1], period: period, phase: phase)]
        case .breathe(let period):
            return [keyframes("opacity", values: [1, 0.55, 1], period: period, phase: phase)]
        case .flicker:
            return [keyframes("opacity", values: [1, 0.78, 0.95, 0.66, 1, 0.86, 1], period: 1.7, phase: phase)]
        case .blink:
            return [steps("opacity", values: [1, 0], period: 1.2)]
        case .flash:
            return [keyframes("opacity", values: [0, 0, 1, 0.25, 1, 0, 0], times: [0, 0.6, 0.64, 0.68, 0.72, 0.8, 1], period: 4.5, phase: phase)]
        case .jitter:
            let jump = Double(unit) * 0.02
            return [
                steps("transform.translation.x", values: [0, jump, -jump * 0.6, 0, jump * 0.3, 0], period: 0.9),
                steps("opacity", values: [1, 0.55, 1, 0.3, 1, 1], period: 0.9),
            ]
        case .scroll:
            return [linear("transform.translation.y", from: 0, to: max(2, Double(unit) * 0.006), period: 0.5)]
        case .spin(let period):
            return [linear("transform.rotation.z", from: 0, to: 2 * .pi, period: period)]
        case .sway(let radians, let period):
            return [swing("transform.rotation.z", amplitude: radians, period: period, phase: phase)]
        case .drift(let units, let period):
            return [swing("transform.translation.x", amplitude: Double(unit) * units, period: period, phase: phase)]
        case .bob(let units, let period):
            return [swing("transform.translation.y", amplitude: Double(unit) * units, period: period, phase: phase)]
        }
    }

    /// `onAppear` : l'ornement entre en glissant et en apparaissant, puis reste à sa place.
    static func entrance(unit: CGFloat) -> CAAnimation {
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 0
        fade.toValue = 1
        let slide = CABasicAnimation(keyPath: "transform.translation.y")
        slide.fromValue = Double(unit) * 0.04
        slide.toValue = 0
        let group = CAAnimationGroup()
        group.animations = [fade, slide]
        group.duration = 0.8
        group.timingFunction = CAMediaTimingFunction(name: .easeOut)
        return group
    }

    private static func linear(_ keyPath: String, from: Double, to: Double, period: Double) -> CAAnimation {
        let animation = CABasicAnimation(keyPath: keyPath)
        animation.fromValue = from
        animation.toValue = to
        animation.duration = period
        animation.repeatCount = .infinity
        animation.timingFunction = CAMediaTimingFunction(name: .linear)
        return animation
    }

    private static func swing(_ keyPath: String, amplitude: Double, period: Double, phase: Double) -> CAAnimation {
        keyframes(keyPath, values: [-amplitude, amplitude, -amplitude], period: period, phase: phase, smooth: true)
    }

    private static func keyframes(_ keyPath: String, values: [Double], times: [Double]? = nil, period: Double, phase: Double, smooth: Bool = true) -> CAAnimation {
        let animation = CAKeyframeAnimation(keyPath: keyPath)
        animation.values = values
        animation.keyTimes = times.map { $0.map { NSNumber(value: $0) } }
        animation.duration = period
        animation.repeatCount = .infinity
        animation.timeOffset = period * phase
        animation.calculationMode = smooth ? .cubic : .linear
        return animation
    }

    private static func steps(_ keyPath: String, values: [Double], period: Double) -> CAAnimation {
        let animation = CAKeyframeAnimation(keyPath: keyPath)
        animation.values = values
        animation.duration = period
        animation.repeatCount = .infinity
        animation.calculationMode = .discrete
        return animation
    }
}

/// **LA COUCHE DES ORNEMENTS ANIMÉS** (#12683) — posée au-dessus du cadre fixe, dans le repère de la
/// toile peinte, et masquée hors des visages et des textes. Sans toucher, sans dessin par image.
nonisolated final class CallFrameMotionLayer: CALayer {
    let sceneSize: CGSize

    init(scene: CallFrameMotionScene) {
        sceneSize = scene.size
        super.init()
        bounds = CGRect(origin: .zero, size: scene.size)
        anchorPoint = CGPoint(x: 0.5, y: 0.5)
        let maskLayer = CALayer()
        maskLayer.frame = bounds
        maskLayer.contents = scene.mask
        mask = maskLayer
        scene.sprites.forEach { addSublayer(Self.spriteLayer($0, size: scene.size, unit: scene.unit)) }
    }

    override init(layer: Any) {
        sceneSize = (layer as? CallFrameMotionLayer)?.sceneSize ?? .zero
        super.init(layer: layer)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    /// Le cadre peint à `sceneSize` remplit `viewSize` (même ajustement que le compositeur Metal).
    func fit(into viewSize: CGSize) {
        guard sceneSize.width > 0, sceneSize.height > 0 else { return }
        let scale = max(viewSize.width / sceneSize.width, viewSize.height / sceneSize.height)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        position = CGPoint(x: viewSize.width / 2, y: viewSize.height / 2)
        setAffineTransform(CGAffineTransform(scaleX: scale, y: scale))
        CATransaction.commit()
    }

    private static func spriteLayer(_ sprite: CallFrameMotionSprite, size: CGSize, unit: CGFloat) -> CALayer {
        let container = CALayer()
        container.frame = CGRect(origin: .zero, size: size)
        sprite.images.enumerated().forEach { index, image in
            let piece = sprite.track.travels ? travelingLayer(image, sprite: sprite, size: size) : imageLayer(image, size: size)
            CallFrameMotionAnimations.animations(for: sprite.track, index: index, size: size, unit: unit)
                .enumerated()
                .forEach { offset, animation in piece.add(animation, forKey: "\(CallFrameMotionAnimations.key).\(offset)") }
            container.addSublayer(piece)
        }
        return container
    }

    private static func imageLayer(_ image: CGImage, size: CGSize) -> CALayer {
        let layer = CALayer()
        layer.frame = CGRect(origin: .zero, size: size)
        layer.contents = image
        return layer
    }

    /// Deux planches bout à bout : quand la première sort par un bord, la seconde l'a déjà remplacée.
    private static func travelingLayer(_ image: CGImage, sprite: CallFrameMotionSprite, size: CGSize) -> CALayer {
        let replicator = CAReplicatorLayer()
        replicator.frame = CGRect(origin: .zero, size: size)
        replicator.instanceCount = 2
        let rises: Bool
        if case .rise = sprite.track.style { rises = true } else { rises = false }
        replicator.instanceTransform = CATransform3DMakeTranslation(0, rises ? size.height : -size.height, 0)
        replicator.addSublayer(imageLayer(image, size: size))
        return replicator
    }
}
