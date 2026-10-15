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

public extension View {
    /// Pose le contour AUTOUR de l'avatar sans changer sa mise en page : le contour est une superposition
    /// agrandie (l'avatar occupe le rayon 42 du viewBox 100). `nil` ⇒ la vue telle quelle (rendu historique).
    @ViewBuilder
    func avatarRing(_ design: AvatarRingDesign?, avatarSize: CGFloat) -> some View {
        if let design {
            overlay {
                AvatarRingView(design: design)
                    .frame(width: avatarSize * 100 / 84, height: avatarSize * 100 / 84)
                    .equatable()
            }
        } else {
            self
        }
    }
}
