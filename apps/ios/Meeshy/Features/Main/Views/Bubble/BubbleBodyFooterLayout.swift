import SwiftUI
import MeeshySDK

// Extrait de `BubbleStandardLayout.swift` (#4098) — l'hôte tenait 1 770 lignes,
// hors du budget 800-1100, et la loi 4 interdit d'y AJOUTER avant d'en avoir
// retiré. Le découpage suit la responsabilité, pas la tranche : ce qui part ici
// n'est pas une vue mais un `Layout` et son cache de mesure — la mécanique qui
// EMPILE le corps d'une bulle au-dessus de son pied, et qui se relit sans rien
// savoir de ce que la bulle contient.

// MARK: - Bubble body + footer layout
//
// Stacks the bubble's inner content above its footer. Unlike a plain VStack,
// the footer is handed *exactly* the inner content's resolved width — so the
// footer's trailing meta (timestamp + delivery check) lands on the bubble's
// trailing edge, matching the corner-pinned footer of media bubbles. The
// footer never widens the bubble: its own intrinsic width acts only as a
// floor so the meta is never clipped on very short messages.
//
// `sizeThatFits` and `placeSubviews` compute the body and footer heights at
// the same resolved width, so the reported size is self-consistent and the
// hosting UICollectionView cell never drifts. Accepts one subview (body only,
// when the footer is suppressed for an audio-in-quote bubble) or two.
/// Identifies a bubble for the height cache: the message id plus the exact
/// `BubbleContent` value it renders. nil at the call site = no caching (e.g.
/// expandable bubbles whose height depends on per-cell `isExpanded` state).
struct BubbleHeightCacheContext {
    let messageId: String
    let content: BubbleContent
}

struct BubbleBodyFooterLayout: Layout {
    var spacing: CGFloat = 4
    var cacheContext: BubbleHeightCacheContext? = nil

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        // Cache lookup only for a concrete finite proposal width — the
        // ideal/unspecified passes must not poison the width-keyed cache, and a
        // hit returns the previously measured size without descending into the
        // body subtree (the #1 CPU self-time at scroll). On a miss we measure
        // and store; `placeSubviews` always re-measures the live content, so the
        // cache only affects the *reported* size, never placement.
        guard let ctx = cacheContext,
              let proposedWidth = proposal.width,
              Self.cacheUsable(proposedWidth: proposedWidth, isMainThread: Thread.isMainThread) else {
            return measuredSize(proposal: proposal, subviews: subviews)
        }
        // `Layout.sizeThatFits` is a nonisolated protocol requirement and iOS 26
        // can invoke it on com.apple.SwiftUI.AsyncRenderer, NOT only on the main
        // thread (5 device crashes 2026-06-10..12: dispatch_assert_queue_fail in
        // this exact `assumeIsolated`). The cache is therefore a main-thread-only
        // fast path: off-main passes fall through to a direct measure above, and
        // `assumeIsolated` below is only reached when the main thread is proven.
        return MainActor.assumeIsolated {
            let cache = BubbleHeightCache.shared
            if let cached = cache.size(messageId: ctx.messageId, content: ctx.content, width: proposedWidth) {
                return cached
            }
            let size = measuredSize(proposal: proposal, subviews: subviews)
            cache.store(messageId: ctx.messageId, content: ctx.content, width: proposedWidth, size: size)
            return size
        }
    }

    /// Whether the height cache may be consulted for this layout pass. Pure +
    /// testable. The main-thread requirement is a hard correctness gate, not an
    /// optimization: `BubbleHeightCache` (and `BubbleContent ==`) are @MainActor,
    /// bridged via `assumeIsolated`, which traps on any other thread.
    static func cacheUsable(proposedWidth: CGFloat, isMainThread: Bool) -> Bool {
        proposedWidth.isFinite && isMainThread
    }

    private func measuredSize(proposal: ProposedViewSize, subviews: Subviews) -> CGSize {
        guard let body = subviews.first else { return .zero }
        // Probe the body's INTRINSIC height (`height: nil`), never the proposed
        // height. A link-preview body hosts a `LinkPreviewCard` whose
        // `.frame(minHeight: 64)` has no maximum, so when handed the incoming
        // proposal's height it grows to FILL it — and since this measured size
        // becomes the parent's next proposal, the height runs away in a feedback
        // loop (observed: a 213→383 inflation, leaving ~170pt of empty bubble
        // that the next message overlapped into). `placeSubviews` already probes
        // with `height: nil`; measuring the same way here keeps the reported
        // height equal to the placed height (no cell-height drift).
        let bodyProbe = body.sizeThatFits(ProposedViewSize(width: proposal.width, height: nil))
        guard subviews.count > 1 else { return bodyProbe }

        let footer = subviews[1]
        let footerFloor = footer.sizeThatFits(.unspecified).width
        let width = max(bodyProbe.width, footerFloor)
        // Re-measure the body subtree only when the footer floor widened the
        // bubble past the body's natural width. When `width == bodyProbe.width`
        // (the common case: a multi-word message already wider than its meta
        // row), `bodyProbe.height` is already the height at this width — the
        // second measure was a redundant full-subtree pass, and that pass is the
        // #1 CPU self-time during scroll. The placement pass (`placeSubviews`)
        // still re-measures unconditionally, so alignment is unaffected.
        let bodyHeight = Self.bodyHeight(bodyProbe: bodyProbe, resolvedWidth: width) {
            body.sizeThatFits(ProposedViewSize(width: $0, height: nil)).height
        }
        let footerHeight = footer.sizeThatFits(ProposedViewSize(width: width, height: nil)).height
        return CGSize(width: width, height: bodyHeight + spacing + footerHeight)
    }

    /// Body height to report for a resolved width, reusing the probe height when
    /// the resolved width equals the probed width (i.e. the footer floor did not
    /// widen the bubble). Pure + testable: the layout supplies the re-measure
    /// closure, which is invoked *only* when a re-measure is genuinely required.
    /// The `==` comparison is exact-safe: `resolvedWidth` is `max(bodyProbe.width,
    /// footerFloor)`, so when the footer does not widen it is literally the same
    /// `bodyProbe.width` value (no float drift).
    static func bodyHeight(
        bodyProbe: CGSize,
        resolvedWidth: CGFloat,
        remeasure: (CGFloat) -> CGFloat
    ) -> CGFloat {
        resolvedWidth == bodyProbe.width ? bodyProbe.height : remeasure(resolvedWidth)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let body = subviews.first else { return }
        let width = bounds.width
        let bodyHeight = body.sizeThatFits(ProposedViewSize(width: width, height: nil)).height
        body.place(
            at: CGPoint(x: bounds.minX, y: bounds.minY),
            anchor: .topLeading,
            proposal: ProposedViewSize(width: width, height: bodyHeight)
        )

        guard subviews.count > 1 else { return }
        let footer = subviews[1]
        let footerHeight = footer.sizeThatFits(ProposedViewSize(width: width, height: nil)).height
        footer.place(
            at: CGPoint(x: bounds.minX, y: bounds.minY + bodyHeight + spacing),
            anchor: .topLeading,
            proposal: ProposedViewSize(width: width, height: footerHeight)
        )
    }
}

// MARK: - Bubble height cache

/// Content-keyed height cache that short-circuits the (expensive) full
/// body-subtree measurement in `BubbleBodyFooterLayout.sizeThatFits` — the #1
/// CPU self-time during scroll. A hit requires the SAME message rendering the
/// SAME `BubbleContent` at the SAME (rounded) width.
///
/// Correctness boundary = `BubbleContent ==`: any height-affecting content
/// change (edit, arriving translation, secondary panel toggle, reactions,
/// attachment enrichment) produces a different value → a miss → a fresh
/// measure. This is the exact invariant the bubble's own equatable gate already
/// relies on, so the cache cannot be more stale than the rendered tree itself.
/// A recycled cell reused for a different message keys on a different id, never
/// reading another message's entry (the failure mode of the reverted
/// width-only `Layout.Cache`, d6ba7f958).
///
/// `placeSubviews` is NEVER cached — it always re-measures the live content — so
/// the cache only affects the *reported* size, not placement. The cache is
/// flushed on Dynamic Type change and on memory warning; width buckets quantize
/// to the nearest point so sub-pixel proposal jitter still hits, and a rotation
/// (different proposed width) naturally misses. Expandable bubbles (text beyond
/// the truncation limit, whose height depends on per-cell `isExpanded` @State)
/// opt out at the call site rather than caching a state this key cannot see.
///
/// `@MainActor`: `BubbleContent`'s equality is main-actor isolated, so the
/// cache shares that isolation and needs no lock. The layout pass is NOT
/// guaranteed to run on the main thread (iOS 26 measures cells on
/// com.apple.SwiftUI.AsyncRenderer) — `sizeThatFits` therefore only consults
/// this cache after proving `Thread.isMainThread` (see `cacheUsable`); off-main
/// passes measure directly without touching it. The system observers fire on
/// the main queue; the flush closure re-enters via `assumeIsolated`.
@MainActor
final class BubbleHeightCache {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = BubbleHeightCache(observeSystemEvents: true)

    private struct Entry {
        let content: BubbleContent
        let widthBucket: CGFloat
        let size: CGSize
    }

    private var entries: [String: Entry] = [:]
    private let capacity: Int

    init(capacity: Int = 3000, observeSystemEvents: Bool = false) {
        self.capacity = capacity
        guard observeSystemEvents else { return }
        let center = NotificationCenter.default
        let flush: @Sendable (Notification) -> Void = { _ in
            MainActor.assumeIsolated { BubbleHeightCache.shared.removeAll() }
        }
        center.addObserver(forName: UIContentSizeCategory.didChangeNotification, object: nil, queue: .main, using: flush)
        center.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main, using: flush)
    }

    private static func bucket(_ width: CGFloat) -> CGFloat { width.rounded() }

    func size(messageId: String, content: BubbleContent, width: CGFloat) -> CGSize? {
        guard let entry = entries[messageId],
              entry.widthBucket == Self.bucket(width),
              entry.content == content else { return nil }
        return entry.size
    }

    func store(messageId: String, content: BubbleContent, width: CGFloat, size: CGSize) {
        // Bound growth: one entry per message id, reset wholesale on overflow
        // (a cold re-measure is cheap next to a scroll's worth of hits).
        if entries[messageId] == nil, entries.count >= capacity {
            entries.removeAll(keepingCapacity: true)
        }
        entries[messageId] = Entry(content: content, widthBucket: Self.bucket(width), size: size)
    }

    func removeAll() {
        entries.removeAll(keepingCapacity: true)
    }

    var count: Int { entries.count }
}

