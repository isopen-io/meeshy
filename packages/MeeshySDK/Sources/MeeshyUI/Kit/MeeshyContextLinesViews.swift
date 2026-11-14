import SwiftUI

// MARK: - Une référence (donnée immuable, l'action reste à l'hôte)

/// Une référence de la ligne : son texte, son nom dit, et son action propre
/// (une référence ouvre sa feuille, la ligne ne fait rien d'elle-même).
public struct MeeshyContextReference {
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
}

// MARK: - Le toucher, un seul site (fiche § 4)

/// Le style d'un élément touchable de K24 : une ligne passe à 70 % à l'appui,
/// sans échelle ; « réduire les animations » rend le changement immédiat.
struct MeeshyContextPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? MeeshyContextLinesRecipe.pressedOpacity : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: MeeshyContextLinesRecipe.fadeDuration), value: configuration.isPressed)
    }
}

// MARK: - Ligne de son

/// La ligne de son : note, « titre · auteur », onde, durée. Un seul élément
/// d'accessibilité ; elle se pose par l'hôte, au-dessus du contenu.
public struct MeeshyContextSoundLine: View {
    public let label: String
    public let title: String
    public let levels: [Float]?
    public let detail: String?
    public let systemImage: String
    public let hint: String?
    public let alignment: MeeshyContextAlignment
    public let surface: MeeshyContextSurface
    public let tint: Color?
    public let haptic: MeeshyContextHaptic
    public let action: (() -> Void)?

    @Environment(\.colorScheme) private var colorScheme

    public init(
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
        action: (() -> Void)? = nil
    ) {
        self.label = label
        self.title = title
        self.levels = levels
        self.detail = detail
        self.systemImage = systemImage
        self.hint = hint
        self.alignment = alignment
        self.surface = surface
        self.tint = tint
        self.haptic = haptic
        self.action = action
    }

    public var body: some View {
        if MeeshyContextLinesRule.soundLineHasContent(title: title, levels: levels, detail: detail) {
            tappable(line)
        }
    }

    private var ink: Color {
        if let tint { return tint }
        return surface == .media ? MeeshyColors.onMedia : MeeshyColors.textPrimary(isDark: colorScheme == .dark)
    }

    private var waveInk: Color {
        if tint != nil { return ink.opacity(0.7) }
        return surface == .media ? MeeshyColors.onMediaMuted : ink.opacity(0.7)
    }

    private var line: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: systemImage)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundStyle(ink)
                .accessibilityHidden(true)
            if !title.isEmpty {
                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                    .foregroundStyle(ink)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            if MeeshyContextLinesRule.showsWave(levels: levels) {
                wave
            }
            if let detail, !detail.isEmpty {
                Text(detail)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                    .foregroundStyle(ink)
                    .monospacedDigit()
                    .fixedSize()
            }
        }
        .frame(minHeight: MeeshyContextLinesRecipe.minimumTarget)
        .contentShape(Rectangle())
    }

    /// L'onde : une passe, dessinée à partir du relevé. Fixe, jamais animée.
    private var wave: some View {
        Canvas { context, size in
            let bars = MeeshyContextWaveRule.bars(levels: levels, count: MeeshyContextLinesRecipe.barCount)
            let step = size.width / CGFloat(bars.count)
            let barWidth = MeeshyContextLinesRecipe.waveBarWidth
            for (index, value) in bars.enumerated() {
                let height = size.height * CGFloat(value)
                let rect = CGRect(
                    x: CGFloat(index) * step + (step - barWidth) / 2,
                    y: (size.height - height) / 2,
                    width: barWidth,
                    height: height
                )
                context.fill(Path(roundedRect: rect, cornerRadius: barWidth / 2), with: .color(waveInk))
            }
        }
        .frame(width: MeeshyContextLinesRecipe.waveSize.width, height: MeeshyContextLinesRecipe.waveSize.height)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func tappable<Content: View>(_ content: Content) -> some View {
        if let action {
            Button {
                if MeeshyContextLinesRule.firesHaptic(hasAction: true, haptic: haptic) {
                    HapticFeedback.light()
                }
                action()
            } label: {
                content
            }
            .buttonStyle(MeeshyContextPressStyle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .accessibilityHint(hint ?? "")
            .accessibilityAddTraits(.isButton)
        } else {
            content
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(label)
        }
    }
}
