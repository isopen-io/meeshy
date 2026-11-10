import SwiftUI

// MARK: - Les emplacements

/// Le glyphe d'un symbole système : une valeur, donc comparable.
public struct MeeshyGlassSymbol: View, Equatable {
    public let name: String

    public init(_ name: String) {
        self.name = name
    }

    public var body: some View {
        Image(systemName: name)
    }
}

/// L'emplacement de pastille vide.
public struct MeeshyGlassNoBadge: View, Equatable {
    public init() {}

    public var body: some View {
        EmptyView()
    }
}

// MARK: - Le disque

/// **Ce qu'on VOIT d'un bouton rond de verre** (K02) : le glyphe, son fond plein
/// éventuel (blanc, rouge, voile doux) et le verre de K01, interactif.
///
/// Atome opaque : ni action, ni nom accessible, ni haptique, ni légende. Une
/// unité « disque + légende » se compose côté app autour de ce disque. Le
/// glyphe garde sa taille quel que soit le Dynamic Type.
public struct MeeshyGlassDisc<Glyph: View, Badge: View>: View {
    private let recipe: MeeshyGlassButtonRecipe
    private let tone: MeeshyGlassTone?
    private let isPressed: Bool?
    private let glyph: Glyph
    private let badge: Badge

    @Environment(\.meeshyGlassIsPressed) private var styledPressed

    init(recipe: MeeshyGlassButtonRecipe, tone: MeeshyGlassTone?, isPressed: Bool?, glyph: Glyph, badge: Badge) {
        self.recipe = recipe
        self.tone = tone
        self.isPressed = isPressed
        self.glyph = glyph
        self.badge = badge
    }

    public var body: some View {
        face
            .frame(width: recipe.diameter, height: recipe.diameter)
            .background { MeeshyGlassButtonFillLayer(recipe: recipe, isPressed: isPressed ?? styledPressed) }
            .meeshyGlass(in: Circle(), tone: tone, isInteractive: true, isPressed: isPressed)
            .transformEnvironment(\.meeshyGlassIsNested) { nested in
                nested = nested || recipe.fill != .clear
            }
            .overlay(alignment: .topTrailing) { badge.accessibilityHidden(true) }
    }

    private var face: some View {
        glyph
            .font(.system(size: recipe.glyphSize, weight: .semibold))
            .foregroundStyle(recipe.inkColor)
            .tint(recipe.inkColor)
            .meeshyAnimation(.easeInOut(duration: MeeshyGlassButtonRecipe.toneFadeDuration), value: recipe.kind)
            .accessibilityHidden(true)
    }
}

public extension MeeshyGlassDisc where Badge == MeeshyGlassNoBadge {
    init(
        kind: MeeshyGlassButtonKind = .normal,
        size: MeeshyGlassButtonSize = .regular,
        ink: Color? = nil,
        tone: MeeshyGlassTone? = nil,
        isPressed: Bool? = nil,
        @ViewBuilder glyph: () -> Glyph
    ) {
        self.init(
            recipe: .resolve(kind: kind, size: size, ink: ink),
            tone: tone, isPressed: isPressed, glyph: glyph(), badge: MeeshyGlassNoBadge()
        )
    }
}

public extension MeeshyGlassDisc where Glyph == MeeshyGlassSymbol, Badge == MeeshyGlassNoBadge {
    init(
        systemImage: String,
        kind: MeeshyGlassButtonKind = .normal,
        size: MeeshyGlassButtonSize = .regular,
        ink: Color? = nil,
        tone: MeeshyGlassTone? = nil,
        isPressed: Bool? = nil
    ) {
        self.init(
            recipe: .resolve(kind: kind, size: size, ink: ink),
            tone: tone, isPressed: isPressed, glyph: MeeshyGlassSymbol(systemImage), badge: MeeshyGlassNoBadge()
        )
    }
}

public extension MeeshyGlassDisc {
    /// La pastille du coin haut de fin, muette pour le lecteur d'écran : son
    /// sens passe par la valeur du bouton.
    func glassBadge<B: View>(@ViewBuilder _ content: () -> B) -> MeeshyGlassDisc<Glyph, B> {
        MeeshyGlassDisc<Glyph, B>(recipe: recipe, tone: tone, isPressed: isPressed, glyph: glyph, badge: content())
    }
}

extension MeeshyGlassDisc: Equatable where Glyph: Equatable, Badge: Equatable {
    public static func == (lhs: MeeshyGlassDisc, rhs: MeeshyGlassDisc) -> Bool {
        lhs.recipe == rhs.recipe && lhs.tone == rhs.tone && lhs.isPressed == rhs.isPressed
            && lhs.glyph == rhs.glyph && lhs.badge == rhs.badge
    }
}

// MARK: - Le fond plein

/// Le fond plein du disque : blanc de l'actif, rouge du destructif, voile doux.
/// Seul le fond s'anime à un changement de tenue ; l'ombre de l'actif ne bouge
/// jamais. Sous le Liquid Glass du système, le voile doux n'existe pas.
private struct MeeshyGlassButtonFillLayer: View {
    let recipe: MeeshyGlassButtonRecipe
    let isPressed: Bool

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    #if DEBUG
    @Environment(\.meeshyGlassForcesDrawn) private var forcesDrawn
    @Environment(\.meeshyGlassForcesOpaque) private var forcesOpaque
    #endif

    var body: some View {
        Circle()
            .fill(recipe.fillColor.opacity(opacity))
            .meeshyAnimation(.easeInOut(duration: MeeshyGlassButtonRecipe.toneFadeDuration), value: recipe.kind)
            .shadow(color: shadowColor, radius: recipe.shadow?.radius ?? 0, x: 0, y: recipe.shadow?.y ?? 0)
            .animation(nil, value: recipe.kind)
    }

    private var opacity: Double {
        guard recipe.fillsUnderLiquid || material != .liquid else { return 0 }
        return recipe.resolvedFillOpacity(isPressed: isPressed)
    }

    private var shadowColor: Color {
        recipe.shadow.map { MeeshyColors.mediaBackdrop.opacity($0.opacity) } ?? .clear
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

// MARK: - L'activation

/// Ce qui se passe quand un bouton est activé : désactivé ou occupé, rien ;
/// sinon UN impact (sauf `none`, quand l'hôte joue le sien), puis l'action.
/// Une loi pure, testée sans écran.
enum MeeshyGlassButtonActivation {
    @discardableResult
    static func perform(
        recipe: MeeshyGlassButtonRecipe,
        haptic: MeeshyGlassButtonHaptic,
        play: (MeeshyGlassButtonHaptic) -> Void = MeeshyGlassButtonActivation.playSystemHaptic,
        action: () -> Void
    ) -> Bool {
        guard recipe.isActionEnabled else { return false }
        if recipe.playsHaptic, haptic != .none { play(haptic) }
        action()
        return true
    }

    static func playSystemHaptic(_ haptic: MeeshyGlassButtonHaptic) {
        switch haptic {
        case .none: break
        case .light: HapticFeedback.light()
        case .medium: HapticFeedback.medium()
        }
    }
}

// MARK: - Le bouton

/// Les VALEURS d'un bouton : ce que `==` compare. Les fermetures n'en font pas
/// partie, l'hôte les garde stables.
struct MeeshyGlassButtonSpec: Equatable {
    let label: String
    let kind: MeeshyGlassButtonKind
    let size: MeeshyGlassButtonSize
    let isOn: Bool?
    let hint: String?
    let value: String?
    let ink: Color?
    let tone: MeeshyGlassTone?
    let isBusy: Bool
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
/// - Désactivé (`.disabled`) ou occupé : ni action, ni haptique, ni appui.
/// - `isOn` fait une bascule ; une tenue active sans `isOn` s'annonce
///   « sélectionné ».
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
        self.spec = spec
        self.glyph = glyph
        self.badge = badge
        self.action = action
        self.onLongPress = onLongPress
        self.onPressChange = onPressChange
    }

    public var body: some View {
        let recipe = MeeshyGlassButtonRecipe.resolve(
            kind: spec.kind, size: spec.size, ink: spec.ink, isEnabled: isEnabled, isBusy: spec.isBusy
        )
        return Button { activate(recipe) } label: { face(recipe) }
            .buttonStyle(MeeshyGlassButtonStyle(longPressFired: $longPressFired, onPressChange: onPressChange))
            .disabled(!recipe.isActionEnabled)
            .opacity(recipe.opacity)
            .modifier(MeeshyGlassLongPress(isOn: onLongPress != nil && recipe.respondsToTouch, perform: { fireLongPress(recipe) }))
            .accessibilityLabel(spec.label)
            .accessibilityHint(spec.hint ?? "")
            .accessibilityValue(spec.value ?? "")
            .modifier(MeeshyGlassTraits(
                state: .resolve(kind: spec.kind, isOn: spec.isOn),
                isBusy: spec.isBusy
            ))
            .modifier(MeeshyGlassLongPressAction(label: spec.longPressLabel, perform: onLongPress))
            .accessibilityShowsLargeContentViewer {
                Label { Text(spec.label) } icon: { glyph }
            }
    }

    private func face(_ recipe: MeeshyGlassButtonRecipe) -> some View {
        MeeshyGlassDisc(recipe: recipe, tone: spec.tone, isPressed: nil, glyph: glyphContent(recipe), badge: badge)
            .frame(width: recipe.targetSide, height: recipe.targetSide)
            .contentShape(Rectangle())
    }

    @ViewBuilder
    private func glyphContent(_ recipe: MeeshyGlassButtonRecipe) -> some View {
        if recipe.showsBusyIndicator {
            ProgressView()
        } else {
            glyph
        }
    }

    private func activate(_ recipe: MeeshyGlassButtonRecipe) {
        guard !longPressFired else {
            longPressFired = false
            return
        }
        MeeshyGlassButtonActivation.perform(recipe: recipe, haptic: spec.haptic, action: action)
    }

    private func fireLongPress(_ recipe: MeeshyGlassButtonRecipe) {
        longPressFired = true
        guard let onLongPress else { return }
        MeeshyGlassButtonActivation.perform(recipe: recipe, haptic: spec.haptic, action: onLongPress)
    }
}

// MARK: - Les inits

public extension MeeshyGlassButton where Glyph == MeeshyGlassSymbol, Badge == MeeshyGlassNoBadge {
    init(
        systemImage: String,
        label: String,
        kind: MeeshyGlassButtonKind = .normal,
        size: MeeshyGlassButtonSize = .regular,
        isOn: Bool? = nil,
        hint: String? = nil,
        value: String? = nil,
        ink: Color? = nil,
        tone: MeeshyGlassTone? = nil,
        isBusy: Bool = false,
        haptic: MeeshyGlassButtonHaptic = .light,
        onLongPress: (() -> Void)? = nil,
        longPressLabel: String? = nil,
        onPressChange: ((Bool) -> Void)? = nil,
        action: @escaping () -> Void
    ) {
        self.init(
            spec: MeeshyGlassButtonSpec(
                label: label, kind: kind, size: size, isOn: isOn, hint: hint, value: value, ink: ink,
                tone: tone, isBusy: isBusy, haptic: haptic, longPressLabel: longPressLabel,
                hasLongPress: onLongPress != nil, hasPressChange: onPressChange != nil
            ),
            glyph: MeeshyGlassSymbol(systemImage), badge: MeeshyGlassNoBadge(),
            action: action, onLongPress: onLongPress, onPressChange: onPressChange
        )
    }
}

public extension MeeshyGlassButton where Badge == MeeshyGlassNoBadge {
    /// Le glyphe remplace l'icône (« Aa », pastille de couleur, drapeau) et
    /// reçoit l'encre. `action` se nomme : la fermeture finale est le glyphe.
    init(
        label: String,
        kind: MeeshyGlassButtonKind = .normal,
        size: MeeshyGlassButtonSize = .regular,
        isOn: Bool? = nil,
        hint: String? = nil,
        value: String? = nil,
        ink: Color? = nil,
        tone: MeeshyGlassTone? = nil,
        isBusy: Bool = false,
        haptic: MeeshyGlassButtonHaptic = .light,
        onLongPress: (() -> Void)? = nil,
        longPressLabel: String? = nil,
        onPressChange: ((Bool) -> Void)? = nil,
        action: @escaping () -> Void,
        @ViewBuilder glyph: () -> Glyph
    ) {
        self.init(
            spec: MeeshyGlassButtonSpec(
                label: label, kind: kind, size: size, isOn: isOn, hint: hint, value: value, ink: ink,
                tone: tone, isBusy: isBusy, haptic: haptic, longPressLabel: longPressLabel,
                hasLongPress: onLongPress != nil, hasPressChange: onPressChange != nil
            ),
            glyph: glyph(), badge: MeeshyGlassNoBadge(),
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
            .adaptiveOnChange(of: isPressed) { _, pressed in
                if pressed, longPressFired.wrappedValue { longPressFired.wrappedValue = false }
                onPressChange?(pressed)
            }
            .onDisappear {
                guard isPressed else { return }
                onPressChange?(false)
            }
    }
}

/// L'appui long : 500 ms, annulé au-delà de 10 pt. N'existe que si l'hôte en
/// donne un (et que le bouton répond au toucher).
private struct MeeshyGlassLongPress: ViewModifier {
    let isOn: Bool
    let perform: () -> Void

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

private struct MeeshyGlassTraits: ViewModifier {
    let state: MeeshyGlassButtonAccessibilityState
    let isBusy: Bool

    func body(content: Content) -> some View {
        content.accessibilityAddTraits(traits)
    }

    private var traits: AccessibilityTraits {
        var result: AccessibilityTraits = []
        if state.isSelected { result.insert(.isSelected) }
        if isBusy { result.insert(.updatesFrequently) }
        if #available(iOS 17.0, *), state.isToggle { result.insert(.isToggle) }
        return result
    }
}

private struct MeeshyGlassLongPressAction: ViewModifier {
    let label: String?
    let perform: (() -> Void)?

    func body(content: Content) -> some View {
        if let label, let perform {
            content.accessibilityAction(named: Text(label), perform)
        } else {
            content
        }
    }
}
