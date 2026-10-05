import SwiftUI
import MeeshySDK

// MARK: - Les blasons des rangs (#9380)
//
// MIROIR de `blason()` de `docs/product/jeu-meeshy-conception.html` (§ IV.3).
// Un écu par rang ; la matière et les pièces héraldiques montent avec lui :
//
//   Murmure, Écho      cuivre                       (Écho : liseré intérieur)
//   Voix, Conteur      bronze                       (Conteur : chef assombri)
//   Passeur            argent, deux étoiles
//   Polyglotte         argent, trois points
//   Ambassadeur        or — Mee et Meo tiennent l'écu, un ruban porte le nom
//   Orateur            or, lauriers
//   Oracle             platine, l'étoile au cimier
//   Légende            obsidienne, couronne au cimier, tenants couronnés
//   Mythe              prisme, tenants auréolés — les 100 premières Légendes
//
// La division s'affiche en chevrons sous l'écu (III : trois, I : un) ; Mythe n'en
// a pas. Le NOM du rang est un texte localisé : c'est l'hôte qui le donne, pour le
// ruban (à partir d'Ambassadeur).

public struct RankBlasonView: View {

    private let rank: GloryRank
    private let division: GloryDivision?
    private let title: String?
    private let figures: GameFigures?
    private let accessibilityLabel: String?

    /// - Parameters:
    ///   - rank: le rang, qui fixe la matière, les pièces héraldiques et les tenants.
    ///   - division: III, II ou I — les chevrons sous l'écu ; `nil` pour Mythe.
    ///   - title: le nom localisé du rang, écrit sur le ruban (Ambassadeur et au-delà).
    ///   - figures: les films de Mee et de Meo qui tiennent l'écu — `nil` pour un
    ///     écu sans tenants (miniature de liste).
    ///   - accessibilityLabel: `nil` ⇒ décoratif ; l'hôte dit « Voix, division II ».
    public init(rank: GloryRank, division: GloryDivision? = nil, title: String? = nil,
                figures: GameFigures? = .standard, accessibilityLabel: String? = nil) {
        self.rank = rank
        self.division = division
        self.title = title
        self.figures = figures
        self.accessibilityLabel = accessibilityLabel
    }

    private static let viewBox = CGSize(width: 200, height: 184)
    private static let shieldPath = GameSVGPath.make("M14 10 h72 v38 c0 24 -16 37 -36 45 c-20 -8 -36 -21 -36 -45 z")
    private static let rimPath = GameSVGPath.make("M21 16 h58 v32 c0 19 -12 30 -29 37 c-17 -7 -29 -18 -29 -37 z")
    private static let chiefPath = GameSVGPath.make("M14 10 h72 v15 h-72z")
    private static let crestCrownPath = GameSVGPath.make("M78 26 l6 -16 8 10 8 -14 8 14 8 -10 6 16 z")
    private static let ribbonPath = GameSVGPath.make("M52 140 h96 l-7 8 7 8 h-96 l7 -8z")
    private static let laurelStems = GameSVGPath.make("M60 132 q-18 -12 -14 -40 M140 132 q18 -12 14 -40")
    private static let ribbonColor = Color(hex: "4f46e5")

    private var index: Int { rank.index }
    private var hasTenants: Bool { index >= 6 }

    public var body: some View {
        ZStack {
            Canvas { context, size in
                let k = size.width / Self.viewBox.width
                context.scaleBy(x: k, y: k)
                if index >= 7 { drawLaurel(in: &context) }
                drawCrest(in: &context)
                drawShield(in: &context)
                if hasTenants { drawRibbon(in: &context) }
                if rank != .mythe, let division { drawChevrons(division, in: &context) }
            }
            if hasTenants, let figures {
                GameTenantsLayer(
                    figures: figures, viewBox: Self.viewBox,
                    mee: .init(center: CGPoint(x: 31.5, y: 93.5), side: 63),
                    meo: .init(center: CGPoint(x: 168.5, y: 93.5), side: 63)
                )
                // Au-dessus des figures : la couronne se pose sur leur tête.
                Canvas { context, size in
                    let k = size.width / Self.viewBox.width
                    context.scaleBy(x: k, y: k)
                    drawTenantAdornments(in: &context)
                }
            }
        }
        .aspectRatio(Self.viewBox.width / Self.viewBox.height, contentMode: .fit)
        .gameAccessibility(label: accessibilityLabel)
    }

    // MARK: L'écu

    private func drawShield(in context: inout GraphicsContext) {
        var local = context
        local.translateBy(x: 50, y: 26)
        let material = rank.material
        local.fill(Self.shieldPath, with: material.shading(in: Self.shieldPath.boundingRect))
        local.stroke(Self.shieldPath, with: .color(GamePalette.ink.opacity(0.35)), lineWidth: 2)
        if index >= 1 {
            local.stroke(Self.rimPath, with: .color(.white.opacity(0.5)), lineWidth: 2)
        }
        if index >= 3 {
            local.fill(Self.chiefPath, with: .color(GamePalette.ink.opacity(0.16)))
        }
        if rank == .passeur {
            local.fill(Self.star(center: CGPoint(x: 32, y: 18), radius: 5), with: .color(.white))
            local.fill(Self.star(center: CGPoint(x: 68, y: 18), radius: 5), with: .color(.white))
        }
        if rank == .polyglotte {
            for x in [38.0, 50, 62] {
                local.fill(Path(ellipseIn: CGRect(x: x - 3, y: 15, width: 6, height: 6)), with: .color(.white))
            }
        }
        GameSignature.draw(in: &local, center: CGPoint(x: 50, y: 55), side: 60, color: material.ink,
                           style: .engraved, strokeWidth: 96)
    }

    // MARK: Cimier, lauriers, ruban, chevrons

    private func drawCrest(in context: inout GraphicsContext) {
        if rank == .oracle {
            let star = Self.star(center: CGPoint(x: 100, y: 13), radius: 11)
            context.fill(star, with: GameMaterial.platinum.shading(in: star.boundingRect))
            context.stroke(star, with: .color(GamePalette.ink.opacity(0.35)), lineWidth: 1)
        } else if index >= 9 {
            let material: GameMaterial = rank == .mythe ? .prism : .gold
            context.fill(Self.crestCrownPath, with: material.shading(in: Self.crestCrownPath.boundingRect))
            context.stroke(Self.crestCrownPath, with: .color(GamePalette.ink.opacity(0.35)), lineWidth: 1)
        }
    }

    private func drawLaurel(in context: inout GraphicsContext) {
        context.stroke(Self.laurelStems, with: .color(GamePalette.laurel),
                       style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
        for step in 0..<3 {
            let leftCenter = CGPoint(x: 50 - Double(step), y: 120 - Double(step) * 12)
            let rightCenter = CGPoint(x: 150 + Double(step), y: 120 - Double(step) * 12)
            for (center, degrees) in [(leftCenter, -50.0), (rightCenter, 50.0)] {
                var leaf = context
                leaf.translateBy(x: center.x, y: center.y)
                leaf.rotate(by: .degrees(degrees))
                leaf.fill(Path(ellipseIn: CGRect(x: -5, y: -2.6, width: 10, height: 5.2)), with: .color(GamePalette.laurel))
            }
        }
    }

    private func drawRibbon(in context: inout GraphicsContext) {
        context.fill(Self.ribbonPath, with: .color(Self.ribbonColor))
        guard let title, !title.isEmpty else { return }
        context.draw(
            Text(title.uppercased()).font(.system(size: 8.5, weight: .medium, design: .monospaced)).kerning(1.4)
                .foregroundColor(.white),
            at: CGPoint(x: 100, y: 148), anchor: .center
        )
    }

    private func drawChevrons(_ division: GloryDivision, in context: inout GraphicsContext) {
        for step in 0..<division.chevrons {
            var chevron = Path()
            chevron.move(to: CGPoint(x: 90, y: 162 + Double(step) * 6))
            chevron.addLine(to: CGPoint(x: 100, y: 167 + Double(step) * 6))
            chevron.addLine(to: CGPoint(x: 110, y: 162 + Double(step) * 6))
            context.stroke(chevron, with: .color(Self.ribbonColor),
                           style: StrokeStyle(lineWidth: 2.6, lineCap: .round, lineJoin: .round))
        }
    }

    // MARK: Couronnes et auréoles des tenants

    /// Légende couronne ses tenants, Mythe les auréole. Les figures sont des
    /// stickers fixes : la couronne ou l'auréole se POSE au-dessus de leur tête.
    private func drawTenantAdornments(in context: inout GraphicsContext) {
        guard index >= 9 else { return }
        for center in [CGPoint(x: 31.5, y: 93.5), CGPoint(x: 168.5, y: 93.5)] {
            let head = CGPoint(x: center.x, y: center.y - 63 * 0.27)
            if rank == .mythe {
                GameHeraldry.drawHalo(in: &context, head: head)
            } else {
                GameHeraldry.drawCrown(in: &context, head: head)
            }
        }
    }

    // MARK: Géométrie

    /// Une étoile à cinq branches : dix sommets, un sur deux rentré à 45 %.
    static func star(center: CGPoint, radius: CGFloat) -> Path {
        var path = Path()
        for step in 0..<10 {
            let angle = CGFloat(step) * .pi / 5 - .pi / 2
            let r = step % 2 == 1 ? radius * 0.45 : radius
            let point = CGPoint(x: center.x + r * cos(angle), y: center.y + r * sin(angle))
            if step == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        path.closeSubpath()
        return path
    }
}
