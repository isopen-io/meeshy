import SwiftUI
import MeeshySDK
import MeeshyUI

/// People hub **Calls** tab.
///
/// Phase 1 ships the shell — the shared `EmptyStateView` primitive (consistent
/// icon/title/subtitle, entrance animation, combined accessibility). Nothing
/// scrolls yet, so it needs no scroll plumbing: the hub keeps the header
/// expanded for this tab by resetting its offset on tab switch.
///
/// The call journal (received / missed / cancelled / outgoing over a 3-month
/// sliding window, locally cached) is wired in Phase 2 against the new
/// `GET /calls/history` endpoint and the SDK `CallHistoryService`. The
/// `isActive` / `onScrollOffsetChange` parameters are kept for call-site
/// uniformity with the hub's other tabs and to ease that Phase 2 swap.
struct CallsTab: View {
    var isActive: Bool = true
    var onScrollOffsetChange: (CGFloat) -> Void = { _ in }

    var body: some View {
        EmptyStateView(
            icon: "phone.arrow.up.right",
            title: String(localized: "calls.empty.title", defaultValue: "Aucun appel recent", bundle: .main),
            subtitle: String(localized: "calls.empty.subtitle", defaultValue: "Vos appels recus, manques, annules et emis apparaitront ici.", bundle: .main)
        )
    }
}
