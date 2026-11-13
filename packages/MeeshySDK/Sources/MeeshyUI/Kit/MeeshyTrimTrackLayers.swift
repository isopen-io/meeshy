import SwiftUI

/// Les voiles et le liseré de la plage : des rectangles de la largeur du
/// contenu, que seules des transformations (échelle, translation) placent —
/// jamais une largeur recalculée, jamais un flou.
struct MeeshyTrimTrackVeilLayer: View, Equatable {
    let geometry: MeeshyTrimTrackGeometry
    let range: ClosedRange<Double>
    let height: CGFloat
    let recipe: MeeshyTrimTrackRecipe

    var body: some View {
        ZStack(alignment: .topLeading) {
            veils
            bar(y: 0)
            bar(y: height - MeeshyTrimTrackRecipe.frameThickness)
        }
        .frame(width: geometry.inset * 2 + geometry.width, height: height, alignment: .topLeading)
        .opacity(recipe.chromeOpacity)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private var span: Double { max(geometry.duration, .leastNonzeroMagnitude) }

    private func fraction(_ seconds: Double) -> CGFloat {
        max(CGFloat(seconds / span), 0.0001)
    }

    @ViewBuilder
    private var veils: some View {
        if recipe.isRemoval {
            veil(fraction: fraction(range.upperBound - range.lowerBound), anchor: .leading, x: geometry.x(for: range.lowerBound))
        } else {
            veil(fraction: fraction(range.lowerBound), anchor: .leading, x: geometry.inset)
            veil(fraction: fraction(geometry.duration - range.upperBound), anchor: .trailing, x: geometry.inset)
        }
    }

    private func veil(fraction: CGFloat, anchor: UnitPoint, x: CGFloat) -> some View {
        Rectangle()
            .fill(recipe.veilColor)
            .frame(width: geometry.width, height: height)
            .scaleEffect(x: fraction, y: 1, anchor: anchor)
            .offset(x: x)
    }

    private func bar(y: CGFloat) -> some View {
        Rectangle()
            .fill(recipe.handleColor)
            .frame(width: geometry.width, height: MeeshyTrimTrackRecipe.frameThickness)
            .scaleEffect(x: fraction(range.upperBound - range.lowerBound), y: 1, anchor: .leading)
            .offset(x: geometry.x(for: range.lowerBound), y: y)
    }
}

/// Une poignée : sa barre jaune au bord de la plage, arrondie vers l'extérieur,
/// une prise sombre en son milieu. Elle se tient HORS de la plage : son bord
/// intérieur est la borne. Le geste et l'accessibilité viennent de la piste.
struct MeeshyTrimTrackHandleShape: View, Equatable {
    let part: MeeshyTrimTrackPart
    let height: CGFloat
    let gripHeight: CGFloat
    let recipe: MeeshyTrimTrackRecipe
    let showsFocusRing: Bool

    var body: some View {
        let radius = MeeshyTrimTrackRecipe.radius
        let isStart = part == .start
        return UnevenRoundedRectangle(
            topLeadingRadius: isStart ? radius : 0,
            bottomLeadingRadius: isStart ? radius : 0,
            bottomTrailingRadius: isStart ? 0 : radius,
            topTrailingRadius: isStart ? 0 : radius,
            style: .continuous
        )
        .fill(recipe.handleColor)
        .overlay {
            RoundedRectangle(cornerRadius: MeeshyTrimTrackRecipe.gripRadius, style: .continuous)
                .fill(recipe.gripColor)
                .frame(width: MeeshyTrimTrackRecipe.gripWidth, height: gripHeight)
        }
        .overlay {
            if showsFocusRing {
                RoundedRectangle(cornerRadius: MeeshyTrimTrackRecipe.gripRadius, style: .continuous)
                    .strokeBorder(recipe.bedColor, lineWidth: MeeshyTrimTrackRecipe.focusRingWidth)
            }
        }
        .shadow(color: recipe.handleShadowColor, radius: MeeshyTrimTrackRecipe.handleShadowRadius, y: 1)
        .frame(width: MeeshyTrimTrackRecipe.handleWidth, height: height)
        .frame(width: MeeshyTrimTrackRecipe.hitWidth, height: height)
        .contentShape(Rectangle())
        .meeshyAnimation(MeeshyAnimation.springFast, value: gripHeight)
        .opacity(recipe.handleOpacity(of: part))
    }
}

/// La tête de lecture : un trait blanc de 3 (4 tenue) et son halo, dans une
/// cible de 44. Elle seule suit l'horloge de l'hôte : le contenu n'en dépend pas.
struct MeeshyTrimTrackHeadShape: View, Equatable {
    let height: CGFloat
    let recipe: MeeshyTrimTrackRecipe

    var body: some View {
        RoundedRectangle(cornerRadius: MeeshyTrimTrackRecipe.gripRadius, style: .continuous)
            .fill(recipe.playheadColor)
            .frame(width: recipe.playheadWidth, height: height)
            .shadow(color: recipe.playheadHaloColor, radius: MeeshyTrimTrackRecipe.playheadHaloRadius)
            .frame(width: MeeshyTrimTrackRecipe.hitWidth, height: height)
            .contentShape(Rectangle())
            .meeshyAnimation(MeeshyAnimation.springFast, value: recipe.playheadWidth)
            .opacity(recipe.chromeOpacity)
    }
}

/// La loupe de précision : une règle de la SEULE fenêtre visible (un trait par
/// 10 ms, un grand par 100 ms) qui défile sous un trait fixe au centre — jamais
/// la piste dilatée entière.
struct MeeshyTrimTrackLoupeLayer: View, Equatable {
    let anchor: Double
    let width: CGFloat
    let height: CGFloat
    let scale: CGFloat
    let duration: Double
    let recipe: MeeshyTrimTrackRecipe

    var body: some View {
        Canvas { context, size in
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(recipe.loupeColor))
            let window = MeeshyTrimTrackRule(duration: duration, minimumSpan: 0.001)
                .precisionWindow(anchor: anchor, width: width, pointsPerSecond: scale)
            let first = Int((max(0, window.lowerBound) * 100).rounded(.up))
            let last = Int((min(duration, window.upperBound) * 100).rounded(.down))
            if first <= last {
                for hundredth in first...last {
                    let isMajor = hundredth % 10 == 0
                    let tick = size.height * (isMajor ? MeeshyTrimTrackRecipe.majorTickFraction : MeeshyTrimTrackRecipe.minorTickFraction)
                    let x = size.width / 2 + CGFloat(Double(hundredth) / 100 - anchor) * scale
                    context.fill(
                        Path(CGRect(x: x, y: size.height - tick, width: MeeshyTrimTrackRecipe.tickWidth, height: tick)),
                        with: .color(recipe.tickColor(isMajor: isMajor))
                    )
                }
            }
            let line = CGRect(
                x: size.width / 2 - MeeshyTrimTrackRecipe.centerLineWidth / 2, y: 0,
                width: MeeshyTrimTrackRecipe.centerLineWidth, height: size.height
            )
            context.fill(Path(line), with: .color(recipe.handleColor))
        }
        .frame(width: width, height: height)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Le relevé sous la piste : le début, la durée gardée au centre (prioritaire),
/// la fin. Une ligne, chiffres à chasse fixe, réduction jusqu'à 70 %.
struct MeeshyTrimTrackReadout: View, Equatable {
    let start: String
    let kept: String
    let end: String
    let recipe: MeeshyTrimTrackRecipe
    let isDark: Bool

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Text(start)
            Spacer(minLength: 0)
            Text(kept)
                .foregroundStyle(recipe.keptColor(isDark: isDark))
                .layoutPriority(1)
            Spacer(minLength: 0)
            Text(end)
        }
        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: recipe.keptWeight).monospacedDigit())
        .foregroundStyle(recipe.readoutColor(isDark: isDark))
        .lineLimit(1)
        .minimumScaleFactor(MeeshyTrimTrackRecipe.readoutShrink)
        .padding(.horizontal, MeeshyTrimTrackRecipe.handleWidth)
        .opacity(recipe.chromeOpacity)
        .accessibilityHidden(true)
    }
}

/// Le temps de la poignée tenue en précision, lu au millième dans une capsule au-dessus.
struct MeeshyTrimTrackPreciseCapsule: View, Equatable {
    let text: String
    let recipe: MeeshyTrimTrackRecipe

    var body: some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .bold).monospacedDigit())
            .foregroundStyle(recipe.capsuleInk)
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.vertical, MeeshySpacing.xxs)
            .background(recipe.capsuleColor, in: Capsule())
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
