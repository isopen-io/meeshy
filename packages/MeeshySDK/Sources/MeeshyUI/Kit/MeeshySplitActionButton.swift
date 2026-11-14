import Combine
import SwiftUI
import UIKit

// MARK: - Le chevron

/// **Ce qu'on VOIT du chevron** : le filet qui le sépare du libellé, le glyphe, et
/// la cible de 44 pt qui déborde vers la fin seulement, jamais vers le libellé.
/// C'est aussi le libellé d'un `Menu` du système qui s'habille en chevron : le
/// bouton le passe à `chevron:`. Atome opaque : ni action, ni nom, ni haptique.
public struct MeeshySplitActionChevronFace: View, Equatable {
    @Environment(\.colorSchemeContrast) private var contrast

    public init() {}

    public var body: some View {
        let slack = CGFloat(MeeshySplitActionButtonRecipe.chevronTargetSlack)
        HStack(spacing: 0) {
            Rectangle()
                .fill(MeeshyColors.onBrand.opacity(ruleOpacity))
                .frame(width: CGFloat(MeeshySplitActionButtonRecipe.ruleWidth))
                .accessibilityHidden(true)
            Image(systemName: "chevron.down")
                .font(MeeshySplitActionButtonRecipe.font(size: CGFloat(MeeshySplitActionButtonRecipe.chevronGlyph), weight: .bold))
                .foregroundStyle(MeeshyColors.onBrand)
                .padding(.leading, CGFloat(MeeshySplitActionButtonRecipe.chevronMarginStart))
                .padding(.trailing, CGFloat(MeeshySplitActionButtonRecipe.chevronMarginEnd))
                .frame(maxHeight: .infinity)
                .accessibilityHidden(true)
        }
        .padding(.trailing, slack)
        .contentShape(Rectangle())
        .padding(.trailing, -slack)
    }

    private var ruleOpacity: Double {
        contrast == .increased
            ? MeeshySplitActionButtonRecipe.ruleOpacityHighContrast
            : MeeshySplitActionButtonRecipe.ruleOpacity
    }

    public static func == (lhs: Self, rhs: Self) -> Bool { true }
}

/// Le chevron par défaut : un bouton qui n'appelle jamais l'action du libellé.
/// Il garde son propre `isEnabled` et joue le même retour haptique.
public struct MeeshySplitActionChevronButton: View {
    private let choose: MeeshySplitActionChoose
    private let haptic: MeeshyGlassButtonHaptic

    init(choose: MeeshySplitActionChoose, haptic: MeeshyGlassButtonHaptic) {
        self.choose = choose
        self.haptic = haptic
    }

    public var body: some View {
        Button(action: activate) { MeeshySplitActionChevronFace().equatable() }
            .buttonStyle(MeeshySplitActionSegmentStyle(segment: .chevron))
            .disabled(!choose.isEnabled)
            .accessibilityLabel(choose.label)
            .accessibilityHint(choose.hint ?? "")
            .accessibilityAddTraits(choose.isExpanded ? .isSelected : [])
    }

    private func activate() {
        MeeshySplitActionTrigger.pressChevron(choose: choose, haptic: haptic)
    }
}

// MARK: - La réponse au toucher

/// Le contexte que la capsule donne à ses segments : qui est pressé (pour
/// l'échelle de la capsule entière), les voiles d'appui et de survol, et le
/// segment qu'un catalogue force pressé.
struct MeeshySplitActionContext {
    let relay: MeeshySplitActionPressRelay
    let pressVeil: Double
    let hoverVeil: Double
    let forced: MeeshySplitActionSegment?
}

/// Le segment pressé, hors de l'état de la vue : l'appui ne re-rend ni la capsule
/// ni ses voisins, seul le petit modificateur d'échelle l'observe.
final class MeeshySplitActionPressRelay: ObservableObject {
    @Published private(set) var segment: MeeshySplitActionSegment?

    nonisolated deinit {}

    func set(_ segment: MeeshySplitActionSegment, pressed: Bool) {
        if pressed {
            self.segment = segment
        } else if self.segment == segment {
            self.segment = nil
        }
    }
}

private struct MeeshySplitActionContextKey: EnvironmentKey {
    static let defaultValue: MeeshySplitActionContext? = nil
}

extension EnvironmentValues {
    var meeshySplitActionContext: MeeshySplitActionContext? {
        get { self[MeeshySplitActionContextKey.self] }
        set { self[MeeshySplitActionContextKey.self] = newValue }
    }
}

private struct MeeshySplitActionForcedPressKey: EnvironmentKey {
    static let defaultValue: MeeshySplitActionSegment? = nil
}

extension EnvironmentValues {
    /// Le segment qu'un catalogue ou un instantané montre pressé.
    var meeshySplitActionForcedPress: MeeshySplitActionSegment? {
        get { self[MeeshySplitActionForcedPressKey.self] }
        set { self[MeeshySplitActionForcedPressKey.self] = newValue }
    }
}

/// Le style d'un segment : pose le voile d'appui sur CE segment et dit à la
/// capsule qu'il est pressé.
struct MeeshySplitActionSegmentStyle: ButtonStyle {
    let segment: MeeshySplitActionSegment

    func makeBody(configuration: Configuration) -> some View {
        MeeshySplitActionSegmentLabel(segment: segment, isPressed: configuration.isPressed) {
            configuration.label
        }
    }
}

private struct MeeshySplitActionSegmentLabel<Content: View>: View {
    let segment: MeeshySplitActionSegment
    let isPressed: Bool
    @ViewBuilder let content: () -> Content

    @Environment(\.meeshySplitActionContext) private var context
    @Environment(\.isEnabled) private var isEnabled
    @State private var isHovered = false

    var body: some View {
        let veil = veilOpacity
        content()
            .background(MeeshyColors.onMedia.opacity(veil))
            .animation(nil, value: veil)
            .onHover { isHovered = $0 }
            .adaptiveOnChange(of: isPressed) { _, pressed in
                context?.relay.set(segment, pressed: pressed && isEnabled)
            }
            .onDisappear { context?.relay.set(segment, pressed: false) }
    }

    private var veilOpacity: Double {
        guard isEnabled, let context else { return 0 }
        if isPressed || context.forced == segment { return context.pressVeil }
        return isHovered ? context.hoverVeil : 0
    }
}

/// L'échelle de K01 sur la capsule entière, lue du relais : seul ce modificateur
/// se re-évalue à l'appui.
private struct MeeshySplitActionPressScale: ViewModifier {
    @ObservedObject var relay: MeeshySplitActionPressRelay
    let forced: MeeshySplitActionSegment?
    let scale: Double

    func body(content: Content) -> some View {
        let pressed = forced != nil || relay.segment != nil
        content
            .scaleEffect(pressed ? CGFloat(scale) : 1)
            .animation(scale == 1 ? nil : MeeshyAnimation.springFast, value: pressed)
    }
}

// MARK: - Le libellé

/// Le texte du libellé : une feuille `Equatable`, qui ne se re-rend que si sa
/// chaîne ou sa taille changent.
struct MeeshySplitActionTitleText: View, Equatable {
    let text: String
    let size: CGFloat
    let lines: Int
    let ink: Color

    var body: some View {
        Text(verbatim: text)
            .font(MeeshySplitActionButtonRecipe.font(size: size, weight: .bold))
            .foregroundStyle(ink)
            .lineLimit(lines)
            .multilineTextAlignment(.center)
    }
}

/// Le libellé qui se replie selon la loi : `ViewThatFits` essaie les marches de
/// `MeeshySplitActionLabelFit.steps`, dans l'ordre. La place est mesurée par la
/// mise en page elle-même, une fois par (libellés, place, taille de police),
/// jamais pendant un geste.
struct MeeshySplitActionFittedLabel<Fallback: View>: View {
    let title: String
    let shortTitle: String?
    let maxLines: Int
    let size: CGFloat
    let smallSize: CGFloat
    let ink: Color
    let fallback: Fallback

    var body: some View {
        switch (maxLines > 1, shortTitle) {
        case (true, let short?):
            ViewThatFits(in: .horizontal) {
                single(title, size)
                single(title, smallSize)
                wrapped
                single(short, size)
                single(short, smallSize)
                glyph
            }
        case (true, nil):
            ViewThatFits(in: .horizontal) {
                single(title, size)
                single(title, smallSize)
                wrapped
                glyph
            }
        case (false, let short?):
            ViewThatFits(in: .horizontal) {
                single(title, size)
                single(title, smallSize)
                single(short, size)
                single(short, smallSize)
                glyph
            }
        case (false, nil):
            ViewThatFits(in: .horizontal) {
                single(title, size)
                single(title, smallSize)
                glyph
            }
        }
    }

    private func single(_ text: String, _ fontSize: CGFloat) -> some View {
        MeeshySplitActionTitleText(text: text, size: fontSize, lines: 1, ink: ink)
            .equatable()
            .fixedSize(horizontal: true, vertical: false)
    }

    private var wrapped: some View {
        MeeshySplitActionTitleText(text: title, size: smallSize, lines: maxLines, ink: ink)
            .equatable()
            .frame(width: wrappedWidth)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var glyph: some View {
        fallback
            .font(MeeshySplitActionButtonRecipe.font(size: size, weight: .bold))
            .foregroundStyle(ink)
            .fixedSize()
    }

    /// La place que le titre replié demande, mesurée à la police de la marche.
    private var wrappedWidth: CGFloat {
        let font = UIFont.systemFont(ofSize: smallSize, weight: .bold)
        let measure: (String) -> Double = { Double(($0 as NSString).size(withAttributes: [.font: font]).width) }
        let longest = title.split(whereSeparator: \.isWhitespace).map { measure(String($0)) }.max() ?? 0
        let widths = MeeshySplitActionLabelWidths(
            title: measure(title), titleSmall: measure(title), titleLongestWordSmall: longest
        )
        return CGFloat(MeeshySplitActionLabelFit.wrappedWidth(widths: widths, maxLines: maxLines))
    }
}

// MARK: - L'état en cours et l'état différé

/// L'anneau de K09 : une feuille `Equatable` que la progression est seule à redessiner.
private struct MeeshySplitActionRing: View, Equatable {
    let progress: Double?
    let diameter: CGFloat

    var body: some View {
        MeeshyProgressRing(progress: progress, label: nil, diameter: diameter, tone: .deep)
    }
}

// MARK: - Le bouton

/// Les VALEURS d'un bouton : ce que le bouton compare, les fermetures hors égalité.
struct MeeshySplitActionButtonSpec: Equatable {
    let title: String
    let shortTitle: String?
    let label: String?
    let hint: String?
    let phase: MeeshySplitActionPhase
    let size: MeeshySplitActionSize
    let width: MeeshySplitActionWidth
    let maxLines: Int
    let isEnabled: Bool
    let haptic: MeeshyGlassButtonHaptic
    let choose: MeeshySplitActionChoose?
}

/// **L'action principale et le choix de ce qui part** (K13) : un bouton plein à la
/// couleur de marque qui porte l'action par son libellé et, séparé par un filet, un
/// chevron qui ouvre le choix de ce qui part. Pendant l'envoi il devient un anneau
/// et un mot ; hors ligne il dit que l'envoi attend.
///
/// - Toucher le libellé : `action`, une fois, au relâcher. Toucher le chevron :
///   `choose.action` seulement, jamais `action`.
/// - Retenu (`isEnabled` faux) : ni action ni haptique ; `onDisabledPress` dit la
///   raison. Le chevron garde son propre `isEnabled`.
/// - `busy` et `deferred` : aucun geste, ni chevron ni filet.
///
/// Agnostique : tout est opaque (libellés déjà traduits, glyphes de l'hôte). Le
/// fond est plein ; sous Liquid Glass, K01 demande un verre teinté de marque et
/// interactif. Aucune couleur ni rayon en dur.
public struct MeeshySplitActionButton<StatusGlyph: View, FallbackGlyph: View, Chevron: View>: View {
    private let spec: MeeshySplitActionButtonSpec
    private let action: () -> Void
    private let onDisabledPress: (() -> Void)?
    private let statusGlyph: StatusGlyph
    private let fallbackGlyph: FallbackGlyph
    private let chevron: (MeeshySplitActionChevronFace) -> Chevron

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userReduceMotion
    @Environment(\.meeshyGlassTone) private var tone
    @Environment(\.meeshySplitActionForcedPress) private var forcedPress
    #if DEBUG
    @Environment(\.meeshyGlassForcesDrawn) private var forcesDrawn
    #endif
    @ScaledMetric(relativeTo: .subheadline) private var labelSize = CGFloat(MeeshySplitActionButtonRecipe.labelSize)
    @ScaledMetric(relativeTo: .footnote) private var smallLabelSize = CGFloat(MeeshySplitActionButtonRecipe.smallLabelSize)
    @ScaledMetric(relativeTo: .footnote) private var deferredLabelSize = CGFloat(MeeshySplitActionButtonRecipe.deferredLabelSize)
    @State private var relay = MeeshySplitActionPressRelay()

    init(
        spec: MeeshySplitActionButtonSpec,
        action: @escaping () -> Void,
        onDisabledPress: (() -> Void)?,
        statusGlyph: StatusGlyph,
        fallbackGlyph: FallbackGlyph,
        chevron: @escaping (MeeshySplitActionChevronFace) -> Chevron
    ) {
        assert(!spec.title.isEmpty, "MeeshySplitActionButton : le libellé est obligatoire et non vide")
        self.spec = spec
        self.action = action
        self.onDisabledPress = onDisabledPress
        self.statusGlyph = statusGlyph
        self.fallbackGlyph = fallbackGlyph
        self.chevron = chevron
    }

    public var body: some View {
        let recipe = self.recipe
        let isDark = colorScheme == .dark
        let ink = recipe.inkColor(isDark: isDark)
        return content(recipe: recipe, ink: ink)
            .environment(\.meeshySplitActionContext, MeeshySplitActionContext(
                relay: relay, pressVeil: recipe.pressVeilOpacity, hoverVeil: recipe.hoverVeilOpacity, forced: forcedPress
            ))
            .frame(minHeight: CGFloat(recipe.height))
            .clipShape(Capsule())
            .background { MeeshySplitActionFillLayer(recipe: recipe) }
            .modifier(MeeshySplitActionGlassLayer(
                request: recipe.glass, tint: recipe.glassTint(increasedContrast: contrast == .increased)
            ))
            .opacity(recipe.opacity)
            .modifier(MeeshySplitActionPressScale(relay: relay, forced: forcedPress, scale: recipe.pressScale))
            .animation(recipe.fadeDuration.map { Animation.easeInOut(duration: $0) }, value: recipe.content)
    }

    private var recipe: MeeshySplitActionButtonRecipe {
        MeeshySplitActionButtonRecipe.resolve(
            phase: spec.phase,
            size: spec.size,
            width: spec.width,
            isEnabled: spec.isEnabled,
            hasChevron: spec.choose != nil,
            material: material,
            tone: tone,
            increasedContrast: contrast == .increased,
            reduceMotion: MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userReduceMotion)
        )
    }

    private var material: MeeshyGlassMaterial {
        MeeshyGlassMaterial.resolve(
            isLiquidAvailable: Platform.isIOS26OrLater,
            reduceTransparency: reduceTransparency,
            forcesDrawn: forcesDrawnInDebug
        )
    }

    private var forcesDrawnInDebug: Bool {
        #if DEBUG
        return forcesDrawn || MeeshyGlassDebug.launchForcesDrawn
        #else
        return false
        #endif
    }

    // MARK: Contenu par phase

    @ViewBuilder
    private func content(recipe: MeeshySplitActionButtonRecipe, ink: Color) -> some View {
        switch spec.phase {
        case .ready:
            ready(recipe: recipe, ink: ink).transition(.opacity)
        case .busy(let progress, let title):
            busy(progress: progress, title: title, recipe: recipe, ink: ink).transition(.opacity)
        case .deferred(let title):
            deferred(title: title, recipe: recipe, ink: ink).transition(.opacity)
        }
    }

    private func ready(recipe: MeeshySplitActionButtonRecipe, ink: Color) -> some View {
        HStack(spacing: 0) {
            labelSegment(recipe: recipe, ink: ink)
            if recipe.showsChevron, spec.choose != nil {
                chevron(MeeshySplitActionChevronFace())
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func labelSegment(recipe: MeeshySplitActionButtonRecipe, ink: Color) -> some View {
        Button(action: activate) {
            MeeshySplitActionFittedLabel(
                title: spec.title, shortTitle: spec.shortTitle, maxLines: spec.maxLines,
                size: labelSize, smallSize: smallLabelSize, ink: ink, fallback: fallbackGlyph
            )
            .padding(.horizontal, CGFloat(recipe.labelPaddingHorizontal))
            .padding(.vertical, CGFloat(MeeshySplitActionButtonRecipe.labelPaddingVertical))
            .frame(maxWidth: recipe.fillsWidth ? .infinity : nil)
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(MeeshySplitActionSegmentStyle(segment: .label))
        .disabled(!recipe.labelRespondsToTouch)
        .overlay { refusalZone }
        .accessibilityLabel(MeeshySplitActionWords.spokenName(label: spec.label, title: spec.title))
        .accessibilityHint(spec.hint ?? "")
        .accessibilityShowsLargeContentViewer {
            Text(verbatim: MeeshySplitActionWords.spokenName(label: spec.label, title: spec.title))
        }
    }

    /// Le toucher d'un bouton retenu : l'hôte dit la raison.
    @ViewBuilder
    private var refusalZone: some View {
        if !spec.isEnabled, let onDisabledPress {
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture(perform: onDisabledPress)
                .accessibilityHidden(true)
        }
    }

    private func busy(
        progress: Double?, title: String, recipe: MeeshySplitActionButtonRecipe, ink: Color
    ) -> some View {
        HStack(spacing: CGFloat(MeeshySplitActionButtonRecipe.ringGap)) {
            MeeshySplitActionRing(progress: progress, diameter: CGFloat(recipe.ringDiameter)).equatable()
            MeeshySplitActionTitleText(text: title, size: labelSize, lines: 1, ink: ink).equatable()
        }
        .padding(.leading, CGFloat(MeeshySplitActionButtonRecipe.ringMarginStart))
        .padding(.trailing, CGFloat(MeeshySplitActionButtonRecipe.ringMarginEnd))
        .padding(.vertical, CGFloat(MeeshySplitActionButtonRecipe.ringMarginStart))
        .frame(maxWidth: recipe.fillsWidth ? .infinity : nil)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(MeeshySplitActionWords.spokenName(label: spec.label, title: spec.title))
        .accessibilityValue(MeeshySplitActionWords.busyValue(
            title: title, percent: progress.map { Int((MeeshyProgressRingRecipe.clampFraction($0) * 100).rounded()) }
        ))
        .accessibilityAddTraits(.updatesFrequently)
    }

    private func deferred(
        title: String, recipe: MeeshySplitActionButtonRecipe, ink: Color
    ) -> some View {
        HStack(spacing: CGFloat(MeeshySplitActionButtonRecipe.deferredGap)) {
            statusGlyph
                .font(MeeshySplitActionButtonRecipe.font(size: CGFloat(MeeshySplitActionButtonRecipe.deferredGlyph), weight: .bold))
                .foregroundStyle(ink)
                .accessibilityHidden(true)
            MeeshySplitActionTitleText(text: title, size: deferredLabelSize, lines: 1, ink: ink).equatable()
        }
        .padding(.horizontal, CGFloat(MeeshySplitActionButtonRecipe.deferredPadding))
        .padding(.vertical, CGFloat(MeeshySplitActionButtonRecipe.labelPaddingVertical))
        .frame(maxWidth: recipe.fillsWidth ? .infinity : nil)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityAddTraits(.isStaticText)
    }

    private func activate() {
        MeeshySplitActionTrigger.pressLabel(
            isEnabled: spec.isEnabled, haptic: spec.haptic, action: action, onDisabledPress: onDisabledPress
        )
    }
}

// MARK: - Les couches

/// Le fond plein et son ombre : seul le fond change de valeur, l'ombre ne bouge
/// jamais. Rien d'animé par la mise en page.
private struct MeeshySplitActionFillLayer: View {
    let recipe: MeeshySplitActionButtonRecipe

    var body: some View {
        Capsule()
            .fill(recipe.fillColor())
            .shadow(
                color: MeeshyColors.brandPrimary.opacity(recipe.shadow?.opacity ?? 0),
                radius: CGFloat(recipe.shadow?.radius ?? 0), x: 0, y: CGFloat(recipe.shadow?.y ?? 0)
            )
    }
}

/// La demande faite à K01, l'unique entrée de verre : un verre de marque
/// interactif sous Liquid Glass, rien ailleurs.
private struct MeeshySplitActionGlassLayer: ViewModifier {
    let request: MeeshySplitActionGlassRequest
    let tint: Color

    @ViewBuilder
    func body(content: Content) -> some View {
        switch request {
        case .none:
            content
        case .brand:
            content.meeshyGlass(in: Capsule(), tint: tint, isInteractive: true)
        }
    }
}

// MARK: - Les inits

public extension MeeshySplitActionButton where StatusGlyph == MeeshySplitActionNoGlyph,
    FallbackGlyph == MeeshySplitActionArrowGlyph, Chevron == MeeshySplitActionChevronButton {
    /// Le bouton complet : libellé, phase, choix. Les glyphes et le chevron ont
    /// leurs défauts (aucun glyphe d'état, flèche vers le haut en dernier repli,
    /// chevron qui n'appelle que `choose.action`).
    init(
        _ title: String,
        shortTitle: String? = nil,
        label: String? = nil,
        hint: String? = nil,
        phase: MeeshySplitActionPhase = .ready,
        size: MeeshySplitActionSize = .regular,
        width: MeeshySplitActionWidth = .hug,
        maxLines: Int = 1,
        isEnabled: Bool = true,
        onDisabledPress: (() -> Void)? = nil,
        haptic: MeeshyGlassButtonHaptic = .light,
        choose: MeeshySplitActionChoose? = nil,
        action: @escaping () -> Void
    ) {
        self.init(
            spec: MeeshySplitActionButtonSpec(
                title: title, shortTitle: shortTitle, label: label, hint: hint, phase: phase, size: size,
                width: width, maxLines: maxLines, isEnabled: isEnabled, haptic: haptic, choose: choose
            ),
            action: action, onDisabledPress: onDisabledPress,
            statusGlyph: MeeshySplitActionNoGlyph(), fallbackGlyph: MeeshySplitActionArrowGlyph(),
            chevron: { _ in
                MeeshySplitActionChevronButton(
                    choose: choose ?? MeeshySplitActionChoose(label: title), haptic: haptic
                )
            }
        )
    }
}

public extension MeeshySplitActionButton where Chevron == MeeshySplitActionChevronButton {
    /// Les glyphes de l'hôte : celui devant le libellé différé, et le dernier
    /// repli quand aucun libellé ne tient.
    init(
        _ title: String,
        shortTitle: String? = nil,
        label: String? = nil,
        hint: String? = nil,
        phase: MeeshySplitActionPhase = .ready,
        size: MeeshySplitActionSize = .regular,
        width: MeeshySplitActionWidth = .hug,
        maxLines: Int = 1,
        isEnabled: Bool = true,
        onDisabledPress: (() -> Void)? = nil,
        haptic: MeeshyGlassButtonHaptic = .light,
        choose: MeeshySplitActionChoose? = nil,
        action: @escaping () -> Void,
        @ViewBuilder statusGlyph: () -> StatusGlyph,
        @ViewBuilder fallbackGlyph: () -> FallbackGlyph
    ) {
        self.init(
            spec: MeeshySplitActionButtonSpec(
                title: title, shortTitle: shortTitle, label: label, hint: hint, phase: phase, size: size,
                width: width, maxLines: maxLines, isEnabled: isEnabled, haptic: haptic, choose: choose
            ),
            action: action, onDisabledPress: onDisabledPress,
            statusGlyph: statusGlyph(), fallbackGlyph: fallbackGlyph(),
            chevron: { _ in
                MeeshySplitActionChevronButton(
                    choose: choose ?? MeeshySplitActionChoose(label: title), haptic: haptic
                )
            }
        )
    }
}

public extension MeeshySplitActionButton where StatusGlyph == MeeshySplitActionNoGlyph,
    FallbackGlyph == MeeshySplitActionArrowGlyph {
    /// Le chevron habillé par l'hôte : un `Menu` du système reçoit la face du
    /// chevron (filet, glyphe, cible) pour libellé.
    init(
        _ title: String,
        shortTitle: String? = nil,
        label: String? = nil,
        hint: String? = nil,
        phase: MeeshySplitActionPhase = .ready,
        size: MeeshySplitActionSize = .regular,
        width: MeeshySplitActionWidth = .hug,
        maxLines: Int = 1,
        isEnabled: Bool = true,
        onDisabledPress: (() -> Void)? = nil,
        haptic: MeeshyGlassButtonHaptic = .light,
        choose: MeeshySplitActionChoose,
        action: @escaping () -> Void,
        @ViewBuilder chevron: @escaping (MeeshySplitActionChevronFace) -> Chevron
    ) {
        self.init(
            spec: MeeshySplitActionButtonSpec(
                title: title, shortTitle: shortTitle, label: label, hint: hint, phase: phase, size: size,
                width: width, maxLines: maxLines, isEnabled: isEnabled, haptic: haptic, choose: choose
            ),
            action: action, onDisabledPress: onDisabledPress,
            statusGlyph: MeeshySplitActionNoGlyph(), fallbackGlyph: MeeshySplitActionArrowGlyph(),
            chevron: chevron
        )
    }
}

extension MeeshySplitActionButton: Equatable where StatusGlyph: Equatable, FallbackGlyph: Equatable {
    public static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.spec == rhs.spec && lhs.statusGlyph == rhs.statusGlyph && lhs.fallbackGlyph == rhs.fallbackGlyph
    }
}

/// L'emplacement de glyphe d'état vide.
public struct MeeshySplitActionNoGlyph: View, Equatable {
    public init() {}

    public var body: some View {
        EmptyView()
    }
}

/// Le dernier repli du libellé : une flèche vers le haut.
public struct MeeshySplitActionArrowGlyph: View, Equatable {
    public init() {}

    public var body: some View {
        Image(systemName: "arrow.up")
    }
}
