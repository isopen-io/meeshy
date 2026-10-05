import SwiftUI
import MeeshySDK

// MARK: - L'anneau de niveau (#9380)
//
// MIROIR de `ring()` de `docs/product/jeu-meeshy-conception.html` (§ II.2) : un
// anneau dont l'arc se remplit avec la barre du niveau, la Signature à plat au-
// dessus du chiffre. La couleur de l'arc est celle du PALIER de nom (Étincelle,
// Lueur… Galaxie), qui change tous les dix niveaux ; Galaxie est en prisme.
//
// Ce que la brique montre en plus :
//  - le REPÈRE DU RECORD : un cran sur l'anneau, que la barre ne dépasse pas
//    quand on a redescendu ;
//  - les ÉTOILES DE PRESTIGE : jusqu'à cinq, sous l'anneau.
//
// L'arc (`Circle.trim`) est ANIMABLE : `withAnimation { progress = … }` le remplit ou
// le vide (« l'anneau se remplit, le chiffre roule » / « se vide calmement »).
// La brique n'anime rien d'elle-même : la chorégraphie est celle de l'app.

/// Les dix couleurs de palier de la planche, du rouge Étincelle au prisme de Galaxie.
public enum LevelTierPalette {
    public static func color(for tier: LevelTierKey) -> Color {
        switch tier {
        case .etincelle: Color(hex: "f87171")
        case .lueur: Color(hex: "fb923c")
        case .lumiere: Color(hex: "fbbf24")
        case .eclat: Color(hex: "a3e635")
        case .rayon: Color(hex: "34d399")
        case .aurore: Color(hex: "22d3ee")
        case .comete: Color(hex: "60a5fa")
        case .etoile: Color(hex: "818cf8")
        case .constellation: Color(hex: "a855f7")
        case .galaxie: Color(hex: "a855f7")
        }
    }

    /// Le trait de l'arc : une couleur franche, ou le prisme tournant de Galaxie.
    static func style(for tier: LevelTierKey) -> AnyShapeStyle {
        tier == .galaxie
            ? AnyShapeStyle(AngularGradient(stops: GamePalette.prismStops, center: .center))
            : AnyShapeStyle(color(for: tier))
    }
}

public struct LevelRingView: View {

    private let level: Int
    private let progress: Double
    private let tier: LevelTierKey
    private let prestige: Int
    private let recordMarker: Double?
    private let trackColor: Color
    private let inkColor: Color
    private let mutedColor: Color
    private let accessibilityLabel: String?

    @ScaledMetric(relativeTo: .headline) private var typeScale: CGFloat = 1

    /// - Parameters:
    ///   - level: le niveau (1 à 100), peint au centre.
    ///   - progress: la barre du niveau, de 0 à 1.
    ///   - tier: le palier de nom — il fixe la couleur de l'arc.
    ///   - prestige: les étoiles de Prestige (0 à 5) sous l'anneau.
    ///   - recordMarker: la position (0 à 1) du niveau record sur la barre, quand
    ///     on a redescendu ; `nil` sans repère.
    ///   - trackColor: le rail de l'anneau — la couleur de ligne de l'hôte.
    ///   - inkColor: le chiffre du niveau.
    ///   - mutedColor: la Signature.
    ///   - accessibilityLabel: `nil` ⇒ décoratif ; l'hôte dit « Niveau 34, 90 % ».
    public init(level: Int, progress: Double, tier: LevelTierKey, prestige: Int = 0, recordMarker: Double? = nil,
                trackColor: Color = Color.gray.opacity(0.25), inkColor: Color = .primary,
                mutedColor: Color = .secondary, accessibilityLabel: String? = nil) {
        self.level = level
        self.progress = progress
        self.tier = tier
        self.prestige = min(max(prestige, 0), GameLevels.maxPrestige)
        self.recordMarker = recordMarker
        self.trackColor = trackColor
        self.inkColor = inkColor
        self.mutedColor = mutedColor
        self.accessibilityLabel = accessibilityLabel
    }

    private var aspect: CGFloat { prestige > 0 ? 56.0 / 66.0 : 1 }

    public var body: some View {
        GeometryReader { proxy in
            let k = proxy.size.width / 56
            ZStack(alignment: .top) {
                ringBody(k: k)
                    .frame(width: 56 * k, height: 56 * k)
                if prestige > 0 {
                    Canvas { context, _ in
                        context.scaleBy(x: k, y: k)
                        drawPrestige(in: &context)
                    }
                    .frame(width: 56 * k, height: 66 * k)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .top)
        }
        .aspectRatio(aspect, contentMode: .fit)
        .gameAccessibility(label: accessibilityLabel)
    }

    private func ringBody(k: CGFloat) -> some View {
        ZStack {
            Circle().stroke(trackColor, lineWidth: 5 * k).frame(width: 48 * k, height: 48 * k)
            // `trim` est animable : `withAnimation` remplit ou vide l'arc. Le
            // cercle part de 3 h ; on le tourne pour qu'il parte de midi.
            Circle()
                .trim(from: 0, to: CGFloat(min(max(progress, 0), 1)))
                .stroke(LevelTierPalette.style(for: tier), style: StrokeStyle(lineWidth: 5 * k, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .frame(width: 48 * k, height: 48 * k)
            if let recordMarker {
                RecordTick(fraction: recordMarker)
                    .stroke(inkColor, style: StrokeStyle(lineWidth: 2 * k, lineCap: .round))
                    .frame(width: 56 * k, height: 56 * k)
            }
            SignatureMark(style: .flat, color: mutedColor, strokeWidth: 120)
                .frame(width: 13 * k, height: 13 * k)
                .position(x: 28 * k, y: 17 * k)
            Text("\(level)")
                .font(.system(size: 14 * k * min(max(typeScale, 1), GameTypeScale.maximum), weight: .heavy, design: .rounded))
                .foregroundColor(inkColor)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .modifier(NumericRoll())
                .frame(width: 30 * k)
                .position(x: 28 * k, y: 36 * k)
        }
    }

    private func drawPrestige(in context: inout GraphicsContext) {
        let spacing: CGFloat = 9
        let first = 28 - spacing * CGFloat(prestige - 1) / 2
        for step in 0..<prestige {
            context.fill(RankBlasonView.star(center: CGPoint(x: first + CGFloat(step) * spacing, y: 61), radius: 4),
                         with: .color(GamePalette.gold))
        }
    }
}

/// Un cran radial à `fraction` du tour, de midi dans le sens horaire.
private struct RecordTick: Shape {
    let fraction: Double

    func path(in rect: CGRect) -> Path {
        let angle = CGFloat(min(max(fraction, 0), 1)) * 2 * .pi - .pi / 2
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let scale = rect.width / 56
        var path = Path()
        path.move(to: CGPoint(x: center.x + 20 * scale * cos(angle), y: center.y + 20 * scale * sin(angle)))
        path.addLine(to: CGPoint(x: center.x + 28 * scale * cos(angle), y: center.y + 28 * scale * sin(angle)))
        return path
    }
}

/// Le chiffre « roule » quand le niveau change (iOS 17+) ; sur iOS 16 il change net.
private struct NumericRoll: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 17.0, macOS 14.0, *) {
            content.contentTransition(.numericText())
        } else {
            content
        }
    }
}
