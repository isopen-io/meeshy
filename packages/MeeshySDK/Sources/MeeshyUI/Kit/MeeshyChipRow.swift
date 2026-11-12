import SwiftUI

/// **La rangée de puces de choix** (K04) : une rangée de capsules d'où l'on
/// choisit une option ou plusieurs. Elle défile, se replie ou partage sa
/// largeur, et s'estompe au bord derrière lequel il reste des puces.
///
/// Un composant CONTRÔLÉ : `selection` appartient à l'hôte, qui l'applique tout
/// de suite ; `onChange(next, tapped)` rend la sélection calculée par
/// `MeeshyChipRowRule`, la rangée ne garde rien. Aucune matière (le verre, la
/// feuille ou la pilule qui la porte viennent d'ailleurs), aucune chaîne
/// fabriquée : l'hôte passe noms et aides, déjà traduits.
///
/// - Sans puce, la rangée ne rend rien, ni hauteur ni marge.
/// - `label` nomme le groupe pour le lecteur d'écran ; il est obligatoire.
/// - Une puce sans titre doit porter un `accessibilityLabel`.
/// - `.disabled(_:)` désactive la rangée entière.
/// - `chipLabel(chip, encre)` remplace le titre (un nom de police peint dans sa
///   police) ; l'encre est celle que la recette donne à l'état de la puce.
///
/// Les fermetures de l'hôte ne sont pas comparées : il les garde stables.
public struct MeeshyChipRow<ID: Hashable & Sendable, ChipLabel: View>: View {
    private let chips: [MeeshyChip<ID>]
    private let selection: Set<ID>
    private let label: String
    private let mode: MeeshyChipRowMode
    private let layout: MeeshyChipRowLayout
    private let semantics: MeeshyChipRowSemantics
    private let surface: MeeshyChipRowSurface
    private let size: MeeshyChipRowSize
    private let inset: CGFloat
    private let revealsSelection: Bool
    private let haptic: MeeshyChipRowHaptic
    private let chipLabel: (MeeshyChip<ID>, Color) -> ChipLabel
    private let onChange: (Set<ID>, ID) -> Void
    private let onAction: ((ID) -> Void)?
    private var previewPressed: ID?

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    public init(
        _ chips: [MeeshyChip<ID>],
        selection: Set<ID>,
        label: String,
        mode: MeeshyChipRowMode = .single,
        layout: MeeshyChipRowLayout = .scroll,
        semantics: MeeshyChipRowSemantics = .choice,
        surface: MeeshyChipRowSurface = .onMedia,
        size: MeeshyChipRowSize = .regular,
        inset: CGFloat = 0,
        revealsSelection: Bool = true,
        haptic: MeeshyChipRowHaptic = .light,
        chipLabel: @escaping (MeeshyChip<ID>, Color) -> ChipLabel,
        onChange: @escaping (Set<ID>, ID) -> Void,
        onAction: ((ID) -> Void)? = nil
    ) {
        assert(!label.isEmpty, "MeeshyChipRow : le nom du groupe est obligatoire et non vide")
        assert(chips.allSatisfy(\.hasAccessibleName), "MeeshyChipRow : une puce sans titre doit porter un accessibilityLabel")
        self.chips = chips
        self.selection = selection
        self.label = label
        self.mode = mode
        self.layout = layout
        self.semantics = semantics
        self.surface = surface
        self.size = size
        self.inset = inset
        self.revealsSelection = revealsSelection
        self.haptic = haptic
        self.chipLabel = chipLabel
        self.onChange = onChange
        self.onAction = onAction
    }

    /// Fige une puce « pressée » : l'instantané et le catalogue ne tiennent pas
    /// un doigt sur l'écran.
    func previewing(pressed id: ID?) -> MeeshyChipRow {
        var copy = self
        copy.previewPressed = id
        return copy
    }

    @ViewBuilder
    public var body: some View {
        if !chips.isEmpty {
            layoutBody
                .accessibilityElement(children: .contain)
                .accessibilityLabel(label)
                .modifier(MeeshyChipGroupTraits(isTabs: semantics == .tabs))
        }
    }

    // MARK: - Dispositions

    @ViewBuilder
    private var layoutBody: some View {
        switch layout {
        case .scroll:
            scrolling
        case .wrap:
            FlowLayout(itemSpacing: MeeshySpacing.xsPlus, lineSpacing: MeeshySpacing.sm) { cells }
                .padding(.horizontal, inset)
        case .equal:
            HStack(spacing: MeeshySpacing.xsPlus) { cells }
                .padding(.horizontal, inset)
        }
    }

    /// La cible déborde la capsule : la marge verticale vit DANS le défilement
    /// (sans quoi il la couperait), et se retire dehors pour que la rangée
    /// garde l'encombrement de la capsule.
    private var scrolling: some View {
        let slack = size.verticalSlack
        return ScrollViewReader { proxy in
            MeeshyFadingScrollView(axis: .horizontal) {
                HStack(spacing: MeeshySpacing.xsPlus) { cells }
                    .padding(.horizontal, inset)
                    .padding(.vertical, slack)
            }
            .padding(.vertical, -slack)
            .onAppear {
                reveal(proxy, to: MeeshyChipRowRule.revealTarget(order: chips.map(\.id), previous: [], current: selection), animated: false)
            }
            .adaptiveOnChange(of: selection) { previous, current in
                reveal(proxy, to: MeeshyChipRowRule.revealTarget(order: chips.map(\.id), previous: previous, current: current), animated: true)
            }
        }
    }

    private var cells: some View {
        ForEach(chips) { chip in
            MeeshyChipCell(spec: spec(for: chip), label: chipLabel, onChange: onChange, onAction: onAction)
                .equatable()
                .id(chip.id)
        }
    }

    // MARK: - Valeurs

    private func spec(for chip: MeeshyChip<ID>) -> MeeshyChipCellSpec<ID> {
        let isSelected = mode != .actions && chip.kind == .choice && selection.contains(chip.id)
        return MeeshyChipCellSpec(
            chip: chip,
            isSelected: isSelected,
            ruleSelection: ruleSelection(isSelected: isSelected, id: chip.id),
            mode: mode,
            semantics: semantics,
            surface: surface,
            size: size,
            haptic: haptic,
            fillsWidth: layout == .equal,
            forcedPressed: previewPressed == chip.id
        )
    }

    private func ruleSelection(isSelected: Bool, id: ID) -> Set<ID> {
        switch mode {
        case .multiple: return selection
        case .single, .singleOrNone: return isSelected ? [id] : []
        case .actions: return []
        }
    }

    // MARK: - Montrer la courante

    /// Centrée : sans animation à l'apparition, en 250 ms à chaque changement,
    /// immédiate sous « réduire les animations ».
    private func reveal(_ proxy: ScrollViewProxy, to target: ID?, animated: Bool) {
        guard revealsSelection, let target else { return }
        let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
        let animation = animated
            ? MeeshyMotion.animation(.easeInOut(duration: MeeshyChipRecipe.revealDuration), reduce: reduce)
            : nil
        withAnimation(animation) {
            proxy.scrollTo(target, anchor: .center)
        }
    }
}

// MARK: - Le titre par défaut

public extension MeeshyChipRow where ChipLabel == MeeshyChipTitleLabel {
    init(
        _ chips: [MeeshyChip<ID>],
        selection: Set<ID>,
        label: String,
        mode: MeeshyChipRowMode = .single,
        layout: MeeshyChipRowLayout = .scroll,
        semantics: MeeshyChipRowSemantics = .choice,
        surface: MeeshyChipRowSurface = .onMedia,
        size: MeeshyChipRowSize = .regular,
        inset: CGFloat = 0,
        revealsSelection: Bool = true,
        haptic: MeeshyChipRowHaptic = .light,
        onChange: @escaping (Set<ID>, ID) -> Void,
        onAction: ((ID) -> Void)? = nil
    ) {
        self.init(
            chips, selection: selection, label: label, mode: mode, layout: layout, semantics: semantics,
            surface: surface, size: size, inset: inset, revealsSelection: revealsSelection, haptic: haptic,
            chipLabel: { chip, _ in MeeshyChipTitleLabel(chip.title) },
            onChange: onChange, onAction: onAction
        )
    }
}

/// Des onglets se disent comme une barre d'onglets.
private struct MeeshyChipGroupTraits: ViewModifier {
    let isTabs: Bool

    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.accessibilityAddTraits(isTabs ? .isTabBar : [])
        } else {
            content
        }
    }
}
