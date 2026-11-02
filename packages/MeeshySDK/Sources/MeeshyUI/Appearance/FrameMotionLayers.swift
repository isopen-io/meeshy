import Combine
import SwiftUI
import UIKit
import QuartzCore
import MeeshySDK

// MARK: - FrameMotionLayers (#10935)
//
// Les couches Core Animation des mouvements d'un cadre (contour d'avatar, cadre de
// bannière). Chaque couche du plan (`FrameMotionPlan`) devient un arbre de `CALayer`
// — un porteur par mouvement, ancré à son origine, le dessin (`CAShapeLayer`, ou un
// `CAGradientLayer` découpé à la forme) au cœur — et une `CABasicAnimation` par
// porteur : `transform.rotation.z`, `transform.scale`, `opacity`, `transform`
// (inclinaison). Le reflet est un `CAGradientLayer` dont la POSITION glisse sous un
// masque à la forme de ses cibles. Le serveur de composition interpole tout : aucun
// corps SwiftUI n'est réévalué à chaque image.
//
// `FrameMotionHostView` porte ces couches et décide quand elles tournent : jamais sous
// « Réduire les animations », quand la politique média coupe le décor (économie
// d'énergie, chaleur sérieuse — `MediaPolicy.animatesDecoration`, #9880), ou quand l'app l'interdit
// (`animates`) — le cadre fixe reste ; en PAUSE hors écran, hors fenêtre et quand
// l'application passe en arrière-plan.

/// Ce qu'un dessin animé remet à son hôte : l'arbre de couches, et les animations à poser
/// une fois l'arbre attaché (leur délai part de cet instant).
public struct FrameMotionContent {
    public let root: CALayer
    let animations: [(layer: CALayer, animation: CAAnimation, delay: Double)]

    public var animationCount: Int { animations.count }

    static var empty: FrameMotionContent { FrameMotionContent(root: CALayer(), animations: []) }
}

/// Une peinture : une couleur fixe, ou un dégradé linéaire en fractions de la boîte du chemin.
struct FramePaint {
    let color: UIColor
    let gradient: FrameGradient?
    let palette: [String]

    static func cgColor(_ hex: String, opacity: Double = 1) -> CGColor {
        UIColor(Color(hex: hex)).withAlphaComponent(opacity).cgColor
    }

    /// Peint `path` dans `context` (repère courant) : tracé à `lineWidth`, rempli sinon ; le dégradé (en
    /// fractions de la boîte du chemin) s'étend au-delà de ses bornes, sa couleur s'il est illisible. Le
    /// dessin fixe d'un cadre de bannière (`BannerFrameRenderer`) et d'un contour (`AvatarRingRenderer`).
    func fill(_ path: CGPath, in context: CGContext, opacity: Double, lineWidth: CGFloat?, evenOdd: Bool) {
        context.saveGState()
        defer { context.restoreGState() }
        guard let gradient,
              let cg = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                  colors: gradient.stops.map { Self.cgColor(palette[safe: $0.color] ?? "#000000", opacity: $0.opacity ?? 1) } as CFArray,
                                  locations: gradient.stops.map { CGFloat($0.at) }) else {
            context.addPath(path)
            if let lineWidth {
                context.setStrokeColor(color.withAlphaComponent(opacity).cgColor)
                context.setLineWidth(lineWidth)
                context.strokePath()
            } else {
                context.setFillColor(color.withAlphaComponent(opacity).cgColor)
                context.fillPath(using: evenOdd ? .evenOdd : .winding)
            }
            return
        }
        let box = path.boundingBoxOfPath
        context.addPath(path)
        if let lineWidth {
            context.setLineWidth(lineWidth)
            context.replacePathWithStrokedPath()
            context.clip()
        } else {
            context.clip(using: evenOdd ? .evenOdd : .winding)
        }
        context.setAlpha(CGFloat(opacity))
        context.drawLinearGradient(
            cg,
            start: CGPoint(x: box.minX + gradient.x1 * box.width, y: box.minY + gradient.y1 * box.height),
            end: CGPoint(x: box.minX + gradient.x2 * box.width, y: box.minY + gradient.y2 * box.height),
            options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]
        )
    }
}

enum FrameMotionLayers {
    static let animationKey = "meeshy.frame.motion"

    /// Une forme peinte : un `CAShapeLayer`, ou un `CAGradientLayer` découpé à la forme quand le trait
    /// porte un dégradé lisible (`nil` ⇒ sa couleur).
    static func shape(_ path: CGPath, paint: FramePaint, opacity: Double, lineWidth: CGFloat?, evenOdd: Bool) -> CALayer {
        let shape = CAShapeLayer()
        shape.path = path
        shape.fillRule = evenOdd ? .evenOdd : .nonZero
        if let lineWidth {
            shape.fillColor = nil
            shape.strokeColor = paint.color.cgColor
            shape.lineWidth = lineWidth
        } else {
            shape.fillColor = paint.color.cgColor
        }
        shape.opacity = Float(opacity)
        guard let gradient = paint.gradient else { return shape }
        let geometry = path.boundingBoxOfPath
        let frame = lineWidth.map { geometry.insetBy(dx: -$0, dy: -$0) } ?? geometry
        guard frame.width > 0, frame.height > 0 else { return shape }
        let layer = CAGradientLayer()
        layer.frame = frame
        layer.colors = gradient.stops.map { FramePaint.cgColor(paint.palette[safe: $0.color] ?? "#000000", opacity: $0.opacity ?? 1) }
        layer.locations = gradient.stops.map { NSNumber(value: $0.at) }
        let point = { (x: Double, y: Double) in
            CGPoint(x: (geometry.minX + x * geometry.width - frame.minX) / frame.width, y: (geometry.minY + y * geometry.height - frame.minY) / frame.height)
        }
        layer.startPoint = point(gradient.x1, gradient.y1)
        layer.endPoint = point(gradient.x2, gradient.y2)
        var shift = CGAffineTransform(translationX: -frame.minX, y: -frame.minY)
        shape.path = path.copy(using: &shift)
        shape.fillColor = lineWidth == nil ? UIColor.white.cgColor : nil
        shape.strokeColor = lineWidth == nil ? nil : UIColor.white.cgColor
        shape.opacity = 1
        shape.frame = layer.bounds
        layer.mask = shape
        layer.opacity = Float(opacity)
        return layer
    }

    /// Une couche animée : ses mouvements s'emboîtent (un porteur chacun, ancré à son origine), le dessin au cœur.
    static func wrap(_ content: CALayer, chain: [FrameMotionStep], size: CGSize, scale: CGFloat,
                     into animations: inout [(layer: CALayer, animation: CAAnimation, delay: Double)]) -> CALayer {
        content.frame = CGRect(origin: .zero, size: size)
        return chain.reversed().reduce(content) { inner, step in
            let holder = CALayer()
            holder.bounds = CGRect(origin: .zero, size: size)
            let origin = CGPoint(x: step.origin.x * scale, y: step.origin.y * scale)
            holder.anchorPoint = CGPoint(x: size.width > 0 ? origin.x / size.width : 0.5, y: size.height > 0 ? origin.y / size.height : 0.5)
            holder.position = origin
            holder.addSublayer(inner)
            animations.append((holder, animation(for: step), step.delay))
            return holder
        }
    }

    static func animation(for step: FrameMotionStep) -> CAAnimation {
        let swapped = step.direction == .reverse || step.direction == .alternateReverse
        let (from, to) = swapped ? (step.to, step.from) : (step.from, step.to)
        let animation: CABasicAnimation
        switch step.kind {
        case .rotate:
            animation = CABasicAnimation(keyPath: "transform.rotation.z")
            animation.fromValue = from * .pi / 180
            animation.toValue = to * .pi / 180
        case .pulse:
            animation = CABasicAnimation(keyPath: "transform.scale")
            animation.fromValue = from
            animation.toValue = to
        case .twinkle:
            animation = CABasicAnimation(keyPath: "opacity")
            animation.fromValue = from
            animation.toValue = to
        case .skew:
            animation = CABasicAnimation(keyPath: "transform")
            animation.fromValue = NSValue(caTransform3D: skew(degrees: from))
            animation.toValue = NSValue(caTransform3D: skew(degrees: to))
        }
        switch step.kind {
        case .pulse, .twinkle:
            animation.duration = step.duration / 2
            animation.autoreverses = true
        case .rotate, .skew:
            animation.duration = step.duration
            animation.autoreverses = step.direction == .alternate || step.direction == .alternateReverse
        }
        animation.repeatCount = .infinity
        animation.timingFunction = CAMediaTimingFunction(name: step.linear ? .linear : .easeInEaseOut)
        animation.fillMode = .backwards
        animation.isRemovedOnCompletion = false
        return animation
    }

    static func skew(degrees: Double) -> CATransform3D {
        var transform = CATransform3DIdentity
        transform.m21 = CGFloat(tan(degrees * .pi / 180))
        return transform
    }

    /// Un reflet : un bandeau incliné qui traverse la boîte, découpé (`mask`) à la forme de ses cibles.
    static func sweep(_ plan: FrameSweepPlan, mask: CALayer, size: CGSize,
                      into animations: inout [(layer: CALayer, animation: CAAnimation, delay: Double)]) -> CALayer {
        let holder = CALayer()
        holder.frame = CGRect(origin: .zero, size: size)
        holder.masksToBounds = true
        mask.frame = holder.bounds
        holder.mask = mask
        let band = max(size.height * 0.3, 8)
        let sheen = CAGradientLayer()
        sheen.colors = [UIColor.white.withAlphaComponent(0).cgColor, UIColor.white.withAlphaComponent(0.55).cgColor, UIColor.white.withAlphaComponent(0).cgColor]
        sheen.startPoint = CGPoint(x: 0, y: 0.5)
        sheen.endPoint = CGPoint(x: 1, y: 0.5)
        sheen.bounds = CGRect(x: 0, y: 0, width: band, height: size.height)
        let start = -band * 1.5
        let end = start + size.width + band * 3
        sheen.position = CGPoint(x: start, y: size.height / 2)
        sheen.transform = skew(degrees: -24)
        holder.addSublayer(sheen)
        let glide = CAKeyframeAnimation(keyPath: "position.x")
        glide.values = plan.reverse ? [end, start, start] : [start, end, end]
        glide.keyTimes = [0, 0.55, 1]
        glide.timingFunctions = [CAMediaTimingFunction(controlPoints: 0.45, 0.05, 0.35, 1), CAMediaTimingFunction(name: .linear)]
        glide.duration = plan.duration
        glide.repeatCount = .infinity
        glide.fillMode = .backwards
        glide.isRemovedOnCompletion = false
        animations.append((sheen, glide, plan.delay))
        return holder
    }
}

// MARK: - L'hôte

/// Porte un `FrameMotionContent` et décide quand ses animations tournent.
final class FrameMotionHostView: UIView {
    /// La décision de l'app (aperçu, vignette) : `false` ⇒ le cadre fixe, aucune animation posée.
    var animates = true {
        didSet { if oldValue != animates { syncMotion() } }
    }

    private var content: FrameMotionContent = .empty
    private(set) var hasInstalledAnimations = false
    private(set) var isPaused = false
    private var policyObservation: AnyCancellable?

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        accessibilityElementsHidden = true
        backgroundColor = .clear
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(motionPolicyChanged), name: UIAccessibility.reduceMotionStatusDidChangeNotification, object: nil)
        policyObservation = MediaPolicyMonitor.shared.$policy
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.syncMotion() }
        center.addObserver(self, selector: #selector(visibilityChanged), name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(visibilityChanged), name: UIApplication.willEnterForegroundNotification, object: nil)
    }

    required init?(coder: NSCoder) { nil }

    nonisolated deinit {}

    /// Les animations ne se posent qu'ici : mouvement autorisé par l'app, par l'accessibilité et par l'énergie.
    var motionAllowed: Bool {
        animates && !UIAccessibility.isReduceMotionEnabled && MediaPolicyMonitor.shared.policy.animatesDecoration
    }

    func show(_ next: FrameMotionContent) {
        content.root.removeFromSuperlayer()
        content = next
        hasInstalledAnimations = false
        next.root.frame = bounds
        layer.addSublayer(next.root)
        syncMotion()
    }

    func syncMotion() {
        if motionAllowed, !hasInstalledAnimations, content.animationCount > 0 {
            let now = content.root.convertTime(CACurrentMediaTime(), from: nil)
            for entry in content.animations {
                entry.animation.beginTime = now + entry.delay
                entry.layer.add(entry.animation, forKey: FrameMotionLayers.animationKey)
            }
            hasInstalledAnimations = true
        } else if !motionAllowed, hasInstalledAnimations {
            content.animations.forEach { $0.layer.removeAnimation(forKey: FrameMotionLayers.animationKey) }
            hasInstalledAnimations = false
        }
        syncVisibility()
    }

    /// À l'écran : dans une fenêtre, visible, l'application au premier plan, la boîte dans la fenêtre.
    var isOnScreen: Bool {
        guard let window, !isHidden, alpha > 0.01, !FrameMotionTicker.shared.appInBackground else { return false }
        return convert(bounds, to: window).intersects(window.bounds)
    }

    func syncVisibility() {
        if isOnScreen { resume() } else { pause() }
    }

    private func pause() {
        guard !isPaused else { return }
        let now = layer.convertTime(CACurrentMediaTime(), from: nil)
        layer.speed = 0
        layer.timeOffset = now
        isPaused = true
    }

    private func resume() {
        guard isPaused else { return }
        let paused = layer.timeOffset
        layer.speed = 1
        layer.timeOffset = 0
        layer.beginTime = 0
        layer.beginTime = layer.convertTime(CACurrentMediaTime(), from: nil) - paused
        isPaused = false
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        content.root.frame = bounds
        CATransaction.commit()
        syncVisibility()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil { FrameMotionTicker.shared.untrack(self) } else { FrameMotionTicker.shared.track(self) }
        syncMotion()
    }

    @objc private func motionPolicyChanged() { syncMotion() }

    @objc private func visibilityChanged(_ note: Notification) {
        FrameMotionTicker.shared.appInBackground = note.name == UIApplication.didEnterBackgroundNotification
        syncVisibility()
    }
}

/// Une horloge lente (1 Hz) et partagée : un cadre défilé hors de la fenêtre se met en pause, sans
/// minuterie par cadre ni lien d'affichage.
final class FrameMotionTicker: NSObject {
    static let shared = FrameMotionTicker()

    var appInBackground = false
    private let hosts = NSHashTable<FrameMotionHostView>.weakObjects()
    private var timer: Timer?

    nonisolated deinit {}

    func track(_ host: FrameMotionHostView) {
        hosts.add(host)
        guard timer == nil else { return }
        let timer = Timer(timeInterval: 1, target: self, selector: #selector(tick), userInfo: nil, repeats: true)
        timer.tolerance = 0.5
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    func untrack(_ host: FrameMotionHostView) {
        hosts.remove(host)
        guard hosts.allObjects.isEmpty else { return }
        timer?.invalidate()
        timer = nil
    }

    @objc private func tick() {
        hosts.allObjects.forEach { $0.syncVisibility() }
    }
}
