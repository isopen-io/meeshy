import SwiftUI

// MARK: - Mee et Meo GRAVÉS dans le métal, et colorés (#9540)
//
// Le revers de la Meesh ne porte plus deux autocollants : Mee et Meo y sont FRAPPÉS. Le dessin garde ses COULEURS
// (l'émail dans les creux) ; le relief tient en deux traits — la lumière HAUTE (le bord supérieur accroche le reflet) et
// l'ombre BASSE (le creux retient l'ombre, plus sombre) — jamais le contour blanc épais d'un sticker découpé.
//
// Les deux figures sont celles de la conception (`meeJoy`, `meoOpen` de `docs/product/jeu-meeshy-conception.html`),
// portées trait pour trait en données — l'ordre, les chemins, les teintes — dans la boîte de 140 × 140 que le web pose
// (`GAME_BIRD_BOX`, `apps/web/src/lib/game/birds.ts`). Le relief reprend `birdEngraveFilter` du web : l'ombre décalée de
// +2,4 (opacité 0,6, encre indigo), la lumière décalée de −1,3 (blanc, 0,85), puis le dessin.
//
// La brique DESSINE : aucune animation, aucun film — un objet frappé ne bouge pas.

enum GameEngravedBirds {

    /// Le côté de la boîte d'une figure, en unités du dessin.
    static let box: CGFloat = 140

    enum Bird: Sendable {
        case meeJoy
        case meoOpen
    }

    // MARK: Le relief (miroir de `birdEngraveFilter`)

    /// L'ombre : le creux retient l'ombre, vers le BAS.
    static let shadeOffset: CGFloat = 2.4
    static let shadeOpacity: Double = 0.6
    static let shadeColor = MeeshyColors.indigo950
    /// La lumière : le bord supérieur accroche le reflet, vers le HAUT.
    static let lightOffset: CGFloat = -1.3
    static let lightOpacity: Double = 0.85
    static let lightColor = Color.white

    // MARK: Les formes

    enum Paint: Sendable {
        case solid(String)
        /// Deux arrêts, du premier au second, de `from` à `to` dans la boîte de la forme (`objectBoundingBox`).
        case linear(String, String, from: UnitPoint, to: UnitPoint)
        /// Deux arrêts, du centre vers le bord ; `center` et `radius` en fractions de la boîte de la forme.
        case radial(String, String, center: UnitPoint, radius: CGFloat)
    }

    struct Stroke: Sendable {
        let color: String
        let width: CGFloat
        var opacity: Double = 1
        var round = true
    }

    enum Geometry: Sendable {
        case circle(cx: CGFloat, cy: CGFloat, r: CGFloat)
        case ellipse(cx: CGFloat, cy: CGFloat, rx: CGFloat, ry: CGFloat, rotation: CGFloat = 0)
        case path(String)
    }

    struct Shape: Sendable {
        let geometry: Geometry
        var fill: Paint?
        var stroke: Stroke?
        var opacity: Double = 1

        /// Un reflet blanc posé DANS le corps : il ne fait pas partie de la silhouette qui porte l'ombre et la lumière.
        var isHighlight: Bool {
            guard opacity < 0.6, case let .solid(hex)? = fill else { return false }
            return hex == "ffffff"
        }
    }

    private static func solid(_ hex: String, _ geometry: Geometry, opacity: Double = 1) -> Shape {
        Shape(geometry: geometry, fill: .solid(hex), stroke: nil, opacity: opacity)
    }

    private static func line(_ d: String, _ hex: String, _ width: CGFloat, opacity: Double = 1) -> Shape {
        Shape(geometry: .path(d), fill: nil, stroke: Stroke(color: hex, width: width), opacity: opacity)
    }

    /// Un œil ouvert de Meo : la pupille, l'ombre du bas, deux reflets.
    private static func meoEye(_ x: CGFloat) -> [Shape] {
        [
            solid("1c1941", .ellipse(cx: x, cy: 74, rx: 9, ry: 10.5)),
            solid("4c4a8a", .ellipse(cx: x, cy: 79, rx: 6, ry: 4), opacity: 0.55),
            solid("ffffff", .circle(cx: x + 3, cy: 70, r: 3.8)),
            solid("ffffff", .circle(cx: x - 3, cy: 77.8, r: 1.7)),
        ]
    }

    // Ce que les deux colibris partagent : le corps, le ventre, le cœur, les joues, le bec.
    private static let beak: [Shape] = [
        Shape(geometry: .path("M65.5 85 Q60.5 91 65.5 97.5 L86.5 93 Q90.5 91.3 86.5 89.6 Z"),
              fill: .linear("fde68a", "f59e0b", from: .top, to: .bottom), stroke: Stroke(color: "b45309", width: 1.6)),
        line("M63.8 90.6 Q75 94 87 90.9", "b45309", 1.5),
        line("M68 86.8 Q75 86 81 88", "ffffff", 1.8, opacity: 0.7),
    ]

    private static let heart = "M70 117.2 C56.4 109.2 62.8 100.4 70 107.2 C77.2 100.4 83.6 109.2 70 117.2 Z"

    private static func wings(skin: String, deep: String, light: String, vein: String) -> (left: [Shape], right: [Shape]) {
        func wing(cx: CGFloat, rotation: CGFloat, vein path: String) -> [Shape] {
            [
                Shape(geometry: .ellipse(cx: cx, cy: 70, rx: 13, ry: 24, rotation: rotation),
                      fill: .linear(light, skin, from: .top, to: .bottom), stroke: Stroke(color: deep, width: 2.2, opacity: 0.55)),
                line(path, vein, 2),
            ]
        }
        return (wing(cx: 26, rotation: -34, vein: "M21 60 q2 12 7 22"), wing(cx: 114, rotation: 34, vein: "M119 60 q-2 12 -7 22"))
    }

    /// Mee, joyeuse : les yeux en arcs, la crête rose, la queue verte.
    static let meeJoy: [Shape] = {
        let wing = wings(skin: "7de8d2", deep: "0f766e", light: "e6fff7", vein: "7de8d2")
        let crest = "M66 44 C58 28 74 16 84 24 C91 30 84 40 77 35"
        var shapes = wing.left
        shapes += [
            Shape(geometry: .path("M61 112 C50 116 45 124 47 131 C53 130 57 126 60 122 C62 128 66 132 72 133 C74 125 70 117 66 112 Z"),
                  fill: .solid("0f766e"), stroke: Stroke(color: "0f766e", width: 1.8)),
            line(crest, "0f766e", 9.5),
            line(crest, "f43f5e", 6),
            solid("ffffff", .circle(cx: 72, cy: 24, r: 1.6), opacity: 0.75),
            Shape(geometry: .circle(cx: 70, cy: 80, r: 40),
                  fill: .radial("7ff0c8", "14b8a6", center: UnitPoint(x: 0.38, y: 0.3), radius: 0.8),
                  stroke: Stroke(color: "0f766e", width: 2.4)),
            solid("ffffff", .ellipse(cx: 55, cy: 55, rx: 13, ry: 7.5, rotation: -28), opacity: 0.38),
            solid("ffffff", .circle(cx: 76, cy: 47.5, r: 2.6), opacity: 0.55),
            solid("f0fdfa", .ellipse(cx: 70, cy: 103, rx: 26, ry: 16), opacity: 0.96),
            Shape(geometry: .path(heart), fill: .linear("fb7185", "e11d48", from: .topLeading, to: .bottomTrailing)),
            solid("ffffff", .circle(cx: 66, cy: 107, r: 1.5), opacity: 0.9),
            solid("ff7a9a", .ellipse(cx: 45, cy: 88, rx: 7.5, ry: 4.8), opacity: 0.85),
            solid("ff7a9a", .ellipse(cx: 98, cy: 86, rx: 7, ry: 4.6), opacity: 0.85),
            line("M49 76 q8 -11 16 0", "1c1941", 4.5),
            line("M75 76 q8 -11 16 0", "1c1941", 4.5),
        ]
        shapes += beak
        shapes += wing.right
        return shapes
    }()

    /// Meo, les yeux ouverts : le plumet violet, la queue ambrée, le col violet.
    static let meoOpen: [Shape] = {
        let wing = wings(skin: "86efac", deep: "065f46", light: "e3fcef", vein: "86efac")
        func plume(_ d: String) -> Shape {
            Shape(geometry: .path(d), fill: .solid("7c3aed"), stroke: Stroke(color: "6d28d9", width: 2))
        }
        var shapes = wing.left
        shapes += [
            Shape(geometry: .path("M61 112 C50 116 45 124 47 131 C53 130 57 126 60 122 C62 128 66 132 72 133 C74 125 70 117 66 112 Z"),
                  fill: .solid("d97706"), stroke: Stroke(color: "065f46", width: 1.8)),
            plume("M62 45 C58 35 48 31 38 34 C46 37 51 41 53 48 Z"),
            plume("M69 43 C68 29 58 20 45 21 C55 27 59 34 60 45 Z"),
            plume("M76 43 C77 30 70 18 60 14 C66 23 68 32 67 44 Z"),
            Shape(geometry: .circle(cx: 70, cy: 80, r: 40),
                  fill: .radial("5ee6a8", "0d9b6c", center: UnitPoint(x: 0.38, y: 0.3), radius: 0.8),
                  stroke: Stroke(color: "065f46", width: 2.4)),
            solid("ffffff", .ellipse(cx: 55, cy: 55, rx: 13, ry: 7.5, rotation: -28), opacity: 0.38),
            solid("ffffff", .circle(cx: 76, cy: 47.5, r: 2.6), opacity: 0.55),
            solid("ecfdf5", .ellipse(cx: 70, cy: 103, rx: 26, ry: 16), opacity: 0.96),
            solid("6d28d9", .path("M61 107 Q50 110 42 117 Q53 115 62 112 Z")),
            solid("6d28d9", .path("M79 107 Q90 110 98 117 Q87 115 78 112 Z")),
            Shape(geometry: .path(heart), fill: .linear("a78bfa", "6d28d9", from: .topLeading, to: .bottomTrailing)),
            solid("ffffff", .circle(cx: 66, cy: 107, r: 1.5), opacity: 0.9),
            solid("ff8fa8", .ellipse(cx: 45, cy: 88, rx: 7.5, ry: 4.8), opacity: 0.85),
            solid("ff8fa8", .ellipse(cx: 98, cy: 86, rx: 7, ry: 4.6), opacity: 0.85),
        ]
        shapes += meoEye(57)
        shapes += meoEye(83)
        shapes += beak
        shapes += wing.right
        return shapes
    }()

    static func shapes(of bird: Bird) -> [Shape] {
        switch bird {
        case .meeJoy: meeJoy
        case .meoOpen: meoOpen
        }
    }

    // MARK: Le dessin

    /// Pose la figure : `origin` est le coin haut-gauche de sa boîte dans le repère du contexte, `scale` le rapport à la
    /// boîte de 140. `flipped` retourne la figure autour de son bord gauche : posée à droite, elle regarde vers le centre.
    static func draw(_ bird: Bird, in context: inout GraphicsContext, origin: CGPoint, scale: CGFloat, flipped: Bool = false) {
        var framed = context
        framed.translateBy(x: origin.x, y: origin.y)
        framed.scaleBy(x: flipped ? -scale : scale, y: scale)
        let shapes = shapes(of: bird)
        // 1. l'ombre BASSE, 2. la lumière HAUTE — la silhouette décalée, derrière le dessin ;
        let outline = silhouette(of: shapes)
        framed.fill(outline.offsetBy(dx: 0, dy: shadeOffset), with: .color(shadeColor.opacity(shadeOpacity)))
        framed.fill(outline.offsetBy(dx: 0, dy: lightOffset), with: .color(lightColor.opacity(lightOpacity)))
        // 3. puis le dessin, dans ses couleurs.
        for shape in shapes { render(shape, in: framed) }
    }

    /// La silhouette du dessin, en UN chemin : l'union des formes pleines et des traits épaissis. Un seul remplissage —
    /// l'opacité de l'ombre ne se cumule pas là où deux formes se recouvrent.
    static func silhouette(of shapes: [Shape]) -> Path {
        var union = Path()
        for shape in shapes where !shape.isHighlight {
            let (path, turn) = outline(of: shape.geometry)
            if shape.fill != nil { union.addPath(path, transform: turn) }
            if let stroke = shape.stroke { union.addPath(path.strokedPath(style(of: stroke)), transform: turn) }
        }
        return union
    }

    private static func render(_ shape: Shape, in context: GraphicsContext) {
        var drawing = context
        drawing.opacity = shape.opacity
        let (path, turn) = outline(of: shape.geometry)
        drawing.concatenate(turn)
        if let fill = shape.fill {
            drawing.fill(path, with: shading(of: fill, in: path.boundingRect))
        }
        if let stroke = shape.stroke {
            drawing.opacity = shape.opacity * stroke.opacity
            drawing.stroke(path, with: .color(Color(hex: stroke.color)), style: style(of: stroke))
        }
    }

    /// Le chemin d'une forme dans SON repère, et la rotation qui la pose (autour de son centre, pour une ellipse :
    /// le dégradé et le tracé vivent dans le repère de la forme, comme `transform="rotate(a cx cy)"` de SVG).
    private static func outline(of geometry: Geometry) -> (Path, CGAffineTransform) {
        switch geometry {
        case let .circle(cx, cy, r):
            return (Path(ellipseIn: CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2)), .identity)
        case let .ellipse(cx, cy, rx, ry, rotation):
            let turn = CGAffineTransform(translationX: cx, y: cy)
                .rotated(by: rotation * .pi / 180)
                .translatedBy(x: -cx, y: -cy)
            return (Path(ellipseIn: CGRect(x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2)), rotation == 0 ? .identity : turn)
        case let .path(d):
            return (GameSVGPath.make(d), .identity)
        }
    }

    private static func style(of stroke: Stroke) -> StrokeStyle {
        StrokeStyle(lineWidth: stroke.width, lineCap: stroke.round ? .round : .butt, lineJoin: stroke.round ? .round : .miter)
    }

    private static func shading(of paint: Paint, in box: CGRect) -> GraphicsContext.Shading {
        switch paint {
        case let .solid(hex):
            return .color(Color(hex: hex))
        case let .linear(first, second, from, to):
            return .linearGradient(
                Gradient(colors: [Color(hex: first), Color(hex: second)]),
                startPoint: CGPoint(x: box.minX + from.x * box.width, y: box.minY + from.y * box.height),
                endPoint: CGPoint(x: box.minX + to.x * box.width, y: box.minY + to.y * box.height)
            )
        case let .radial(inner, outer, center, radius):
            return .radialGradient(
                Gradient(colors: [Color(hex: inner), Color(hex: outer)]),
                center: CGPoint(x: box.minX + center.x * box.width, y: box.minY + center.y * box.height),
                startRadius: 0, endRadius: radius * max(box.width, box.height)
            )
        }
    }
}
