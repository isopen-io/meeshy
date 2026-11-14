import SwiftUI

// MARK: - Ligne de références

/// Largeurs mesurées séparément : celle du contenu, celle de la place offerte.
struct MeeshyContextContentWidthKey: PreferenceKey {
    static let defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

struct MeeshyContextAvailableWidthKey: PreferenceKey {
    static let defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

/// La ligne de références : une rangée de segments séparés par « · », chacun
/// bouton de SA feuille. Absente si vide ; elle défile quand elle déborde, et
/// l'estompe ne paraît que dans ce cas.
public struct MeeshyContextReferenceLine: View {
    public let label: String
    public let references: [MeeshyContextReference]
    public let alignment: MeeshyContextAlignment
    public let surface: MeeshyContextSurface
    public let tint: Color?

    @Environment(\.colorScheme) private var colorScheme
    @State private var contentWidth: CGFloat = 0
    @State private var availableWidth: CGFloat = 0

    public init(
        label: String,
        references: [MeeshyContextReference],
        alignment: MeeshyContextAlignment = .center,
        surface: MeeshyContextSurface = .media,
        tint: Color? = nil
    ) {
        self.label = label
        self.references = references
        self.alignment = alignment
        self.surface = surface
        self.tint = tint
    }

    public var body: some View {
        let visible = MeeshyContextLinesRule.visibleItems(references, text: \.text)
        if !visible.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    ForEach(visible.indices, id: \.self) { index in
                        if index > 0 {
                            Text("·").accessibilityHidden(true)
                        }
                        segment(visible[index])
                    }
                }
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                .foregroundStyle(ink)
                .padding(.horizontal, MeeshySpacing.md)
                .background(
                    GeometryReader { proxy in
                        Color.clear.preference(key: MeeshyContextContentWidthKey.self, value: proxy.size.width)
                    }
                )
            }
            .background(
                GeometryReader { proxy in
                    Color.clear.preference(key: MeeshyContextAvailableWidthKey.self, value: proxy.size.width)
                }
            )
            .onPreferenceChange(MeeshyContextContentWidthKey.self) { contentWidth = $0 }
            .onPreferenceChange(MeeshyContextAvailableWidthKey.self) { availableWidth = $0 }
            .mask(edgeMask)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(label)
        }
    }

    private var ink: Color {
        if let tint { return tint }
        return surface == .media ? MeeshyColors.onMediaSecondary : MeeshyColors.textSecondary(isDark: colorScheme == .dark)
    }

    @ViewBuilder
    private func segment(_ reference: MeeshyContextReference) -> some View {
        let content = HStack(spacing: MeeshySpacing.xsPlus) {
            if let systemImage = reference.systemImage {
                Image(systemName: systemImage)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                    .accessibilityHidden(true)
            }
            Text(reference.text).lineLimit(1)
        }
        if let action = reference.action {
            Button {
                action()
            } label: {
                content
            }
            .buttonStyle(MeeshyContextPressStyle())
            .accessibilityLabel(reference.spokenLabel)
            .accessibilityHint(reference.hint ?? "")
            .accessibilityAddTraits(.isButton)
        } else {
            content
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(reference.spokenLabel)
        }
    }

    /// L'estompe ne se pose que si le contenu déborde : sinon, un masque plein.
    private var edgeMask: some View {
        let fades = MeeshyContextLinesRule.needsFade(contentWidth: contentWidth, available: availableWidth)
        return LinearGradient(
            stops: fades
                ? [
                    .init(color: .clear, location: 0),
                    .init(color: .black, location: 0.12),
                    .init(color: .black, location: 0.88),
                    .init(color: .clear, location: 1),
                ]
                : [.init(color: .black, location: 0), .init(color: .black, location: 1)],
            startPoint: .leading,
            endPoint: .trailing
        )
    }
}

// MARK: - Puce

/// La puce : un verre posé sur le contenu (glyphe, valeur, détail, chevron).
/// Le verre vient de K01 ; K24 ne le dessine pas. Un seul élément dit
/// « nom, valeur » ; sans action, elle n'est qu'un texte.
public struct MeeshyContextChip: View {
    public let label: String
    public let title: String
    public let systemImage: String?
    public let detail: String?
    public let showsChevron: Bool?
    public let isExpanded: Bool?
    public let tone: MeeshyGlassTone?
    public let updatesFrequently: Bool
    public let isPressed: Bool?
    public let hint: String?
    public let tint: Color?
    public let action: (() -> Void)?

    public init(
        label: String,
        title: String,
        systemImage: String? = nil,
        detail: String? = nil,
        showsChevron: Bool? = nil,
        isExpanded: Bool? = nil,
        tone: MeeshyGlassTone? = nil,
        updatesFrequently: Bool = false,
        isPressed: Bool? = nil,
        hint: String? = nil,
        tint: Color? = nil,
        action: (() -> Void)? = nil
    ) {
        self.label = label
        self.title = title
        self.systemImage = systemImage
        self.detail = detail
        self.showsChevron = showsChevron
        self.isExpanded = isExpanded
        self.tone = tone
        self.updatesFrequently = updatesFrequently
        self.isPressed = isPressed
        self.hint = hint
        self.tint = tint
        self.action = action
    }

    public var body: some View {
        if MeeshyContextLinesRule.showsChip(title: title, glyph: systemImage) {
            tappable(pill)
        }
    }

    private var hasChevron: Bool {
        MeeshyContextLinesRule.showsChevron(hasAction: action != nil, requested: showsChevron)
    }

    private var valueText: String {
        [title, detail ?? ""].filter { !$0.isEmpty }.joined(separator: ", ")
    }

    private var pill: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(MeeshyFont.relative(MeeshyIconSize.md))
                    .accessibilityHidden(true)
            }
            if !title.isEmpty {
                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .lineLimit(1)
            }
            if let detail, !detail.isEmpty {
                Text(detail)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .monospacedDigit()
                    .fixedSize()
            }
            if hasChevron {
                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                    .rotationEffect(.degrees(isExpanded == true ? -90 : 0))
                    .accessibilityHidden(true)
            }
        }
        .foregroundStyle(tint ?? MeeshyColors.onMedia)
        .padding(.horizontal, MeeshySpacing.md)
        .frame(height: MeeshyContextLinesRecipe.chipHeight)
        .meeshyGlass(in: Capsule(), tone: tone, tint: tint, isInteractive: action != nil, isPressed: isPressed)
        .contentShape(Capsule())
    }

    @ViewBuilder
    private func tappable<Content: View>(_ content: Content) -> some View {
        if let action {
            Button {
                HapticFeedback.light()
                action()
            } label: {
                content
            }
            .buttonStyle(MeeshyContextPressStyle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .accessibilityValue(valueText)
            .accessibilityHint(hint ?? "")
            .accessibilityAddTraits(.isButton)
            .accessibilityAddTraits(updatesFrequently ? .updatesFrequently : .isButton)
        } else {
            content
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(label)
                .accessibilityValue(valueText)
        }
    }
}
