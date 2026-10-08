import SwiftUI
import MeeshySDK

// MARK: - Les blasons des rangs (#9380, décorations #9636)
//
// Un écu par rang ; la matière monte avec lui (cuivre → prisme). À partir
// d'Ambassadeur, Mee et Meo tiennent l'écu ; à Légende ils sont couronnés ; à
// Mythe, auréolés.
//
// Toute la GÉOMÉTRIE ajoutée par #9636 est la table PARTAGÉE avec le web
// (`GameRankCrest`, miroir de `packages/shared/utils/game/rank-crest.ts`), peinte
// ici forme pour forme comme `apps/web/src/components/game/rank-blason.tsx` :
//   · la décoration propre à chaque rang, à la Signature, DERRIÈRE l'écu ;
//   · le NIVEAU gravé dans la pointe de l'écu ;
//   · la DIVISION en cinq encoches sous la pointe (V = 1 … I = 5, les vides en creux) ;
//   · pour le Mythe, la Signature unique de son ÉMISSION en halo prismatique,
//     son numéro gravé sous l'écu.
// Sous 60 pt, le blason se recadre sur l'écu et sa décoration : tenants, ruban
// et chiffres gravés se taisent, illisibles à cette taille.
//
// Le NOM du rang est un texte localisé : c'est l'hôte qui le donne (ruban).

public struct RankBlasonView: View {

    private let rank: GloryRank
    private let division: GloryDivision5?
    private let level: Int?
    private let mythic: MythicSeatRef?
    private let title: String?
    private let figures: GameFigures?
    private let accessibilityLabel: String?

    /// - Parameters:
    ///   - rank: le rang, qui fixe la matière, la décoration et les tenants.
    ///   - division5: V (5) à I (1) — les encoches sous l'écu ; `nil` pour Mythe (ou rien à montrer).
    ///   - level: le niveau du joueur, gravé dans la pointe ; `nil` : rien n'est gravé.
    ///   - mythic: la place servie du Mythe — son émission dessine la Signature unique.
    ///   - title: le nom localisé du rang, écrit sur le ruban (Ambassadeur et au-delà).
    ///   - figures: les films de Mee et de Meo qui tiennent l'écu — `nil` pour un écu sans tenants.
    ///   - accessibilityLabel: `nil` ⇒ décoratif ; l'hôte dit « Voix IV, niveau 34 ».
    public init(rank: GloryRank, division5: GloryDivision5?, level: Int? = nil, mythic: MythicSeatRef? = nil,
                title: String? = nil, figures: GameFigures? = .standard, accessibilityLabel: String? = nil) {
        self.rank = rank
        self.division = rank == .mythe ? nil : division5
        self.level = level
        self.mythic = rank == .mythe ? mythic : nil
        self.title = title
        self.figures = figures
        self.accessibilityLabel = accessibilityLabel
    }

    /// Un hôte qui ne connaît que la division HÉRITÉE (III, II, I) : elle se relit telle quelle.
    public init(rank: GloryRank, division: GloryDivision? = nil, title: String? = nil,
                figures: GameFigures? = .standard, accessibilityLabel: String? = nil) {
        self.init(rank: rank, division5: division.map(GloryDivision5.init(legacy:)), title: title,
                  figures: figures, accessibilityLabel: accessibilityLabel)
    }

    private static let viewBox = CGSize(width: GameRankCrest.frame.width, height: GameRankCrest.frame.height)
    private static let shieldPath = GameSVGPath.make("M14 10 h72 v38 c0 24 -16 37 -36 45 c-20 -8 -36 -21 -36 -45 z")
    private static let rimPath = GameSVGPath.make("M21 16 h58 v32 c0 19 -12 30 -29 37 c-17 -7 -29 -18 -29 -37 z")
    private static let chiefPath = GameSVGPath.make("M14 10 h72 v15 h-72z")
    private static let ribbonPath = GameSVGPath.make("M52 140 h96 l-7 8 7 8 h-96 l7 -8z")
    private static let accent = MeeshyColors.indigo600
    /// Le liseré des pièces (`--game-edge` du web : indigo 950).
    private static let edge = MeeshyColors.indigo950

    private var index: Int { rank.index }
    private var hasTenants: Bool { index >= 6 }
    private var material: GameMaterial { rank.material }

    public var body: some View {
        GeometryReader { proxy in
            let compact = proxy.size.width < GameRankCrest.compactBelow
            ZStack {
                Canvas { context, size in
                    let frame = compact
                        ? (rank == .mythe ? GameRankCrest.compactMythicFrame : GameRankCrest.compactFrame)
                        : GameRankCrest.fullFrame
                    let k = size.width / frame.width
                    context.scaleBy(x: k, y: k)
                    context.translateBy(x: -frame.x, y: -frame.y)
                    if rank == .mythe { drawMythicHalo(compact: compact, in: &context) }
                    for piece in GameRankCrest.pieces(for: rank) { draw(piece, in: &context) }
                    drawShield(in: &context)
                    if let level, !compact { drawLevel(level, in: &context) }
                    if hasTenants, !compact { drawRibbon(in: &context) }
                    drawNotches(in: &context)
                }
                if hasTenants, !compact, let figures {
                    GameTenantsLayer(
                        figures: figures, viewBox: Self.viewBox,
                        mee: .init(center: CGPoint(x: 31.5, y: 93.5), side: 63),
                        meo: .init(center: CGPoint(x: 168.5, y: 93.5), side: 63)
                    )
                    // Au-dessus des figures : la couronne ou l'auréole se pose sur leur tête.
                    Canvas { context, size in
                        let k = size.width / Self.viewBox.width
                        context.scaleBy(x: k, y: k)
                        drawTenantAdornments(in: &context)
                    }
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
        local.fill(Self.shieldPath, with: material.shading(in: Self.shieldPath.boundingRect))
        local.stroke(Self.shieldPath, with: .color(Self.edge.opacity(0.35)), lineWidth: 2)
        if index >= 1 {
            local.stroke(Self.rimPath, with: .color(.white.opacity(0.5)), lineWidth: 2)
        }
        if index >= 3 {
            local.fill(Self.chiefPath, with: .color(Self.edge.opacity(0.16)))
        }
        GameSignature.draw(in: &local, center: CGPoint(x: 50, y: 55), side: 60, color: material.ink,
                           style: .engraved, strokeWidth: 96)
    }

    // MARK: La décoration du rang (table partagée)

    private func strokeColor(_ tone: CrestTone) -> Color {
        switch tone {
        case .gold: GameMaterial.gold.lineColor
        case .ink: material.ink
        case .metal: material.lineColor
        }
    }

    private func fill(_ tone: CrestTone, in box: CGRect) -> GraphicsContext.Shading {
        switch tone {
        case .gold: GameMaterial.gold.shading(in: box)
        case .ink: .color(material.ink)
        case .metal: material.shading(in: box)
        }
    }

    private func draw(_ piece: CrestPiece, in context: inout GraphicsContext) {
        switch piece {
        case let .line(x1, y1, x2, y2, width, tone):
            var path = Path()
            path.move(to: CGPoint(x: x1, y: y1))
            path.addLine(to: CGPoint(x: x2, y: y2))
            context.stroke(path, with: .color(strokeColor(tone)), style: StrokeStyle(lineWidth: width, lineCap: .round))
        case let .arc(cx, cy, r, from, to, width, tone):
            context.stroke(Self.arcPath(cx: cx, cy: cy, r: r, from: from, to: to), with: .color(strokeColor(tone)),
                           style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
        case let .curve(x, y, segments, width, tone):
            var path = Path()
            path.move(to: CGPoint(x: x, y: y))
            for s in segments {
                path.addCurve(to: CGPoint(x: s.x, y: s.y), control1: CGPoint(x: s.c1x, y: s.c1y), control2: CGPoint(x: s.c2x, y: s.c2y))
            }
            context.stroke(path, with: .color(strokeColor(tone)), style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
        case let .leaf(x1, y1, x2, y2, bulge, tone):
            let path = Self.leafPath(x1: x1, y1: y1, x2: x2, y2: y2, bulge: bulge)
            context.fill(path, with: fill(tone, in: path.boundingRect))
            context.stroke(path, with: .color(Self.edge.opacity(0.25)), lineWidth: 0.6)
        case let .dot(cx, cy, r, tone):
            let path = Path(ellipseIn: CGRect(x: cx - r, y: cy - r, width: 2 * r, height: 2 * r))
            context.fill(path, with: fill(tone, in: path.boundingRect))
            context.stroke(path, with: .color(Self.edge.opacity(0.25)), lineWidth: 0.6)
        }
    }

    /// Un arc tracé dans le sens horaire de `from` à `to` (degrés depuis midi), échantillonné —
    /// aucune ambiguïté de sens de `addArc` dans un repère à y descendant.
    static func arcPath(cx: Double, cy: Double, r: Double, from: Double, to: Double) -> Path {
        let steps = 48
        var path = Path()
        for step in 0...steps {
            let degrees = from + (to - from) * Double(step) / Double(steps)
            let radians = degrees * .pi / 180
            let point = CGPoint(x: cx + r * sin(radians), y: cy - r * cos(radians))
            if step == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        return path
    }

    /// Une feuille pleine : deux Bézier quadratiques dont le contrôle s'écarte de 2 × `bulge` du milieu.
    static func leafPath(x1: Double, y1: Double, x2: Double, y2: Double, bulge: Double) -> Path {
        let length = max(hypot(x2 - x1, y2 - y1), .ulpOfOne)
        let nx = (-(y2 - y1) / length) * bulge * 2
        let ny = ((x2 - x1) / length) * bulge * 2
        let mx = (x1 + x2) / 2
        let my = (y1 + y2) / 2
        var path = Path()
        path.move(to: CGPoint(x: x1, y: y1))
        path.addQuadCurve(to: CGPoint(x: x2, y: y2), control: CGPoint(x: mx + nx, y: my + ny))
        path.addQuadCurve(to: CGPoint(x: x1, y: y1), control: CGPoint(x: mx - nx, y: my - ny))
        path.closeSubpath()
        return path
    }

    // MARK: Le niveau gravé, le ruban, les encoches

    /// Un texte posé par le centre de sa LIGNE DE BASE, comme `text-anchor="middle"` + `y` en SVG.
    private static func drawOnBaseline(_ text: Text, at point: CGPoint, in context: inout GraphicsContext) {
        let resolved = context.resolve(text)
        let size = resolved.measure(in: CGSize(width: 1000, height: 1000))
        let baseline = resolved.firstBaseline(in: size)
        context.draw(resolved, in: CGRect(x: point.x - size.width / 2, y: point.y - baseline, width: size.width, height: size.height))
    }

    private func drawLevel(_ level: Int, in context: inout GraphicsContext) {
        let spot = GameRankCrest.levelEngraving
        let digits = String(level)
        let font = Font.system(size: GameRankCrest.levelEngravingSize(forLevel: level), weight: .heavy)
        Self.drawOnBaseline(Text(digits).font(font).foregroundColor(.white.opacity(0.35)),
                            at: CGPoint(x: spot.x + 0.6, y: spot.y + 0.8), in: &context)
        Self.drawOnBaseline(Text(digits).font(font).foregroundColor(material.ink.opacity(0.85)),
                            at: CGPoint(x: spot.x, y: spot.y), in: &context)
    }

    private func drawRibbon(in context: inout GraphicsContext) {
        context.fill(Self.ribbonPath, with: .color(Self.accent))
        guard let title, !title.isEmpty else { return }
        Self.drawOnBaseline(
            Text(title.uppercased()).font(.system(size: 8.5, weight: .medium, design: .monospaced)).kerning(1.4)
                .foregroundColor(.white),
            at: CGPoint(x: 100, y: 151.5), in: &context
        )
    }

    private func drawNotches(in context: inout GraphicsContext) {
        for notch in GameRankCrest.notches(division) {
            var path = Path()
            path.move(to: CGPoint(x: notch.x, y: notch.y1))
            path.addLine(to: CGPoint(x: notch.x, y: notch.y2))
            context.stroke(path, with: .color(notch.on ? Self.accent : Color.primary.opacity(0.14)),
                           style: StrokeStyle(lineWidth: notch.width, lineCap: .round))
        }
    }

    // MARK: Le halo du Mythe

    /// La couleur d'un rayon : la roue du prisme depuis la teinte de l'émission, ou les jetons du prisme sans émission.
    static func rayColor(hue: Int?, index k: Int, count: Int) -> Color {
        guard let hue else {
            let colors = GameMaterial.prismColors
            return colors[k % colors.count]
        }
        let degrees = (Double(hue) + 360 * Double(k) / Double(max(1, count))).rounded()
        return hsl(hue: degrees.truncatingRemainder(dividingBy: 360), saturation: 0.8, lightness: 0.56)
    }

    /// `hsl(h s l)` du web, converti en RGB.
    static func hsl(hue: Double, saturation: Double, lightness: Double) -> Color {
        let c = (1 - abs(2 * lightness - 1)) * saturation
        let h = hue / 60
        let x = c * (1 - abs(h.truncatingRemainder(dividingBy: 2) - 1))
        let (r, g, b): (Double, Double, Double) = switch h {
        case ..<1: (c, x, 0)
        case ..<2: (x, c, 0)
        case ..<3: (0, c, x)
        case ..<4: (0, x, c)
        case ..<5: (x, 0, c)
        default: (c, 0, x)
        }
        let m = lightness - c / 2
        return Color(red: r + m, green: g + m, blue: b + m)
    }

    private func drawMythicHalo(compact: Bool, in context: inout GraphicsContext) {
        let halo = GameRankCrest.mythicHalo(edition: mythic?.edition)
        for (k, ray) in halo.rays.enumerated() {
            var path = Path()
            path.move(to: CGPoint(x: ray.x1, y: ray.y1))
            path.addLine(to: CGPoint(x: ray.x2, y: ray.y2))
            context.stroke(path, with: .color(Self.rayColor(hue: halo.hue, index: k, count: halo.rays.count)),
                           style: StrokeStyle(lineWidth: halo.rayWidth, lineCap: .round))
        }
        for (k, bead) in halo.beads.enumerated() {
            let path = Path(ellipseIn: CGRect(x: bead.cx - bead.r, y: bead.cy - bead.r, width: 2 * bead.r, height: 2 * bead.r))
            context.fill(path, with: .color(Self.rayColor(hue: halo.hue, index: k * 3, count: halo.rays.count)))
        }
        if let gem = halo.gem, let first = gem.first {
            var path = Path()
            path.move(to: CGPoint(x: first.x, y: first.y))
            for vertex in gem.dropFirst() { path.addLine(to: CGPoint(x: vertex.x, y: vertex.y)) }
            path.closeSubpath()
            context.fill(path, with: GameMaterial.gold.shading(in: path.boundingRect))
            context.stroke(path, with: .color(Self.edge.opacity(0.4)), style: StrokeStyle(lineWidth: 0.8, lineJoin: .round))
        }
        if let numeral = halo.numeral, !compact {
            Self.drawOnBaseline(Text(numeral.text).font(.system(size: numeral.size, weight: .heavy)).foregroundColor(.primary),
                                at: CGPoint(x: numeral.x, y: numeral.y), in: &context)
        }
    }

    // MARK: Géométrie partagée

    /// Une étoile à cinq branches : dix sommets, un sur deux rentré à 45 % (les étoiles de Prestige de l'anneau).
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
}
