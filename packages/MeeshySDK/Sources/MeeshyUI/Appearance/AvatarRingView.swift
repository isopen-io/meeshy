import SwiftUI
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

    public init(design: AvatarRingDesign) {
        self.design = design
    }

    nonisolated public static func == (lhs: AvatarRingView, rhs: AvatarRingView) -> Bool {
        lhs.design == rhs.design
    }

    private static let box: Double = 100
    private static let dots = 28
    private static let dashes = 36
    private static let arcs = 24

    public var body: some View {
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
            }

            for stroke in design.ornament {
                let path = SVGPathData.make(stroke.d)
                    .applying(CGAffineTransform(scaleX: scale, y: scale).concatenating(CGAffineTransform(translationX: offset.x, y: offset.y)))
                let color = Color(hex: colors[stroke.color]).opacity(stroke.opacity)
                if let lineWidth = stroke.width {
                    context.stroke(path, with: .color(color), lineWidth: lineWidth * scale)
                } else {
                    context.fill(path, with: .color(color))
                }
            }
        }
        .accessibilityHidden(true)
        .allowsHitTesting(false)
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
        func channels(_ hex: String) -> [Double] {
            let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
            return (0..<3).map { i in
                let start = digits.index(digits.startIndex, offsetBy: i * 2)
                let end = digits.index(start, offsetBy: 2)
                return Double(Int(digits[start..<end], radix: 16) ?? 0)
            }
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
                    AvatarRingView(design: design)
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
    /// contour se pose sans perte d'image quand il arrive. Immobile par défaut : une
    /// liste en porte des dizaines.
    @ViewBuilder
    func avatarRingWithin(_ design: AvatarRingDesign?, footprint: CGFloat, storyRingSize: CGFloat? = nil, animates: Bool = false) -> some View {
        if let design {
            scaleEffect(AvatarRingGeometry.footprintScale(footprint: footprint, storyRingSize: storyRingSize))
            .overlay {
                ZStack {
                    AvatarRingView(design: design)
                        .equatable()
                    if animates, let lottie = design.lottie {
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
