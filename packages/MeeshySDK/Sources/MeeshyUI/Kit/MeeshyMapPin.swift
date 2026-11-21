import SwiftUI

/// **Le disque de flou (K36)** : la zone où la personne se trouve, de rayon déjà
/// mesuré à l'écran. Sous 32 de rayon il n'est pas dessiné. Périmé : pointillé gris.
public struct MeeshyBlurDisc: View {
    private let radius: Double
    private let tint: Color
    private let isSelected: Bool
    private let isStale: Bool

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @State private var breathes = false

    public init(radius: Double, tint: Color = MeeshyColors.brandPrimary, isSelected: Bool = false, isStale: Bool = false) {
        self.radius = radius
        self.tint = tint
        self.isSelected = isSelected
        self.isStale = isStale
    }

    public var body: some View {
        let recipe = MeeshyMapPinRecipe.resolve(kind: .other, precision: .area(radius: radius), isLive: false,
                                                isSelected: isSelected, isStale: isStale, isPressed: false,
                                                reduceMotion: false)
        let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
        let color = isStale ? Color.gray : tint
        if recipe.showsDisc {
            Circle()
                .fill(color.opacity(recipe.discOpacity))
                .overlay(
                    Circle().strokeBorder(color, style: StrokeStyle(lineWidth: CGFloat(MeeshyMapPinRecipe.discBorderWidth),
                                                                    dash: recipe.discIsDashed ? [4, 3] : []))
                )
                .frame(width: CGFloat(recipe.discDiameter), height: CGFloat(recipe.discDiameter))
                .scaleEffect(breathes && !reduce ? 1 + CGFloat(MeeshyMapPinRecipe.discBreathAmplitude) : 1)
                .animation(reduce ? nil : .easeInOut(duration: MeeshyMapPinRecipe.discBreathSeconds / 2)
                    .repeatForever(autoreverses: true), value: breathes)
                .onAppear { breathes = true }
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }
}

/// **La grappe (K36)** : trois contenus recouverts dans une gélule, et le compte au
/// coin. À partir de 2 ; l'hôte dit « ils se touchent » et donne le compte.
public struct MeeshyPinCluster<Content: View>: View {
    private let label: String
    private let count: Int
    private let tint: Color
    private let onPress: (() -> Void)?
    private let content: (Int) -> Content

    @Environment(\.colorScheme) private var colorScheme

    public init(label: String,
                count: Int,
                tint: Color = MeeshyColors.brandPrimary,
                onPress: (() -> Void)? = nil,
                @ViewBuilder content: @escaping (Int) -> Content) {
        self.label = label
        self.count = count
        self.tint = tint
        self.onPress = onPress
        self.content = content
    }

    public var body: some View {
        if let text = MeeshyMapPinRecipe.clusterCountText(count) {
            let shown = MeeshyMapPinRecipe.clusterContentCount(count)
            let cell = CGFloat(MeeshyMapPinRecipe.clusterCellDiameter)
            let overlap = CGFloat(MeeshyMapPinRecipe.clusterOverlap)
            let isDark = colorScheme == .dark
            let ground = isDark ? Color.black : Color.white
            let capsule = HStack(spacing: -overlap) {
                ForEach(0..<shown, id: \.self) { index in
                    content(index)
                        .frame(width: cell, height: cell)
                        .clipShape(Circle())
                        .overlay(Circle().strokeBorder(ground, lineWidth: CGFloat(MeeshyMapPinRecipe.rimWidth)))
                        .zIndex(Double(shown - index))
                }
            }
            .padding(MeeshySpacing.xs)
            .background(Capsule().fill(ground))
            .overlay(alignment: .topTrailing) {
                Text(verbatim: text)
                    .meeshyScaledFont(MeeshyFont.smallSize, weight: .heavy)
                    .monospacedDigit()
                    .foregroundStyle(Color.white)
                    .frame(minWidth: 26, minHeight: 26)
                    .background(Capsule().fill(tint))
                    .offset(x: MeeshySpacing.xs, y: -MeeshySpacing.xs)
            }
            if let onPress {
                Button(action: onPress) { capsule }
                    .buttonStyle(.plain)
                    .frame(minWidth: CGFloat(MeeshyMapPinRecipe.minimumTarget), minHeight: CGFloat(MeeshyMapPinRecipe.minimumTarget))
                    .accessibilityLabel(label)
            } else {
                capsule
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(label)
                    .accessibilityAddTraits(.isImage)
            }
        }
    }
}

/// **L'épingle de personne (K36)** : un contenu rond (l'hôte y met un avatar, une
/// vignette, un glyphe) sous un liseré, avec son onde et sa pointe. Elle dessine
/// quelqu'un à un endroit, elle ne sait ni où ni qui : ni carte, ni coordonnée.
///
/// Les emplacements `badge`, `above` et `below` sont vides par défaut ; l'hôte
/// y pose le point de présence et ses étiquettes. Sans `onPress`, c'est une image
/// nommée, pas un bouton.
public struct MeeshyMapPin<Content: View, Badge: View, Above: View, Below: View>: View {
    private let label: String
    private let tint: Color
    private let kind: MeeshyMapPinKind
    private let precision: MeeshyMapPinPrecision
    private let isLive: Bool
    private let isSelected: Bool
    private let isStale: Bool
    private let caption: String?
    private let hint: String?
    private let onPress: (() -> Void)?
    private let content: Content
    private let badge: Badge
    private let above: Above
    private let below: Below

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @State private var waving = false
    @State private var hasAppeared = false

    public init(label: String,
                tint: Color = MeeshyColors.brandPrimary,
                kind: MeeshyMapPinKind = .other,
                precision: MeeshyMapPinPrecision = .exact,
                isLive: Bool = false,
                isSelected: Bool = false,
                isStale: Bool = false,
                caption: String? = nil,
                hint: String? = nil,
                onPress: (() -> Void)? = nil,
                @ViewBuilder content: () -> Content,
                @ViewBuilder badge: () -> Badge,
                @ViewBuilder above: () -> Above,
                @ViewBuilder below: () -> Below) {
        self.label = label
        self.tint = tint
        self.kind = kind
        self.precision = precision
        self.isLive = isLive
        self.isSelected = isSelected
        self.isStale = isStale
        self.caption = caption
        self.hint = hint
        self.onPress = onPress
        self.content = content()
        self.badge = badge()
        self.above = above()
        self.below = below()
    }

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    private func recipe(isPressed: Bool) -> MeeshyMapPinRecipe {
        MeeshyMapPinRecipe.resolve(kind: kind, precision: precision, isLive: isLive, isSelected: isSelected,
                                   isStale: isStale, isPressed: isPressed, reduceMotion: reduceMotion)
    }

    public var body: some View {
        let rest = recipe(isPressed: false)
        VStack(spacing: MeeshySpacing.xsPlus) {
            above
            Group {
                if let onPress {
                    Button(action: {
                        if !isSelected { HapticFeedback.light() }
                        onPress()
                    }) { EmptyView() }
                        .buttonStyle(MeeshyMapPinStyle { pressed in pin(recipe: recipe(isPressed: pressed)) })
                        .accessibilityLabel(label)
                        .accessibilityHint(hint ?? "")
                        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
                } else {
                    pin(recipe: rest)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(label)
                        .accessibilityAddTraits(.isImage)
                }
            }
            captionView
        }
        .zIndex(isSelected ? 1 : 0)
    }

    @ViewBuilder
    private var captionView: some View {
        if Below.self != EmptyView.self {
            below
        } else if let text = MeeshyMapPinRecipe.caption(caption), kind == .other {
            Text(verbatim: text)
                .meeshyScaledFont(MeeshyFont.footnoteSize, weight: .bold)
                .lineLimit(1)
                .padding(.horizontal, MeeshySpacing.smPlus)
                .frame(height: 22)
                .background(Capsule().fill(.ultraThinMaterial))
        }
    }

    private func pin(recipe: MeeshyMapPinRecipe) -> some View {
        let diameter = CGFloat(recipe.contentDiameter)
        let ground = colorScheme == .dark ? Color.black : Color.white
        let rim = recipe.tipIsWhite || kind == .own ? Color.white : ground
        return ZStack {
            if kind == .other && precision.radius > 0 {
                MeeshyBlurDisc(radius: precision.radius, tint: tint, isSelected: isSelected, isStale: isStale)
            }
            if recipe.showsWave { wave(recipe: recipe, diameter: diameter) }
            ZStack {
                if kind == .ghost {
                    Circle().strokeBorder(Color.secondary, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                } else {
                    content.clipShape(Circle())
                }
            }
            .frame(width: diameter, height: diameter)
            .saturation(recipe.isGrayed ? 0 : 1)
            .opacity(recipe.isGrayed ? MeeshyOpacity.heavy : 1)
            .overlay(Circle().strokeBorder(rim, lineWidth: CGFloat(recipe.rimWidth)))
            .overlay(selectionRing(recipe: recipe, diameter: diameter))
            .shadow(color: Color.black.opacity(0.55), radius: 12, x: 0, y: 10)
            .overlay(alignment: .bottomTrailing) { badge.offset(x: 2, y: 2) }
            .overlay(alignment: .bottom) { tip(recipe: recipe, rim: rim) }
        }
        .frame(minWidth: CGFloat(recipe.hitTarget), minHeight: CGFloat(recipe.hitTarget))
        .scaleEffect(CGFloat(recipe.pressScale) * (hasAppeared || reduceMotion ? 1 : 0.6))
        .opacity(hasAppeared || reduceMotion ? 1 : 0)
        .animation(MeeshyMapPinRecipe.morphAnimation(reduce: reduceMotion), value: isSelected)
        .animation(MeeshyMapPinRecipe.appearAnimation(reduce: reduceMotion), value: hasAppeared)
        .onAppear {
            hasAppeared = true
            waving = true
        }
    }

    @ViewBuilder
    private func selectionRing(recipe: MeeshyMapPinRecipe, diameter: CGFloat) -> some View {
        if recipe.showsSelectionRing {
            Circle().strokeBorder(tint, lineWidth: 3).padding(-5)
        }
    }

    @ViewBuilder
    private func tip(recipe: MeeshyMapPinRecipe, rim: Color) -> some View {
        if recipe.showsTip {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(recipe.tipIsWhite ? Color.white : rim)
                .frame(width: CGFloat(MeeshyMapPinRecipe.tipSide), height: CGFloat(MeeshyMapPinRecipe.tipSide))
                .rotationEffect(.degrees(45))
                .offset(y: CGFloat(MeeshyMapPinRecipe.tipSide) / 2)
                .zIndex(-1)
        }
    }

    private func wave(recipe: MeeshyMapPinRecipe, diameter: CGFloat) -> some View {
        let ring = diameter + CGFloat(MeeshyMapPinRecipe.waveInset) * 2
        let stopped = reduceMotion
        return Circle()
            .strokeBorder(tint, lineWidth: CGFloat(MeeshyMapPinRecipe.waveRingWidth))
            .frame(width: ring, height: ring)
            .scaleEffect(stopped ? 1 : (waving ? CGFloat(MeeshyMapPinRecipe.waveScaleTo) : CGFloat(MeeshyMapPinRecipe.waveScaleFrom)))
            .opacity(stopped ? 1 : (waving ? 0 : 1))
            .animation(stopped ? nil : .easeOut(duration: MeeshyMapPinRecipe.waveSeconds).repeatForever(autoreverses: false),
                       value: waving)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

private struct MeeshyMapPinStyle<Content: View>: ButtonStyle {
    let build: (Bool) -> Content

    init(@ViewBuilder build: @escaping (Bool) -> Content) {
        self.build = build
    }

    func makeBody(configuration: Configuration) -> some View {
        build(configuration.isPressed)
    }
}

extension MeeshyMapPin where Badge == EmptyView, Above == EmptyView, Below == EmptyView {
    public init(label: String,
                tint: Color = MeeshyColors.brandPrimary,
                kind: MeeshyMapPinKind = .other,
                precision: MeeshyMapPinPrecision = .exact,
                isLive: Bool = false,
                isSelected: Bool = false,
                isStale: Bool = false,
                caption: String? = nil,
                hint: String? = nil,
                onPress: (() -> Void)? = nil,
                @ViewBuilder content: () -> Content) {
        self.init(label: label, tint: tint, kind: kind, precision: precision, isLive: isLive,
                  isSelected: isSelected, isStale: isStale, caption: caption, hint: hint, onPress: onPress,
                  content: content, badge: { EmptyView() }, above: { EmptyView() }, below: { EmptyView() })
    }
}
