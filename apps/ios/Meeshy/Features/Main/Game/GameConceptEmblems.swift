import SwiftUI
import MeeshyUI

// MARK: - Les emblèmes de Points, d'Élans et du Tableau de bord (#9564, amendement n° 2)
//
// MIROIR de `apps/web/src/lib/game/concept-emblems.ts` (#9563), forme pour forme, dans le même carré de 72 : le
// niveau a son anneau, la Gloire son blason, la Meesh sa pièce ; ces trois-là portaient une Signature dans une
// pastille teintée, trois fois la même. Chaque emblème est UNE matière du jeu, la Signature gravée dedans, et un
// accent qui dit le concept :
//
//   · Points          — un jeton rond indigo ; une étincelle d'or à quatre branches, en haut à droite : un geste
//                       vient de rapporter ;
//   · Élans           — un carré arrondi couleur de flamme ; un chevron qui monte au-dessus de la Signature : ce
//                       qui pousse plus haut ;
//   · Tableau de bord — un panneau d'argent ; la Signature à gauche comme trois lignes de lecture, trois barres
//                       qui grandissent à droite.
//
// DÉCORATIF : l'hôte dit le nom du concept.

/// La géométrie d'un emblème, dans le carré de 72 du partagé. Une table, pas du dessin : la vue la parcourt.
struct ConceptEmblemDesign: Equatable {
    enum Kind: String, CaseIterable, Equatable {
        case points
        case elans
        case dashboard
    }

    enum Paint: Equatable {
        case indigo
        case flame
        case silver
    }

    enum Body: Equatable {
        case circle(center: CGPoint, radius: CGFloat)
        case rect(CGRect, radius: CGFloat)

        var frame: CGRect {
            switch self {
            case .circle(let center, let radius): CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)
            case .rect(let rect, _): rect
            }
        }
    }

    enum Accent: Equatable {
        /// Une forme pleine, donnée par ses sommets — peinte à l'or.
        case spark([CGPoint])
        /// Un trait à bouts ronds — à l'encre de la matière.
        case chevron([CGPoint], lineWidth: CGFloat)
        /// Un rectangle arrondi plein — à l'indigo de la marque.
        case bar(CGRect, radius: CGFloat)
    }

    struct Signature: Equatable {
        let center: CGPoint
        let size: CGFloat
        let strokeWidth: CGFloat
    }

    static let box: CGFloat = 72

    let paint: Paint
    let body: Body
    let signature: Signature
    let accents: [Accent]

    static func of(_ kind: Kind) -> ConceptEmblemDesign {
        switch kind {
        case .points:
            ConceptEmblemDesign(
                paint: .indigo,
                body: .circle(center: CGPoint(x: 34, y: 38), radius: 28),
                signature: Signature(center: CGPoint(x: 34, y: 38), size: 38, strokeWidth: 100),
                accents: [.spark([
                    CGPoint(x: 56, y: 4), CGPoint(x: 59, y: 13), CGPoint(x: 68, y: 16), CGPoint(x: 59, y: 19),
                    CGPoint(x: 56, y: 28), CGPoint(x: 53, y: 19), CGPoint(x: 44, y: 16), CGPoint(x: 53, y: 13),
                ])]
            )
        case .elans:
            ConceptEmblemDesign(
                paint: .flame,
                body: .rect(CGRect(x: 8, y: 8, width: 56, height: 56), radius: 18),
                signature: Signature(center: CGPoint(x: 36, y: 47), size: 32, strokeWidth: 104),
                accents: [.chevron([CGPoint(x: 23, y: 30), CGPoint(x: 36, y: 17), CGPoint(x: 49, y: 30)], lineWidth: 6)]
            )
        case .dashboard:
            ConceptEmblemDesign(
                paint: .silver,
                body: .rect(CGRect(x: 6, y: 12, width: 60, height: 48), radius: 12),
                signature: Signature(center: CGPoint(x: 26, y: 36), size: 30, strokeWidth: 104),
                accents: [
                    .bar(CGRect(x: 41, y: 38, width: 5, height: 12), radius: 2.5),
                    .bar(CGRect(x: 48.5, y: 30, width: 5, height: 20), radius: 2.5),
                    .bar(CGRect(x: 56, y: 22, width: 5, height: 28), radius: 2.5),
                ]
            )
        }
    }
}

/// L'emblème DESSINÉ d'un concept sans objet : Points, Élans, Tableau de bord.
struct ConceptMarkView: View {
    let kind: ConceptEmblemDesign.Kind

    private var design: ConceptEmblemDesign { ConceptEmblemDesign.of(kind) }

    /// La peinture de la matière : l'indigo de la marque (500 → 900), le feu qui monte, l'argent.
    private var fill: LinearGradient {
        switch design.paint {
        case .indigo: LinearGradient(colors: [MeeshyColors.indigo500, MeeshyColors.indigo900], startPoint: .topLeading, endPoint: .bottomTrailing)
        case .flame: GameMaterial.flame.gradient
        case .silver: GameMaterial.silver.gradient
        }
    }

    /// L'encre gravée sur la matière : claire sur l'indigo, sombre sur le feu et l'argent.
    private var ink: Color {
        switch design.paint {
        case .indigo: .white
        case .flame: GameMaterial.flame.ink
        case .silver: GameMaterial.silver.ink
        }
    }

    var body: some View {
        GeometryReader { geo in
            let scale = min(geo.size.width, geo.size.height) / ConceptEmblemDesign.box
            ZStack(alignment: .topLeading) {
                plate(scale)
                SignatureMark(style: .engraved, color: ink, strokeWidth: design.signature.strokeWidth)
                    .frame(width: design.signature.size * scale, height: design.signature.size * scale)
                    .position(x: design.signature.center.x * scale, y: design.signature.center.y * scale)
                ForEach(Array(design.accents.enumerated()), id: \.offset) { _, accent in
                    self.accent(accent, scale)
                }
            }
            .frame(width: ConceptEmblemDesign.box * scale, height: ConceptEmblemDesign.box * scale)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityHidden(true)
    }

    /// Le corps : un jeton rond ou un panneau arrondi, peint à la matière, liseré d'un filet sombre.
    @ViewBuilder
    private func plate(_ scale: CGFloat) -> some View {
        let frame = design.body.frame
        let edge = MeeshyColors.indigo950.opacity(0.25)
        switch design.body {
        case .circle:
            Circle()
                .fill(fill)
                .overlay(Circle().stroke(edge, lineWidth: scale))
                .frame(width: frame.width * scale, height: frame.height * scale)
                .position(x: frame.midX * scale, y: frame.midY * scale)
        case .rect(_, let radius):
            RoundedRectangle(cornerRadius: radius * scale)
                .fill(fill)
                .overlay(RoundedRectangle(cornerRadius: radius * scale).stroke(edge, lineWidth: scale))
                .frame(width: frame.width * scale, height: frame.height * scale)
                .position(x: frame.midX * scale, y: frame.midY * scale)
        }
    }

    @ViewBuilder
    private func accent(_ accent: ConceptEmblemDesign.Accent, _ scale: CGFloat) -> some View {
        switch accent {
        case .spark(let points):
            let shape = Self.path(points, closed: true, scale: scale)
            shape.fill(GameMaterial.gold.gradient)
            shape.stroke(Color.white, style: StrokeStyle(lineWidth: 1.5 * scale, lineJoin: .round))
        case .chevron(let points, let lineWidth):
            Self.path(points, closed: false, scale: scale)
                .stroke(ink, style: StrokeStyle(lineWidth: lineWidth * scale, lineCap: .round, lineJoin: .round))
        case .bar(let rect, let radius):
            RoundedRectangle(cornerRadius: radius * scale)
                .fill(MeeshyColors.indigo600)
                .frame(width: rect.width * scale, height: rect.height * scale)
                .position(x: rect.midX * scale, y: rect.midY * scale)
        }
    }

    private static func path(_ points: [CGPoint], closed: Bool, scale: CGFloat) -> Path {
        Path { path in
            guard let first = points.first else { return }
            path.move(to: CGPoint(x: first.x * scale, y: first.y * scale))
            for point in points.dropFirst() {
                path.addLine(to: CGPoint(x: point.x * scale, y: point.y * scale))
            }
            if closed { path.closeSubpath() }
        }
    }
}
