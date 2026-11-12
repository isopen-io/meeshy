import SwiftUI
import MeeshySDK

// MARK: - Ce que l'en-tête dit à ses capsules

private struct MeeshyModeReducesToGlyphKey: EnvironmentKey {
    static let defaultValue = false
}

private struct MeeshyModeLabelScaleKey: EnvironmentKey {
    static let defaultValue: CGFloat = 1
}

private struct MeeshyModeFixedPressKey: EnvironmentKey {
    static let defaultValue: Bool? = nil
}

extension EnvironmentValues {
    /// Posé par l'en-tête quand il ne tient plus : la capsule qui a un glyphe n'en montre que lui.
    var meeshyModeReducesToGlyph: Bool {
        get { self[MeeshyModeReducesToGlyphKey.self] }
        set { self[MeeshyModeReducesToGlyphKey.self] = newValue }
    }

    /// Posé par l'en-tête au pas le plus serré : les libellés peuvent descendre à 80 % avant de se tronquer.
    var meeshyModeLabelScale: CGFloat {
        get { self[MeeshyModeLabelScaleKey.self] }
        set { self[MeeshyModeLabelScaleKey.self] = newValue }
    }

    /// Un appui figé, pour la tuile « pressée » du catalogue et des instantanés : il prime sur le doigt.
    var meeshyModeFixedPress: Bool? {
        get { self[MeeshyModeFixedPressKey.self] }
        set { self[MeeshyModeFixedPressKey.self] = newValue }
    }
}

// MARK: - La capsule

/// **Une capsule à libellé d'un mode plein écran** (K16) : « Quitter » ou le centre sur verre `dense` de
/// K01, la validation en plein blanc (fond, encre et ombre de l'actif de K02). Le nom est toujours dit au
/// lecteur d'écran, même réduite à la coche ; jamais de légende dessous.
///
/// - Toucher : l'action part une fois, au relâcher ; rien si désactivée (`.disabled`) ou occupée. UN
///   impact léger par le site unique de K02 (`haptic: .none` quand l'hôte joue le sien).
/// - Occupée : la roue du système remplace le glyphe (ou le titre), la largeur est gardée, la valeur dite
///   est « En cours ».
/// - Hauteur visible 44 ; la cible est la capsule.
///
/// `Equatable` sur ses valeurs (la fermeture hors comparaison) : un hôte qui se re-rend à paramètres
/// égaux ne la re-rend pas.
public struct MeeshyModeCapsule: View, Equatable {
    private let values: MeeshyModeActionValues
    private let kind: MeeshyModeCapsuleKind
    private let action: () -> Void

    public init(
        title: String,
        systemImage: String? = nil,
        kind: MeeshyModeCapsuleKind = .glass,
        display: MeeshyModeCapsuleDisplay = .title,
        isBusy: Bool = false,
        hint: String? = nil,
        haptic: MeeshyGlassButtonHaptic = .light,
        action: @escaping () -> Void
    ) {
        assert(!title.isEmpty, "MeeshyModeCapsule : le nom est obligatoire et non vide, même en coche")
        self.values = MeeshyModeActionValues(
            title: title, systemImage: systemImage, display: display, hint: hint,
            isEnabled: true, isBusy: isBusy, haptic: haptic
        )
        self.kind = kind
        self.action = action
    }

    init(_ action: MeeshyModeAction, kind: MeeshyModeCapsuleKind) {
        self.values = action.values
        self.kind = kind
        self.action = action.action
    }

    public static func == (lhs: MeeshyModeCapsule, rhs: MeeshyModeCapsule) -> Bool {
        lhs.values == rhs.values && lhs.kind == rhs.kind
    }

    @Environment(\.isEnabled) private var isEnabled

    public var body: some View {
        Button(action: activate) {
            MeeshyModeCapsuleFace(values: values, kind: kind)
        }
        .buttonStyle(MeeshyGlassPressStyle())
        .accessibilityLabel(values.title)
        .accessibilityHint(values.hint ?? "")
        .accessibilityValue(values.isBusy ? MeeshyProgressRingWords.spokenValue(percent: nil, valueText: nil) : "")
        .accessibilityShowsLargeContentViewer {
            Label(values.title, systemImage: values.systemImage ?? "circle")
        }
    }

    private func activate() {
        MeeshyGlassButtonTrigger.perform(
            isEnabled: isEnabled && !values.isBusy, haptic: values.haptic, action: action
        )
    }
}

// MARK: - Ce qu'on voit

private struct MeeshyModeCapsuleFace: View {
    let values: MeeshyModeActionValues
    let kind: MeeshyModeCapsuleKind

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.meeshyGlassIsPressed) private var fingerPressed
    @Environment(\.meeshyModeFixedPress) private var fixedPress
    @Environment(\.meeshyGlassTone) private var hostTone
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.meeshyModeReducesToGlyph) private var reducesToGlyph
    @Environment(\.meeshyModeLabelScale) private var labelScale

    var body: some View {
        let isPressed = fixedPress ?? fingerPressed
        let style = MeeshyModeCapsuleStyle.resolve(
            kind: kind, isPressed: isPressed, isEnabled: isEnabled, isBusy: values.isBusy
        )
        let display = MeeshyModeChromeRecipe.effectiveDisplay(
            reducesToGlyph && values.systemImage != nil ? .glyph : values.display,
            hasGlyph: values.systemImage != nil
        )
        return content(display: display)
            .foregroundStyle(ink)
            .padding(.horizontal, MeeshyModeChromeRecipe.capsuleMargin)
            .frame(minWidth: MeeshyModeChromeRecipe.capsuleHeight, minHeight: MeeshyModeChromeRecipe.capsuleHeight)
            .modifier(MeeshyModeCapsuleSurface(style: style, isPressed: isPressed))
            .opacity(style.opacity)
            .contentShape(Capsule())
    }

    @ViewBuilder
    private func content(display: MeeshyModeCapsuleDisplay) -> some View {
        let hasGlyph = display != .title
        let hasTitle = display != .glyph
        if values.isBusy, !hasGlyph {
            title.hidden().overlay { spinner(size: MeeshyModeChromeRecipe.glyphSize) }
        } else {
            HStack(spacing: MeeshyModeChromeRecipe.glyphGap) {
                if hasGlyph { glyph(display: display) }
                if hasTitle { title }
            }
        }
    }

    @ViewBuilder
    private func glyph(display: MeeshyModeCapsuleDisplay) -> some View {
        let size = display == .glyph ? MeeshyModeChromeRecipe.checkSize : MeeshyModeChromeRecipe.glyphSize
        if values.isBusy {
            spinner(size: size)
        } else if let name = values.systemImage {
            Image(systemName: name)
                .font(.system(size: size, weight: display == .glyph ? .bold : .semibold))
                .accessibilityHidden(true)
        }
    }

    private var title: some View {
        Text(values.title)
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
            .lineLimit(1)
            .minimumScaleFactor(labelScale)
            .truncationMode(.tail)
            .accessibilityHidden(true)
    }

    private func spinner(size: CGFloat) -> some View {
        ProgressView()
            .progressViewStyle(.circular)
            .tint(ink)
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }

    private var ink: Color {
        if kind == .solid { return MeeshyColors.indigo950 }
        return hostTone == .theme ? MeeshyColors.textPrimary(isDark: colorScheme == .dark) : MeeshyColors.onMedia
    }
}

/// La matière : du verre `dense` de K01, interactif, pour une capsule de verre ; le plein blanc et son
/// ombre pour la validation. Aucune autre matière ne se pose ici.
private struct MeeshyModeCapsuleSurface: ViewModifier {
    let style: MeeshyModeCapsuleStyle
    let isPressed: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        switch style.kind {
        case .glass:
            content.meeshyGlass(in: Capsule(), density: .dense, isInteractive: style.respondsToTouch, isPressed: isPressed)
        case .solid:
            content.background {
                Capsule()
                    .fill(MeeshyColors.onMedia.opacity(style.fillOpacity))
                    .shadow(
                        color: MeeshyColors.mediaBackdrop.opacity(style.shadow?.opacity ?? 0),
                        radius: style.shadow?.radius ?? 0, x: 0, y: style.shadow?.y ?? 0
                    )
            }
        }
    }
}
