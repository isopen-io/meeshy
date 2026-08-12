import SwiftUI
import MeeshySDK
import MeeshyUI

/// Cold-start placeholder for a single Contacts-hub row (avatar + two text
/// lines). Mirrors the row shape every tab already renders once data lands
/// (avatar, name, subtitle) so the vertical rhythm survives the swap to live
/// rows — same idea as `SkeletonLinkRow`, sized for a contact/call row instead
/// of a link row.
///
/// Leaf view: no `@ObservedObject`/`@StateObject`, no singleton read besides
/// the calculated `ThemeManager.shared` accessor already used by every other
/// skeleton in `MeeshySDK/Primitives/SkeletonView.swift`.
private struct ContactsSkeletonRow: View {
    private let accentColor: String
    private var theme: ThemeManager { ThemeManager.shared }

    init(accentColor: String) {
        self.accentColor = accentColor
    }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            Circle()
                .fill(theme.textMuted.opacity(0.12))
                .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(theme.textMuted.opacity(0.12))
                    .frame(width: 120, height: 14)
                RoundedRectangle(cornerRadius: 3)
                    .fill(theme.textMuted.opacity(0.08))
                    .frame(width: 80, height: 11)
            }

            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.sm)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(theme.surfaceGradient(tint: accentColor))
        )
        .shimmer()
        .accessibilityHidden(true)
    }
}

/// Cold-start skeleton for the Contacts hub — replaces the full-screen
/// `ProgressView()` on an empty cache (`loadState == .loading && items.isEmpty`)
/// across `ContactsListTab`, `CallsTab`, and `BlockedTab`. Per the Instant App
/// bible: skeleton rows on an empty cache, never a bare spinner.
///
/// `accentColor` defaults to the brand indigo — the same tint every one of
/// these tabs already uses for its `ProgressView().tint(...)`.
struct ContactsSkeletonList: View {
    private let count: Int
    private let accentColor: String

    init(count: Int = 5, accentColor: String = MeeshyColors.brandPrimaryHex) {
        self.count = count
        self.accentColor = accentColor
    }

    var body: some View {
        VStack(spacing: MeeshySpacing.md) {
            ForEach(0..<count, id: \.self) { _ in
                ContactsSkeletonRow(accentColor: accentColor)
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.lg)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "contacts.skeleton.loading", defaultValue: "Chargement en cours", bundle: .main))
    }
}

#if DEBUG
struct ContactsSkeletonList_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            ContactsSkeletonList()
                .preferredColorScheme(.light)
            ContactsSkeletonList()
                .preferredColorScheme(.dark)
        }
    }
}
#endif
