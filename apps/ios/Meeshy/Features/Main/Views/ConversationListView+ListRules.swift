import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Règles pures de la liste, sans état

extension ConversationListView {

    // MARK: - Preview Auto-Load Eligibility
    //
    // Pure/testable (no SwiftUI/MainActor dependency) — same `firstIndex`
    // scan shape as `triggerLoadMoreIfNeeded` below, but NOT the same call
    // cadence: `triggerLoadMoreIfNeeded` fires from `.onAppear` (once per
    // scroll-triggered row appearance), while this runs on every
    // `conversationRow` body evaluation for every on-screen row — including
    // re-renders driven by `presencePulse`. The caller (`sectionsContent`)
    // hoists the `orderedConversationIds` array build to ONCE per body pass
    // instead of once per row to keep that repeated cost bounded. Gates
    // `ConversationRowItem.enableAutoPreviewLoad` to the first `limit`
    // entries of `orderedConversationIds` — the caller MUST pass the
    // actually-rendered order (flattened `groupedConversations`), never the
    // raw unfiltered/ungrouped `conversationViewModel.conversations`: a
    // filtered/sectioned view's visible rows can fall entirely outside the
    // full-account top-20 by recency, permanently starving their auto-load
    // (fix 2026-07-21; audit 2026-07-20 introduced the limit itself: every
    // row firing its preview-prefetch `.task` on appear meant 1 REST call
    // per newly-visible row on a cold cache).
    nonisolated static func shouldAutoLoadPreview(
        conversationId: String,
        orderedConversationIds: [String],
        limit: Int
    ) -> Bool {
        guard limit > 0, let idx = orderedConversationIds.firstIndex(of: conversationId) else { return false }
        return idx < limit
    }

    // MARK: - Share Link Permission

    func canCreateShareLink(for conversation: Conversation) -> Bool {
        if conversation.type == .direct { return false }
        if conversation.type == .group {
            let role = conversation.currentUserRole?.lowercased() ?? "member"
            return ["admin", "moderator", "owner", "co-owner", "bigboss"].contains(role)
        }
        return true
    }

    /// Libellé de la pilule : la section dont les rangs viennent d'entrer à
    /// l'écran, à défaut la première section rendue. Fonction PURE (aucune
    /// dépendance SwiftUI/MainActor), donc directement testable — même
    /// convention que `emptyBranch` / `shouldAutoLoadPreview`. La MAJUSCULE
    /// vient de `LentilleSticker.displayTitle` : pilule et sticker crient le
    /// même mot, par la même fonction, jamais par deux transformations
    /// parallèles qui dériveraient.
    nonisolated static func sectionPillTitle(
        visibleSectionId: String?,
        sections: [ConversationSection]
    ) -> String? {
        guard let fallback = sections.first else { return nil }
        let match = sections.first(where: { $0.id == visibleSectionId }) ?? fallback
        return LentilleSticker.displayTitle(match.name)
    }
}
