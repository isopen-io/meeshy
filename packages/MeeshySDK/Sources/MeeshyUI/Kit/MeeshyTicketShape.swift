import SwiftUI

/// **La forme du billet (K30)** : un rectangle arrondi moins deux demi-disques
/// centrés sur la coupe, aux bords gauche et droit. Un seul tracé : fond, bord et
/// zone de toucher en sortent, et le fond de l'hôte passe au travers des encoches.
public struct MeeshyTicketShape: Shape {
    public var cut: CGFloat
    public var notch: CGFloat
    public var radius: CGFloat

    public init(cut: CGFloat, notch: CGFloat = CGFloat(MeeshyTicketRecipe.notchDiameter),
                radius: CGFloat = CGFloat(MeeshyTicketRecipe.cornerRadius)) {
        self.cut = cut
        self.notch = notch
        self.radius = radius
    }

    public var animatableData: CGFloat {
        get { cut }
        set { cut = newValue }
    }

    /// Les centres des deux encoches : sur les bords, à la hauteur de la coupe.
    public static func notchCenters(width: Double, height: Double, cut: Double) -> (leading: CGPoint, trailing: CGPoint) {
        (CGPoint(x: 0, y: cut), CGPoint(x: width, y: cut))
    }

    public func path(in rect: CGRect) -> Path {
        let corner = min(radius, rect.width / 2, rect.height / 2)
        let notchRadius = notch / 2
        let hasNotches = cut - notchRadius > corner && cut + notchRadius < rect.height - corner
        var path = Path()
        path.move(to: CGPoint(x: rect.minX + corner, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - corner, y: rect.minY))
        path.addArc(center: CGPoint(x: rect.maxX - corner, y: rect.minY + corner), radius: corner,
                    startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
        if hasNotches {
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + cut - notchRadius))
            path.addArc(center: CGPoint(x: rect.maxX, y: rect.minY + cut), radius: notchRadius,
                        startAngle: .degrees(-90), endAngle: .degrees(90), clockwise: true)
        }
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - corner))
        path.addArc(center: CGPoint(x: rect.maxX - corner, y: rect.maxY - corner), radius: corner,
                    startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        path.addLine(to: CGPoint(x: rect.minX + corner, y: rect.maxY))
        path.addArc(center: CGPoint(x: rect.minX + corner, y: rect.maxY - corner), radius: corner,
                    startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
        if hasNotches {
            path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + cut + notchRadius))
            path.addArc(center: CGPoint(x: rect.minX, y: rect.minY + cut), radius: notchRadius,
                        startAngle: .degrees(90), endAngle: .degrees(-90), clockwise: true)
        }
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + corner))
        path.addArc(center: CGPoint(x: rect.minX + corner, y: rect.minY + corner), radius: corner,
                    startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        path.closeSubpath()
        return path
    }
}

/// Le pointillé de coupe : un trait horizontal en tirets, marges de 16.
struct MeeshyTicketCutLine: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return path
    }
}
