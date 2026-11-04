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

    /// La part de l'empreinte que l'avatar occupe sous un contour : le cercle de rayon 42
    /// du viewBox 100 (miroir de `AVATAR_FRACTION`, `avatar-ring.tsx`).
    public static let holeFraction: CGFloat = 0.84

    /// L'échelle de l'avatar quand le contour tient DANS son empreinte (#10713, listes et
    /// bulles) : l'avatar se ramène au trou du contour, et son anneau de story avec lui.
    public static func footprintScale(footprint: CGFloat, storyRingSize: CGFloat?) -> CGFloat {
        holeFraction * avatarScale(avatarSize: footprint, storyRingSize: storyRingSize)
    }
}

/// La mise en place d'un contour dans sa boîte (#15157) : l'échelle de l'avatar, le film illustré
/// s'il s'affiche, et si l'anneau fixe se dessine. Le film ne sort de la boîte que de la place que
/// l'hôte déclare libre (`AvatarRingDecor.fit`) ; quand il s'affiche, l'anneau fixe — son image de
/// repli — ne se dessine pas dessous. Il s'affiche à toutes les tailles (#16114) ; seul l'hôte qui
/// le retire (`decor: false`, la bulle de frappe) garde l'anneau seul.
public struct AvatarRingLayout: Equatable {
    public let contentScale: CGFloat
    public let decor: AvatarRingDecorFit?
    public var drawsStill: Bool { decor == nil }
    /// L'échelle de la couche `lottie` du contour : elle suit l'avatar quand le cadre se réduit.
    public var ringScale: CGFloat { CGFloat(decor?.scale ?? 1) }
    /// Le côté peint, film compris : jamais plus que la boîte et la place déclarée.
    public func paintedSide(box: CGFloat) -> CGFloat { decor.map { CGFloat($0.side) } ?? box }

    /// Ce que le film d'un cadre demande au-delà de sa boîte, de chaque côté : la place qu'un hôte
    /// RÉSERVE (et déclare en `decorRoom`) pour le montrer sans réduire l'avatar. `0` sans film.
    public static func fullSpill(_ design: AvatarRingDesign?, box: CGFloat) -> CGFloat {
        guard let decor = design?.decor else { return 0 }
        return box * CGFloat(decor.reach - 1) / 2
    }

    /// Ce qu'un avatar posé par `avatarRing` (boîte = `avatarSize / 0,84`) peint sous son bord quand
    /// l'hôte déclare toute la place : la marge à réserver avant un texte. `0` sans film.
    public static func paintBeyondAvatar(_ design: AvatarRingDesign?, avatarSize: CGFloat) -> CGFloat {
        let box = avatarSize * 100 / 84
        let spill = fullSpill(design, box: box)
        return spill > 0 ? (box + 2 * spill - avatarSize) / 2 : 0
    }

    public static func make(_ design: AvatarRingDesign, box: CGFloat, baseScale: CGFloat, room: CGFloat = 0, decor showsDecor: Bool = true) -> AvatarRingLayout {
        let decor = showsDecor ? design.decor?.fit(box: Double(box), room: Double(room)) : nil
        return AvatarRingLayout(contentScale: baseScale * CGFloat(decor?.scale ?? 1), decor: decor)
    }
}

public extension View {
    /// Pose le contour AUTOUR de l'avatar sans changer sa mise en page : le contour est une superposition
    /// agrandie (l'avatar occupe le rayon 42 du viewBox 100). `nil` ⇒ la vue telle quelle (rendu historique).
    /// `storyRingSize` (l'emprise de l'anneau de story quand l'avatar en porte un) réduit l'avatar pour que
    /// l'anneau passe DANS le contour, concentrique, au lieu d'être recouvert (#10714). `decorRoom` : la place
    /// libre (pt) que l'hôte garantit autour de la boîte du contour — aucun texte ni avatar voisin n'y vit (#15157).
    @ViewBuilder
    func avatarRing(_ design: AvatarRingDesign?, avatarSize: CGFloat, storyRingSize: CGFloat? = nil, animates: Bool = true, decorRoom: CGFloat = 0) -> some View {
        if let design {
            let box = avatarSize * 100 / 84
            let layout = AvatarRingLayout.make(design, box: box, baseScale: AvatarRingGeometry.avatarScale(avatarSize: avatarSize, storyRingSize: storyRingSize), room: decorRoom)
            modifier(AvatarRingFrameModifier(design: design, box: box, layout: layout, animates: animates))
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
    func avatarRingWithin(_ design: AvatarRingDesign?, footprint: CGFloat, storyRingSize: CGFloat? = nil, animates: Bool = true, decorRoom: CGFloat = 0, decor: Bool = true) -> some View {
        if let design {
            let layout = AvatarRingLayout.make(design, box: footprint, baseScale: AvatarRingGeometry.footprintScale(footprint: footprint, storyRingSize: storyRingSize), room: decorRoom, decor: decor)
            modifier(AvatarRingFrameModifier(design: design, box: footprint, layout: layout, animates: animates))
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
