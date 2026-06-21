import SwiftUI
import MeeshySDK
import MeeshyUI

/// People hub **Calls** tab.
///
/// Phase 1 ships the shell: a polished empty state and the scroll plumbing so
/// it participates in the hub's collapsing header. The call journal (received /
/// missed / cancelled / outgoing over a 3-month sliding window, locally cached)
/// is wired in Phase 2 against the new `GET /calls/history` endpoint and the
/// SDK `CallHistoryService`.
struct CallsTab: View {
    private var theme: ThemeManager { ThemeManager.shared }
    var isActive: Bool = true
    var onScrollOffsetChange: (CGFloat) -> Void = { _ in }

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            ContactsScrollSentinel()
            VStack(spacing: 16) {
                Spacer(minLength: 90)
                Image(systemName: "phone.arrow.up.right")
                    .font(.system(size: 44, weight: .light))
                    .foregroundColor(MeeshyColors.indigo500.opacity(0.5))
                    .accessibilityHidden(true)
                Text(String(localized: "calls.empty.title", defaultValue: "Aucun appel recent", bundle: .main))
                    .font(.callout.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                Text(String(localized: "calls.empty.subtitle", defaultValue: "Vos appels recus, manques, annules et emis apparaitront ici.", bundle: .main))
                    .font(.footnote)
                    .foregroundColor(theme.textMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 44)
            }
            .frame(maxWidth: .infinity)
        }
        .reportsContactsScroll(active: isActive, onChange: onScrollOffsetChange)
    }
}
