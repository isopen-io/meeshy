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

    /// Le contour fixe : LE dessin de `AvatarRingRenderer`, celui que grave aussi l'export d'une story.
    private func still(skipping: Set<Int>) -> some View {
        Canvas { context, size in
            context.withCGContext { cg in
                AvatarRingRenderer.drawStill(design, in: CGRect(origin: .zero, size: size), skipping: skipping, context: cg)
            }
        }
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

    /// La part de la boîte d'un contour que l'avatar occupe : le cercle de rayon 42
    /// du viewBox 100 (miroir de `AVATAR_FRACTION`, `avatar-ring.tsx`).
    public static let holeFraction: CGFloat = 0.84

    /// LA taille d'un avatar décoré (#19988) : quel que soit le cadre — contour simple ou film illustré —,
    /// il peint dans un carré de `d / 0,84`, centré sur l'avatar de diamètre `d`. Un cadre illustré ne
    /// grossit donc plus avec sa portée : c'est le visage qui se ramène à son trou.
    public static func decoratedSide(avatarSize: CGFloat) -> CGFloat {
        avatarSize / holeFraction
    }

    /// Ce qu'un avatar décoré peint au-delà de son diamètre, de chaque côté : la marge que l'hôte laisse
    /// libre, sans clip ni voisin. La même fraction pour tous les cadres ; `0` sans cadre.
    public static func spill(_ design: AvatarRingDesign?, avatarSize: CGFloat) -> CGFloat {
        guard design != nil else { return 0 }
        return (decoratedSide(avatarSize: avatarSize) - avatarSize) / 2
    }
}

/// La mise en place d'un cadre autour d'un avatar (#19988) : la boîte normalisée
/// (`AvatarRingGeometry.decoratedSide`), l'échelle du visage, le film illustré s'il s'affiche, et si
/// l'anneau fixe se dessine. Le film tient dans la boîte — jamais au-delà, à aucune taille — et, quand il
/// s'affiche, l'anneau fixe (son image de repli) ne se dessine pas dessous. Seul l'hôte qui le retire
/// (`decor: false`, la bulle de frappe, #16114) garde l'anneau seul.
public struct AvatarRingLayout: Equatable {
    public let box: CGFloat
    public let contentScale: CGFloat
    public let decor: AvatarRingDecorFit?
    public var drawsStill: Bool { decor == nil }
    /// L'échelle de la couche `lottie` du contour : elle suit le visage quand un film le réduit.
    public var ringScale: CGFloat { CGFloat(decor?.scale ?? 1) }
    /// Le côté peint, film compris : la boîte normalisée.
    public var paintedSide: CGFloat { decor.map { CGFloat($0.side) } ?? box }

    public static func make(_ design: AvatarRingDesign, avatarSize: CGFloat, storyRingSize: CGFloat? = nil,
                            decor showsDecor: Bool = true) -> AvatarRingLayout {
        let box = AvatarRingGeometry.decoratedSide(avatarSize: avatarSize)
        let decor = showsDecor ? design.decor?.fit(box: Double(box)) : nil
        let baseScale = AvatarRingGeometry.avatarScale(avatarSize: avatarSize, storyRingSize: storyRingSize)
        return AvatarRingLayout(box: box, contentScale: baseScale * CGFloat(decor?.scale ?? 1), decor: decor)
    }
}

public extension View {
    /// Pose le cadre AUTOUR de l'avatar sans changer sa mise en page (#19988) : une superposition de côté
    /// `avatarSize / 0,84`, la même pour tous les cadres et à toutes les tailles. `storyRingSize` (l'emprise de
    /// l'anneau de story quand l'avatar en porte un) le ramène dans le trou du cadre, concentrique (#10714).
    /// `decor: false` retire les films illustrés (la bulle de frappe, #16114). `nil` ⇒ la vue telle quelle.
    @ViewBuilder
    func avatarRing(_ design: AvatarRingDesign?, avatarSize: CGFloat, storyRingSize: CGFloat? = nil,
                    animates: Bool = true, decor: Bool = true) -> some View {
        if let design {
            let layout = AvatarRingLayout.make(design, avatarSize: avatarSize, storyRingSize: storyRingSize, decor: decor)
            modifier(AvatarRingFrameModifier(design: design, box: layout.box, layout: layout, animates: animates))
        } else {
            self
        }
    }
}

private struct AvatarRingFrameModifier: ViewModifier {
    let design: AvatarRingDesign
    let box: CGFloat
    let layout: AvatarRingLayout
    let animates: Bool

    func body(content: Content) -> some View {
        content
            .scaleEffect(layout.contentScale)
            .background { AvatarRingDecorFilm(film: design.decor?.back, fit: layout.decor, animates: animates) }
            .overlay {
                ZStack {
                    if layout.drawsStill {
                        AvatarRingView(design: design, animates: animates)
                            .equatable()
                    }
                    if let lottie = design.lottie {
                        PackLottieLayer(ref: lottie, animates: animates)
                            .scaleEffect(layout.ringScale)
                    }
                }
                .frame(width: box, height: box)
            }
            .overlay { AvatarRingDecorFilm(film: design.decor?.front, fit: layout.decor, animates: animates) }
    }
}

// MARK: - Les calques illustrés d'un cadre (#13960)

/// Un film d'un cadre illustré : `back` posé en arrière-plan de l'avatar, `front` au-dessus,
/// carré, centré, du côté que `AvatarRingDecor.fit` lui donne (#15157) — il ne sort de la boîte que
/// de la place déclarée libre (une superposition SwiftUI ne compte pas dans la mise en page).
/// Sans film ou sans place, aucune vue.
struct AvatarRingDecorFilm: View {
    let film: PackAssetRef?
    let fit: AvatarRingDecorFit?
    let animates: Bool

    var body: some View {
        if let film, let fit {
            PackLottieLayer(ref: film, animates: animates)
                .frame(width: CGFloat(fit.side), height: CGFloat(fit.side))
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
