import SwiftUI

/// **La bannière vivante (K27)** : un dégradé tiré d'une seule teinte, deux orbes
/// qui flottent, une parallaxe à l'inclinaison, un fondu vers le fond de l'écran,
/// et trois emplacements (haut début, haut fin, bas). Un décor, jamais un écran.
///
/// Agnostique : une teinte, une image DÉJÀ chargée, des emplacements. Elle ne sait
/// ni réglages, ni niveau, ni rang, ne charge rien et ne demande aucune permission.
/// Dégradé, orbes et fondu se taisent pour le lecteur d'écran ; seuls les
/// emplacements parlent, dans l'ordre début, fin, bas.
public struct MeeshyLivingBanner<TopLeading: View, TopTrailing: View, Bottom: View>: View {
    private let tint: Color
    private let mode: MeeshyLivingBannerMode
    private let image: Image?
    private let height: Double
    private let motion: MeeshyLivingBannerMotion
    private let isMuted: Bool
    private let isLoading: Bool
    private let collapse: Double
    private let topLeading: TopLeading
    private let topTrailing: TopTrailing
    private let bottom: Bottom

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @StateObject private var tilt = MeeshyDeviceTilt()
    @State private var isVisible = false

    public init(tint: Color,
                mode: MeeshyLivingBannerMode = .banner,
                image: Image? = nil,
                height: Double = MeeshyLivingBannerHeight.hero,
                motion: MeeshyLivingBannerMotion = .on,
                isMuted: Bool = false,
                isLoading: Bool = false,
                collapse: Double = 0,
                @ViewBuilder topLeading: () -> TopLeading,
                @ViewBuilder topTrailing: () -> TopTrailing,
                @ViewBuilder bottom: () -> Bottom) {
        self.tint = tint
        self.mode = mode
        self.image = image
        self.height = height
        self.motion = motion
        self.isMuted = isMuted
        self.isLoading = isLoading
        self.collapse = collapse
        self.topLeading = topLeading()
        self.topTrailing = topTrailing()
        self.bottom = bottom()
    }

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    private var recipe: MeeshyLivingBannerRecipe {
        MeeshyLivingBannerRecipe.resolve(
            mode: mode, isDark: colorScheme == .dark, hasImage: image != nil, isMuted: isMuted,
            motion: motion, height: height, collapse: collapse, isVisible: isVisible,
            systemReduceMotion: reduceMotion
        )
    }

    public var body: some View {
        let recipe = self.recipe
        Group {
            if isLoading {
                MeeshySkeleton(shape: .card(aspect: MeeshyLivingBannerLayout.skeletonWidth / recipe.height, radius: 0))
                    .frame(maxWidth: .infinity)
            } else {
                banner(recipe: recipe)
            }
        }
        .onAppear { isVisible = true }
        .onDisappear {
            isVisible = false
            tilt.stop()
        }
        .adaptiveOnChange(of: recipe.usesSensor) { _, runs in
            if runs { tilt.start() } else { tilt.stop() }
        }
    }

    private func banner(recipe: MeeshyLivingBannerRecipe) -> some View {
        let base = MeeshyKitRGB(color: tint)
        let isDark = colorScheme == .dark
        let ground = MeeshyColors.backgroundPrimary(isDark: isDark)
        let shift = MeeshyLivingBannerRecipe.parallax(tiltDegrees: recipe.usesSensor ? tilt.degrees : 0)
        return ZStack {
            gradient(base: base, recipe: recipe, ground: ground)
            MeeshyLivingBannerOrbs(base: base, recipe: recipe, shift: shift, floats: recipe.floats,
                                   reduceMotion: reduceMotion)
            imageLayer(recipe: recipe)
            if recipe.showsFade {
                LinearGradient(colors: [ground.opacity(0), ground], startPoint: .top, endPoint: .bottom)
                    .frame(height: CGFloat(recipe.fadeHeight))
                    .opacity(recipe.fadeOpacity)
                    .frame(maxHeight: .infinity, alignment: .bottom)
            }
            slots
        }
        .frame(height: CGFloat(recipe.height))
        .saturation(recipe.isDesaturated ? 0 : 1)
        .clipped()
    }

    private func gradient(base: MeeshyKitRGB, recipe: MeeshyLivingBannerRecipe, ground: Color) -> some View {
        let stops = recipe.stopShares
        let colors: [Color] = [
            base.color.opacity(stops[0]),
            base.color.opacity(stops[1]),
            ground,
        ]
        return LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private func imageLayer(recipe: MeeshyLivingBannerRecipe) -> some View {
        if let image {
            ZStack {
                image.resizable().scaledToFill()
                Color.black.opacity(recipe.imageVeil)
            }
            .accessibilityHidden(true)
            .transition(.opacity)
        }
    }

    private var slots: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: MeeshySpacing.sm) {
                topLeading
                Spacer(minLength: MeeshySpacing.sm)
                topTrailing
            }
            .padding(.horizontal, MeeshySpacing.lg)
            Spacer(minLength: 0)
            HStack {
                Spacer(minLength: 0)
                bottom
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.bottom, MeeshyLivingBannerLayout.bottomInset)
        }
        .accessibilityElement(children: .contain)
    }
}

extension MeeshyLivingBanner where TopLeading == EmptyView, TopTrailing == EmptyView, Bottom == EmptyView {
    public init(tint: Color,
                mode: MeeshyLivingBannerMode = .banner,
                image: Image? = nil,
                height: Double = MeeshyLivingBannerHeight.hero,
                motion: MeeshyLivingBannerMotion = .on,
                isMuted: Bool = false,
                isLoading: Bool = false,
                collapse: Double = 0) {
        self.init(tint: tint, mode: mode, image: image, height: height, motion: motion, isMuted: isMuted,
                  isLoading: isLoading, collapse: collapse,
                  topLeading: { EmptyView() }, topTrailing: { EmptyView() }, bottom: { EmptyView() })
    }
}

/// Les mesures de placement : le bas se pose à 76 du bord, au-dessus du fondu.
enum MeeshyLivingBannerLayout {
    static let bottomInset: CGFloat = 76
    static let skeletonWidth: Double = 393
}

/// Les deux orbes : elles flottent à contretemps, 9 s par cycle, lues au dessin
/// par une seule horloge ; figées sous « réduire les animations » ou quand rien
/// ne doit bouger.
private struct MeeshyLivingBannerOrbs: View {
    let base: MeeshyKitRGB
    let recipe: MeeshyLivingBannerRecipe
    let shift: (near: Double, far: Double)
    let floats: Bool
    let reduceMotion: Bool

    var body: some View {
        TimelineView(.animation(minimumInterval: nil, paused: !floats || reduceMotion)) { context in
            let phase = floats && !reduceMotion
                ? context.date.timeIntervalSinceReferenceDate / MeeshyLivingBannerRecipe.floatPeriod
                : 0
            ZStack {
                orb(recipe.near, phase: phase, offset: shift.near, counter: false)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                if recipe.far.diameter > 0 {
                    orb(recipe.far, phase: phase, offset: shift.far, counter: true)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                }
            }
        }
        .drawingGroup()
        .accessibilityHidden(true)
    }

    private func orb(_ orb: MeeshyLivingBannerOrb, phase: Double, offset: Double, counter: Bool) -> some View {
        let wave = sin(phase * 2 * Double.pi + (counter ? Double.pi : 0))
        let half = (wave + 1) / 2
        let scale = 1 + (MeeshyLivingBannerRecipe.floatScale - 1) * half
        return Circle()
            .fill(base.hueShifted(by: orb.hueShift).color.opacity(orb.opacity))
            .frame(width: CGFloat(orb.diameter), height: CGFloat(orb.diameter))
            .scaleEffect(CGFloat(scale))
            .blur(radius: CGFloat(orb.blur))
            .offset(x: CGFloat(offset + wave * MeeshyLivingBannerRecipe.floatDriftX * (counter ? -1 : 1)),
                    y: CGFloat(wave * MeeshyLivingBannerRecipe.floatDriftY))
    }
}
