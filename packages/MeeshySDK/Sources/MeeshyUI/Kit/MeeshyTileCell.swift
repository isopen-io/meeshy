import SwiftUI

// MARK: - Les VALEURS d'une vignette

/// Ce que `==` compare : tout ce qui change ce que la vignette DESSINE ou DIT.
/// L'aperçu et les rappels de l'hôte n'en font pas partie : il les garde
/// stables, et signale un aperçu neuf par `tile.previewVersion`.
nonisolated struct MeeshyTileCellSpec<ID: Hashable & Sendable>: Equatable {
    let tile: MeeshyTile<ID>
    let isSelected: Bool
    let tileSize: CGSize
    let names: MeeshyTileNames
    let selectionStyle: MeeshyTileSelectionStyle
    let surface: MeeshyTileSurface
    let haptic: MeeshyTileHaptic
    /// Une voisine de la courante, réduite : le carrousel qui le demande.
    let isNeighbour: Bool
    /// La courante dont l'hôte tient les gestes.
    let listensToGestures: Bool
    /// La cellule d'une grille : l'aperçu prend la largeur de sa colonne.
    let fillsWidth: Bool
    let forcedPressed: Bool
}

// MARK: - Ce qu'on VOIT

/// La face d'une vignette : l'aperçu rogné à sa forme, le cercle ou le fond
/// plein de la courante, le nom dessous. Rien n'est posé en verre.
struct MeeshyTileFace<ID: Hashable & Sendable, Preview: View>: View {
    let spec: MeeshyTileCellSpec<ID>
    let preview: (MeeshyTile<ID>, MeeshyTileState) -> Preview
    let isPressed: Bool

    @Environment(\.isEnabled) var isEnabled
    @Environment(\.colorScheme) var colorScheme
    @State var isHovered = false
    @ScaledMetric(relativeTo: .footnote) var nameSize: CGFloat = MeeshyTileMetrics.nameFontSize

    var body: some View {
        let recipe = self.recipe
        let isDark = colorScheme == .dark
        let ink = recipe.toneColor(isDark: isDark)
        return VStack(spacing: MeeshyTileMetrics.nameGap) {
            visual(recipe: recipe, ink: ink, isDark: isDark)
            if spec.names == .each, !spec.tile.title.isEmpty {
                name(ink: ink)
            }
        }
        .scaleEffect(spec.isNeighbour ? MeeshyTileRecipe.neighbourScale : 1)
        .opacity(recipe.opacity * (spec.isNeighbour ? MeeshyTileRecipe.neighbourOpacity : 1))
        .meeshyAnimation(.easeInOut(duration: MeeshyTileRecipe.ringFadeDuration), value: spec.isSelected)
        .meeshyAnimation(.easeOut(duration: MeeshyTileRecipe.neighbourFadeDuration), value: spec.isNeighbour)
        .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
        .contentShape(Rectangle())
        .onHover { isHovered = $0 }
    }

    private var recipe: MeeshyTileRecipe {
        MeeshyTileRecipe.resolve(
            surface: spec.surface,
            selectionStyle: spec.selectionStyle,
            isSelected: spec.isSelected,
            isPressed: isPressed,
            isHovered: isHovered,
            isEnabled: isEnabled && spec.tile.isEnabled
        )
    }

    private var radius: CGFloat {
        spec.selectionStyle == .fill ? MeeshyTileMetrics.fillRadius : MeeshyTileMetrics.radius
    }

    private var state: MeeshyTileState {
        MeeshyTileState(isSelected: spec.isSelected, isEnabled: isEnabled && spec.tile.isEnabled)
    }

    private func visual(recipe: MeeshyTileRecipe, ink: Color, isDark: Bool) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        return ZStack {
            Rectangle().fill(ink.opacity(recipe.fillOpacity))
            placeholder(recipe: recipe, ink: ink, isDark: isDark)
            preview(spec.tile, state)
        }
        .frame(width: spec.fillsWidth ? nil : spec.tileSize.width, height: spec.fillsWidth ? nil : spec.tileSize.height)
        .aspectRatio(spec.fillsWidth ? spec.tileSize.width / spec.tileSize.height : nil, contentMode: .fit)
        .clipShape(shape)
        .overlay { ring(recipe: recipe, ink: ink) }
        .accessibilityHidden(true)
    }

    /// Le voile et le glyphe d'un aperçu qui n'est pas encore là : ils se
    /// peignent SOUS l'aperçu, qui les recouvre dès qu'il arrive.
    @ViewBuilder
    private func placeholder(recipe: MeeshyTileRecipe, ink: Color, isDark: Bool) -> some View {
        if let symbol = spec.tile.placeholderSystemImage {
            ZStack {
                Rectangle().fill(ink.opacity(MeeshyTileRecipe.placeholderVeil))
                Image(systemName: symbol)
                    .font(Font.system(size: MeeshyIconSize.xl, weight: .semibold))
                    .foregroundStyle(recipe.fillInkColor(isDark: isDark) ?? ink)
            }
        }
    }

    /// 2 de vide transparent, puis 2 de trait : dehors de l'aperçu, que la
    /// réserve de la bande garde de tout rognage.
    private func ring(recipe: MeeshyTileRecipe, ink: Color) -> some View {
        let outset = MeeshyTileMetrics.ringGap + MeeshyTileMetrics.ringLine
        return RoundedRectangle(cornerRadius: radius + outset, style: .continuous)
            .strokeBorder(ink, lineWidth: MeeshyTileMetrics.ringLine)
            .padding(-outset)
            .opacity(recipe.ringOpacity)
            .allowsHitTesting(false)
    }

    private func name(ink: Color) -> some View {
        Text(verbatim: spec.tile.title)
            .font(Font.system(size: nameSize, weight: .semibold))
            .foregroundStyle(ink)
            .lineLimit(MeeshyTileMetrics.nameMaxLines)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .frame(width: spec.fillsWidth ? nil : spec.tileSize.width)
            .accessibilityHidden(true)
    }
}

/// Le style du bouton : l'appui se lit dans `configuration.isPressed`, donc la
/// vignette se redessine seule, jamais l'hôte. Aucune échelle à l'appui.
struct MeeshyTileButtonStyle<ID: Hashable & Sendable, Preview: View>: ButtonStyle {
    let spec: MeeshyTileCellSpec<ID>
    let preview: (MeeshyTile<ID>, MeeshyTileState) -> Preview

    func makeBody(configuration: Configuration) -> some View {
        MeeshyTileFace(spec: spec, preview: preview, isPressed: configuration.isPressed || spec.forcedPressed)
    }
}

// MARK: - La cellule

/// Une vignette touchable : son bouton, son nom, son rôle. `Equatable` sur ses
/// valeurs : une bande qui se re-rend à valeurs égales ne la re-rend pas.
struct MeeshyTileCell<ID: Hashable & Sendable, Preview: View>: View, Equatable {
    let spec: MeeshyTileCellSpec<ID>
    let preview: (MeeshyTile<ID>, MeeshyTileState) -> Preview
    let onSelect: (ID) -> Void
    let gestures: MeeshyTileCurrentGestures?

    @Environment(\.isEnabled) private var isEnabled

    init(
        spec: MeeshyTileCellSpec<ID>,
        preview: @escaping (MeeshyTile<ID>, MeeshyTileState) -> Preview,
        onSelect: @escaping (ID) -> Void,
        gestures: MeeshyTileCurrentGestures?
    ) {
        self.spec = spec
        self.preview = preview
        self.onSelect = onSelect
        self.gestures = gestures
    }

    static func == (lhs: MeeshyTileCell, rhs: MeeshyTileCell) -> Bool {
        lhs.spec == rhs.spec
    }

    var body: some View {
        Button(action: activate) { EmptyView() }
            .buttonStyle(MeeshyTileButtonStyle(spec: spec, preview: preview))
            .disabled(!spec.tile.isEnabled)
            .accessibilityLabel(spec.tile.name)
            .accessibilityHint(spec.tile.hint ?? "")
            .accessibilityAddTraits(spec.isSelected ? .isSelected : [])
            .modifier(MeeshyTileGestures(gestures: spec.listensToGestures ? gestures : nil, offersActions: true))
    }

    private func activate() {
        MeeshyTileStripTrigger.perform(
            tapped: spec.tile.id,
            selection: spec.isSelected ? spec.tile.id : nil,
            isEnabled: isEnabled && spec.tile.isEnabled,
            haptic: spec.haptic,
            onSelect: onSelect
        )
    }
}

// MARK: - Les gestes de l'hôte sur la courante

/// Deux tapes et un maintien sur la courante, et leurs actions nommées pour le
/// lecteur d'écran, qui ne les fait pas. Sans `gestures`, rien n'est posé : un
/// toucher sur une voisine ne patiente jamais.
struct MeeshyTileGestures: ViewModifier {
    let gestures: MeeshyTileCurrentGestures?
    let offersActions: Bool

    @State var isHolding = false

    @ViewBuilder
    func body(content: Content) -> some View {
        if let gestures {
            content
                .highPriorityGesture(doubleTap(gestures))
                .simultaneousGesture(hold(gestures))
                .modifier(MeeshyTileGestureActions(gestures: gestures, offersActions: offersActions))
        } else {
            content
        }
    }

    private func doubleTap(_ gestures: MeeshyTileCurrentGestures) -> some Gesture {
        TapGesture(count: 2).onEnded { gestures.onDoubleTap?() }
    }

    private func hold(_ gestures: MeeshyTileCurrentGestures) -> some Gesture {
        LongPressGesture(minimumDuration: MeeshyTileRecipe.holdDuration)
            .sequenced(before: DragGesture(minimumDistance: 0))
            .onChanged { value in
                guard case .second(true, let drag) = value else { return }
                if !isHolding {
                    isHolding = true
                    gestures.onHold?(.began)
                }
                if let drag { gestures.onHold?(.moved(drag.translation)) }
            }
            .onEnded { _ in
                guard isHolding else { return }
                isHolding = false
                gestures.onHold?(.ended)
            }
    }
}

/// Les actions du lecteur d'écran : celles que l'hôte a nommées, et seulement
/// elles. Le maintien se lance (`began`) ; l'hôte l'arrête de son geste.
struct MeeshyTileGestureActions: ViewModifier {
    let gestures: MeeshyTileCurrentGestures
    let offersActions: Bool

    private var holdAction: (() -> Void)? {
        guard let onHold = gestures.onHold else { return nil }
        return { onHold(.began) }
    }

    @ViewBuilder
    func body(content: Content) -> some View {
        if offersActions {
            content
                .modifier(MeeshyTileNamedAction(name: gestures.doubleTapName, action: gestures.onDoubleTap))
                .modifier(MeeshyTileNamedAction(name: gestures.holdName, action: holdAction))
        } else {
            content
        }
    }
}

private struct MeeshyTileNamedAction: ViewModifier {
    let name: String
    let action: (() -> Void)?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let action, !name.isEmpty {
            content.accessibilityAction(named: Text(verbatim: name), action)
        } else {
            content
        }
    }
}
