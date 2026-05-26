import Foundation

/// Lightweight Equatable envelope carrying the per-row state that the long-press
/// overlay needs to propagate down to a cell **without** triggering re-renders
/// on the rest of the list.
///
/// `ConversationView` recomputes one envelope per visible message every time
/// `overlayState.targetMessage` flips. For 99% of rows the envelope stays
/// `==` to its previous value, so SwiftUI's structural diff (and the embedding
/// `UICollectionView` diffable data source in `MessageListViewController`)
/// short-circuit cell re-renders. Only the targeted cell sees its envelope
/// change — that's the one cell that transitions to `opacity: 0` and back.
///
/// The envelope is intentionally small: it only carries flags that the
/// overlay machinery needs. Existing per-cell props (message content,
/// reactions, palette, etc.) keep flowing through their current channels
/// because they already have their own equality gating via
/// `ThemedMessageBubble`'s Equatable.
///
/// See spec section 3.5.
struct MessageRowEnvelope: Equatable, Hashable {
    let messageId: String
    /// `true` for the single row whose bubble is being displayed in the
    /// elevated overlay. The list-side cell is rendered with `opacity: 0`
    /// for the duration of the overlay's `.opening` → `.open` → `.closing`
    /// phases, then revealed via a 16 ms cross-fade in sync with the overlay
    /// fade-out.
    let isHiddenForOverlay: Bool
    /// Semantic alias for the same condition, surfaced separately so future
    /// work on the AVPlayer defensive pattern (spec section 9.4) can swap
    /// `VideoPlayer` for an `Image` snapshot without re-purposing the
    /// `isHiddenForOverlay` opacity flag.
    let isShadowedByOverlay: Bool

    init(
        messageId: String,
        isHiddenForOverlay: Bool = false,
        isShadowedByOverlay: Bool = false
    ) {
        self.messageId = messageId
        self.isHiddenForOverlay = isHiddenForOverlay
        self.isShadowedByOverlay = isShadowedByOverlay
    }
}
