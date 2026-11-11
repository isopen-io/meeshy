import SwiftUI

// MARK: - Les emplacements

/// Le glyphe d'un symbole système : une valeur, donc comparable.
public struct MeeshyGlassButtonSymbol: View, Equatable {
    public let name: String

    public init(_ name: String) {
        self.name = name
    }

    public var body: some View {
        Image(systemName: name)
    }
}

/// L'emplacement de pastille vide.
public struct MeeshyGlassButtonNoBadge: View, Equatable {
    public init() {}

    public var body: some View {
        EmptyView()
    }
}

// MARK: - Le disque

/// **Ce qu'on VOIT d'un bouton rond de verre** (K02) : le glyphe, son fond plein
/// éventuel (blanc, rouge, voile doux) et le verre de K01, interactif. C'est
/// aussi le libellé d'un `Menu` qui s'habille comme un bouton.
///
/// Atome opaque : ni action, ni nom accessible, ni haptique, ni légende. Une
/// unité « disque + légende » se compose côté app autour de ce disque. Le
/// glyphe garde sa taille quel que soit le Dynamic Type.
public struct MeeshyGlassButtonFace<Glyph: View, Badge: View>: View {
    private let kind: MeeshyGlassButtonKind
    private let size: MeeshyGlassButtonSize
    private let tone: MeeshyGlassTone?
    private let tint: Color?
    private let glyphTint: Color?
    private let isPressed: Bool?
    private let glyph: Glyph
    private let badge: Badge

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.meeshyGlassTone) private var hostTone
    @Environment(\.meeshyGlassIsPressed) private var styledPressed
    @Environment(\.meeshyGlassIsNested) private var isNested
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    #if DEBUG
    @Environment(\.meeshyGlassForcesDrawn) private var forcesDrawn
    @Environment(\.meeshyGlassForcesOpaque) private var forcesOpaque
    #endif
    @State private var isHovered = false

    init(
        kind: MeeshyGlassButtonKind,
        size: MeeshyGlassButtonSize,
        tone: MeeshyGlassTone?,
        tint: Color?,
        glyphTint: Color?,
        isPressed: Bool?,
        glyph: Glyph,
        badge: Badge
    ) {
        self.kind = kind
        self.size = size
        self.tone = tone
        self.tint = tint
        self.glyphTint = glyphTint
        self.isPressed = isPressed
        self.glyph = glyph
        self.badge = badge
    }

    public var body: some View {
        let recipe = self.recipe
        let isDark = colorScheme == .dark
        return glyph
            .font(recipe.glyphFont)
            .foregroundStyle(recipe.inkColor(isDark: isDark))
            .meeshyAnimation(.easeInOut(duration: MeeshyGlassButtonRecipe.toneFadeDuration), value: recipe.kind)
            .accessibilityHidden(true)
            .frame(width: recipe.diameter, height: recipe.diameter)
            .background { MeeshyGlassButtonFillLayer(recipe: recipe, isDark: isDark) }
            .modifier(MeeshyGlassButtonGlassLayer(request: recipe.glass, tone: tone, tint: tint, isPressed: isPressed))
            .meeshyAnimation(.easeInOut(duration: MeeshyGlassButtonRecipe.toneFadeDuration), value: recipe.kind)
            .onHover { isHovered = $0 }
            .overlay(alignment: .topTrailing) { badge.accessibilityHidden(true) }
            .opacity(recipe.opacity)
    }

    private var recipe: MeeshyGlassButtonRecipe {
        MeeshyGlassButtonRecipe.resolve(
            kind: kind,
            size: size,
            tone: tone ?? hostTone,
            material: material,
            isNested: isNested,
            isPressed: isPressed ?? styledPressed,
            isHovered: isHovered,
            isEnabled: isEnabled,
            glyphTint: glyphTint
        )
    }

    private var material: MeeshyGlassMaterial {
        MeeshyGlassMaterial.resolve(
            isLiquidAvailable: Platform.isIOS26OrLater,
            reduceTransparency: reduceTransparency,
            forcesDrawn: forcesDrawnInDebug,
            forcesOpaque: forcesOpaqueInDebug
        )
    }

    private var forcesDrawnInDebug: Bool {
        #if DEBUG
        return forcesDrawn || MeeshyGlassDebug.launchForcesDrawn
        #else
        return false
        #endif
    }

    private var forcesOpaqueInDebug: Bool {
        #if DEBUG
        return forcesOpaque
        #else
        return false
        #endif
    }
}

public extension MeeshyGlassButtonFace where Badge == MeeshyGlassButtonNoBadge {
    init(
        kind: MeeshyGlassButtonKind = .normal,
        size: MeeshyGlassButtonSize = .s44,
        tone: MeeshyGlassTone? = nil,
        tint: Color? = nil,
        glyphTint: Color? = nil,
        isPressed: Bool? = nil,
        @ViewBuilder glyph: () -> Glyph
    ) {
        self.init(
            kind: kind, size: size, tone: tone, tint: tint, glyphTint: glyphTint,
            isPressed: isPressed, glyph: glyph(), badge: MeeshyGlassButtonNoBadge()
        )
    }
}

public extension MeeshyGlassButtonFace where Glyph == MeeshyGlassButtonSymbol, Badge == MeeshyGlassButtonNoBadge {
    init(
        systemImage: String,
        kind: MeeshyGlassButtonKind = .normal,
        size: MeeshyGlassButtonSize = .s44,
        tone: MeeshyGlassTone? = nil,
        tint: Color? = nil,
        glyphTint: Color? = nil,
        isPressed: Bool? = nil
    ) {
        self.init(
            kind: kind, size: size, tone: tone, tint: tint, glyphTint: glyphTint,
            isPressed: isPressed, glyph: MeeshyGlassButtonSymbol(systemImage), badge: MeeshyGlassButtonNoBadge()
        )
    }
}

public extension MeeshyGlassButtonFace {
    /// La pastille du coin haut de fin, muette pour le lecteur d'écran : son
    /// sens passe par la valeur du bouton.
    func glassBadge<B: View>(@ViewBuilder _ content: () -> B) -> MeeshyGlassButtonFace<Glyph, B> {
        MeeshyGlassButtonFace<Glyph, B>(
            kind: kind, size: size, tone: tone, tint: tint, glyphTint: glyphTint,
            isPressed: isPressed, glyph: glyph, badge: content()
        )
    }
}

extension MeeshyGlassButtonFace: Equatable where Glyph: Equatable, Badge: Equatable {
    public static func == (lhs: MeeshyGlassButtonFace, rhs: MeeshyGlassButtonFace) -> Bool {
        lhs.kind == rhs.kind && lhs.size == rhs.size && lhs.tone == rhs.tone && lhs.tint == rhs.tint
            && lhs.glyphTint == rhs.glyphTint && lhs.isPressed == rhs.isPressed
            && lhs.glyph == rhs.glyph && lhs.badge == rhs.badge
    }
}

// MARK: - Le fond plein

/// Le fond plein du disque : blanc de l'actif, rouge du destructif, voile doux,
/// plus le voile d'appui là où K01 ne pose pas de matière. Seul le fond s'anime
/// à un changement de tenue ; l'appui est immédiat et l'ombre de l'actif ne
/// bouge jamais.
private struct MeeshyGlassButtonFillLayer: View {
    let recipe: MeeshyGlassButtonRecipe
    let isDark: Bool

    var body: some View {
        Circle()
            .fill(recipe.fillColor(isDark: isDark).opacity(recipe.fillOpacity))
            .overlay { Circle().fill(MeeshyColors.onMedia.opacity(recipe.pressVeilOpacity)) }
            .meeshyAnimation(.easeInOut(duration: MeeshyGlassButtonRecipe.toneFadeDuration), value: recipe.kind)
            .shadow(color: shadowColor, radius: recipe.shadow?.radius ?? 0, x: 0, y: recipe.shadow?.y ?? 0)
            .animation(nil, value: recipe.kind)
    }

    private var shadowColor: Color {
        recipe.shadow.map { MeeshyColors.mediaBackdrop.opacity($0.opacity) } ?? .clear
    }
}

/// La demande faite à K01, l'unique entrée de verre : aucune quand le fond est
/// plein, un verre interactif sinon (teinté de rouge pour le destructif sous
/// Liquid Glass). Changer de demande change l'identité du disque : le fondu de
/// la tenue, posé AU-DESSUS de ce modificateur, en fait un fondu enchaîné.
private struct MeeshyGlassButtonGlassLayer: ViewModifier {
    let request: MeeshyGlassButtonGlassRequest
    let tone: MeeshyGlassTone?
    let tint: Color?
    let isPressed: Bool?

    @ViewBuilder
    func body(content: Content) -> some View {
        switch request {
        case .none:
            content
        case .neutral:
            content.meeshyGlass(in: Circle(), tone: tone, tint: tint, isInteractive: true, isPressed: isPressed)
        case .red:
            content.meeshyGlass(in: Circle(), tone: tone, tint: MeeshyColors.errorStrong, isInteractive: true, isPressed: isPressed)
        }
    }
}

// MARK: - L'activation

/// Ce qui se passe quand un bouton est activé : désactivé, rien ; sinon UN
/// impact (sauf `none`, quand l'hôte joue le sien), puis l'action. Une loi
/// pure, testée sans écran.
@MainActor
enum MeeshyGlassButtonTrigger {
    @discardableResult
    static func perform(
        isEnabled: Bool,
        haptic: MeeshyGlassButtonHaptic,
        play: @MainActor (MeeshyGlassButtonHaptic) -> Void = MeeshyGlassButtonTrigger.playSystemHaptic,
        action: () -> Void
    ) -> Bool {
        guard isEnabled else { return false }
        if haptic != .none { play(haptic) }
        action()
        return true
    }

    static func playSystemHaptic(_ haptic: MeeshyGlassButtonHaptic) {
        switch haptic {
        case .none: break
        case .light: HapticFeedback.light()
        }
    }
}

// MARK: - Le bouton

/// Les VALEURS d'un bouton : ce que `==` compare. Les fermetures n'en font pas
/// partie, l'hôte les garde stables.
struct MeeshyGlassButtonSpec: Equatable {
    let label: String
    let hint: String?
    let value: String?
    let kind: MeeshyGlassButtonKind
    let size: MeeshyGlassButtonSize
    let activation: MeeshyGlassButtonActivation
    let tone: MeeshyGlassTone?
    let tint: Color?
    let glyphTint: Color?
    let haptic: MeeshyGlassButtonHaptic
    let longPressLabel: String?
    let hasLongPress: Bool
    let hasPressChange: Bool
}

/// **Un bouton rond de verre** (K02) : le disque, son geste, son nom
/// accessible. Jamais de légende : le nom vit dans l'accessibilité.
///
/// - Toucher : l'action part au relâcher, la réponse visuelle est celle de K01.
/// - Appui long (si `onLongPress`) : 500 ms, annulé au-delà de 10 pt, sans
///   déclencher l'action ; le lecteur d'écran l'offre sous `longPressLabel`.
/// - Désactivé (`.disabled`) : ni action, ni haptique, ni appui.
/// - `activation` dit l'état (bascule, sélection, déplié) et en déduit la tenue
///   quand `kind` est absent.
/// - La cible tactile déborde le disque ; l'encombrement reste son diamètre.
///
/// `Equatable` sur les valeurs (fermetures hors comparaison) : un hôte qui se
/// re-rend à paramètres égaux ne re-rend pas le bouton.
public struct MeeshyGlassButton<Glyph: View, Badge: View>: View {
    private let spec: MeeshyGlassButtonSpec
    private let glyph: Glyph
    private let badge: Badge
    private let action: () -> Void
    private let onLongPress: (() -> Void)?
    private let onPressChange: ((Bool) -> Void)?

    @Environment(\.isEnabled) private var isEnabled
    @State private var longPressFired = false

    init(
        spec: MeeshyGlassButtonSpec,
        glyph: Glyph,
        badge: Badge,
        action: @escaping () -> Void,
        onLongPress: (() -> Void)?,
        onPressChange: ((Bool) -> Void)?
    ) {
        assert(!spec.label.isEmpty, "MeeshyGlassButton : le nom accessible est obligatoire et non vide")
        self.spec = spec
        self.glyph = glyph
        self.badge = badge
        self.action = action
        self.onLongPress = onLongPress
        self.onPressChange = onPressChange
    }

    public var body: some View {
        let state = MeeshyGlassButtonAccessibilityState.resolve(activation: spec.activation)
        return Button(action: activate) { face }
            .buttonStyle(MeeshyGlassButtonStyle(longPressFired: $longPressFired, onPressChange: onPressChange))
            .modifier(MeeshyGlassLongPress(isOn: onLongPress != nil, perform: fireLongPress))
            .accessibilityLabel(spec.label)
            .accessibilityHint(spec.hint ?? "")
            .accessibilityValue(MeeshyGlassButtonAccessibilityState.composeValue(
                toggleWord: state.toggleIsOn.map(MeeshyGlassButtonWords.toggle), value: spec.value
            ))
            .modifier(MeeshyGlassTraits(state: state))
            .modifier(MeeshyGlassLongPressAction(
                name: MeeshyGlassButtonAccessibilityState.longPressActionName(
                    longPressLabel: spec.longPressLabel, label: spec.label
                ),
                perform: onLongPress
            ))
            .accessibilityShowsLargeContentViewer {
                Label { Text(spec.label) } icon: { glyph }
            }
    }

    private var face: some View {
        MeeshyGlassButtonFace(
            kind: spec.kind, size: spec.size, tone: spec.tone, tint: spec.tint, glyphTint: spec.glyphTint,
            isPressed: nil, glyph: glyph, badge: badge
        )
        .contentShape(Rectangle().inset(by: -spec.size.hitSlack))
    }

    private func activate() {
        guard !longPressFired else {
            longPressFired = false
            return
        }
        MeeshyGlassButtonTrigger.perform(isEnabled: isEnabled, haptic: spec.haptic, action: action)
    }

    private func fireLongPress() {
        guard let onLongPress, isEnabled else { return }
        longPressFired = true
        MeeshyGlassButtonTrigger.perform(isEnabled: isEnabled, haptic: spec.haptic, action: onLongPress)
    }
}

// MARK: - Les inits

public extension MeeshyGlassButton where Glyph == MeeshyGlassButtonSymbol, Badge == MeeshyGlassButtonNoBadge {
    init(
        systemImage: String,
        label: String,
        hint: String? = nil,
        value: String? = nil,
        kind: MeeshyGlassButtonKind? = nil,
        size: MeeshyGlassButtonSize = .s44,
        activation: MeeshyGlassButtonActivation = .none,
        tone: MeeshyGlassTone? = nil,
        tint: Color? = nil,
        glyphTint: Color? = nil,
        haptic: MeeshyGlassButtonHaptic = .light,
        onPressChange: ((Bool) -> Void)? = nil,
        onLongPress: (() -> Void)? = nil,
        longPressLabel: String? = nil,
        action: @escaping () -> Void
    ) {
        self.init(
            spec: MeeshyGlassButtonSpec(
                label: label, hint: hint, value: value, kind: kind ?? activation.impliedKind, size: size,
                activation: activation, tone: tone, tint: tint, glyphTint: glyphTint, haptic: haptic,
                longPressLabel: longPressLabel, hasLongPress: onLongPress != nil, hasPressChange: onPressChange != nil
            ),
            glyph: MeeshyGlassButtonSymbol(systemImage), badge: MeeshyGlassButtonNoBadge(),
            action: action, onLongPress: onLongPress, onPressChange: onPressChange
        )
    }
}

public extension MeeshyGlassButton where Badge == MeeshyGlassButtonNoBadge {
    /// Le glyphe remplace l'icône (« Aa », pastille de couleur, drapeau) et
    /// reçoit l'encre. `action` se nomme : la fermeture finale est le glyphe.
    init(
        label: String,
        hint: String? = nil,
        value: String? = nil,
        kind: MeeshyGlassButtonKind? = nil,
        size: MeeshyGlassButtonSize = .s44,
        activation: MeeshyGlassButtonActivation = .none,
        tone: MeeshyGlassTone? = nil,
        tint: Color? = nil,
        glyphTint: Color? = nil,
        haptic: MeeshyGlassButtonHaptic = .light,
        onPressChange: ((Bool) -> Void)? = nil,
        onLongPress: (() -> Void)? = nil,
        longPressLabel: String? = nil,
        action: @escaping () -> Void,
        @ViewBuilder glyph: () -> Glyph
    ) {
        self.init(
            spec: MeeshyGlassButtonSpec(
                label: label, hint: hint, value: value, kind: kind ?? activation.impliedKind, size: size,
                activation: activation, tone: tone, tint: tint, glyphTint: glyphTint, haptic: haptic,
                longPressLabel: longPressLabel, hasLongPress: onLongPress != nil, hasPressChange: onPressChange != nil
            ),
            glyph: glyph(), badge: MeeshyGlassButtonNoBadge(),
            action: action, onLongPress: onLongPress, onPressChange: onPressChange
        )
    }
}

public extension MeeshyGlassButton {
    /// La pastille du coin haut de fin, muette pour le lecteur d'écran : son
    /// sens passe par `value`.
    func glassBadge<B: View>(@ViewBuilder _ content: () -> B) -> MeeshyGlassButton<Glyph, B> {
        MeeshyGlassButton<Glyph, B>(
            spec: spec, glyph: glyph, badge: content(),
            action: action, onLongPress: onLongPress, onPressChange: onPressChange
        )
    }
}

extension MeeshyGlassButton: Equatable where Glyph: Equatable, Badge: Equatable {
    public static func == (lhs: MeeshyGlassButton, rhs: MeeshyGlassButton) -> Bool {
        lhs.spec == rhs.spec && lhs.glyph == rhs.glyph && lhs.badge == rhs.badge
    }
}

// MARK: - L'appui

/// Le style du bouton : pose l'appui dans l'environnement du libellé (où K01 le
/// lit pour le verre dessiné), dit à l'hôte le doigt posé et levé, et rend à
/// l'appui long son drapeau. L'appui ne passe par aucun état de l'hôte.
private struct MeeshyGlassButtonStyle: ButtonStyle {
    let longPressFired: Binding<Bool>
    let onPressChange: ((Bool) -> Void)?

    func makeBody(configuration: Configuration) -> some View {
        MeeshyGlassPressLabel(
            isPressed: configuration.isPressed,
            longPressFired: longPressFired,
            onPressChange: onPressChange
        ) { configuration.label }
    }
}

private struct MeeshyGlassPressLabel<Content: View>: View {
    let isPressed: Bool
    let longPressFired: Binding<Bool>
    let onPressChange: ((Bool) -> Void)?
    @ViewBuilder let content: () -> Content

    var body: some View {
        content()
            .environment(\.meeshyGlassIsPressed, isPressed)
            .adaptiveOnChange(of: isPressed) { wasPressed, pressed in
                if pressed, longPressFired.wrappedValue { longPressFired.wrappedValue = false }
                if let report = MeeshyGlassPressReport.report(from: wasPressed, to: pressed) { onPressChange?(report) }
            }
            .onDisappear {
                if let report = MeeshyGlassPressReport.report(from: isPressed, to: nil) { onPressChange?(report) }
            }
    }
}

/// Ce que l'hôte entend du doigt (`onPressChange`) : posé, levé, et levé si le
/// bouton quitte l'écran doigt posé (`to == nil`). Rien quand rien ne change.
/// Une loi pure, testée sans écran.
enum MeeshyGlassPressReport {
    static func report(from wasPressed: Bool, to isPressed: Bool?) -> Bool? {
        guard let isPressed else { return wasPressed ? false : nil }
        return wasPressed == isPressed ? nil : isPressed
    }
}

/// L'appui long : 500 ms, annulé au-delà de 10 pt. N'existe que si l'hôte en
/// donne un ; désactivé, il ne fait rien (`fireLongPress`). L'identité du
/// bouton ne dépend donc pas de `.disabled`.
private struct MeeshyGlassLongPress: ViewModifier {
    let isOn: Bool
    let perform: () -> Void

    @ViewBuilder
    func body(content: Content) -> some View {
        if isOn {
            content.simultaneousGesture(
                LongPressGesture(
                    minimumDuration: MeeshyGlassButtonRecipe.longPressDuration,
                    maximumDistance: MeeshyGlassButtonRecipe.longPressMaxMovement
                ).onEnded { _ in perform() }
            )
        } else {
            content
        }
    }
}

// MARK: - Le lecteur d'écran

/// Les deux mots d'une bascule, dans la langue du lecteur d'écran.
enum MeeshyGlassButtonWords {
    static func toggle(isOn: Bool) -> String {
        isOn
            ? String(localized: "kit.glass_button.toggle.on", defaultValue: "Activé", bundle: .module)
            : String(localized: "kit.glass_button.toggle.off", defaultValue: "Désactivé", bundle: .module)
    }
}

private struct MeeshyGlassTraits: ViewModifier {
    let state: MeeshyGlassButtonAccessibilityState

    func body(content: Content) -> some View {
        content.accessibilityAddTraits(traits)
    }

    private var traits: AccessibilityTraits {
        var result: AccessibilityTraits = []
        if state.isSelected { result.insert(.isSelected) }
        if #available(iOS 17.0, *), state.isToggle { result.insert(.isToggle) }
        return result
    }
}

/// L'appui long offert au lecteur d'écran dès qu'il existe : sans
/// `longPressLabel`, il porte le nom du bouton plutôt que de disparaître.
private struct MeeshyGlassLongPressAction: ViewModifier {
    let name: String
    let perform: (() -> Void)?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let perform {
            content.accessibilityAction(named: Text(name), perform)
        } else {
            content
        }
    }
}
