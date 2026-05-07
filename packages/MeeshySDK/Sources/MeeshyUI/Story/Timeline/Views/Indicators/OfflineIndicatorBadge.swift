import SwiftUI
import MeeshySDK

/// Subtle, non-blocking indicator that the timeline composer is operating offline.
///
/// Spec: `docs/superpowers/specs/2026-05-05-story-timeline-editor-design.md` §
/// "Architecture OFFLINE-FIRST". Must NOT alarm — no red, no modal, no banner.
/// Indigo 300 at 80% opacity on an ultraThinMaterial capsule reads as "ambient
/// information", consistent with the Meeshy indigo brand palette.
///
/// Hidden when `isOffline = false` so it consumes zero layout in the top bar
/// when the device is connected.
public struct OfflineIndicatorBadge: View, Equatable {

    public let isOffline: Bool

    public init(isOffline: Bool) {
        self.isOffline = isOffline
    }

    // MARK: - Equatable (visual props only)

    public static func == (lhs: OfflineIndicatorBadge, rhs: OfflineIndicatorBadge) -> Bool {
        lhs.isOffline == rhs.isOffline
    }

    // MARK: - Body

    public var body: some View {
        if isOffline {
            Label {
                Text(
                    String(
                        localized: "story.timeline.indicator.offline",
                        defaultValue: "Hors-ligne",
                        bundle: .module
                    )
                )
                .font(.system(size: 11, weight: .medium))
            } icon: {
                Image(systemName: "airplane")
                    .font(.system(size: 10))
            }
            .foregroundStyle(MeeshyColors.indigo300.opacity(0.8))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(.ultraThinMaterial, in: Capsule())
            .accessibilityElement(children: .combine)
            .accessibilityLabel(
                String(
                    localized: "story.timeline.a11y.offline",
                    defaultValue: "Hors-ligne — votre story sera publiée à la reconnexion",
                    bundle: .module
                )
            )
        }
    }
}
