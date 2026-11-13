import SwiftUI

// MARK: - Ce qui se mesure sans redessiner

/// Ce que la bande retient du défilement derrière une RÉFÉRENCE : écrire ici ne
/// redessine rien. La plage visible ne part qu'au changement de plage ; le
/// défilement est « en cours » tant que le décalage bouge, « au repos » quand
/// il n'a plus bougé depuis `restDelay`. La tâche de repos s'annule quand
/// l'écran est quitté : rien n'est retenu.
@MainActor
final class MeeshyTileScrollMonitor {
    nonisolated deinit {}

    private var tracker = MeeshyTileVisibleRangeTracker()
    private var lastOffset: CGFloat?
    private var isScrolling = false
    private var restTask: Task<Void, Never>?

    func report(_ range: ClosedRange<Int>?, to callback: ((ClosedRange<Int>?) -> Void)?) {
        guard let callback, tracker.reports(range) else { return }
        callback(range)
    }

    func moved(to offset: CGFloat, onScrollingChange callback: ((Bool) -> Void)?) {
        defer { lastOffset = offset }
        guard let callback, let previous = lastOffset, previous != offset else { return }
        if !isScrolling {
            isScrolling = true
            callback(true)
        }
        restTask?.cancel()
        restTask = Task { @MainActor [weak self] in
            do { try await Task.sleep(for: .seconds(MeeshyTileRecipe.restDelay)) } catch { return }
            guard !Task.isCancelled, let self else { return }
            self.isScrolling = false
            callback(false)
        }
    }

    func cancel() {
        restTask?.cancel()
        restTask = nil
    }
}

/// Mesure le contenu d'une bande depuis l'intérieur du défilement : la plage
/// visible (un rappel seulement quand elle change), le décalage (pour le
/// repos, et pour l'`underlay`). Sans rappel à servir, il ne pose rien.
struct MeeshyTileScrollObserver: ViewModifier {
    let geometry: MeeshyTileStripGeometry
    let viewport: CGFloat
    let isRightToLeft: Bool
    let onVisibleRange: ((ClosedRange<Int>?) -> Void)?
    let onScrollingChange: ((Bool) -> Void)?
    let onOffset: ((CGFloat) -> Void)?

    @State var monitor = MeeshyTileScrollMonitor()

    @ViewBuilder
    func body(content: Content) -> some View {
        if onVisibleRange == nil, onScrollingChange == nil, onOffset == nil {
            content
        } else {
            content
                .modifier(rangeObserver)
                .modifier(offsetObserver)
                .onDisappear { monitor.cancel() }
        }
    }

    private var rangeObserver: MeeshyTileRangeObserver {
        MeeshyTileRangeObserver(
            geometry: geometry, viewport: viewport, isRightToLeft: isRightToLeft, monitor: monitor, callback: onVisibleRange
        )
    }

    private var offsetObserver: MeeshyTileOffsetObserver {
        MeeshyTileOffsetObserver(
            viewport: viewport, isRightToLeft: isRightToLeft, monitor: monitor,
            onScrollingChange: onScrollingChange, onOffset: onOffset
        )
    }
}

struct MeeshyTileRangeObserver: ViewModifier {
    let geometry: MeeshyTileStripGeometry
    let viewport: CGFloat
    let isRightToLeft: Bool
    let monitor: MeeshyTileScrollMonitor
    let callback: ((ClosedRange<Int>?) -> Void)?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let callback {
            let laws = geometry
            let width = viewport
            let mirrored = isRightToLeft
            content.onGeometryChange(for: Optional<ClosedRange<Int>>.self) { proxy in
                let offset = MeeshyTileStripGeometry.offset(
                    contentFrame: proxy.frame(in: .named(MeeshyFadingScrollSpace.name)),
                    viewport: width,
                    isRightToLeft: mirrored
                )
                return laws.visibleRange(offset: offset, viewport: width)
            } action: { range in
                guard width > 0 else { return }
                monitor.report(range, to: callback)
            }
        } else {
            content
        }
    }
}

struct MeeshyTileOffsetObserver: ViewModifier {
    let viewport: CGFloat
    let isRightToLeft: Bool
    let monitor: MeeshyTileScrollMonitor
    let onScrollingChange: ((Bool) -> Void)?
    let onOffset: ((CGFloat) -> Void)?

    @ViewBuilder
    func body(content: Content) -> some View {
        if onScrollingChange != nil || onOffset != nil {
            let width = viewport
            let mirrored = isRightToLeft
            content.onGeometryChange(for: CGFloat.self) { proxy in
                MeeshyTileStripGeometry.offset(
                    contentFrame: proxy.frame(in: .named(MeeshyFadingScrollSpace.name)),
                    viewport: width,
                    isRightToLeft: mirrored
                )
            } action: { offset in
                onOffset?(offset)
                monitor.moved(to: offset, onScrollingChange: onScrollingChange)
            }
        } else {
            content
        }
    }
}

// MARK: - L'emplacement de dessous

/// Le masque de l'`underlay` : la forme des vignettes visibles, dans la zone
/// visible. La surface de l'hôte ne se voit que là, sous les aperçus.
struct MeeshyTileUnderlayMask: View {
    let geometry: MeeshyTileStripGeometry
    let top: CGFloat
    let radius: CGFloat
    let isRightToLeft: Bool

    var body: some View {
        ZStack(alignment: .topLeading) {
            if let range = geometry.visibleRange {
                ForEach(Array(range), id: \.self) { index in
                    let frame = physicalFrame(of: index)
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .frame(width: frame.width, height: frame.height)
                        .offset(x: frame.minX, y: top)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .environment(\.layoutDirection, .leftToRight)
    }

    /// Le cadre PHYSIQUE : en RTL, la bande commence à droite.
    private func physicalFrame(of index: Int) -> CGRect {
        let frame = geometry.viewportFrame(of: index)
        guard isRightToLeft else { return frame }
        return CGRect(x: geometry.viewport - frame.maxX, y: frame.minY, width: frame.width, height: frame.height)
    }
}
