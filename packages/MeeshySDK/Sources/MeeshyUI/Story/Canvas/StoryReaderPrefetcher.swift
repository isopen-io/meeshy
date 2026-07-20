import UIKit
import MeeshySDK

/// Pre-bootstraps `StoryCanvasUIView` instances for slides adjacent to the
/// current one so the first frame of slide N+1 (or N-1 on back-swipe) is
/// instantaneous — no image decode, no Metal pipeline cold start, no
/// AVPlayer init on the transition.
///
/// Maintains a sliding window of at most 4 canvas views: `[N-1, N, N+1, N+2]`.
/// The window is asymmetric — one slide of look-behind for back-swipe and TWO
/// of look-ahead so the next two slides' first frames are already rendered
/// before the user swipes (forward navigation is the dominant gesture in a
/// story reader). Views outside the window are evicted (memory bounded).
///
/// Usage from a multi-slide viewer:
/// ```swift
/// let prefetcher = StoryReaderPrefetcher()
/// // when the current slide changes:
/// prefetcher.updateWindow(items: group.stories,
///                         currentIndex: idx,
///                         context: readerContext,
///                         preferredLanguages: ["fr"])
/// // grab an already-bootstrapped view:
/// if let view = prefetcher.view(for: nextItem.id) { ... }
/// ```
///
/// All instantiation happens on the main actor (MeeshyUI default isolation),
/// off-screen at `frame = .zero, alpha = 0`. Promoting the view to the visible
/// slot is the caller's responsibility — at that point the layer tree, the
/// image cache lookup, and the AVPlayer (for video backgrounds) have already
/// settled, so the first frame is one CATransaction away instead of a full
/// lazy bootstrap.
public final class StoryReaderPrefetcher {

    // MARK: - State

    /// Active sliding window. Keyed by `StoryItem.id` so callers can look up
    /// the bootstrapped view by item identity without caring about the order
    /// the parent provided.
    private(set) var bootstrapped: [String: StoryCanvasUIView] = [:]

    /// Off-screen host view that owns the prefetched canvas views. Kept as a
    /// `UIView` (not a `CALayer`) so the canvas can attach gesture
    /// recognizers, observe `didMoveToWindow`, and run its `editDisplayLink`
    /// just like it would when promoted into the visible reader. The host is
    /// hidden but inserted into a window by the caller via `attach(to:)`.
    public let hostView: UIView

    // MARK: - Init

    public init() {
        let host = UIView(frame: .zero)
        host.isHidden = false       // visible but offscreen so child views get layoutSubviews()
        host.alpha = 0              // invisible to the user
        host.isUserInteractionEnabled = false
        host.clipsToBounds = true
        host.accessibilityElementsHidden = true
        self.hostView = host
    }

    // MARK: - Public API

    /// Attaches the off-screen host view to a parent so prefetched canvas
    /// views go through a full `didMoveToWindow` cycle (layer tree build,
    /// background image decode, AVPlayer asset load). Call this once when
    /// the reader screen appears.
    public func attach(to parent: UIView) {
        guard hostView.superview !== parent else { return }
        hostView.removeFromSuperview()
        parent.addSubview(hostView)
        // The host occupies a 1x1 region in the top-left, behind any
        // visible content. We can't use `.zero` because `layoutSubviews`
        // on children short-circuits when bounds are empty (see
        // StoryCanvasUIView.rebuildLayers → `guard bounds.size != .zero`).
        // 1x1 lets the canvas perform its initial bootstrap without
        // taking any meaningful screen real estate. The promotion path
        // is responsible for re-parenting and resizing.
        hostView.frame = CGRect(x: 0, y: 0, width: 1, height: 1)
        parent.sendSubviewToBack(hostView)
    }

    /// Detaches and discards every cached view. Call from the viewer's
    /// `onDisappear` to release memory aggressively.
    public func detach() {
        bootstrapped.values.forEach { $0.removeFromSuperview() }
        bootstrapped.removeAll()
        hostView.removeFromSuperview()
    }

    /// Returns the prefetched canvas view for `itemId`, if any. Returns
    /// `nil` when the slide is outside the current window (caller should
    /// fall back to lazy instantiation).
    ///
    /// WS3.5 — activate(.play) contract: every prefetched canvas is bootstrapped
    /// in `.edit` (see `bootstrap`) so neighbour slides do NOT auto-start their
    /// audio + background/foreground video at mount time. A canvas returned here
    /// is therefore still in `.edit`; the caller MUST promote it to `.play` via
    /// `activate(currentId:)` BEFORE displaying it, otherwise its bg/fg video and
    /// audio never start (the slide renders its first frame but stays paused).
    /// This method intentionally does NOT auto-flip the mode: doing so would
    /// start audio for a slide that is prefetched but not yet visible.
    public func view(for itemId: String) -> StoryCanvasUIView? {
        bootstrapped[itemId]
    }

    /// Recomputes the sliding window around `currentIndex`. Bootstraps any
    /// missing view at `[N-1, N, N+1]`, evicts everything else.
    ///
    /// - Parameters:
    ///   - items: The ordered list of stories in the current group.
    ///   - currentIndex: Index of the slide the user is currently viewing.
    ///     The window contains the slide itself plus its immediate neighbors.
    ///   - context: Runtime context (mute, completion callback, language
    ///     chain, post media resolver, image cache) injected into each
    ///     bootstrapped view via `setReaderContext(_:)`.
    ///   - preferredLanguages: Prisme Linguistique chain used to project
    ///     `StoryItem` → `StorySlide` (title + text resolution).
    ///   - extraWarmItems: Slides supplémentaires à garder chauds HORS de la
    ///     fenêtre intra-groupe — typiquement le slide d'entrée des groupes
    ///     voisins, pour que la première frame d'un swipe auteur→auteur soit
    ///     instantanée. Bootstrappés en `.edit` comme la fenêtre, protégés de
    ///     l'éviction tant qu'ils restent passés ; `[]` (défaut) préserve le
    ///     comportement historique.
    public func updateWindow(items: [StoryItem],
                             currentIndex: Int,
                             context: StoryReaderContext,
                             preferredLanguages: [String],
                             extraWarmItems: [StoryItem] = []) {
        guard !items.isEmpty,
              items.indices.contains(currentIndex) else {
            // Empty group or out-of-range index: drop everything.
            evict(keeping: [])
            return
        }

        let windowIndices = windowIndices(around: currentIndex, count: items.count)
        var desiredIds = Set(windowIndices.map { items[$0].id })
        desiredIds.formUnion(extraWarmItems.map(\.id))

        // Evict everything outside the window first to free memory before we
        // allocate new canvases. Important on low-RAM devices where 3 fullscreen
        // canvas views can sit on the edge of the memory pressure threshold.
        evict(keeping: desiredIds)

        for idx in windowIndices {
            let item = items[idx]
            if bootstrapped[item.id] != nil { continue }
            bootstrap(item: item,
                      context: context,
                      preferredLanguages: preferredLanguages)
        }
        for item in extraWarmItems where bootstrapped[item.id] == nil {
            bootstrap(item: item,
                      context: context,
                      preferredLanguages: preferredLanguages)
        }
    }

    // MARK: - Window math

    /// Indices to keep in the sliding window. Asymétrique : 1 slide en arrière
    /// (N-1) + DEUX slides en avant (N+1, N+2), centré sur `N`. La marche-avant
    /// élargie à n+2 garde les deux prochaines premières frames déjà rendues
    /// avant le swipe (navigation avant dominante dans un reader de stories), ce
    /// qui supprime le décodage/cold-start au changement de page. La marche-arrière
    /// couvre le back-swipe. Bornes : start drops indices < 0, end drops
    /// indices ≥ count — donc `[N, N+1, N+2]` au premier slide, `[N-1, N]` au
    /// dernier. Single-slide group keeps only `N`.
    func windowIndices(around current: Int, count: Int) -> [Int] {
        guard count > 0 else { return [] }
        let lower = max(0, current - 1)
        let upper = min(count - 1, current + 2)
        return Array(lower...upper)
    }

    // MARK: - Bootstrap / eviction

    private func bootstrap(item: StoryItem,
                           context: StoryReaderContext,
                           preferredLanguages: [String]) {
        let slide = item.toRenderableSlide(preferredLanguages: preferredLanguages)
        // Bootstrap in `.edit` so prefetched neighbour slides DO NOT auto-start
        // their audio + video at mount time. Only the slide currently visible
        // to the user should be in `.play`; `activate(currentId:)` flips it
        // — the previous architecture left every prefetched canvas in `.play`
        // simultaneously, which made all three audios in the window pre-cache
        // and start at once and stalled the per-slide `onContentReady` timer.
        let canvas = StoryCanvasUIView(slide: slide, mode: .edit)
        canvas.translatesAutoresizingMaskIntoConstraints = true
        // Sized to the host (1×1) so `layoutSubviews` fires and the layer
        // tree is built; the actual visible frame is set when the parent
        // promotes the view into the visible slot.
        canvas.frame = hostView.bounds
        canvas.isHidden = false
        canvas.isUserInteractionEnabled = false
        canvas.setReaderContext(context)
        hostView.addSubview(canvas)
        bootstrapped[item.id] = canvas
    }

    /// Switches the canvas of `currentId` to `.play` and every other
    /// bootstrapped canvas back to `.edit`. Idempotent — safe to call on
    /// every `currentStoryIndex` change without checking the previous state.
    public func activate(currentId: String) {
        for (id, canvas) in bootstrapped {
            if id == currentId {
                if canvas.mode != .play { canvas.setMode(.play) }
            } else {
                if canvas.mode != .edit { canvas.setMode(.edit) }
            }
        }
    }

    private func evict(keeping desired: Set<String>) {
        let evictable = bootstrapped.keys.filter { !desired.contains($0) }
        for key in evictable {
            bootstrapped[key]?.removeFromSuperview()
            bootstrapped.removeValue(forKey: key)
        }
    }
}
