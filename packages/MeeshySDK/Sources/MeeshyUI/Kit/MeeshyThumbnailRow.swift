import Combine
import Foundation
import SwiftUI

/// **La rangée de vignettes** (K20) : des vignettes ordonnées, posées en
/// surimpression sans cadre ni verre. Elle cercle la courante, finit par « + »,
/// montre ce qui s'envoie ou attend, et se réordonne au doigt : toucher = aller,
/// double toucher = dupliquer, appui long = armer (une croix paraît) puis glisser.
///
/// Un composant CONTRÔLÉ et AGNOSTIQUE : l'ordre, la courante et la progression
/// appartiennent à l'hôte, qui les applique tout de suite ; la rangée ne connaît
/// ni scène, ni diapo, ni média. Le contenu d'une vignette est celui de
/// `content(item, state)`, rogné à sa forme : l'hôte le peint, le décode, le met
/// en cache. Aucune matière, aucune chaîne fabriquée : noms, valeurs dites et
/// noms d'actions viennent de l'hôte.
///
/// - Sans vignette ni `onAdd`, la rangée ne rend rien, ni hauteur ni marge.
/// - Un rappel absent retire son geste ET son affordance : sans `onAdd`, pas de
///   « + » ; sans `onMove`, pas de glisser ; sans `onRemove` ou sans
///   `removeLabel`, pas de croix.
/// - `label` nomme le groupe pour le lecteur d'écran ; il est obligatoire.
/// - `.disabled(_:)` rend la rangée visible et inerte, sans « + » ni croix.
/// - La rangée se réduit de `tileHeight` à `minTileHeight` pour tenir dans la
///   largeur qu'on lui laisse, puis défile.
public struct MeeshyThumbnailRow<ID: Hashable & Sendable, Content: View>: View {
    private let items: [MeeshyThumbnail<ID>]
    private let current: ID?
    private let label: String
    private let words: MeeshyThumbnailRowWords
    private let tileHeight: CGFloat
    private let minTileHeight: CGFloat
    private let aspectRatio: CGFloat
    private let alignment: HorizontalAlignment
    private let haptic: MeeshyThumbnailHaptic
    private let tone: MeeshyGlassTone?
    private let actions: ((ID) -> [MeeshyThumbnailAction])?
    private let callbacks: MeeshyThumbnailRowCallbacks<ID>
    private let content: (MeeshyThumbnail<ID>, MeeshyThumbnailState) -> Content
    private var pressedPreview: ID?
    private var plusPressedPreview = false
    private var armedPreview: ID?
    private var liftedPreview: MeeshyThumbnailDrag<ID>?

    @StateObject private var model = MeeshyThumbnailRowModel<ID>()
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.layoutDirection) private var layoutDirection
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @Environment(\.meeshyGlassTone) private var hostTone

    public init(
        _ items: [MeeshyThumbnail<ID>],
        current: ID?,
        label: String,
        words: MeeshyThumbnailRowWords,
        tileHeight: CGFloat = MeeshyThumbnailRowRecipe.defaultTileHeight,
        minTileHeight: CGFloat = MeeshyThumbnailRowRecipe.minTileHeight,
        aspectRatio: CGFloat = MeeshyThumbnailRowRecipe.defaultAspectRatio,
        alignment: HorizontalAlignment = .center,
        haptic: MeeshyThumbnailHaptic = .standard,
        tone: MeeshyGlassTone? = nil,
        actions: ((ID) -> [MeeshyThumbnailAction])? = nil,
        onSelect: ((ID) -> Void)? = nil,
        onAdd: (() -> Void)? = nil,
        onDuplicate: ((ID) -> Void)? = nil,
        onMove: ((ID, Int) -> Void)? = nil,
        onRemove: ((ID) -> Void)? = nil,
        @ViewBuilder content: @escaping (MeeshyThumbnail<ID>, MeeshyThumbnailState) -> Content
    ) {
        assert(!label.isEmpty, "MeeshyThumbnailRow : le nom du groupe est obligatoire et non vide")
        assert(items.allSatisfy(\.hasAccessibleName), "MeeshyThumbnailRow : une vignette porte un accessibilityLabel")
        self.items = items
        self.current = current
        self.label = label
        self.words = words
        self.tileHeight = tileHeight
        self.minTileHeight = minTileHeight
        self.aspectRatio = aspectRatio
        self.alignment = alignment
        self.haptic = haptic
        self.tone = tone
        self.actions = actions
        self.callbacks = MeeshyThumbnailRowCallbacks(
            onSelect: onSelect, onAdd: onAdd, onDuplicate: onDuplicate, onMove: onMove, onRemove: onRemove
        )
        self.content = content
    }

    /// Fige un état que l'instantané et le catalogue ne tiennent pas au doigt :
    /// une vignette « pressée », le « + » pressé, une vignette armée, une vignette
    /// soulevée et glissée de `translation`.
    func previewing(
        pressed id: ID? = nil,
        plusPressed: Bool = false,
        armed: ID? = nil,
        lifted: (id: ID, translation: CGFloat)? = nil
    ) -> MeeshyThumbnailRow {
        var copy = self
        copy.pressedPreview = id
        copy.plusPressedPreview = plusPressed
        copy.armedPreview = armed
        copy.liftedPreview = lifted.map { MeeshyThumbnailDrag(id: $0.id, translation: $0.translation) }
        return copy
    }

    // MARK: - Corps

    @ViewBuilder
    public var body: some View {
        if !(items.isEmpty && callbacks.onAdd == nil) {
            GeometryReader { proxy in
                rowBody(width: proxy.size.width)
                    .frame(
                        width: proxy.size.width, height: proxy.size.height,
                        alignment: Alignment(horizontal: alignment, vertical: .center)
                    )
            }
            .frame(height: max(tileHeight, MeeshyThumbnailRowRecipe.targetHeight))
        }
    }

    private var hasAdd: Bool { callbacks.onAdd != nil && isEnabled }

    private func rowBody(width: CGFloat) -> some View {
        let slots = items.count + (hasAdd ? 1 : 0)
        let fit = MeeshyThumbnailRowFit.resolve(
            slots: slots, available: width, tileHeight: tileHeight, minTileHeight: minTileHeight,
            aspectRatio: aspectRatio
        )
        let pitch = fit.pitch()
        sync(pitch: pitch, viewport: width)
        return arranged(fit: fit, pitch: pitch, width: width)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(label)
            .adaptiveOnChange(of: items.map(\.id)) { _, ids in model.idsChanged(ids) }
            .onAppear { model.idsChanged(items.map(\.id)) }
            .onDisappear { model.cancel() }
            .meeshyAnimation(.easeOut(duration: MeeshyThumbnailRowRecipe.neighbourDuration), value: fit)
    }

    /// Les réglages du moment, recopiés dans le modèle : il lit toujours les
    /// rappels et la courante les plus récents, sans rien publier.
    private func sync(pitch: CGFloat, viewport: CGFloat) {
        model.callbacks = callbacks
        model.haptic = haptic
        model.isEnabled = isEnabled
        model.current = current
        model.pitch = pitch
        model.viewport = viewport
        model.isRightToLeft = layoutDirection == .rightToLeft
        if model.ids.isEmpty { model.ids = items.map(\.id) }
    }

    // MARK: - Disposition

    @ViewBuilder
    private func arranged(fit: MeeshyThumbnailRowFit, pitch: CGFloat, width: CGFloat) -> some View {
        let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
        let stack = cells(fit: fit, pitch: pitch, reduce: reduce)
        if fit.scrolls {
            scrolling(stack, fit: fit, reduce: reduce)
        } else {
            let contentWidth = MeeshyThumbnailRowFit.contentWidth(
                slots: items.count + (hasAdd ? 1 : 0), tileWidth: fit.width, spacing: MeeshyThumbnailRowRecipe.spacing
            )
            stack.frame(width: contentWidth)
        }
    }

    private func cells(fit: MeeshyThumbnailRowFit, pitch: CGFloat, reduce: Bool) -> some View {
        let effectiveTone = tone ?? hostTone
        let specs = MeeshyThumbnailRowSpecs.cells(
            MeeshyThumbnailRowSpecs.Inputs(
                items: items, current: current, armed: model.armed ?? armedPreview, drag: model.drag ?? liftedPreview, size: fit.size,
                spacing: MeeshyThumbnailRowRecipe.spacing, tone: effectiveTone, isEnabled: isEnabled,
                isRightToLeft: layoutDirection == .rightToLeft,
                capabilities: MeeshyThumbnailCapabilities(
                    canSelect: callbacks.onSelect != nil, canDuplicate: callbacks.onDuplicate != nil,
                    canMove: callbacks.onMove != nil && items.count > 1, canRemove: callbacks.onRemove != nil
                ),
                pressedPreview: pressedPreview
            )
        )
        let handlers = self.handlers
        return HStack(spacing: 0) {
            ForEach(specs, id: \.thumbnail.id) { spec in
                MeeshyThumbnailCell(spec: spec, content: content, handlers: handlers)
                    .equatable()
                    .zIndex(spec.zOrder)
                    .id(spec.thumbnail.id)
                    .transition(.opacity)
            }
            if hasAdd {
                MeeshyThumbnailAddButton(
                    size: fit.size, pitch: pitch, tone: effectiveTone, name: words.add,
                    isPressedPreview: plusPressedPreview, action: { model.add() }
                )
            }
        }
        .padding(.horizontal, -MeeshyThumbnailRowRecipe.spacing / 2)
        .coordinateSpace(name: MeeshyThumbnailRowSpace.name)
        .animation(
            reduce ? nil : .easeOut(duration: MeeshyThumbnailRowRecipe.neighbourDuration),
            value: items.map(\.id)
        )
    }

    private var handlers: MeeshyThumbnailCellHandlers<ID> {
        let model = self.model
        return MeeshyThumbnailCellHandlers(
            tap: { id in model.tap(id, now: ProcessInfo.processInfo.systemUptime) },
            holdBegan: { id in model.holdBegan(id) },
            holdEnded: { model.holdEnded(now: ProcessInfo.processInfo.systemUptime) },
            dragChanged: { id, translation, finger in model.dragChanged(id, translation: translation, finger: finger) },
            dragEnded: { id in model.dragEnded(id) },
            remove: { id in model.remove(id) },
            perform: { kind, id in model.perform(kind, on: id) },
            hostActions: actions,
            words: words
        )
    }

    // MARK: - Défilement

    /// Gelé tant qu'une vignette est armée ou glissée, et qui avance seul près
    /// d'un bord. La réserve vit DANS le défilement (sans quoi il couperait le
    /// cercle et la croix qui débordent), et se retire dehors : la rangée garde
    /// l'encombrement de ses vignettes.
    private func scrolling<Stack: View>(_ stack: Stack, fit: MeeshyThumbnailRowFit, reduce: Bool) -> some View {
        let reserveX = MeeshyThumbnailRowRecipe.reserveX
        let reserveY = MeeshyThumbnailRowRecipe.reserveY
        let frozen = model.armed != nil || model.drag != nil
        let edgeTask: ID? = model.drag?.id
        return ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                stack
                    .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named(MeeshyThumbnailRowSpace.viewport)).minX } action: {
                        model.contentMinX = $0
                    }
                    .padding(.horizontal, reserveX)
                    .padding(.vertical, reserveY)
            }
            .coordinateSpace(name: MeeshyThumbnailRowSpace.viewport)
            .scrollDisabled(frozen)
            .padding(.horizontal, -reserveX)
            .padding(.vertical, -reserveY)
            .onAppear { reveal(proxy, to: current, animated: false, reduce: reduce) }
            .adaptiveOnChange(of: current) { _, next in reveal(proxy, to: next, animated: true, reduce: reduce) }
            .task(id: edgeTask) { await advanceAtTheEdge(proxy, reduce: reduce) }
        }
    }

    /// La courante vient en vue : sans animation à l'apparition, en 250 ms à
    /// chaque changement, immédiate sous « réduire les animations ».
    private func reveal(_ proxy: ScrollViewProxy, to target: ID?, animated: Bool, reduce: Bool) {
        guard let target else { return }
        let animation = animated
            ? MeeshyMotion.animation(.easeInOut(duration: MeeshyThumbnailRowRecipe.revealDuration), reduce: reduce)
            : nil
        withAnimation(animation) {
            proxy.scrollTo(target, anchor: .center)
        }
    }

    /// Près d'un bord, la rangée avance seule d'une place à chaque tic, tant
    /// qu'une vignette est glissée ; la tâche s'arrête avec le glisser.
    private func advanceAtTheEdge(_ proxy: ScrollViewProxy, reduce: Bool) async {
        guard model.drag != nil else { return }
        let interval = MeeshyThumbnailRowRecipe.edgeScrollInterval
        while !Task.isCancelled {
            do { try await Task.sleep(for: .seconds(interval)) } catch { return }
            guard let next = model.edgeScrollTarget() else { continue }
            withAnimation(MeeshyMotion.animation(.linear(duration: interval), reduce: reduce)) {
                proxy.scrollTo(next, anchor: nil)
            }
        }
    }
}

extension MeeshyThumbnailRowSpace {
    /// L'espace de la zone visible : le contenu s'y mesure pour savoir où est le doigt.
    static let viewport = "meeshy.thumbnailRow.viewport"
}
