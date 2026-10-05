import SwiftUI
import MeeshySDK

// MARK: - Les médailles (#9466)
//
// MIROIR de `medal()` de `docs/product/jeu-meeshy-conception.html` (§ XII.2). Un badge
// d'accumulation se lit comme une vraie médaille :
//
//   - une LUNETTE de métal biseautée (sept matières : cuivre → prisme) ;
//   - un champ ÉMAILLÉ à la couleur de la FAMILLE de l'axe (contenu indigo, lien rose,
//     conversation violet, commentaire sarcelle, outil ambre) ;
//   - un PICTOGRAMME d'axe au trait au centre — jamais une bulle de conversation ;
//   - SEPT PERLES de palier en haut, autant d'allumées que la matière a de rang ;
//   - le poinçon SIGNATURE gravé en bas ;
//   - un RUBAN à partir de l'Or, avec le seuil en cartouche ;
//   - un ARC extérieur : la progression vers le palier suivant.
//
// Une médaille ÉTEINTE (une frappe l'a fait redescendre) devient une EMPREINTE : la même
// médaille en creux, sans métal, avec ce qu'il manque pour la rallumer. Le prisme (5 000)
// irise son émail ; l'hôte lui donne l'inclinaison du téléphone (`gamePrismTilt`).

/// La famille d'un axe : elle fixe la couleur de l'émail.
///
/// `nonisolated` : MeeshyUI isole tout au `MainActor` par défaut, et l'app lit ces deux
/// énumérations depuis des modèles purs (`GameBadgeItem`), hors de l'acteur principal.
public nonisolated enum GameMedalFamily: Sendable, Equatable, CaseIterable {
    case content
    case social
    case conversation
    case comment
    case tool

    public init(_ family: EngagementAxisFamily) {
        switch family {
        case .content: self = .content
        case .social: self = .social
        case .conversation: self = .conversation
        case .comment: self = .comment
        case .tool: self = .tool
        }
    }

    /// Les cinq couleurs d'émail de la planche.
    public var enamel: Color {
        switch self {
        case .content: Color(hex: "4f46e5")
        case .social: Color(hex: "e11d48")
        case .conversation: Color(hex: "7c3aed")
        case .comment: Color(hex: "0d9488")
        case .tool: Color(hex: "d97706")
        }
    }
}

/// Le pictogramme d'axe, dessiné au trait. Neuf glyphes : jamais une bulle.
public nonisolated enum GameMedalGlyph: Sendable, Equatable, CaseIterable {
    case text
    case voice
    case story
    case post
    case reel
    case comment
    case conversation
    case tool
    case social

    /// Le glyphe de chaque axe du catalogue ; le `switch` est exhaustif, un axe ajouté sans
    /// pictogramme ne compile plus.
    public init(axis: EngagementAxisKey) {
        switch axis {
        case .textMessage: self = .text
        case .audioMessage, .audioComment: self = .voice
        case .story: self = .story
        case .post: self = .post
        case .reel: self = .reel
        case .textComment: self = .comment
        case .privateConversation, .publicConversation, .communityConversation, .groupCreated: self = .conversation
        case .sticker, .inAppEdit, .directPublish, .reaction, .attachment: self = .tool
        case .trackedLink, .share, .inviteJoined, .friendship: self = .social
        }
    }
}

extension GameMaterial {
    /// Le nombre de perles allumées : Cuivre 1 … Prisme 7. La flamme n'est pas une matière de médaille.
    var medalRank: Int {
        switch self {
        case .copper: 1
        case .bronze: 2
        case .silver: 3
        case .gold: 4
        case .platinum: 5
        case .obsidian: 6
        case .prism: 7
        case .flame: 0
        }
    }

    /// Le ruban apparaît à partir de l'Or.
    var medalHasRibbon: Bool { medalRank >= 4 }
}

public struct GameMedalView: View {

    public enum State: Sendable, Equatable {
        case lit
        /// L'empreinte d'une médaille éteinte.
        case imprint
    }

    private let family: GameMedalFamily
    private let glyph: GameMedalGlyph
    private let material: GameMaterial
    private let state: State
    private let progress: Double
    private let label: String?
    private let surface: Color
    private let muted: Color
    private let accessibilityLabel: String?

    @ScaledMetric(relativeTo: .caption) private var typeScale: CGFloat = 1

    /// - Parameters:
    ///   - family: la famille de l'axe — la couleur de l'émail.
    ///   - glyph: le pictogramme d'axe.
    ///   - material: Cuivre → Prisme : la lunette, les perles allumées, le ruban.
    ///   - state: allumée, ou empreinte d'une médaille éteinte.
    ///   - progress: de 0 à 1, l'arc vers le palier suivant ; 1 quand il n'y en a plus.
    ///   - label: le seuil du cartouche du ruban (« 100 »), ou ce qu'il manque sous une
    ///     empreinte (« −37 »).
    ///   - surface: le fond de l'empreinte (la couleur de surface de l'hôte).
    ///   - muted: la teinte éteinte de l'empreinte et le rail de l'arc.
    ///   - accessibilityLabel: `nil` ⇒ décorative ; l'hôte dit « Messages texte, Or, 100 sur
    ///     500 vers Platine ».
    public init(family: GameMedalFamily, glyph: GameMedalGlyph, material: GameMaterial, state: State = .lit,
                progress: Double = 1, label: String? = nil, surface: Color = .white, muted: Color = .gray,
                accessibilityLabel: String? = nil) {
        self.family = family
        self.glyph = glyph
        self.material = material
        self.state = state
        self.progress = min(max(progress.isFinite ? progress : 0, 0), 1)
        self.label = label
        self.surface = surface
        self.muted = muted
        self.accessibilityLabel = accessibilityLabel
    }

    /// La boîte de dessin : 100 × 112, comme la planche.
    static let aspect: CGFloat = 100.0 / 112.0

    private static let radius: CGFloat = 34
    private static let center = CGPoint(x: 50, y: 52)

    public var body: some View {
        Canvas { context, size in
            let k = size.width / 100
            context.scaleBy(x: k, y: k)
            switch state {
            case .lit: drawMedal(in: &context)
            case .imprint: drawImprint(in: &context)
            }
        }
        .aspectRatio(Self.aspect, contentMode: .fit)
        .gameAccessibility(label: accessibilityLabel)
    }

    private var labelSize: CGFloat { 7.5 * min(max(typeScale, 1), GameTypeScale.maximum) }

    // MARK: - La médaille

    private func circle(_ radius: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: Self.center.x - radius, y: Self.center.y - radius, width: radius * 2, height: radius * 2))
    }

    private func drawMedal(in context: inout GraphicsContext) {
        let r = Self.radius
        if material.medalHasRibbon { drawRibbon(in: &context) }
        drawArc(in: &context)

        let bezel = circle(r + 2)
        context.fill(bezel, with: material.shading(in: bezel.boundingRect))
        context.stroke(bezel, with: .color(GamePalette.ink.opacity(0.3)), lineWidth: 1)
        // Le biseau : la lunette prend la lumière en haut à gauche et la perd en bas à droite.
        context.stroke(circle(r + 0.6), with: .linearGradient(
            Gradient(colors: [.white.opacity(0.75), .white.opacity(0)]),
            startPoint: CGPoint(x: 20, y: 18), endPoint: CGPoint(x: 80, y: 86)
        ), lineWidth: 1.6)
        context.stroke(circle(r - 1), with: .linearGradient(
            Gradient(colors: [GamePalette.ink.opacity(0), GamePalette.ink.opacity(0.32)]),
            startPoint: CGPoint(x: 20, y: 18), endPoint: CGPoint(x: 80, y: 86)
        ), lineWidth: 2.2)
        context.stroke(circle(r - 3), with: .color(.white.opacity(0.55)), lineWidth: 1.4)

        let enamel = circle(r - 7)
        context.fill(enamel, with: .color(family.enamel))
        if material == .prism {
            var iridescence = context
            iridescence.opacity = 0.5
            iridescence.fill(enamel, with: .conicGradient(Gradient(stops: GamePalette.prismStops), center: Self.center, angle: .zero))
        }
        var sheen = context
        sheen.opacity = 0.18
        sheen.fill(enamel, with: .linearGradient(
            Gradient(colors: [.white, .white.opacity(0)]),
            startPoint: CGPoint(x: 50, y: 25), endPoint: CGPoint(x: 50, y: 79)
        ))

        drawGlyph(in: &context, color: .white, opacity: 1)
        drawPearls(in: &context)
        GameSignature.draw(in: &context, center: CGPoint(x: 50, y: 80.5), side: 13, color: material.ink,
                           style: .engraved, strokeWidth: 130)
        if material.medalHasRibbon, let label { drawCartouche(label, in: &context) }
    }

    private func drawRibbon(in context: inout GraphicsContext) {
        context.fill(GameSVGPath.make("M38 74 l-8 30 9-6 5 9 6-30z"), with: .color(family.enamel))
        var right = context
        right.opacity = 0.85
        right.fill(GameSVGPath.make("M62 74 l8 30 -9-6 -5 9 -6-30z"), with: .color(family.enamel))
    }

    private func drawCartouche(_ text: String, in context: inout GraphicsContext) {
        let plate = Path(roundedRect: CGRect(x: 36, y: 99, width: 28, height: 11), cornerRadius: 3)
        context.fill(plate, with: .color(GamePalette.ink))
        context.draw(
            Text(text).font(.system(size: labelSize, weight: .medium, design: .monospaced)).foregroundColor(.white),
            at: CGPoint(x: 50, y: 104.5), anchor: .center
        )
    }

    /// L'arc extérieur : un rail, et la part parcourue vers le palier suivant, de midi dans le
    /// sens horaire. Un polygone fin plutôt qu'`addArc`, dont le sens est inversé dans le repère
    /// retourné de SwiftUI.
    private func drawArc(in context: inout GraphicsContext) {
        let radius = Self.radius + 7
        context.stroke(circle(radius), with: .color(muted.opacity(0.35)), lineWidth: 3)
        guard progress > 0 else { return }
        if progress >= 1 {
            context.stroke(circle(radius), with: .color(family.enamel), lineWidth: 3)
            return
        }
        let steps = max(2, Int((progress * 96).rounded(.up)))
        var path = Path()
        for step in 0...steps {
            let angle = CGFloat(step) / CGFloat(steps) * CGFloat(progress) * 2 * .pi - .pi / 2
            let point = CGPoint(x: Self.center.x + radius * cos(angle), y: Self.center.y + radius * sin(angle))
            if step == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        context.stroke(path, with: .color(family.enamel), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
    }

    /// Sept perles sur la lunette, du haut : autant de pleines que la matière a de rang.
    private func drawPearls(in context: inout GraphicsContext) {
        let lit = material.medalRank
        for step in 0..<7 {
            let angle = (-90 + CGFloat(step - 3) * 13) * .pi / 180
            let r = Self.radius + 1.5
            let pearl = Path(ellipseIn: CGRect(
                x: Self.center.x + r * cos(angle) - 2.1, y: Self.center.y + r * sin(angle) - 2.1, width: 4.2, height: 4.2
            ))
            if step < lit { context.fill(pearl, with: .color(.white)) }
            context.stroke(pearl, with: .color(.white.opacity(0.8)), lineWidth: 1)
        }
    }

    // MARK: - L'empreinte

    private func drawImprint(in context: inout GraphicsContext) {
        let r = Self.radius
        let plate = circle(r + 2)
        context.fill(plate, with: .color(surface))
        context.stroke(plate, with: .color(muted), style: StrokeStyle(lineWidth: 2, dash: [4, 4]))
        context.stroke(circle(r - 8), with: .color(muted.opacity(0.35)), lineWidth: 2)
        drawGlyph(in: &context, color: muted, opacity: 0.35)
        if let label {
            context.draw(
                Text(label).font(.system(size: labelSize * 10 / 7.5, weight: .medium, design: .monospaced)).foregroundColor(muted),
                at: CGPoint(x: 50, y: 104), anchor: .center
            )
        }
    }

    // MARK: - Les pictogrammes

    /// Le glyphe, au trait, centré en (50, 50) : « Aa », micro, cercle pointillé, carré,
    /// lecture, guillemets, deux points reliés, étoile, maillons.
    private func drawGlyph(in context: inout GraphicsContext, color: Color, opacity: Double) {
        var inner = context
        inner.opacity = context.opacity * opacity
        inner.translateBy(x: 50, y: 50)
        let round = StrokeStyle(lineWidth: 2.4, lineCap: .round, lineJoin: .round)
        switch glyph {
        case .text:
            inner.draw(Text("Aa").font(.system(size: 15, weight: .heavy, design: .rounded)).foregroundColor(color),
                       at: .zero, anchor: .center)
        case .voice:
            inner.fill(Path(roundedRect: CGRect(x: -4, y: -10, width: 8, height: 13), cornerRadius: 4), with: .color(color))
            inner.stroke(GameSVGPath.make("M-8 0 A8 8 0 0 0 8 0 M0 8 L0 13"), with: .color(color),
                         style: StrokeStyle(lineWidth: 2.2, lineCap: .round))
        case .story:
            inner.stroke(Path(ellipseIn: CGRect(x: -9, y: -9, width: 18, height: 18)), with: .color(color),
                         style: StrokeStyle(lineWidth: 2.4, dash: [4, 3]))
            inner.fill(Path(ellipseIn: CGRect(x: -3.5, y: -3.5, width: 7, height: 7)), with: .color(color))
        case .post:
            inner.stroke(Path(roundedRect: CGRect(x: -9, y: -9, width: 18, height: 18), cornerRadius: 3), with: .color(color), style: round)
            inner.stroke(GameSVGPath.make("M-4 -2.5 L4 -2.5 M-4 3 L2 3"), with: .color(color),
                         style: StrokeStyle(lineWidth: 2, lineCap: .round))
        case .reel:
            inner.fill(GameSVGPath.make("M-5 -8 L9 0 L-5 8 Z"), with: .color(color))
        case .comment:
            inner.fill(GameSVGPath.make("M-9 -6h6v6l-3 6h-3l2-6h-2zM2 -6h6v6l-3 6h-3l2-6h-2z"), with: .color(color))
        case .conversation:
            inner.fill(Path(ellipseIn: CGRect(x: -10, y: -4, width: 8, height: 8)), with: .color(color))
            inner.fill(Path(ellipseIn: CGRect(x: 3, y: -4, width: 8, height: 8)), with: .color(color))
            inner.stroke(GameSVGPath.make("M-2 0 L3 0"), with: .color(color), style: StrokeStyle(lineWidth: 2.6, lineCap: .butt))
        case .tool:
            inner.fill(RankBlasonView.star(center: .zero, radius: 10), with: .color(color))
        case .social:
            inner.stroke(Path(roundedRect: CGRect(x: -11, y: -4, width: 12, height: 8), cornerRadius: 4), with: .color(color), style: round)
            inner.stroke(Path(roundedRect: CGRect(x: -1, y: -4, width: 12, height: 8), cornerRadius: 4), with: .color(color), style: round)
        }
    }
}
