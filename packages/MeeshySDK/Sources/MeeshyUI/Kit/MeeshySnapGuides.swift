import SwiftUI

/// Les repères d'aimantation, posés au-dessus des objets d'une scène, sous les
/// cibles de dépôt et sous tout le chrome. Il remplit ce que l'hôte lui donne.
///
/// Pendant un glissé : la ligne ENGAGÉE seule, pleine, d'un bord à l'autre ; les
/// lignes candidates et le contour de la scène ne se tracent que si l'hôte les
/// passe. Au repos (`isActive` faux), rien dans l'arbre. Le calque ne prend aucun
/// toucher et se tait pour le lecteur d'écran ; il joue un `light` à l'entrée de
/// chaque NOUVELLE ligne engagée (`haptic: .none` laisse l'hôte jouer le sien).
///
/// Il ne décide pas des lignes : il reçoit des fractions (0…1 du calque, comptées
/// depuis la gauche physique, sans miroir en RTL — une scène est un média).
public struct MeeshySnapGuides: View, Equatable {
    private let isActive: Bool
    private let engaged: MeeshySnapLines
    private let candidates: MeeshySnapLines
    private let showsBounds: Bool
    private let cornerRadius: CGFloat
    private let haptic: MeeshySnapHaptic

    public init(
        isActive: Bool,
        engaged: MeeshySnapLines = .none,
        candidates: MeeshySnapLines = .none,
        showsBounds: Bool = false,
        cornerRadius: CGFloat = 0,
        haptic: MeeshySnapHaptic = .light
    ) {
        self.isActive = isActive
        self.engaged = engaged
        self.candidates = candidates
        self.showsBounds = showsBounds
        self.cornerRadius = cornerRadius
        self.haptic = haptic
    }

    public var body: some View {
        ZStack {
            if let plan = MeeshySnapGuidesRule.plan(isActive: isActive, engaged: engaged, candidates: candidates) {
                MeeshySnapGuidesLayer(plan: plan, showsBounds: showsBounds, cornerRadius: cornerRadius)
                    .equatable()
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .adaptiveOnChange(of: isActive ? MeeshySnapGuidesRule.sanitized(engaged) : .none) { previous, next in
            _ = MeeshySnapGuidesRule.perform(from: previous, to: next, haptic: haptic)
        }
    }
}

/// Une seule surface de dessin, redessinée quand ce qu'elle peint change de
/// VALEUR : cent mouvements du doigt à lignes égales ne la redessinent pas.
private struct MeeshySnapGuidesLayer: View, Equatable {
    let plan: MeeshySnapGuidesPlan
    let showsBounds: Bool
    let cornerRadius: CGFloat

    var body: some View {
        let style = MeeshySelectionFeedbackRecipe.guides()
        let plan = plan, showsBounds = showsBounds, cornerRadius = cornerRadius
        Canvas { context, size in
            Self.drawCandidates(plan.candidates, style: style, in: &context, size: size)
            if showsBounds { Self.drawBounds(style: style, cornerRadius: cornerRadius, in: &context, size: size) }
            Self.drawEngaged(plan.engaged, style: style, in: &context, size: size)
        }
    }

    private nonisolated static func segments(_ lines: MeeshySnapLines, size: CGSize) -> Path {
        var path = Path()
        for x in MeeshySnapGuidesRule.points(lines.vertical, length: size.width) {
            path.move(to: CGPoint(x: x, y: 0))
            path.addLine(to: CGPoint(x: x, y: size.height))
        }
        for y in MeeshySnapGuidesRule.points(lines.horizontal, length: size.height) {
            path.move(to: CGPoint(x: 0, y: y))
            path.addLine(to: CGPoint(x: size.width, y: y))
        }
        return path
    }

    private nonisolated static func drawCandidates(_ lines: MeeshySnapLines, style: MeeshySnapGuidesStyle, in context: inout GraphicsContext, size: CGSize) {
        guard !lines.isEmpty else { return }
        context.stroke(
            segments(lines, size: size),
            with: .color(MeeshyColors.onMedia.opacity(style.candidateOpacity)),
            style: StrokeStyle(lineWidth: style.candidateWidth, dash: style.candidateDash)
        )
    }

    private nonisolated static func drawBounds(style: MeeshySnapGuidesStyle, cornerRadius: CGFloat, in context: inout GraphicsContext, size: CGSize) {
        let frame = CGRect(origin: .zero, size: size).insetBy(dx: style.boundsInset, dy: style.boundsInset)
        context.stroke(
            Path(roundedRect: frame, cornerRadius: max(0, cornerRadius - style.boundsInset)),
            with: .color(MeeshyColors.onMedia.opacity(style.boundsOpacity)),
            lineWidth: style.boundsWidth
        )
    }

    /// La ligne engagée : un liseré sombre de chaque côté, puis le trait jaune par-dessus.
    private nonisolated static func drawEngaged(_ lines: MeeshySnapLines, style: MeeshySnapGuidesStyle, in context: inout GraphicsContext, size: CGSize) {
        guard !lines.isEmpty else { return }
        let path = segments(lines, size: size)
        context.stroke(path, with: .color(MeeshyColors.scrim), lineWidth: style.engagedWidth + 2 * style.engagedEdgeWidth)
        context.stroke(path, with: .color(MeeshyColors.mediaSnap), lineWidth: style.engagedWidth)
    }
}
