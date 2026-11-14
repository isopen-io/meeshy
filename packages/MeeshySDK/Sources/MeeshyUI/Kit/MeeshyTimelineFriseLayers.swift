import SwiftUI

/// **La règle graduée, en UN `Canvas`** : traits mineurs et majeurs, libellés
/// de l'hôte (ceux des bouts rentrés), et l'ascenseur fin d'une frise zoomée.
/// Une scène de deux heures n'y monte pas plus de vues qu'une de six secondes.
struct MeeshyTimelineFriseRulerCanvas: View, Equatable {
    let ticks: [MeeshyTimelineFriseRuler.Tick]
    let labels: [String?]
    let viewport: MeeshyTimelineFriseViewport
    let duration: Double
    let labelSize: CGFloat
    let recipe: MeeshyTimelineFriseRecipe
    let isDark: Bool

    var body: some View {
        Canvas { context, size in
            draw(in: context, size: size)
        }
        .frame(height: MeeshyTimelineFriseRecipe.rulerDrawnHeight)
        .accessibilityHidden(true)
    }

    private func draw(in context: GraphicsContext, size: CGSize) {
        for (index, tick) in ticks.enumerated() {
            let x = CGFloat(viewport.fraction(tick.time)) * size.width
            let height = tick.isMajor ? MeeshyTimelineFriseRecipe.majorTickHeight : MeeshyTimelineFriseRecipe.minorTickHeight
            let mark = CGRect(
                x: min(max(0, x - MeeshyTimelineFriseRecipe.tickWidth / 2), size.width - MeeshyTimelineFriseRecipe.tickWidth),
                y: size.height - height, width: MeeshyTimelineFriseRecipe.tickWidth, height: height
            )
            context.fill(Path(mark), with: .color(recipe.tickColor(isMajor: tick.isMajor, isDark: isDark)))
            guard index < labels.count, let label = labels[index], !label.isEmpty else { continue }
            var text = context.resolve(Text(label).font(.system(size: labelSize, weight: .semibold).monospacedDigit()))
            text.shading = .color(recipe.labelColor(isDark: isDark))
            let measure = text.measure(in: size)
            let centre = min(max(measure.width / 2, x), size.width - measure.width / 2)
            context.draw(text, at: CGPoint(x: centre, y: measure.height / 2), anchor: .center)
        }
        drawScrollBar(in: context, size: size)
    }

    private func drawScrollBar(in context: GraphicsContext, size: CGSize) {
        guard recipe.isZoomed, duration > 0 else { return }
        let bar = CGRect(
            x: CGFloat(viewport.start / duration) * size.width,
            y: size.height - MeeshyTimelineFriseRecipe.scrollBarHeight,
            width: max(MeeshyTimelineFriseRecipe.scrollBarMinimumWidth, CGFloat(viewport.span / duration) * size.width),
            height: MeeshyTimelineFriseRecipe.scrollBarHeight
        )
        context.fill(Path(roundedRect: bar, cornerRadius: bar.height / 2), with: .color(recipe.scrollBarColor(isDark: isDark)))
    }
}

/// Le décor d'une barre : l'anneau, le liseré sombre et le halo d'une piste
/// choisie. Le contenu de l'hôte est dessous, rogné par la même forme.
struct MeeshyTimelineFriseBarChrome: View, Equatable {
    let isSelected: Bool
    let recipe: MeeshyTimelineFriseRecipe

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: MeeshyTimelineFriseRecipe.radius, style: .continuous)
        shape
            .strokeBorder(recipe.markColor, lineWidth: MeeshyTimelineFriseRecipe.ringWidth)
            .overlay { shape.stroke(recipe.edgeColor, lineWidth: MeeshyTimelineFriseRecipe.edgeWidth) }
            .shadow(color: recipe.haloColor, radius: MeeshyTimelineFriseRecipe.haloRadius)
            .opacity(isSelected ? 1 : 0)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

/// Une poignée : un trait blanc de 10 dans le bout de la barre, à liseré
/// sombre. Le geste et la cible de 44 viennent de la rangée.
struct MeeshyTimelineFriseHandleShape: View, Equatable {
    let height: CGFloat
    let recipe: MeeshyTimelineFriseRecipe
    let showsFocusRing: Bool
    let isDark: Bool

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: MeeshyTimelineFriseRecipe.handleWidth / 2, style: .continuous)
        shape
            .fill(recipe.markColor)
            .overlay { shape.strokeBorder(recipe.edgeColor, lineWidth: MeeshyTimelineFriseRecipe.edgeWidth) }
            .overlay {
                if showsFocusRing {
                    shape.stroke(recipe.focusColor(isDark: isDark), lineWidth: MeeshyTimelineFriseRecipe.focusRingWidth)
                        .padding(-MeeshyTimelineFriseRecipe.focusRingWidth)
                }
            }
            .frame(width: MeeshyTimelineFriseRecipe.handleWidth, height: height)
            .accessibilityHidden(true)
    }
}

/// Une image clé : le losange de l'atelier (`SmallDiamond`), blanc à bord sombre.
struct MeeshyTimelineFriseKeyMark: View, Equatable {
    let recipe: MeeshyTimelineFriseRecipe

    var body: some View {
        SmallDiamond()
            .fill(recipe.markColor)
            .overlay { SmallDiamond().stroke(recipe.edgeColor, lineWidth: MeeshyTimelineFriseRecipe.keyframeBorder) }
            .frame(width: MeeshyTimelineFriseRecipe.keyframeSize, height: MeeshyTimelineFriseRecipe.keyframeSize)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

/// La ligne d'accroche : le pointillé de `SnapGuideView`, reteint au jaune de
/// la coupe (à l'encre du thème sur une feuille claire), sur toute la hauteur.
struct MeeshyTimelineFriseSnapLine: View, Equatable {
    let height: CGFloat
    let recipe: MeeshyTimelineFriseRecipe
    let isDark: Bool

    var body: some View {
        Path { path in
            path.move(to: CGPoint(x: MeeshyTimelineFriseRecipe.snapLineWidth / 2, y: 0))
            path.addLine(to: CGPoint(x: MeeshyTimelineFriseRecipe.snapLineWidth / 2, y: height))
        }
        .stroke(
            recipe.snapLineColor(isDark: isDark),
            style: StrokeStyle(lineWidth: MeeshyTimelineFriseRecipe.snapLineWidth, dash: MeeshyTimelineFriseRecipe.snapDash)
        )
        .frame(width: MeeshyTimelineFriseRecipe.snapLineWidth, height: height)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// « aimanté · 9,0 s » : le texte de l'hôte sur une capsule jaune, encre sombre.
struct MeeshyTimelineFriseSnapLabel: View, Equatable {
    let text: String
    let recipe: MeeshyTimelineFriseRecipe

    var body: some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .heavy).monospacedDigit())
            .foregroundStyle(recipe.snapLabelInk)
            .lineLimit(1)
            .padding(.horizontal, MeeshySpacing.xsPlus)
            .padding(.vertical, MeeshySpacing.xxs)
            .background(Capsule().fill(recipe.snapLabelFill))
            .fixedSize()
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

/// La tête : un trait blanc de 2 qui déborde, coiffé d'un losange de 14, à
/// halo et liseré sombre. Jamais une cible : c'est la règle qui se touche.
struct MeeshyTimelineFrisePlayheadShape: View, Equatable {
    let height: CGFloat
    let recipe: MeeshyTimelineFriseRecipe

    var body: some View {
        VStack(spacing: -MeeshyTimelineFriseRecipe.playheadCap / 2) {
            SmallDiamond()
                .fill(recipe.markColor)
                .overlay { SmallDiamond().stroke(recipe.edgeColor, lineWidth: MeeshyTimelineFriseRecipe.edgeWidth) }
                .frame(width: MeeshyTimelineFriseRecipe.playheadCap, height: MeeshyTimelineFriseRecipe.playheadCap)
                .zIndex(1)
            Rectangle()
                .fill(recipe.markColor)
                .frame(width: MeeshyTimelineFriseRecipe.playheadWidth)
                .overlay { Rectangle().stroke(recipe.edgeColor, lineWidth: MeeshyTimelineFriseRecipe.edgeWidth / 2) }
        }
        .frame(width: MeeshyTimelineFriseRecipe.playheadCap, height: height)
        .shadow(color: recipe.playheadHaloColor, radius: MeeshyTimelineFriseRecipe.playheadHaloRadius)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// L'invite muette « Pincer pour zoomer » : une puce de 34, en haut à droite.
struct MeeshyTimelineFriseZoomHint: View, Equatable {
    let text: String
    let recipe: MeeshyTimelineFriseRecipe
    let isDark: Bool

    var body: some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
            .foregroundStyle(recipe.labelColor(isDark: isDark))
            .lineLimit(1)
            .padding(.horizontal, MeeshySpacing.smPlus)
            .frame(minHeight: MeeshyTimelineFriseRecipe.hintHeight)
            .background(Capsule().fill(recipe.hintFill))
            .accessibilityHidden(true)
    }
}

/// **Le contenu de l'hôte, figé pendant un geste.** Sa clé est la piste, pas
/// la fenêtre en cours : tant qu'un doigt glisse, pince ou tire, il n'est
/// jamais réévalué (la barre change de place et de largeur, pas son contenu) ;
/// au repos, il suit l'hôte.
struct MeeshyTimelineFriseBarContent<Content: View>: View, Equatable {
    let track: MeeshyTimelineFriseTrack
    let isFrozen: Bool
    let content: (MeeshyTimelineFriseTrack) -> Content

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.isFrozen && rhs.isFrozen && lhs.track == rhs.track
    }

    var body: some View {
        content(track).accessibilityHidden(true)
    }
}
