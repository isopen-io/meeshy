import SwiftUI

// MARK: - Une référence (donnée immuable, l'action reste à l'hôte)

/// Une référence de la ligne : son texte, son nom dit, et son action propre
/// (une référence ouvre sa feuille, la ligne ne fait rien d'elle-même).
/// `==` compare les valeurs ; l'action n'y compte que par sa présence.
public struct MeeshyContextReference: Equatable, Identifiable {
    public let id: String
    public let text: String
    public let spokenLabel: String
    public let systemImage: String?
    public let hint: String?
    public let action: (() -> Void)?

    public init(
        id: String,
        text: String,
        spokenLabel: String,
        systemImage: String? = nil,
        hint: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.id = id
        self.text = text
        self.spokenLabel = spokenLabel
        self.systemImage = systemImage
        self.hint = hint
        self.action = action
    }

    public static func == (lhs: MeeshyContextReference, rhs: MeeshyContextReference) -> Bool {
        lhs.id == rhs.id && lhs.text == rhs.text && lhs.spokenLabel == rhs.spokenLabel
            && lhs.systemImage == rhs.systemImage && lhs.hint == rhs.hint
            && (lhs.action == nil) == (rhs.action == nil)
    }
}

/// L'emplacement `leading` vide : le glyphe de l'élément s'y dessine.
public struct MeeshyContextNoLeading: View, Equatable {
    public init() {}

    public var body: some View {
        EmptyView()
    }
}

// MARK: - La cible, le toucher, l'appui long : un seul site (fiche § 4)

/// La cible tactile de 44 pt, obtenue par débord du côté opposé au contenu.
nonisolated struct MeeshyContextHitShape: Shape {
    let edge: MeeshyContextHitEdge

    func path(in rect: CGRect) -> Path {
        Path(MeeshyContextLinesRule.hitRect(rect, edge: edge, minimum: MeeshyContextLinesRecipe.minimumTarget))
    }
}

/// Le style d'un élément touchable de K24 : une ligne passe à 70 % à l'appui
/// et à 85 % au survol, sans échelle ; la puce prend la réponse de K01 (l'appui
/// est posé dans l'environnement du libellé, où le verre dessiné le lit).
/// Un nouvel appui rend à l'appui long son drapeau.
struct MeeshyContextPressStyle: ButtonStyle {
    let fades: Bool
    let longPressFired: Binding<Bool>

    func makeBody(configuration: Configuration) -> some View {
        MeeshyContextPressLabel(isPressed: configuration.isPressed, fades: fades, longPressFired: longPressFired) {
            configuration.label
        }
    }
}

private struct MeeshyContextPressLabel<Content: View>: View {
    let isPressed: Bool
    let fades: Bool
    let longPressFired: Binding<Bool>
    @ViewBuilder let content: () -> Content

    @State private var isHovered = false

    var body: some View {
        content()
            .environment(\.meeshyGlassIsPressed, isPressed)
            .opacity(fades ? MeeshyContextLinesRule.lineOpacity(isPressed: isPressed, isHovered: isHovered) : 1)
            .meeshyAnimation(.easeOut(duration: MeeshyContextLinesRecipe.fadeDuration), value: isPressed)
            .onHover { isHovered = fades && $0 }
            .adaptiveOnChange(of: isPressed) { _, pressed in
                if pressed, longPressFired.wrappedValue { longPressFired.wrappedValue = false }
            }
    }
}

/// Le geste d'un élément de K24 : le toucher part une fois, au relâcher, avec
/// le retour du site unique de K02 ; l'appui long (s'il existe) avale le
/// relâcher qui le suit et s'offre au lecteur d'écran sous son nom.
struct MeeshyContextGesture: ViewModifier {
    let label: String
    let hint: String?
    let haptic: MeeshyContextHaptic
    let fades: Bool
    let longPressLabel: String?
    let action: (() -> Void)?
    let onLongPress: (() -> Void)?

    @Environment(\.isEnabled) private var isEnabled
    @State private var longPressFired = false

    @ViewBuilder
    func body(content: Content) -> some View {
        if let action {
            Button { activate(action) } label: { content }
                .buttonStyle(MeeshyContextPressStyle(fades: fades, longPressFired: $longPressFired))
                .modifier(MeeshyGlassLongPress(isOn: onLongPress != nil, perform: fireLongPress))
                .accessibilityLabel(label)
                .accessibilityHint(hint ?? "")
                .modifier(MeeshyGlassLongPressAction(name: longPressName, perform: namedLongPress))
        } else {
            content
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(label)
                .modifier(MeeshyGlassLongPress(isOn: onLongPress != nil, perform: fireLongPress))
                .modifier(MeeshyGlassLongPressAction(name: longPressName, perform: namedLongPress))
        }
    }

    private var longPressName: String {
        MeeshyGlassButtonAccessibilityState.longPressActionName(longPressLabel: longPressLabel, label: label)
    }

    private func activate(_ action: () -> Void) {
        guard !longPressFired else {
            longPressFired = false
            return
        }
        MeeshyGlassButtonTrigger.perform(isEnabled: isEnabled, haptic: haptic.glassHaptic, action: action)
    }

    private var namedLongPress: (() -> Void)? {
        guard let onLongPress else { return nil }
        return { _ = MeeshyGlassButtonTrigger.perform(isEnabled: isEnabled, haptic: haptic.glassHaptic, action: onLongPress) }
    }

    private func fireLongPress() {
        guard let onLongPress, isEnabled else { return }
        longPressFired = action != nil
        MeeshyGlassButtonTrigger.perform(isEnabled: isEnabled, haptic: haptic.glassHaptic, action: onLongPress)
    }
}

// MARK: - L'onde

/// L'onde : 18 barres au pas de 4, calculées une fois par relevé (à l'init de
/// la ligne) et dessinées en une passe. Fixe, jamais animée.
struct MeeshyContextWave: View, Equatable {
    let bars: [Double]
    let ink: Color

    var body: some View {
        let bars = self.bars
        let ink = self.ink
        return Canvas { context, size in
            let width = MeeshyContextLinesRecipe.waveBarWidth
            let pitch = MeeshyContextLinesRecipe.waveBarPitch
            let path = bars.enumerated().reduce(into: Path()) { path, bar in
                let height = size.height * CGFloat(bar.element)
                let rect = CGRect(x: CGFloat(bar.offset) * pitch, y: (size.height - height) / 2, width: width, height: height)
                path.addRoundedRect(in: rect, cornerSize: CGSize(width: width / 2, height: width / 2))
            }
            context.fill(path, with: .color(ink))
        }
        .frame(width: MeeshyContextLinesRecipe.waveSize.width, height: MeeshyContextLinesRecipe.waveSize.height)
        .accessibilityHidden(true)
    }
}

// MARK: - Ligne de son

/// Les VALEURS de la ligne de son : ce que `==` compare.
struct MeeshyContextSoundSpec: Equatable {
    let label: String
    let title: String?
    let bars: [Double]?
    let detail: String?
    let systemImage: String
    let hint: String?
    let alignment: MeeshyContextAlignment
    let surface: MeeshyContextSurface
    let tint: Color?
    let haptic: MeeshyContextHaptic
    let longPressLabel: String?
    let hasAction: Bool
    let hasLongPress: Bool
    let hasContent: Bool
}

/// La ligne de son : note (ou `leading`), « titre · auteur », onde, durée. Un
/// seul élément d'accessibilité ; l'hôte la pose au-dessus du contenu. Le
/// titre cède la largeur, la durée jamais. `Equatable` sur les valeurs.
public struct MeeshyContextSoundLine<Leading: View>: View {
    private let spec: MeeshyContextSoundSpec
    private let leading: Leading?
    private let action: (() -> Void)?
    private let onLongPress: (() -> Void)?

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.isEnabled) private var isEnabled

    init(spec: MeeshyContextSoundSpec, leading: Leading?, action: (() -> Void)?, onLongPress: (() -> Void)?) {
        assert(!spec.label.isEmpty, "MeeshyContextSoundLine : le nom accessible est obligatoire")
        self.spec = spec
        self.leading = leading
        self.action = action
        self.onLongPress = onLongPress
    }

    public var body: some View {
        if spec.hasContent {
            line
                .modifier(MeeshyContextGesture(
                    label: spec.label, hint: spec.hint, haptic: spec.haptic, fades: true,
                    longPressLabel: spec.longPressLabel, action: action, onLongPress: onLongPress
                ))
                .opacity(isEnabled ? 1 : MeeshyContextLinesRecipe.disabledOpacity)
                .dynamicTypeSize(...MeeshyContextLinesRecipe.maxDynamicTypeSize)
                .frame(maxWidth: .infinity, alignment: spec.alignment == .center ? .center : .leading)
        }
    }

    private var line: some View {
        HStack(spacing: MeeshySpacing.sm) {
            glyph
            if let title = spec.title {
                Text(title).lineLimit(1).truncationMode(.tail)
            }
            if let bars = spec.bars {
                MeeshyContextWave(bars: bars, ink: waveInk).equatable()
            }
            if let detail = spec.detail {
                Text(detail).monospacedDigit().fixedSize().layoutPriority(1)
            }
        }
        .font(MeeshyFont.relative(MeeshyContextLinesRecipe.soundTextSize, weight: .semibold))
        .foregroundStyle(textInk)
        .contentShape(MeeshyContextHitShape(edge: .top))
    }

    @ViewBuilder
    private var glyph: some View {
        if let leading {
            leading.accessibilityHidden(true)
        } else {
            Image(systemName: spec.systemImage)
                .font(MeeshyFont.relative(MeeshyContextLinesRecipe.noteSize, weight: .semibold))
                .accessibilityHidden(true)
        }
    }

    private var baseInk: Color {
        if let tint = spec.tint { return tint }
        return spec.surface == .media ? MeeshyColors.onMedia : MeeshyColors.textPrimary(isDark: colorScheme == .dark)
    }

    private var textInk: Color {
        if spec.tint == nil, spec.surface == .media { return MeeshyColors.onMediaSecondary }
        return baseInk.opacity(MeeshyContextLinesRecipe.textOpacity)
    }

    private var waveInk: Color {
        if spec.tint == nil, spec.surface == .media { return MeeshyColors.onMediaMuted }
        return baseInk.opacity(MeeshyContextLinesRecipe.waveOpacity)
    }
}

public extension MeeshyContextSoundLine where Leading == MeeshyContextNoLeading {
    init(
        label: String,
        title: String = "",
        levels: [Float]? = nil,
        detail: String? = nil,
        systemImage: String = "music.note",
        hint: String? = nil,
        alignment: MeeshyContextAlignment = .center,
        surface: MeeshyContextSurface = .media,
        tint: Color? = nil,
        haptic: MeeshyContextHaptic = .light,
        onLongPress: (() -> Void)? = nil,
        longPressLabel: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.init(
            spec: .make(label: label, title: title, levels: levels, detail: detail, systemImage: systemImage,
                        hint: hint, alignment: alignment, surface: surface, tint: tint, haptic: haptic,
                        longPressLabel: longPressLabel, hasAction: action != nil, hasLongPress: onLongPress != nil),
            leading: nil, action: action, onLongPress: onLongPress
        )
    }
}

public extension MeeshyContextSoundLine {
    /// `leading` remplace la note (point rouge, émoji, drapeau).
    init(
        label: String,
        title: String = "",
        levels: [Float]? = nil,
        detail: String? = nil,
        hint: String? = nil,
        alignment: MeeshyContextAlignment = .center,
        surface: MeeshyContextSurface = .media,
        tint: Color? = nil,
        haptic: MeeshyContextHaptic = .light,
        onLongPress: (() -> Void)? = nil,
        longPressLabel: String? = nil,
        action: (() -> Void)? = nil,
        @ViewBuilder leading: () -> Leading
    ) {
        self.init(
            spec: .make(label: label, title: title, levels: levels, detail: detail, systemImage: "music.note",
                        hint: hint, alignment: alignment, surface: surface, tint: tint, haptic: haptic,
                        longPressLabel: longPressLabel, hasAction: action != nil, hasLongPress: onLongPress != nil),
            leading: leading(), action: action, onLongPress: onLongPress
        )
    }
}

extension MeeshyContextSoundSpec {
    static func make(
        label: String, title: String, levels: [Float]?, detail: String?, systemImage: String, hint: String?,
        alignment: MeeshyContextAlignment, surface: MeeshyContextSurface, tint: Color?, haptic: MeeshyContextHaptic,
        longPressLabel: String?, hasAction: Bool, hasLongPress: Bool
    ) -> MeeshyContextSoundSpec {
        MeeshyContextSoundSpec(
            label: label,
            title: MeeshyContextLinesRule.visibleText(title),
            bars: levels.map { MeeshyContextWaveRule.bars(levels: $0, count: MeeshyContextLinesRecipe.barCount) },
            detail: MeeshyContextLinesRule.visibleText(detail),
            systemImage: systemImage, hint: hint, alignment: alignment, surface: surface, tint: tint,
            haptic: haptic, longPressLabel: longPressLabel, hasAction: hasAction, hasLongPress: hasLongPress,
            hasContent: MeeshyContextLinesRule.soundLineHasContent(title: title, levels: levels, detail: detail)
        )
    }
}

extension MeeshyContextSoundLine: Equatable where Leading: Equatable {
    public static func == (lhs: MeeshyContextSoundLine, rhs: MeeshyContextSoundLine) -> Bool {
        lhs.spec == rhs.spec && lhs.leading == rhs.leading
    }
}
