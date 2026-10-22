import SwiftUI
import UIKit
import MeeshySDK

// MARK: - AvatarRingView (#10632, spec §§ 5.2, 8.2)
//
// Un building block AGNOSTIQUE, miroir de `avatarRingSvg` (`utils/appearance-svg.ts`) :
// il prend un `AvatarRingDesign` et peint son contour dans le viewBox 0 0 100 100
// où l'avatar occupe le cercle de rayon 42. Jamais de singleton Meeshy, jamais de
// décision « quel contour, quand » : l'app compose. Couleurs FIXES — un contour
// se voit des autres, identique pour tous.

public struct AvatarRingView: View, Equatable {
    public let design: AvatarRingDesign
    /// La décision de l'app : `false` ⇒ le contour fixe (aperçus, vignettes). Les mouvements (#10935) tournent
    /// en couches Core Animation (`FrameMotionLayers`), jamais sous « Réduire les animations ».
    public let animates: Bool

    @Environment(\.accessibilityReduceMotion) private var systemReduce
    @Environment(\.meeshyForceReduceMotion) private var userForced

    public init(design: AvatarRingDesign, animates: Bool = true) {
        self.design = design
        self.animates = animates
    }

    nonisolated public static func == (lhs: AvatarRingView, rhs: AvatarRingView) -> Bool {
        lhs.design == rhs.design && lhs.animates == rhs.animates
    }

    /// Le plan des couches animées d'un contour : ses chemins d'ornement, viewBox 0 0 100 100, centre (50, 50).
    static func motionPlan(_ design: AvatarRingDesign) -> FrameMotionPlan {
        guard !design.motion.isEmpty else { return .still }
        let elements = design.ornament.map { stroke -> FrameMotionPlan.Element in
            let box = SVGPathData.make(stroke.d).cgPath.boundingBoxOfPath
            return FrameMotionPlan.Element(group: stroke.group, bounds: box.isNull ? nil : box)
        }
        return FrameMotionPlan.make(elements: elements, motions: design.motion, center: CGPoint(x: Self.box / 2, y: Self.box / 2))
    }

    nonisolated private static let box: Double = 100
    private static let dots = 28
    private static let dashes = 36
    private static let arcs = 24

    public var body: some View {
        let plan = animates && !MeeshyMotion.shouldReduce(system: systemReduce, userForced: userForced) ? Self.motionPlan(design) : .still
        ZStack {
            still(skipping: plan.animated)
            if !plan.isStill {
                AvatarRingMotionLayers(design: design, plan: plan)
            }
        }
        .accessibilityHidden(true)
        .allowsHitTesting(false)
    }

    private func still(skipping: Set<Int>) -> some View {
        Canvas { context, size in
            let scale = min(size.width, size.height) / Self.box
            let offset = CGPoint(x: (size.width - Self.box * scale) / 2, y: (size.height - Self.box * scale) / 2)
            let width = design.stroke.width * Self.box
            let radius = Self.box / 2 - width / 2
            let colors = design.stroke.colors
            let first = Color(hex: colors[0])
            let second = Color(hex: colors.count > 1 ? colors[1] : colors[0])

            func circle(_ r: Double) -> Path {
                Path(ellipseIn: CGRect(
                    x: offset.x + (Self.box / 2 - r) * scale, y: offset.y + (Self.box / 2 - r) * scale,
                    width: 2 * r * scale, height: 2 * r * scale
                ))
            }

            switch design.stroke.style {
            case .solid:
                context.stroke(circle(radius), with: .color(first), lineWidth: width * scale)
            case .double:
                context.stroke(circle(radius), with: .color(first), lineWidth: width * scale)
                context.stroke(circle(radius - width * 2), with: .color(second), lineWidth: width * scale)
            case .dotted:
                let circumference = 2 * Double.pi * radius
                context.stroke(
                    circle(radius), with: .color(first),
                    style: StrokeStyle(lineWidth: width * scale, lineCap: .round, dash: [0.001, circumference / Double(Self.dots) * scale])
                )
            case .dashed:
                let step = 2 * Double.pi * radius / Double(Self.dashes)
                context.stroke(
                    circle(radius), with: .color(first),
                    style: StrokeStyle(lineWidth: width * scale, dash: [step * 0.6 * scale, step * 0.4 * scale])
                )
            case .gradient:
                for index in 0..<Self.arcs {
                    let from = Double(index) / Double(Self.arcs) * 2 * Double.pi - Double.pi / 2
                    let to = Double(index + 1) / Double(Self.arcs) * 2 * Double.pi - Double.pi / 2 + 0.004
                    var arc = Path()
                    arc.addArc(
                        center: CGPoint(x: offset.x + Self.box / 2 * scale, y: offset.y + Self.box / 2 * scale),
                        radius: radius * scale, startAngle: .radians(from), endAngle: .radians(to), clockwise: false
                    )
                    let hex = Self.cyclicHex(colors, at: Double(index) / Double(Self.arcs))
                    context.stroke(arc, with: .color(Color(hex: hex)), lineWidth: width * scale)
                }
            case .none:
                break
            }

            for (index, stroke) in design.ornament.enumerated() where !skipping.contains(index) {
                let path = SVGPathData.make(stroke.d)
                    .applying(CGAffineTransform(scaleX: scale, y: scale).concatenating(CGAffineTransform(translationX: offset.x, y: offset.y)))
                let shading = Self.shading(stroke, design: design, in: path.boundingRect)
                var layer = context
                layer.opacity = stroke.opacity
                if let lineWidth = stroke.width {
                    layer.stroke(path, with: shading, lineWidth: lineWidth * scale)
                } else {
                    layer.fill(path, with: shading)
                }
            }
        }
    }

    /// La peinture d'un trait : son dégradé (en fractions de sa boîte) s'il est lisible, sa couleur sinon.
    private static func shading(_ stroke: AvatarRingOrnamentPath, design: AvatarRingDesign, in box: CGRect) -> GraphicsContext.Shading {
        let colors = design.stroke.colors
        guard let gradient = stroke.gradient.flatMap({ design.gradients[safe: $0] ?? nil }) else {
            return .color(Color(hex: colors[stroke.color]))
        }
        let stops = gradient.stops.map { Gradient.Stop(color: Color(hex: colors[safe: $0.color] ?? "#000000").opacity($0.opacity ?? 1), location: $0.at) }
        return .linearGradient(
            Gradient(stops: stops),
            startPoint: CGPoint(x: box.minX + gradient.x1 * box.width, y: box.minY + gradient.y1 * box.height),
            endPoint: CGPoint(x: box.minX + gradient.x2 * box.width, y: box.minY + gradient.y2 * box.height)
        )
    }

    // MARK: Dégradé cyclique

    /// La couleur à la fraction `t` d'un tour, le dernier segment ramenant à la première couleur (miroir de `cyclicColor`).
    nonisolated static func cyclicHex(_ colors: [String], at t: Double) -> String {
        let loop = colors + [colors[0]]
        let scaled = t * Double(loop.count - 1)
        let index = min(Int(scaled), loop.count - 2)
        return lerpHex(loop[index], loop[index + 1], scaled - Double(index))
    }

    nonisolated static func lerpHex(_ from: String, _ to: String, _ t: Double) -> String {
        // Bornée quelle que soit l'entrée : `#RGB` s'étend, `#RRGGBBAA` perd son alpha, le reste se lit noir —
        // jamais un indice hors de la chaîne (le décodage refuse déjà ces couleurs ; ceci tient la ligne de dessin).
        func channels(_ hex: String) -> [Double] {
            var digits = Array(hex.hasPrefix("#") ? hex.dropFirst() : Substring(hex))
            if digits.count == 3 { digits = digits.flatMap { [$0, $0] } }
            guard digits.count >= 6, digits.allSatisfy(\.isHexDigit) else { return [0, 0, 0] }
            return (0..<3).map { i in Double(Int(String(digits[(i * 2)..<(i * 2 + 2)]), radix: 16) ?? 0) }
        }
        let a = channels(from), b = channels(to)
        let mixed = (0..<3).map { i in Int((a[i] + (b[i] - a[i]) * t).rounded()) }
        return "#" + mixed.map { String(format: "%02X", $0) }.joined()
    }
}

// MARK: - Contour et anneau de story, concentriques (#10714)

/// Décision porteur du 2026-10-15, la même sur le web (`ringedAvatarSize`) : le contour
/// est DEHORS, l'anneau de story JUSTE DEDANS, et l'avatar se réduit légèrement pour
/// que l'anneau tienne dans le trou du contour — les deux restent visibles.
public enum AvatarRingGeometry {
    /// L'échelle de l'avatar (anneau de story compris) sous un contour : son anneau de
    /// story (`storyRingSize`, l'emprise de `MeeshyAvatar` quand il en porte un) se ramène
    /// au diamètre de l'avatar nu, c'est-à-dire au trou du contour. `1` sans anneau de story.
    public static func avatarScale(avatarSize: CGFloat, storyRingSize: CGFloat?) -> CGFloat {
        guard let storyRingSize, avatarSize > 0, storyRingSize > avatarSize else { return 1 }
        return avatarSize / storyRingSize
    }

    /// La part de l'empreinte que l'avatar occupe sous un contour : le cercle de rayon 42
    /// du viewBox 100 (miroir de `AVATAR_FRACTION`, `avatar-ring.tsx`).
    public static let holeFraction: CGFloat = 0.84

    /// L'échelle de l'avatar quand le contour tient DANS son empreinte (#10713, listes et
    /// bulles) : l'avatar se ramène au trou du contour, et son anneau de story avec lui.
    public static func footprintScale(footprint: CGFloat, storyRingSize: CGFloat?) -> CGFloat {
        holeFraction * avatarScale(avatarSize: footprint, storyRingSize: storyRingSize)
    }
}

public extension View {
    /// Pose le contour AUTOUR de l'avatar sans changer sa mise en page : le contour est une superposition
    /// agrandie (l'avatar occupe le rayon 42 du viewBox 100). `nil` ⇒ la vue telle quelle (rendu historique).
    /// `storyRingSize` (l'emprise de l'anneau de story quand l'avatar en porte un) réduit l'avatar pour que
    /// l'anneau passe DANS le contour, concentrique, au lieu d'être recouvert (#10714).
    @ViewBuilder
    func avatarRing(_ design: AvatarRingDesign?, avatarSize: CGFloat, storyRingSize: CGFloat? = nil, animates: Bool = true) -> some View {
        if let design {
            scaleEffect(AvatarRingGeometry.avatarScale(avatarSize: avatarSize, storyRingSize: storyRingSize))
            .overlay {
                ZStack {
                    AvatarRingView(design: design, animates: animates)
                        .equatable()
                    if let lottie = design.lottie {
                        PackLottieLayer(ref: lottie, animates: animates)
                    }
                }
                .frame(width: avatarSize * 100 / 84, height: avatarSize * 100 / 84)
            }
        } else {
            self
        }
    }

    /// Le contour DANS l'empreinte de l'avatar (#10713) — pour les cotes FIXES (ligne de
    /// liste, bulle) : le contour occupe la cote `footprint`, l'avatar (anneau de story
    /// compris, #10714) se réduit à son trou. Rien ne grandit, rien ne se décale, et le
    /// contour se pose sans perte d'image quand il arrive. Animé comme partout (décision
    /// porteur 2026-10-16, #10815) : une liste en porte des dizaines, mais le plafond des
    /// films vivants (`LottieLiveBudget`) n'en fait jouer que quelques-uns à la fois — les
    /// autres montrent leur première image fixe, et un même fichier ne se décode qu'une fois.
    @ViewBuilder
    func avatarRingWithin(_ design: AvatarRingDesign?, footprint: CGFloat, storyRingSize: CGFloat? = nil, animates: Bool = true) -> some View {
        if let design {
            scaleEffect(AvatarRingGeometry.footprintScale(footprint: footprint, storyRingSize: storyRingSize))
            .overlay {
                ZStack {
                    AvatarRingView(design: design, animates: animates)
                        .equatable()
                    if let lottie = design.lottie {
                        PackLottieLayer(ref: lottie, animates: animates)
                    }
                }
                .frame(width: footprint, height: footprint)
            }
        } else {
            self
        }
    }
}

// MARK: - Les couches animées d'un contour (#10935)

private struct AvatarRingMotionLayers: UIViewRepresentable {
    let design: AvatarRingDesign
    let plan: FrameMotionPlan

    func makeUIView(context: Context) -> AvatarRingLayerView {
        AvatarRingLayerView()
    }

    func updateUIView(_ view: AvatarRingLayerView, context: Context) {
        view.configure(design: design, plan: plan)
    }
}

/// Les chemins animés d'un contour, en couches : seule la composition bouge, jamais le `Canvas`.
final class AvatarRingLayerView: UIView {
    let motion = FrameMotionHostView()
    private var design: AvatarRingDesign?
    private var plan: FrameMotionPlan = .still
    private var renderedSize: CGSize = .zero
    private var renderedDesign: AvatarRingDesign?

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        accessibilityElementsHidden = true
        backgroundColor = .clear
        addSubview(motion)
    }

    required init?(coder: NSCoder) { nil }

    nonisolated deinit {}

    func configure(design: AvatarRingDesign, plan: FrameMotionPlan) {
        self.design = design
        self.plan = plan
        render()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        motion.frame = bounds
        render()
    }

    private func render() {
        guard let design, bounds.width > 0, bounds.height > 0 else { return }
        guard bounds.size != renderedSize || design != renderedDesign else { return }
        renderedSize = bounds.size
        renderedDesign = design
        motion.show(AvatarRingLayerView.content(design, plan: plan, size: bounds.size))
    }

    /// Les couches du plan dans une boîte `size` : le viewBox 0 0 100 100 centré, à l'échelle du plus petit côté.
    static func content(_ design: AvatarRingDesign, plan: FrameMotionPlan, size: CGSize) -> FrameMotionContent {
        let scale = min(size.width, size.height) / 100
        let side = 100 * scale
        let root = CALayer()
        root.frame = CGRect(x: (size.width - side) / 2, y: (size.height - side) / 2, width: side, height: side)
        let box = CGSize(width: side, height: side)
        var animations: [(layer: CALayer, animation: CAAnimation, delay: Double)] = []
        func shape(_ index: Int, white: Bool) -> CALayer {
            let stroke = design.ornament[index]
            var transform = CGAffineTransform(scaleX: scale, y: scale)
            let path = SVGPathData.make(stroke.d).cgPath.copy(using: &transform) ?? CGMutablePath()
            let gradient = white ? nil : stroke.gradient.flatMap { design.gradients[safe: $0] ?? nil }
            let color = white ? UIColor.white : UIColor(Color(hex: design.stroke.colors[safe: stroke.color] ?? "#000000"))
            return FrameMotionLayers.shape(path, paint: FramePaint(color: color, gradient: gradient, palette: design.stroke.colors),
                                           opacity: white ? 1 : stroke.opacity, lineWidth: stroke.width.map { $0 * scale }, evenOdd: false)
        }
        for layer in plan.layers {
            let content = CALayer()
            layer.elements.forEach { content.addSublayer(shape($0, white: false)) }
            root.addSublayer(FrameMotionLayers.wrap(content, chain: layer.chain, size: box, scale: scale, into: &animations))
        }
        for sweep in plan.sweeps {
            let targets = CALayer()
            sweep.elements.forEach { targets.addSublayer(shape($0, white: true)) }
            root.addSublayer(FrameMotionLayers.sweep(sweep, mask: targets, size: box, into: &animations))
        }
        let holder = CALayer()
        holder.frame = CGRect(origin: .zero, size: size)
        holder.addSublayer(root)
        return FrameMotionContent(root: holder, animations: animations)
    }
}
