import SwiftUI
import MeeshySDK

// MARK: - La gemme de ligue, le tampon d'Atlas et le liseré de rareté (#9384, #9388, #9390)
//
// MIROIR de `gem()`, des `ligues-row` et des tampons de `docs/product/jeu-meeshy-conception.html`
// (§ II.7 à II.9 et § XIII.1). Trois briques SDK pures : elles DESSINENT à partir de
// valeurs opaques — une ligue, un code de langue, une rareté — et ne savent rien du lien
// avec un compte, d'un classement ni d'une langue du lecteur. L'orchestration (quand les
// montrer, avec quelle phrase) vit dans l'app.
//
//   gemme de ligue   une gemme taillée par ligue, du Quartz au Prisme, la Signature GRAVÉE
//                    en creux ; la gemme Prisme irise (le dégradé de la matière Prisme)
//   tampon d'Atlas   un cachet incliné — deux cercles, le code de la langue, la Signature
//                    à plat ; un tampon manquant est en pointillé, éteint
//   liseré           le contour d'un succès, à la couleur de sa rareté (ardoise, bleu,
//                    violet, or, prisme)

// MARK: - La gemme

extension LeagueKey {
    /// La couleur de la gemme — les huit teintes de la planche, du gris de Quartz à l'irisé du Prisme.
    public var gemColor: Color {
        switch self {
        case .quartz: Color(hex: "e5e7eb")
        case .ambre: Color(hex: "f59e0b")
        case .jade: Color(hex: "10b981")
        case .saphir: Color(hex: "3b82f6")
        case .rubis: Color(hex: "e11d48")
        case .amethyste: Color(hex: "8b5cf6")
        case .diamant: Color(hex: "bae6fd")
        case .prisme: Color(hex: "a855f7")
        }
    }
}

public struct LeagueGemView: View {

    private let league: LeagueKey
    private let accessibilityLabel: String?

    /// - Parameters:
    ///   - league: la ligue — elle fixe la couleur de la gemme.
    ///   - accessibilityLabel: `nil` ⇒ décorative ; l'hôte dit « Ligue Jade, 4e ».
    public init(league: LeagueKey, accessibilityLabel: String? = nil) {
        self.league = league
        self.accessibilityLabel = accessibilityLabel
    }

    private static let cut = GameSVGPath.make("M36 6 l26 20 -26 42 -26 -42 z")
    private static let table = GameSVGPath.make("M10 26 h52")

    public var body: some View {
        Canvas { context, size in
            let k = size.width / 72
            context.scaleBy(x: k, y: k)
            let box = Self.cut.boundingRect
            if league == .prisme {
                context.fill(Self.cut, with: GamePalette.diagonal(GamePalette.prismStops, in: box))
            } else {
                context.fill(Self.cut, with: .color(league.gemColor))
            }
            context.stroke(Self.cut, with: .color(GamePalette.ink.opacity(0.3)), lineWidth: 1)
            context.stroke(Self.table, with: .color(.white.opacity(0.6)), lineWidth: 1.4)
            GameSignature.draw(in: &context, center: CGPoint(x: 36, y: 38), side: 26, color: GamePalette.ink,
                               style: .engraved, strokeWidth: 110)
        }
        .aspectRatio(1, contentMode: .fit)
        .gameAccessibility(label: accessibilityLabel)
    }
}

// MARK: - Le tampon

public struct AtlasStampView: View {

    public enum State: Sendable, Equatable {
        /// La langue est tamponnée : un échange dans les deux sens.
        case stamped
        /// Un sens manque encore : le cachet est dessiné, éteint, à moitié encré.
        case pending
        /// Une langue à découvrir : le contour en pointillé.
        case undiscovered
    }

    private let code: String
    private let tint: Color
    private let state: State
    private let tilt: Double
    private let muted: Color
    private let accessibilityLabel: String?

    @ScaledMetric(relativeTo: .caption) private var typeScale: CGFloat = 1

    /// - Parameters:
    ///   - code: le code de la langue, en capitales (« FR », « JA ») ; vide pour « à découvrir ».
    ///   - tint: la couleur de l'encre — celle de la langue.
    ///   - state: tamponné, à moitié échangé, ou à découvrir.
    ///   - tilt: l'inclinaison du cachet en degrés (la planche alterne −6 et 8).
    ///   - muted: la teinte éteinte (à moitié échangé, à découvrir).
    ///   - accessibilityLabel: `nil` ⇒ décoratif ; l'hôte dit « Japonais, tamponné ».
    public init(code: String, tint: Color, state: State = .stamped, tilt: Double = -6,
                muted: Color = .gray, accessibilityLabel: String? = nil) {
        self.code = code
        self.tint = tint
        self.state = state
        self.tilt = tilt
        self.muted = muted
        self.accessibilityLabel = accessibilityLabel
    }

    private var ink: Color { state == .stamped ? tint : muted }

    public var body: some View {
        Canvas { context, size in
            let k = size.width / 72
            context.scaleBy(x: k, y: k)
            context.translateBy(x: 36, y: 36)
            context.rotate(by: .degrees(tilt))
            context.translateBy(x: -36, y: -36)
            let outer = Path(ellipseIn: CGRect(x: 7, y: 7, width: 58, height: 58))
            let inner = Path(ellipseIn: CGRect(x: 13, y: 13, width: 46, height: 46))
            let dashed = state == .undiscovered
            context.stroke(outer, with: .color(ink), style: StrokeStyle(lineWidth: 2.5, dash: dashed ? [4, 4] : []))
            context.stroke(inner, with: .color(ink), lineWidth: 1)
            let label = code.isEmpty ? "··" : code.uppercased()
            context.draw(
                Text(label).font(.system(size: 15 * min(max(typeScale, 1), GameTypeScale.maximum), weight: .heavy, design: .rounded))
                    .foregroundColor(ink),
                at: CGPoint(x: 36, y: 38), anchor: .center
            )
            GameSignature.draw(in: &context, center: CGPoint(x: 36, y: 48), side: 14, color: ink,
                               style: .flat, strokeWidth: 120)
        }
        .opacity(state == .pending ? 0.7 : 1)
        .aspectRatio(1, contentMode: .fit)
        .gameAccessibility(label: accessibilityLabel)
    }
}

// MARK: - Le liseré de rareté

extension RarityBorder {
    /// Le trait du liseré : une couleur franche, ou le prisme tournant du mythique.
    public var stroke: AnyShapeStyle {
        switch self {
        case .slate: AnyShapeStyle(Color(hex: "94a3b8"))
        case .blue: AnyShapeStyle(Color(hex: "3b82f6"))
        case .violet: AnyShapeStyle(Color(hex: "8b5cf6"))
        case .gold: AnyShapeStyle(Color(hex: "f59e0b"))
        case .prism: AnyShapeStyle(AngularGradient(stops: GamePalette.prismStops, center: .center))
        }
    }
}

private struct GameRarityRim: ViewModifier {
    let border: RarityBorder?
    let cornerRadius: CGFloat

    func body(content: Content) -> some View {
        content.overlay {
            if let border {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(border.stroke, lineWidth: 1.5)
                    .allowsHitTesting(false)
            }
        }
    }
}

extension View {
    /// Pose le liseré de rareté d'un succès ; `nil` (rareté non mesurée) ne pose rien : un
    /// succès sans mesure vaut un commun, et le commun reste sobre.
    public func gameRarityRim(_ border: RarityBorder?, cornerRadius: CGFloat = 14) -> some View {
        modifier(GameRarityRim(border: border, cornerRadius: cornerRadius))
    }
}
