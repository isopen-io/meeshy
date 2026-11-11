import SwiftUI
import UIKit

/// La tête d'un champ : une icône SF ou un glyphe de texte, à l'encre atténuée.
public enum MeeshyFieldLeading: Equatable, Sendable {
    case icon(systemImage: String)
    case glyph(String)
}

// MARK: - Le compteur

/// Le compteur « 17 / 60 ». Posé dans le champ (`inline`) ou remis à l'hôte
/// (`hosted`, en-tête de pilule) : le champ n'en dessine alors aucun. En alerte
/// à 80 % du plafond : couleur d'alerte ET gras. Dit « 17 caractères sur 60 ».
///
/// `Equatable` sur ses valeurs : un hôte qui se re-rend à compte égal ne le
/// re-rend pas.
public struct MeeshyFieldCounter: View, Equatable {
    public let count: Int
    public let limit: Int
    public let tone: MeeshyGlassTone?

    @Environment(\.meeshyGlassTone) private var hostTone
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.locale) private var locale

    public init(count: Int, limit: Int, tone: MeeshyGlassTone? = nil) {
        self.count = count
        self.limit = limit
        self.tone = tone
    }

    public static func == (lhs: MeeshyFieldCounter, rhs: MeeshyFieldCounter) -> Bool {
        lhs.count == rhs.count && lhs.limit == rhs.limit && lhs.tone == rhs.tone
    }

    public var body: some View {
        let isNear = MeeshyFieldLimit.isNear(count: count, limit: limit)
        let recipe = MeeshyFieldRecipe.resolve(input: .sentence, hasCaption: false, tone: tone ?? hostTone,
                                               isEnabled: true, increasedContrast: false)
        let isDark = colorScheme == .dark
        Text(MeeshyFieldWords.counter(count: count, limit: limit, locale: locale))
            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: isNear ? .bold : .medium).monospacedDigit())
            .foregroundStyle(isNear
                             ? recipe.alertColor(isDark: isDark)
                             : recipe.inkColor(isDark: isDark).opacity(MeeshyFieldRecipe.mutedOpacity))
            .lineLimit(1)
            .fixedSize()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(MeeshyFieldWords.spokenCount(count: count, limit: limit, locale: locale))
    }
}

// MARK: - Le champ

/// **Le champ de saisie de feuille** (K08) : une boîte arrondie à 8 % de
/// l'encre, sans bord ni verre, où l'on tape une ligne, un paragraphe ou un
/// nombre. Tête optionnelle, invite, légende, compteur, croix de `search`, roue
/// d'occupation, et un `trailing` dans une cellule de 44 pt au bord de fin.
///
/// État : un brouillon local garde le curseur ; `onChange` part à chaque frappe,
/// après troncature au plafond ; `onCommit` une fois par valeur changée, au
/// Retour, à la perte de focus et au démontage ; un `text` venu de l'hôte
/// remplace le brouillon. Le champ ne ferme jamais le clavier de lui-même.
public struct MeeshyField<Trailing: View>: View {
    private let label: String
    private let text: String
    private let input: MeeshyFieldInput
    private let prompt: String?
    private let caption: String?
    private let leading: MeeshyFieldLeading?
    private let limit: Int?
    private let counter: MeeshyFieldCounterPlacement
    private let isBusy: Bool
    private let autoFocus: Bool
    private let tone: MeeshyGlassTone?
    private let haptic: MeeshyFieldHaptic
    private let focus: FocusState<Bool>.Binding?
    private let onChange: (String) -> Void
    private let onSubmit: ((String) -> Void)?
    private let onCommit: ((String) -> Void)?
    private let onFocusChange: ((Bool) -> Void)?
    private let onLimitReached: (() -> Void)?
    private let onStep: ((Int) -> Void)?
    private let trailing: Trailing

    @State private var draft: String
    @State private var ledger: MeeshyFieldLedger
    @FocusState private var ownFocus: Bool
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.meeshyGlassTone) private var hostTone

    public init(_ label: String,
                text: String,
                input: MeeshyFieldInput = .sentence,
                prompt: String? = nil,
                caption: String? = nil,
                leading: MeeshyFieldLeading? = nil,
                limit: Int? = nil,
                counter: MeeshyFieldCounterPlacement = .inline,
                isBusy: Bool = false,
                autoFocus: Bool = false,
                tone: MeeshyGlassTone? = nil,
                haptic: MeeshyFieldHaptic = .standard,
                focus: FocusState<Bool>.Binding? = nil,
                onChange: @escaping (String) -> Void,
                onSubmit: ((String) -> Void)? = nil,
                onCommit: ((String) -> Void)? = nil,
                onFocusChange: ((Bool) -> Void)? = nil,
                onLimitReached: (() -> Void)? = nil,
                onStep: ((Int) -> Void)? = nil,
                @ViewBuilder trailing: () -> Trailing) {
        self.label = label
        self.text = text
        self.input = input
        self.prompt = prompt
        self.caption = caption
        self.leading = leading
        self.limit = limit
        self.counter = counter
        self.isBusy = isBusy
        self.autoFocus = autoFocus
        self.tone = tone
        self.haptic = haptic
        self.focus = focus
        self.onChange = onChange
        self.onSubmit = onSubmit
        self.onCommit = onCommit
        self.onFocusChange = onFocusChange
        self.onLimitReached = onLimitReached
        self.onStep = onStep
        self.trailing = trailing()
        _draft = State(initialValue: text)
        _ledger = State(initialValue: MeeshyFieldLedger(text))
    }

    private var recipe: MeeshyFieldRecipe {
        MeeshyFieldRecipe.resolve(input: input,
                                  hasCaption: caption != nil,
                                  tone: tone ?? hostTone,
                                  isEnabled: isEnabled,
                                  increasedContrast: contrast == .increased)
    }

    private var isFocused: Bool { focus?.wrappedValue ?? ownFocus }

    private var hasTrailing: Bool { Trailing.self != EmptyView.self }

    /// Aux très grandes tailles, le compteur en ligne passe sous la saisie.
    private var stacksCounter: Bool { dynamicTypeSize.isAccessibilitySize }

    public var body: some View {
        let resolved = recipe
        box(resolved)
            .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous))
            .simultaneousGesture(TapGesture().onEnded { setFocus(true) })
            .adaptiveOnChange(of: isFocused) { _, focused in focusChanged(focused) }
            .adaptiveOnChange(of: draft) { _, next in receive(next) }
            .adaptiveOnChange(of: text) { _, external in resync(external) }
            .task {
                guard autoFocus else { return }
                await Task.yield()
                setFocus(true)
            }
            .onDisappear { commit() }
    }

    private func box(_ recipe: MeeshyFieldRecipe) -> some View {
        let ink = recipe.inkColor(isDark: colorScheme == .dark)
        return VStack(alignment: .leading, spacing: recipe.captionSpacing) {
            if let caption {
                MeeshyFieldCaptionLine(caption: caption, ink: ink).equatable()
            }
            row(recipe, ink: ink)
        }
        .padding(.vertical, recipe.verticalPadding)
        .padding(.horizontal, recipe.horizontalPadding)
        .frame(maxWidth: .infinity, minHeight: recipe.minimumHeight,
               alignment: recipe.lineRange.upperBound > 1 ? .topLeading : .leading)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
                .fill(ink.opacity(recipe.fillOpacity))
        )
        .overlay {
            if let hairline = recipe.hairlineOpacity {
                RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
                    .strokeBorder(ink.opacity(hairline), lineWidth: MeeshyBorder.regular)
            }
        }
        .opacity(recipe.contentOpacity)
    }

    private func row(_ recipe: MeeshyFieldRecipe, ink: Color) -> some View {
        HStack(alignment: recipe.lineRange.upperBound > 1 ? .top : .center, spacing: MeeshySpacing.sm) {
            if let leading {
                MeeshyFieldLeadingMark(leading: leading, ink: ink).equatable()
            }
            inputColumn(recipe, ink: ink)
            if !stacksCounter { inlineCounter }
            if recipe.offersClear || isBusy { clearCell(recipe, ink: ink) }
            if hasTrailing {
                trailing
                    .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
                    .padding(.vertical, -recipe.verticalPadding)
            }
        }
    }

    @ViewBuilder
    private func inputColumn(_ recipe: MeeshyFieldRecipe, ink: Color) -> some View {
        if stacksCounter, limit != nil, counter == .inline {
            VStack(alignment: .trailing, spacing: MeeshySpacing.xxs) {
                textField(recipe, ink: ink)
                inlineCounter
            }
        } else {
            textField(recipe, ink: ink)
        }
    }

    private func promptText(ink: Color) -> Text {
        var invite = AttributedString(prompt ?? "")
        invite.foregroundColor = ink.opacity(MeeshyFieldRecipe.mutedOpacity)
        return Text(invite)
    }

    private func textField(_ recipe: MeeshyFieldRecipe, ink: Color) -> some View {
        TextField(
            "",
            text: $draft,
            prompt: MeeshyFieldRecipe.showsPrompt(text: draft, caption: caption)
                ? promptText(ink: ink)
                : nil,
            axis: recipe.lineRange.upperBound > 1 ? .vertical : .horizontal
        )
        .lineLimit(recipe.lineRange)
        .font(valueFont(recipe))
        .foregroundStyle(ink)
        .tint(MeeshyColors.indigo400)
        .focused(focus ?? $ownFocus)
        .autocorrectionDisabled(!recipe.autocorrects)
        .textInputAutocapitalization(recipe.capitalization == .sentences ? .sentences : .never)
        .keyboardType(recipe.keyboard.uiKeyboardType)
        .submitLabel(recipe.returnKey.submitLabel)
        .onSubmit { submit() }
        .accessibilityLabel(label)
        .accessibilityValue(draft)
        .accessibilityHint(caption ?? "")
        .modifier(MeeshyFieldAccessibilityRole(isSearch: input == .search, onStep: input == .numeric ? onStep : nil))
    }

    private func valueFont(_ recipe: MeeshyFieldRecipe) -> Font {
        let font = MeeshyFont.relative(recipe.valueSize, weight: recipe.valueIsBold ? .bold : .regular)
        return input == .numeric ? font.monospacedDigit() : font
    }

    @ViewBuilder
    private var inlineCounter: some View {
        if let limit, counter == .inline {
            let isVisible = MeeshyFieldRecipe.showsInlineCounter(limit: limit, text: draft, placement: counter)
            MeeshyFieldCounter(count: MeeshyFieldLimit.count(draft), limit: limit, tone: tone)
                .equatable()
                .opacity(isVisible ? 1 : 0)
                .accessibilityHidden(!isVisible)
                .meeshyAnimation(.easeOut(duration: MeeshyFieldRecipe.fadeDuration), value: isVisible)
        }
    }

    private func clearCell(_ recipe: MeeshyFieldRecipe, ink: Color) -> some View {
        let showsClear = MeeshyFieldRecipe.showsClear(input: input, text: draft, isBusy: isBusy, isEnabled: isEnabled)
        return ZStack {
            if isBusy {
                ProgressView()
                    .tint(ink.opacity(MeeshyFieldRecipe.mutedOpacity))
                    .accessibilityLabel(MeeshyFieldWords.busy())
                    .transition(.opacity)
            }
            if showsClear {
                Button(action: clearTapped) {
                    Image(systemName: "xmark.circle.fill")
                        .font(MeeshyFont.relative(MeeshyIconSize.lg))
                        .foregroundStyle(ink.opacity(MeeshyFieldRecipe.mutedOpacity))
                        .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(MeeshyFieldWords.clear())
                .transition(.opacity)
            }
        }
        .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
        .padding(.vertical, -recipe.verticalPadding)
        .meeshyAnimation(.easeOut(duration: MeeshyFieldRecipe.fadeDuration), value: MeeshyFieldCellState(isBusy: isBusy, showsClear: showsClear))
    }

    // MARK: - Ce qui se passe

    private func setFocus(_ value: Bool) {
        if let focus {
            focus.wrappedValue = value
        } else {
            ownFocus = value
        }
    }

    private func focusChanged(_ focused: Bool) {
        onFocusChange?(focused)
        if !focused { commit() }
    }

    private func receive(_ next: String) {
        guard let edit = ledger.receive(next, limit: limit) else { return }
        if edit.wasTruncated { draft = edit.value }
        guard edit.emits else { return }
        onChange(edit.value)
        if let crossing = edit.crossing, let limit { crossed(crossing, value: edit.value, limit: limit) }
    }

    private func crossed(_ crossing: MeeshyFieldLimitCrossing, value: String, limit: Int) {
        AdaptiveAccessibility.announce(
            MeeshyFieldWords.announcement(for: crossing, count: MeeshyFieldLimit.count(value), limit: limit),
            priority: .low
        )
        guard crossing == .reached else { return }
        onLimitReached?()
        if haptic == .standard, isEnabled { HapticFeedback.warning() }
    }

    private func resync(_ external: String) {
        guard ledger.resync(external: external) else { return }
        draft = external
    }

    private func clearTapped() {
        MeeshyGlassButtonTrigger.perform(isEnabled: isEnabled, haptic: haptic == .standard ? .light : .none) {
            draft = ""
            setFocus(true)
        }
    }

    private func submit() {
        guard recipe.returnKey != .newline else { return }
        onSubmit?(draft)
        commit()
    }

    private func commit() {
        guard let value = ledger.commit(draft) else { return }
        onCommit?(value)
    }
}

public extension MeeshyField where Trailing == EmptyView {
    init(_ label: String,
         text: String,
         input: MeeshyFieldInput = .sentence,
         prompt: String? = nil,
         caption: String? = nil,
         leading: MeeshyFieldLeading? = nil,
         limit: Int? = nil,
         counter: MeeshyFieldCounterPlacement = .inline,
         isBusy: Bool = false,
         autoFocus: Bool = false,
         tone: MeeshyGlassTone? = nil,
         haptic: MeeshyFieldHaptic = .standard,
         focus: FocusState<Bool>.Binding? = nil,
         onChange: @escaping (String) -> Void,
         onSubmit: ((String) -> Void)? = nil,
         onCommit: ((String) -> Void)? = nil,
         onFocusChange: ((Bool) -> Void)? = nil,
         onLimitReached: (() -> Void)? = nil,
         onStep: ((Int) -> Void)? = nil) {
        self.init(label, text: text, input: input, prompt: prompt, caption: caption, leading: leading,
                  limit: limit, counter: counter, isBusy: isBusy, autoFocus: autoFocus, tone: tone,
                  haptic: haptic, focus: focus, onChange: onChange, onSubmit: onSubmit, onCommit: onCommit,
                  onFocusChange: onFocusChange, onLimitReached: onLimitReached, onStep: onStep) { EmptyView() }
    }
}

// MARK: - Les feuilles

/// Ce que la cellule de fin montre : la roue, la croix, ou rien.
private struct MeeshyFieldCellState: Equatable {
    let isBusy: Bool
    let showsClear: Bool
}

/// La légende d'O9 et d'O10 : une ligne fine au-dessus de la saisie, dans la
/// boîte, lue comme indication par le champ (elle-même masquée au lecteur).
private struct MeeshyFieldCaptionLine: View, Equatable {
    let caption: String
    let ink: Color

    var body: some View {
        Text(caption)
            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
            .foregroundStyle(ink.opacity(MeeshyFieldRecipe.mutedOpacity))
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityHidden(true)
    }
}

/// La tête : une loupe, un « # »… décorative, masquée au lecteur.
private struct MeeshyFieldLeadingMark: View, Equatable {
    let leading: MeeshyFieldLeading
    let ink: Color

    var body: some View {
        Group {
            switch leading {
            case .icon(let systemImage):
                Image(systemName: systemImage)
                    .font(MeeshyFont.relative(MeeshyIconSize.lg))
            case .glyph(let glyph):
                Text(glyph)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize))
            }
        }
        .foregroundStyle(ink.opacity(MeeshyFieldRecipe.mutedOpacity))
        .accessibilityHidden(true)
    }
}

/// Le rôle dit : trait de recherche en `search` (iOS 17+), réglable en
/// `numeric` quand l'hôte écoute `onStep` ; aucun autre champ n'est réglable.
private struct MeeshyFieldAccessibilityRole: ViewModifier {
    let isSearch: Bool
    let onStep: ((Int) -> Void)?

    func body(content: Content) -> some View {
        if let onStep {
            content
                .modifier(MeeshyFieldSearchTrait(isSearch: isSearch))
                .accessibilityAdjustableAction { direction in
                    onStep(MeeshyFieldStep.delta(increments: direction == .increment))
                }
        } else {
            content.modifier(MeeshyFieldSearchTrait(isSearch: isSearch))
        }
    }
}

/// Un pas d'accessibilité : +1 en montant, −1 en descendant.
nonisolated enum MeeshyFieldStep {
    static func delta(increments: Bool) -> Int { increments ? 1 : -1 }
}

private struct MeeshyFieldSearchTrait: ViewModifier {
    let isSearch: Bool

    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.accessibilityAddTraits(isSearch ? .isSearchField : [])
        } else {
            content
        }
    }
}

private extension MeeshyFieldKeyboard {
    var uiKeyboardType: UIKeyboardType {
        switch self {
        case .text: return .default
        case .search: return .webSearch
        case .numbersAndPunctuation: return .numbersAndPunctuation
        }
    }
}

private extension MeeshyFieldReturnKey {
    var submitLabel: SubmitLabel {
        switch self {
        case .done: return .done
        case .search: return .search
        case .newline: return .return
        }
    }
}
