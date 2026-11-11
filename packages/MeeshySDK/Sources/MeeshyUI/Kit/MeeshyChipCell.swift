import SwiftUI

// MARK: - Le titre par défaut

/// Le titre d'une puce, sans localisation (l'hôte a déjà traduit) : rien pour
/// un glyphe seul, afin que la rangée n'ajoute aucun écart.
public struct MeeshyChipTitleLabel: View, Equatable {
    public let title: String

    public init(_ title: String) {
        self.title = title
    }

    @ViewBuilder
    public var body: some View {
        if !title.isEmpty {
            Text(verbatim: title)
        }
    }
}

// MARK: - Les VALEURS d'une puce

/// Ce que `==` compare : tout ce qui change ce que la puce DESSINE ou DIT.
/// Les fermetures de l'hôte n'en font pas partie, il les garde stables.
///
/// `ruleSelection` est la sélection que la loi du toucher lit : la puce seule
/// en choix simple (donc une autre puce qui change ne touche pas celle-ci),
/// la sélection entière en choix multiple, où la bascule en a besoin.
struct MeeshyChipCellSpec<ID: Hashable & Sendable>: Equatable {
    let chip: MeeshyChip<ID>
    let isSelected: Bool
    let ruleSelection: Set<ID>
    let mode: MeeshyChipRowMode
    let semantics: MeeshyChipRowSemantics
    let surface: MeeshyChipRowSurface
    let size: MeeshyChipRowSize
    let haptic: MeeshyChipRowHaptic
    let fillsWidth: Bool
    let forcedPressed: Bool
}

// MARK: - Ce qu'on VOIT

/// La capsule d'une puce : glyphe de tête, titre (ou le `chipLabel` de l'hôte),
/// glyphe de fin. Un voile plat, jamais de verre ni de liseré. Le texte grandit
/// avec le Dynamic Type et la capsule avec lui, sur une ligne.
struct MeeshyChipFace<ID: Hashable & Sendable, ChipLabel: View>: View {
    let spec: MeeshyChipCellSpec<ID>
    let label: (MeeshyChip<ID>, Color) -> ChipLabel
    let isPressed: Bool

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme
    @State private var isHovered = false
    @ScaledMetric(relativeTo: .footnote) private var height: CGFloat
    @ScaledMetric(relativeTo: .footnote) private var fontSize: CGFloat
    @ScaledMetric(relativeTo: .footnote) private var padding: CGFloat

    init(spec: MeeshyChipCellSpec<ID>, label: @escaping (MeeshyChip<ID>, Color) -> ChipLabel, isPressed: Bool) {
        self.spec = spec
        self.label = label
        self.isPressed = isPressed
        _height = ScaledMetric(wrappedValue: spec.size.height, relativeTo: .footnote)
        _fontSize = ScaledMetric(wrappedValue: spec.size.fontSize, relativeTo: .footnote)
        _padding = ScaledMetric(wrappedValue: spec.size.horizontalPadding, relativeTo: .footnote)
    }

    var body: some View {
        let recipe = self.recipe
        let isDark = colorScheme == .dark
        let ink = recipe.inkColor(isDark: isDark)
        return content(ink: ink)
            .padding(.horizontal, padding)
            .frame(minHeight: height)
            .frame(maxWidth: spec.fillsWidth ? CGFloat.infinity : nil)
            .background {
                Capsule().fill(recipe.fillColor(isDark: isDark, tint: spec.chip.tint).opacity(recipe.fillOpacity))
            }
            .opacity(recipe.opacity)
            .meeshyAnimation(.easeInOut(duration: MeeshyChipRecipe.toneFadeDuration), value: spec.isSelected)
            .frame(minWidth: MeeshyControlSize.tapTarget)
            .contentShape(Rectangle().inset(by: -spec.size.verticalSlack))
            .onHover { isHovered = $0 }
    }

    private var recipe: MeeshyChipRecipe {
        MeeshyChipRecipe.resolve(
            surface: spec.surface,
            isSelected: spec.isSelected,
            isPressed: isPressed,
            isHovered: isHovered,
            isEnabled: isEnabled,
            isTinted: spec.chip.tint != nil
        )
    }

    private func content(ink: Color) -> some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            if let symbol = spec.chip.systemImage {
                Image(systemName: symbol)
                    .font(.system(size: spec.chip.isGlyphOnly ? MeeshyIconSize.md : MeeshyIconSize.sm, weight: .semibold))
                    .accessibilityHidden(true)
            }
            label(spec.chip, ink)
                .font(.system(size: fontSize, weight: .bold))
            if let symbol = spec.chip.trailing.systemImage {
                Image(systemName: symbol)
                    .font(.system(size: MeeshyIconSize.xs, weight: .semibold))
                    .accessibilityHidden(true)
            }
        }
        .foregroundStyle(ink)
        .lineLimit(1)
    }
}

/// Le style du bouton : l'appui se lit dans `configuration.isPressed`, donc la
/// capsule se redessine seule, jamais l'hôte. Aucune échelle (K02).
struct MeeshyChipButtonStyle<ID: Hashable & Sendable, ChipLabel: View>: ButtonStyle {
    let spec: MeeshyChipCellSpec<ID>
    let label: (MeeshyChip<ID>, Color) -> ChipLabel

    func makeBody(configuration: Configuration) -> some View {
        MeeshyChipFace(spec: spec, label: label, isPressed: configuration.isPressed || spec.forcedPressed)
    }
}

// MARK: - La cellule

/// Une puce touchable : son bouton, son nom, son rôle. `Equatable` sur ses
/// valeurs : une rangée qui se re-rend à valeurs égales ne la re-rend pas.
struct MeeshyChipCell<ID: Hashable & Sendable, ChipLabel: View>: View, Equatable {
    let spec: MeeshyChipCellSpec<ID>
    let label: (MeeshyChip<ID>, Color) -> ChipLabel
    let onChange: (Set<ID>, ID) -> Void
    let onAction: ((ID) -> Void)?

    @Environment(\.isEnabled) private var isEnabled

    init(
        spec: MeeshyChipCellSpec<ID>,
        label: @escaping (MeeshyChip<ID>, Color) -> ChipLabel,
        onChange: @escaping (Set<ID>, ID) -> Void,
        onAction: ((ID) -> Void)?
    ) {
        self.spec = spec
        self.label = label
        self.onChange = onChange
        self.onAction = onAction
    }

    static func == (lhs: MeeshyChipCell, rhs: MeeshyChipCell) -> Bool {
        lhs.spec == rhs.spec
    }

    var body: some View {
        let state = MeeshyChipAccessibility.resolve(
            mode: spec.mode, semantics: spec.semantics, kind: spec.chip.kind, isSelected: spec.isSelected
        )
        return Button(action: activate) { EmptyView() }
            .buttonStyle(MeeshyChipButtonStyle(spec: spec, label: label))
            .disabled(!spec.chip.isEnabled)
            .accessibilityLabel(spec.chip.name)
            .accessibilityHint(spec.chip.hint ?? "")
            .modifier(MeeshyChipTraits(state: state))
    }

    private func activate() {
        let response = MeeshyChipRowRule.response(
            selection: spec.ruleSelection, tapped: spec.chip.id, mode: spec.mode, kind: spec.chip.kind
        )
        MeeshyChipRowTrigger.perform(
            response: response,
            tapped: spec.chip.id,
            isEnabled: isEnabled && spec.chip.isEnabled,
            haptic: spec.haptic,
            onChange: onChange,
            onAction: onAction
        )
    }
}

/// Le rôle d'une puce pour le lecteur d'écran : sélectionnée, ou bascule.
private struct MeeshyChipTraits: ViewModifier {
    let state: MeeshyChipAccessibility

    func body(content: Content) -> some View {
        content.accessibilityAddTraits(traits)
    }

    private var traits: AccessibilityTraits {
        var result: AccessibilityTraits = []
        if state.isSelected { result.insert(.isSelected) }
        if #available(iOS 17.0, *), state.role == .toggle { result.insert(.isToggle) }
        return result
    }
}
