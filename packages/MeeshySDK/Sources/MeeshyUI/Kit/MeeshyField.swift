import SwiftUI
import UIKit

/// La tête d'un champ : une icône SF ou un glyphe de texte, à l'encre atténuée.
public enum MeeshyFieldLeading: Equatable, Sendable {
    case icon(systemImage: String)
    case glyph(String)
}

/// Le compteur « 17 / 60 ». Posé dans le champ (`inline`) ou remis à l'hôte
/// (`hosted`, en-tête de pilule) : le champ n'en dessine alors aucun.
public struct MeeshyFieldCounter: View {
    public let count: Int
    public let limit: Int
    public let tone: MeeshyGlassTone?

    public init(count: Int, limit: Int, tone: MeeshyGlassTone? = nil) {
        self.count = count
        self.limit = limit
        self.tone = tone
    }

    public var body: some View {
        Text(Self.text(count: count, limit: limit))
            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: MeeshyFieldCounter.weight(count: count, limit: limit)))
            .monospacedDigit()
            .foregroundStyle(MeeshyFieldCounter.color(count: count, limit: limit, tone: tone))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Self.spoken(count: count, limit: limit))
    }

    public static func text(count: Int, limit: Int) -> String {
        "\(count) / \(limit)"
    }

    public static func weight(count: Int, limit: Int) -> Font.Weight {
        MeeshyFieldLimit.isNear(count: count, limit: limit) ? .bold : .medium
    }

    public static func color(count: Int, limit: Int, tone: MeeshyGlassTone?) -> Color {
        MeeshyFieldLimit.isNear(count: count, limit: limit)
            ? MeeshyColors.error
            : MeeshyColors.onMediaMuted
    }

    public static func spoken(count: Int, limit: Int) -> String {
        String(
            localized: "kit.field.count",
            defaultValue: "\(count) caractères sur \(limit)",
            bundle: .module
        )
    }
}

/// Le champ de feuille de K08 : une boîte arrondie, une tête optionnelle, une
/// invite, un compteur, la croix de `search`. État interne : un brouillon local
/// qui garde le curseur ; `onChange` part à chaque frappe, après troncature.
public struct MeeshyField: View {
    public let label: String
    public let text: String
    public let onChange: (String) -> Void
    public let input: MeeshyFieldInput
    public let prompt: String?
    public let caption: String?
    public let leading: MeeshyFieldLeading?
    public let limit: Int?
    public let counter: MeeshyFieldCounterPlacement
    public let isBusy: Bool
    public let autoFocus: Bool
    public let tone: MeeshyGlassTone?
    public let haptic: MeeshyFieldHaptic
    public let onSubmit: ((String) -> Void)?
    public let onCommit: ((String) -> Void)?
    public let onFocusChange: ((Bool) -> Void)?
    public let onLimitReached: (() -> Void)?
    public let onStep: ((Int) -> Void)?

    @State private var draft: String
    @State private var committed: String
    @State private var emitted: String
    @FocusState private var isFocused: Bool
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityDifferentiateWithoutColor) private var differentiate
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(label: String,
                text: String,
                onChange: @escaping (String) -> Void,
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
                onSubmit: ((String) -> Void)? = nil,
                onCommit: ((String) -> Void)? = nil,
                onFocusChange: ((Bool) -> Void)? = nil,
                onLimitReached: (() -> Void)? = nil,
                onStep: ((Int) -> Void)? = nil) {
        self.label = label
        self.text = text
        self.onChange = onChange
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
        self.onSubmit = onSubmit
        self.onCommit = onCommit
        self.onFocusChange = onFocusChange
        self.onLimitReached = onLimitReached
        self.onStep = onStep
        _draft = State(initialValue: text)
        _committed = State(initialValue: text)
        _emitted = State(initialValue: text)
    }

    private var recipe: MeeshyFieldRecipe {
        MeeshyFieldRecipe.resolve(input: input,
                                  hasCaption: caption != nil,
                                  tone: tone,
                                  isEnabled: isEnabled,
                                  increasedContrast: contrast == .increased)
    }

    private var ink: Color {
        recipe.ink == .themeInk ? MeeshyColors.textPrimary(isDark: colorScheme == .dark) : MeeshyColors.onMedia
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            if let caption {
                Text(caption)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize))
                    .foregroundStyle(MeeshyColors.onMediaMuted)
                    .accessibilityHidden(true)
            }
            box
        }
        .contentShape(Rectangle())
        .onTapGesture { isFocused = true }
        .onChange(of: isFocused) { _, focused in
            onFocusChange?(focused)
            if !focused { commitIfChanged() }
        }
        .onChange(of: draft) { _, next in receive(next) }
        .onChange(of: text) { _, external in resyncIfExternal(external) }
        .task(id: autoFocus) {
            guard autoFocus else { return }
            isFocused = true
        }
        .onDisappear { commitIfChanged() }
    }

    private var box: some View {
        HStack(spacing: MeeshySpacing.sm) {
            leadingView
            field
            if MeeshyFieldRecipe.showsInlineCounter(limit: limit, text: draft, placement: counter), let limit {
                MeeshyFieldCounter(count: MeeshyFieldLimit.count(draft), limit: limit, tone: tone)
            }
            trailingControl
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.xsPlus)
        .frame(minHeight: recipe.minimumHeight)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
                .fill(ink.opacity(recipe.fillOpacity))
        )
        .overlay(
            RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
                .strokeBorder(ink.opacity(recipe.hairlineOpacity ?? 0), lineWidth: MeeshyBorder.regular)
        )
        .opacity(recipe.contentOpacity)
    }

    @ViewBuilder
    private var leadingView: some View {
        switch leading {
        case .icon(let systemImage):
            Image(systemName: systemImage)
                .font(MeeshyFont.relative(MeeshyIconSize.lg))
                .foregroundStyle(ink.opacity(MeeshyFieldRecipe.mutedOpacity))
                .accessibilityHidden(true)
        case .glyph(let glyph):
            Text(glyph)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundStyle(ink.opacity(MeeshyFieldRecipe.mutedOpacity))
                .accessibilityHidden(true)
        case nil:
            EmptyView()
        }
    }

    private var field: some View {
        TextField(
            "",
            text: $draft,
            prompt: MeeshyFieldRecipe.showsPrompt(text: draft, caption: caption)
                ? Text(prompt ?? "").foregroundStyle(ink.opacity(MeeshyFieldRecipe.mutedOpacity))
                : nil,
            axis: recipe.lineRange.upperBound > 1 ? .vertical : .horizontal
        )
        .lineLimit(recipe.lineRange)
        .font(MeeshyFont.relative(MeeshyFont.bodySize))
        .foregroundStyle(ink)
        .tint(MeeshyColors.indigo400)
        .focused($isFocused)
        .autocorrectionDisabled(!recipe.autocorrects)
        .textInputAutocapitalization(recipe.capitalization == .sentences ? .sentences : .never)
        .keyboardType(recipe.keyboard.uiKeyboardType)
        .submitLabel(recipe.returnKey.submitLabel)
        .onSubmit { submitIfNeeded() }
        .accessibilityLabel(label)
        .accessibilityValue(draft)
        .accessibilityHint(caption ?? "")
        .adjustableIfNumeric(input: input, onStep: onStep)
    }

    @ViewBuilder
    private var trailingControl: some View {
        if isBusy {
            ProgressView()
                .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
        } else if MeeshyFieldRecipe.showsClear(input: input, text: draft, isBusy: isBusy, isEnabled: isEnabled) {
            Button(action: clear) {
                Image(systemName: "xmark.circle.fill")
                    .font(MeeshyFont.relative(MeeshyIconSize.lg))
                    .foregroundStyle(ink.opacity(MeeshyFieldRecipe.mutedOpacity))
                    .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "kit.field.clear", defaultValue: "Effacer", bundle: .module))
            .transition(.opacity)
            .animation(MeeshyMotion.animation(.easeOut(duration: MeeshyFieldRecipe.fadeDuration), reduce: reduceMotion), value: draft)
        }
    }

    private func receive(_ next: String) {
        guard next != emitted else { return }
        let bounded = limit.map { MeeshyFieldLimit.truncate(next, to: $0) } ?? next
        if bounded != next { draft = bounded }
        announceLimitIfCrossed(previous: emitted, next: bounded)
        emitted = bounded
        onChange(bounded)
    }

    private func announceLimitIfCrossed(previous: String, next: String) {
        guard let limit, MeeshyFieldLimit.count(next) >= limit, MeeshyFieldLimit.count(previous) < limit else { return }
        onLimitReached?()
        if haptic == .standard { HapticFeedback.warning() }
    }

    private func resyncIfExternal(_ external: String) {
        guard external != emitted else { return }
        draft = external
        emitted = external
    }

    private func clear() {
        draft = ""
        emitted = ""
        onChange("")
        isFocused = true
        if haptic == .standard { HapticFeedback.light() }
    }

    private func submitIfNeeded() {
        guard recipe.returnKey != .newline else { return }
        onSubmit?(draft)
        commitIfChanged()
    }

    private func commitIfChanged() {
        guard draft != committed else { return }
        committed = draft
        onCommit?(draft)
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

private extension View {
    @ViewBuilder
    func adjustableIfNumeric(input: MeeshyFieldInput, onStep: ((Int) -> Void)?) -> some View {
        if input == .numeric, let onStep {
            accessibilityAdjustableAction { direction in
                onStep(direction == .increment ? 1 : -1)
            }
        } else {
            self
        }
    }
}
