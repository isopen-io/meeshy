import SwiftUI

// MARK: - Emplacements

/// Une icône SF Symbol en tête de ligne. Sa couleur vient de la ligne (l'encre du titre).
public struct MeeshyToggleRowSymbol: View, Equatable {
    public let name: String

    public init(_ name: String) {
        self.name = name
    }

    public var body: some View {
        Image(systemName: name)
            .font(MeeshyFont.relative(MeeshyIconSize.xxl, weight: .regular))
            .padding(.trailing, MeeshySpacing.md)
            .accessibilityHidden(true)
    }
}

/// L'emplacement vide : aucune tête, aucune pastille, aucun accessoire.
public struct MeeshyToggleRowNoSlot: View, Equatable {
    public init() {}

    public var body: some View {
        EmptyView()
    }
}

// MARK: - Le contenu

/// Ce que la ligne montre, hors emplacements : titre, sous-titre, accessoire,
/// variante, filet, ton et teinte. Une valeur, donc comparable.
public nonisolated struct MeeshyToggleRowContent: Sendable, Equatable {
    public let title: String
    public let subtitle: String?
    public let accessory: MeeshyToggleRowAccessory
    public let kind: MeeshyToggleRowKind
    public let showsDivider: Bool
    public let tone: MeeshyGlassTone?
    public let tint: Color?

    public init(
        title: String,
        subtitle: String? = nil,
        accessory: MeeshyToggleRowAccessory = .none,
        kind: MeeshyToggleRowKind = .normal,
        showsDivider: Bool = false,
        tone: MeeshyGlassTone? = nil,
        tint: Color? = nil
    ) {
        self.title = title
        self.subtitle = subtitle
        self.accessory = accessory
        self.kind = kind
        self.showsDivider = showsDivider
        self.tone = tone
        self.tint = tint
    }
}

// MARK: - Le dessin seul

/// **Ce qu'on VOIT d'une ligne** (K06) : tête, titre, sous-titre, accessoire et filet,
/// sans action ni rôle. Sert de libellé à un `NavigationLink` ou à un `Menu`, et de
/// corps au bouton `MeeshyToggleRow`. Une unité « ligne + second contrôle » se compose
/// autour de ce dessin (le (i) des réglages).
public struct MeeshyToggleRowFace<Leading: View, TitleAccessory: View, Trailing: View>: View {
    private let content: MeeshyToggleRowContent
    private let leading: Leading
    private let titleAccessory: TitleAccessory
    private let trailing: Trailing

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.meeshyGlassTone) private var hostTone
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(
        content: MeeshyToggleRowContent,
        @ViewBuilder leading: () -> Leading,
        @ViewBuilder titleAccessory: () -> TitleAccessory,
        @ViewBuilder trailing: () -> Trailing
    ) {
        self.content = content
        self.leading = leading()
        self.titleAccessory = titleAccessory()
        self.trailing = trailing()
    }

    public var body: some View {
        let recipe = MeeshyToggleRowRecipe.resolve(
            accessory: content.accessory,
            kind: content.kind,
            tone: content.tone ?? hostTone,
            isDark: colorScheme == .dark,
            isEnabled: isEnabled,
            isPressed: false,
            isHovered: false,
            tint: content.tint
        )
        VStack(alignment: .leading, spacing: 0) {
            if content.showsDivider {
                Rectangle()
                    .fill(recipe.dividerColor)
                    .frame(height: MeeshyBorder.regular)
                    .accessibilityHidden(true)
            }
            line(recipe)
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.vertical, MeeshySpacing.xs)
                .frame(maxWidth: .infinity, minHeight: recipe.minimumHeight, alignment: .leading)
                .contentShape(Rectangle())
        }
    }

    @ViewBuilder
    private func line(_ recipe: MeeshyToggleRowRecipe) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                HStack(spacing: 0) {
                    leadingSlot(recipe)
                    textColumn(recipe)
                    Spacer(minLength: 0)
                }
                accessoryGroup(recipe)
            }
        } else {
            HStack(spacing: 0) {
                leadingSlot(recipe)
                textColumn(recipe)
                Spacer(minLength: MeeshySpacing.sm)
                accessoryGroup(recipe)
            }
        }
    }

    private func leadingSlot(_ recipe: MeeshyToggleRowRecipe) -> some View {
        leading
            .foregroundStyle(recipe.titleColor)
            .opacity(recipe.contentOpacity)
            .accessibilityHidden(true)
    }

    private func textColumn(_ recipe: MeeshyToggleRowRecipe) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
            HStack(spacing: MeeshySpacing.xs) {
                Text(content.title)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
                    .foregroundStyle(recipe.titleColor)
                    .opacity(recipe.contentOpacity)
                    .fixedSize(horizontal: false, vertical: true)
                titleAccessory
                    .accessibilityHidden(true)
            }
            if let subtitle = MeeshyToggleRowRecipe.visibleSubtitle(content.subtitle) {
                Text(subtitle)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .regular))
                    .foregroundStyle(recipe.subtitleColor)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func accessoryGroup(_ recipe: MeeshyToggleRowRecipe) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            trailing
                .accessibilityHidden(true)
            accessoryView(recipe)
        }
        .opacity(recipe.contentOpacity)
        .meeshyAnimation(.easeInOut(duration: MeeshyToggleRowRecipe.fadeDuration), value: content.accessory)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func accessoryView(_ recipe: MeeshyToggleRowRecipe) -> some View {
        switch content.accessory {
        case .none:
            EmptyView()
        case .toggle(let isOn):
            Toggle(isOn: .constant(isOn)) { EmptyView() }
                .labelsHidden()
                .tint(recipe.trackOnColor)
                .allowsHitTesting(false)
                .transaction { $0.animation = reduceMotion ? nil : $0.animation }
        case .check(let isSelected):
            if isSelected {
                Image(systemName: "checkmark")
                    .font(MeeshyFont.relative(MeeshyIconSize.xl, weight: .semibold))
                    .foregroundStyle(recipe.accessoryColor)
            }
        case .checkbox(let isChecked):
            Image(systemName: isChecked ? "checkmark.square.fill" : "square")
                .font(.system(size: MeeshyToggleRowRecipe.checkboxSide, weight: .regular))
                .foregroundStyle(recipe.accessoryColor)
        case .chevron:
            Image(systemName: "chevron.right")
                .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .semibold))
                .foregroundStyle(recipe.accessoryColor)
        case .value(let text):
            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .regular))
                .foregroundStyle(recipe.accessoryColor)
        }
    }
}

public extension MeeshyToggleRowFace where Leading == MeeshyToggleRowNoSlot, TitleAccessory == MeeshyToggleRowNoSlot, Trailing == MeeshyToggleRowNoSlot {
    init(content: MeeshyToggleRowContent) {
        self.init(content: content, leading: { MeeshyToggleRowNoSlot() }, titleAccessory: { MeeshyToggleRowNoSlot() }, trailing: { MeeshyToggleRowNoSlot() })
    }
}

extension MeeshyToggleRowFace: Equatable where Leading: Equatable, TitleAccessory: Equatable, Trailing: Equatable {
    public static func == (lhs: MeeshyToggleRowFace, rhs: MeeshyToggleRowFace) -> Bool {
        lhs.content == rhs.content && lhs.leading == rhs.leading
            && lhs.titleAccessory == rhs.titleAccessory && lhs.trailing == rhs.trailing
    }
}

// MARK: - La ligne

/// **La ligne de liste qui se touche tout entière** (K06) : toute la surface est la
/// cible, `action` part une fois au relâcher, et l'accessoire est un dessin inerte.
/// L'hôte tient l'état (`isOn`, `isSelected`) et le met à jour lui-même.
public struct MeeshyToggleRow<Leading: View, TitleAccessory: View, Trailing: View>: View {
    private let content: MeeshyToggleRowContent
    private let haptic: MeeshyToggleRowHaptic
    private let action: () -> Void
    private let leading: Leading
    private let titleAccessory: TitleAccessory
    private let trailing: Trailing

    @Environment(\.isEnabled) private var isEnabled

    public init(
        content: MeeshyToggleRowContent,
        haptic: MeeshyToggleRowHaptic = .light,
        action: @escaping () -> Void,
        @ViewBuilder leading: () -> Leading,
        @ViewBuilder titleAccessory: () -> TitleAccessory,
        @ViewBuilder trailing: () -> Trailing
    ) {
        self.content = content
        self.haptic = haptic
        self.action = action
        self.leading = leading()
        self.titleAccessory = titleAccessory()
        self.trailing = trailing()
    }

    public var body: some View {
        Button(action: perform) {
            MeeshyToggleRowFace(
                content: content,
                leading: { leading },
                titleAccessory: { titleAccessory },
                trailing: { trailing }
            )
        }
        .buttonStyle(MeeshyToggleRowPressStyle(kind: content.kind, tone: content.tone, tint: content.tint))
        .accessibilityLabel(MeeshyToggleRowRecipe.accessibilityLabel(title: content.title, subtitle: content.subtitle))
        .accessibilityValue(spokenValue)
        .accessibilityAddTraits(isSelectedTrait)
    }

    private func perform() {
        if haptic == .light, isEnabled {
            HapticFeedback.light()
        }
        action()
    }

    private var spokenValue: String {
        switch MeeshyToggleRowRecipe.valueFor(accessory: content.accessory) {
        case .none, .selected:
            return ""
        case .toggle(let isOn):
            return isOn
                ? String(localized: "kit.glass_button.toggle.on", defaultValue: "Activé", bundle: .module)
                : String(localized: "kit.glass_button.toggle.off", defaultValue: "Désactivé", bundle: .module)
        case .text(let text):
            return text
        }
    }

    private var isSelectedTrait: AccessibilityTraits {
        MeeshyToggleRowRecipe.isChosen(content.accessory) ? .isSelected : []
    }
}

public extension MeeshyToggleRow where Leading == MeeshyToggleRowNoSlot, TitleAccessory == MeeshyToggleRowNoSlot, Trailing == MeeshyToggleRowNoSlot {
    init(
        _ title: String,
        subtitle: String? = nil,
        accessory: MeeshyToggleRowAccessory = .none,
        kind: MeeshyToggleRowKind = .normal,
        showsDivider: Bool = false,
        tone: MeeshyGlassTone? = nil,
        tint: Color? = nil,
        haptic: MeeshyToggleRowHaptic = .light,
        action: @escaping () -> Void
    ) {
        self.init(
            content: MeeshyToggleRowContent(
                title: title, subtitle: subtitle, accessory: accessory, kind: kind,
                showsDivider: showsDivider, tone: tone, tint: tint
            ),
            haptic: haptic,
            action: action,
            leading: { MeeshyToggleRowNoSlot() },
            titleAccessory: { MeeshyToggleRowNoSlot() },
            trailing: { MeeshyToggleRowNoSlot() }
        )
    }
}

public extension MeeshyToggleRow where Leading == MeeshyToggleRowSymbol, TitleAccessory == MeeshyToggleRowNoSlot, Trailing == MeeshyToggleRowNoSlot {
    init(
        _ title: String,
        systemImage: String,
        subtitle: String? = nil,
        accessory: MeeshyToggleRowAccessory = .none,
        kind: MeeshyToggleRowKind = .normal,
        showsDivider: Bool = false,
        tone: MeeshyGlassTone? = nil,
        tint: Color? = nil,
        haptic: MeeshyToggleRowHaptic = .light,
        action: @escaping () -> Void
    ) {
        self.init(
            content: MeeshyToggleRowContent(
                title: title, subtitle: subtitle, accessory: accessory, kind: kind,
                showsDivider: showsDivider, tone: tone, tint: tint
            ),
            haptic: haptic,
            action: action,
            leading: { MeeshyToggleRowSymbol(systemImage) },
            titleAccessory: { MeeshyToggleRowNoSlot() },
            trailing: { MeeshyToggleRowNoSlot() }
        )
    }
}

// MARK: - Le voile d'appui

/// Le voile d'appui : l'encre de la ligne à 15 % tant que le doigt est posé, à 8 %
/// au survol. Il déborde de `MeeshySpacing.sm` de chaque côté sans changer
/// l'encombrement. Il vit dans le style du bouton : l'appui ne re-rend pas le dessin.
private struct MeeshyToggleRowPressStyle: ButtonStyle {
    let kind: MeeshyToggleRowKind
    let tone: MeeshyGlassTone?
    let tint: Color?

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background {
                MeeshyToggleRowVeil(
                    isPressed: configuration.isPressed,
                    kind: kind,
                    tone: tone,
                    tint: tint
                )
            }
    }
}

private struct MeeshyToggleRowVeil: View {
    let isPressed: Bool
    let kind: MeeshyToggleRowKind
    let tone: MeeshyGlassTone?
    let tint: Color?

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.meeshyGlassTone) private var hostTone
    @State private var isHovered = false

    var body: some View {
        let recipe = MeeshyToggleRowRecipe.resolve(
            accessory: .none,
            kind: kind,
            tone: tone ?? hostTone,
            isDark: colorScheme == .dark,
            isEnabled: isEnabled,
            isPressed: isPressed,
            isHovered: isHovered,
            tint: tint
        )
        RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
            .fill(recipe.veilColor)
            .padding(.horizontal, -MeeshySpacing.sm)
            .meeshyAnimation(isPressed ? nil : .easeOut(duration: MeeshyToggleRowRecipe.fadeDuration), value: isPressed)
            .onHover { isHovered = $0 }
            .accessibilityHidden(true)
    }
}
