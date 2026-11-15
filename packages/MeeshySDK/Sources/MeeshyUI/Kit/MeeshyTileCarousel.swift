import SwiftUI

/// Le repos d'un défilement qu'aucune phase ne dit : une tâche qui se relance à
/// chaque mouvement et s'annule quand l'écran est quitté.
@MainActor
final class MeeshyTileRestTimer {
    nonisolated deinit {}

    private var task: Task<Void, Never>?

    func schedule(_ action: @escaping @MainActor () -> Void) {
        task?.cancel()
        task = Task { @MainActor in
            do { try await Task.sleep(for: .seconds(MeeshyTileRecipe.restDelay)) } catch { return }
            guard !Task.isCancelled else { return }
            action()
        }
    }

    func cancel() {
        task?.cancel()
        task = nil
    }
}

/// **Le carrousel** : la vignette centrée est la courante. Le défilement
/// s'aimante au centre ; celle qui passe au centre est choisie (un `onSelect`
/// par changement), et au repos la bande rejoint la courante. Toucher une
/// voisine la choisit et la centre. Un seul élément ajustable pour le lecteur
/// d'écran : son nom est le groupe, sa valeur celui de la courante.
///
/// L'aimantation demande iOS 17 ; sur iOS 16 le carrousel se pose comme la
/// bande : toucher choisit et centre.
struct MeeshyTileCarousel<ID: Hashable & Sendable, Preview: View>: View {
    let tiles: [MeeshyTile<ID>]
    let selection: ID?
    let label: String
    let dimsNeighbours: Bool
    let configuration: MeeshyTileConfiguration
    /// Le nom de la courante, seul sous la bande : la règle des noms le dit.
    let showsCurrentName: Bool
    let previewPressed: ID?
    let revealsSelection: Bool
    let isSolo: Bool
    let gestures: MeeshyTileCurrentGestures?
    let onSelect: (ID) -> Void
    let preview: (MeeshyTile<ID>, MeeshyTileState) -> Preview

    @Environment(\.accessibilityReduceMotion) var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) var forcedReduceMotion
    @State var centeredIndex: Int? = nil

    var body: some View {
        let shownIndex = centeredIndex ?? chosenIndex
        return VStack(spacing: MeeshyTileMetrics.nameGap) {
            track
            currentName(at: shownIndex)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue(MeeshyTileStripAccessibility.value(of: tiles, selection: selection))
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: step(1)
            case .decrement: step(-1)
            @unknown default: return
            }
        }
        .modifier(MeeshyTileCarouselActions(gestures: gestures))
    }

    private var chosenIndex: Int? {
        selection.flatMap { id in tiles.firstIndex { $0.id == id } }
    }

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    @ViewBuilder
    private func currentName(at index: Int?) -> some View {
        if showsCurrentName, let index, tiles.indices.contains(index), !tiles[index].title.isEmpty {
            MeeshyTileCurrentName(title: tiles[index].title, surface: configuration.surface)
        }
    }

    // MARK: - Piste

    private var track: some View {
        let height = max(
            configuration.tileSize.height + 2 * MeeshyTileMetrics.reserve, MeeshyTileMetrics.carouselMinimumHeight
        )
        return GeometryReader { container in
            let side = max(0, (container.size.width - configuration.tileSize.width) / 2)
            trackBody(side: side, height: height)
        }
        .frame(height: height)
    }

    @ViewBuilder
    private func trackBody(side: CGFloat, height: CGFloat) -> some View {
        let margin = max(0, (height - configuration.tileSize.height) / 2)
        if #available(iOS 17.0, *) {
            MeeshyTileSnappingTrack(
                carousel: self, side: side, margin: margin, centeredIndex: $centeredIndex
            )
        } else {
            MeeshyTileTouchTrack(carousel: self, side: side, margin: margin)
        }
    }

    // MARK: - Cellules

    func cell(at index: Int) -> some View {
        let tile = tiles[index]
        let isSelected = tile.id == selection
        return MeeshyTileCell(
            spec: configuration.spec(
                for: tile, isSelected: isSelected, isNeighbour: dimsNeighbours && !isSelected,
                listensToGestures: gestures != nil, forcedPressed: previewPressed == tile.id
            ),
            preview: preview, onSelect: onSelect, gestures: gestures
        )
        .equatable()
    }

    var cellSpacing: CGFloat { MeeshyTileMetrics.spacing }

    // MARK: - Choisir

    /// `current` est la courante au moment où l'on choisit : celle que la piste
    /// a retenue, non celle d'un rendu passé que la fermeture a capturée.
    func select(_ index: Int, current: ID?) {
        guard tiles.indices.contains(index) else { return }
        MeeshyTileStripTrigger.perform(
            tapped: tiles[index].id, selection: current, isEnabled: tiles[index].isEnabled,
            haptic: configuration.haptic, onSelect: onSelect
        )
    }

    private func step(_ offset: Int) {
        guard let next = MeeshyTileStripRule.stepping(selection, in: tiles.map(\.id), by: offset),
              let index = tiles.firstIndex(where: { $0.id == next }) else { return }
        select(index, current: selection)
    }

    func scroll(_ animated: Bool) -> Animation? {
        animated
            ? MeeshyMotion.animation(.easeInOut(duration: MeeshyTileRecipe.revealDuration), reduce: reduceMotion)
            : nil
    }
}

// MARK: - Les actions de l'hôte, au niveau du carrousel

/// Le carrousel est UN élément : les actions nommées des gestes de l'hôte se
/// posent sur lui, les vignettes qu'il contient étant ignorées du lecteur d'écran.
private struct MeeshyTileCarouselActions: ViewModifier {
    let gestures: MeeshyTileCurrentGestures?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let gestures {
            content.modifier(MeeshyTileGestureActions(gestures: gestures, offersActions: true))
        } else {
            content
        }
    }
}

// MARK: - iOS 17 : l'aimantation

/// iOS 17 et plus : l'accroche laisse le lancer aller aussi loin qu'il porte,
/// le centre suit le doigt, et la vignette qui y passe est choisie. Un
/// défilement que la bande fait d'elle-même (ouverture, toucher sur une
/// voisine) ne choisit personne en chemin : `MeeshyTileStripFollow` le sait.
@available(iOS 17.0, *)
private struct MeeshyTileSnappingTrack<ID: Hashable & Sendable, Preview: View>: View {
    let carousel: MeeshyTileCarousel<ID, Preview>
    let side: CGFloat
    let margin: CGFloat
    @Binding var centeredIndex: Int?

    @State var follow = MeeshyTileStripFollow()
    @State var timer = MeeshyTileRestTimer()
    /// La courante d'après l'hôte, lue au moment où l'on agit : une fermeture
    /// qui attend le repos a capturé un rendu passé, pas l'état d'aujourd'hui.
    @State var current: ID? = nil
    /// La vignette sur laquelle la piste s'est ouverte : son arrivée ne choisit personne.
    @State var openingIndex: Int? = nil

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: carousel.cellSpacing) {
                ForEach(carousel.tiles.indices, id: \.self) { index in
                    carousel.cell(at: index).id(index)
                }
            }
            .scrollTargetLayout()
        }
        .contentMargins(.horizontal, side, for: .scrollContent)
        .contentMargins(.vertical, margin, for: .scrollContent)
        .scrollTargetBehavior(.viewAligned(limitBehavior: .never))
        .scrollPosition(id: $centeredIndex, anchor: .center)
        .scrollDisabled(carousel.isSolo)
        .onAppear(perform: begin)
        .onDisappear { timer.cancel() }
        .adaptiveOnChange(of: centeredIndex) { _, index in arrived(at: index) }
        .adaptiveOnChange(of: carousel.selection) { _, selection in chosen(selection) }
    }

    private var chosenIndex: Int? {
        current.flatMap { id in carousel.tiles.firstIndex { $0.id == id } }
    }

    /// La piste s'ouvre sur la courante (sinon sur la première, sans la choisir) :
    /// son arrivée au centre est celle de la bande, pas celle du doigt.
    private func begin() {
        current = carousel.selection
        let start = chosenIndex ?? 0
        openingIndex = start
        follow.begin(chosen: start)
        _ = follow.centered(on: start, chosen: chosenIndex, selects: false)
        centeredIndex = start
    }

    private func arrived(at index: Int?) {
        guard let index else { return }
        if let opening = openingIndex {
            openingIndex = nil
            if index == opening { return }
        }
        if let pick = follow.centered(on: index, chosen: chosenIndex, selects: true) {
            carousel.select(pick, current: current)
        }
        timer.schedule { settle() }
    }

    private func chosen(_ selection: ID?) {
        current = selection
        guard let index = chosenIndex, let destination = follow.chose(index) else { return }
        withAnimation(carousel.scroll(true)) { centeredIndex = destination }
    }

    private func settle() {
        switch follow.settled(chosen: chosenIndex, selects: true) {
        case .nothing: break
        case .choose(let index): carousel.select(index, current: current)
        case .rejoin(let index): withAnimation(carousel.scroll(true)) { centeredIndex = index }
        }
    }
}

// MARK: - iOS 16 : toucher

/// iOS 16 : ni accroche ni position. Toucher une vignette la choisit, et la
/// bande la centre.
private struct MeeshyTileTouchTrack<ID: Hashable & Sendable, Preview: View>: View {
    let carousel: MeeshyTileCarousel<ID, Preview>
    let side: CGFloat
    let margin: CGFloat

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: carousel.cellSpacing) {
                    ForEach(carousel.tiles.indices, id: \.self) { index in
                        carousel.cell(at: index).id(index)
                    }
                }
                .padding(.horizontal, side)
                .padding(.vertical, margin)
            }
            .scrollDisabled(carousel.isSolo)
            .onAppear { center(proxy, animated: false) }
            .adaptiveOnChange(of: carousel.selection) { _, _ in center(proxy, animated: true) }
        }
    }

    private func center(_ proxy: ScrollViewProxy, animated: Bool) {
        guard carousel.revealsSelection,
              let id = carousel.selection,
              let index = carousel.tiles.firstIndex(where: { $0.id == id }) else { return }
        withAnimation(carousel.scroll(animated)) {
            proxy.scrollTo(index, anchor: .center)
        }
    }
}
