import SwiftUI
import MeeshySDK

/// **La marque de traduction (K51)** : tout contenu traduit porte la même marque
/// discrète, qui dit d'où il vient et rend l'original d'un geste. « Traduit de
/// l'italien · Voir l'original. »
///
/// Elle signale et bascule, elle ne résout rien : elle reçoit un nom de langue déjà
/// accordé et un booléen, jamais un code de langue ni un résolveur du Prisme. Aucun
/// état : `isShowingOriginal` lui est remis, et le même booléen choisit le texte de
/// l'hôte ET le libellé de la marque. Sans traduction, l'hôte ne la monte pas. Sans
/// `onToggle`, elle informe et ne promet aucun geste.
public struct MeeshyTranslationMark: View {
    private let sourceLanguageName: String?
    private let originalLanguageName: String?
    private let isShowingOriginal: Bool
    private let onToggle: (() -> Void)?
    private let density: MeeshyTranslationMarkDensity
    private let mode: MeeshyTranslationMarkMode?
    private let announcement: String?
    private let isPending: Bool
    private let tint: Color?
    private let tone: MeeshyGlassTone?
    private let onExplore: (() -> Void)?
    private let label: String?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.locale) private var locale
    @State private var width: Double = 390

    public init(sourceLanguageName: String?,
                originalLanguageName: String? = nil,
                isShowingOriginal: Bool = false,
                onToggle: (() -> Void)? = nil,
                density: MeeshyTranslationMarkDensity = .line,
                mode: MeeshyTranslationMarkMode? = nil,
                announcement: String? = nil,
                isPending: Bool = false,
                tint: Color? = nil,
                tone: MeeshyGlassTone? = nil,
                onExplore: (() -> Void)? = nil,
                label: String? = nil) {
        self.sourceLanguageName = sourceLanguageName
        self.originalLanguageName = originalLanguageName
        self.isShowingOriginal = isShowingOriginal
        self.onToggle = onToggle
        self.density = density
        self.mode = mode
        self.announcement = announcement
        self.isPending = isPending
        self.tint = tint
        self.tone = tone
        self.onExplore = onExplore
        self.label = label
    }

    private var accent: Color { tint ?? .accentColor }

    public var body: some View {
        let resolvedMode = MeeshyTranslationMarkRecipe.resolveMode(mode, isShowingOriginal: isShowingOriginal)
        let recipe = MeeshyTranslationMarkRecipe.resolve(density: density, mode: resolvedMode, hasToggle: onToggle != nil,
                                                         isPressed: false, isPending: isPending, width: width,
                                                         reduceMotion: reduceMotion)
        content(recipe: recipe, mode: resolvedMode)
            .background(GeometryReader { proxy in
                Color.clear.preference(key: MeeshyTranslationMarkWidthKey.self, value: Double(proxy.size.width))
            })
            .onPreferenceChange(MeeshyTranslationMarkWidthKey.self) { width = $0 }
    }

    @ViewBuilder
    private func content(recipe: MeeshyTranslationMarkRecipe, mode: MeeshyTranslationMarkMode) -> some View {
        switch density {
        case .icon:
            glyph(recipe: recipe, mode: mode)
        case .line:
            line(recipe: recipe, mode: mode)
        case .legend:
            line(recipe: recipe, mode: mode)
                .padding(.horizontal, MeeshySpacing.sm)
                .padding(.vertical, MeeshySpacing.xs)
                .meeshyGlass(in: RoundedRectangle(cornerRadius: 13, style: .continuous), tone: tone)
        }
    }

    private func glyph(recipe: MeeshyTranslationMarkRecipe, mode: MeeshyTranslationMarkMode) -> some View {
        Image(systemName: "translate")
            .meeshyScaledFont(recipe.glyphSize, weight: .semibold)
            .foregroundStyle(recipe.glyphIsMuted ? Color.secondary : accent)
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private func line(recipe: MeeshyTranslationMarkRecipe, mode: MeeshyTranslationMarkMode) -> some View {
        let mention = mode == .announce ? (announcement ?? "") : MeeshyTranslationMarkWords.mention(
            mode: mode, languageName: mode == .original ? (originalLanguageName ?? sourceLanguageName) : sourceLanguageName,
            locale: locale)
        let layout = recipe.wrapsToggle
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: MeeshySpacing.xxs))
            : AnyLayout(HStackLayout(spacing: recipe.separatorSpacing))
        layout {
            HStack(spacing: MeeshySpacing.xs) {
                glyph(recipe: recipe, mode: mode)
                Text(verbatim: mention)
                    .meeshyScaledFont(recipe.textSize, weight: mode == .announce ? .semibold : .regular)
                    .foregroundStyle(mode == .announce ? accent : Color.secondary)
                    .lineLimit(2)
                    .animation(MeeshyMotion.animation(.morph, reduce: reduceMotion), value: mention)
            }
            .accessibilityElement(children: .combine)
            if recipe.showsSeparator {
                Text(verbatim: "·").foregroundStyle(Color.secondary).accessibilityHidden(true)
            }
            if recipe.showsToggle { toggle(recipe: recipe, mode: mode) }
        }
    }

    private func toggle(recipe: MeeshyTranslationMarkRecipe, mode: MeeshyTranslationMarkMode) -> some View {
        Button {
            guard recipe.acceptsToggle else { return }
            onToggle?()
        } label: {
            Text(verbatim: MeeshyTranslationMarkWords.toggle(mode: mode, locale: locale))
                .meeshyScaledFont(recipe.textSize, weight: .bold)
                .foregroundStyle(accent)
                .frame(minWidth: recipe.tapTarget, minHeight: recipe.tapTarget, alignment: .leading)
        }
        .buttonStyle(MeeshyTranslationMarkToggleStyle(recipe: recipe, reduceMotion: reduceMotion))
        .opacity(recipe.toggleOpacity)
        .accessibilityLabel(label ?? MeeshyTranslationMarkWords.toggle(mode: mode, locale: locale))
        .accessibilityValue(MeeshyTranslationMarkWords.toggleValue(mode: mode, locale: locale))
        .modifier(MeeshyTranslationMarkExplore(onExplore: onExplore))
    }
}

private struct MeeshyTranslationMarkWidthKey: PreferenceKey {
    static let defaultValue: Double = 390
    static func reduce(value: inout Double, nextValue: () -> Double) { value = nextValue() }
}

/// À l'appui seule la bascule répond : échelle et encre ; le glyphe et la mention ne bougent pas.
struct MeeshyTranslationMarkToggleStyle: ButtonStyle {
    let recipe: MeeshyTranslationMarkRecipe
    let reduceMotion: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? MeeshyTranslationMarkRecipe.pressedScale : 1)
            .opacity(configuration.isPressed ? MeeshyTranslationMarkRecipe.pressedInkOpacity : 1)
    }
}

/// L'appui long ouvre la feuille des langues de l'hôte, doublé d'une action nommée.
struct MeeshyTranslationMarkExplore: ViewModifier {
    let onExplore: (() -> Void)?

    func body(content: Content) -> some View {
        if let onExplore {
            content
                .onLongPressGesture(perform: onExplore)
                .accessibilityAction(named: Text("kit.translation_mark.explore", bundle: .module), onExplore)
        } else {
            content
        }
    }
}
