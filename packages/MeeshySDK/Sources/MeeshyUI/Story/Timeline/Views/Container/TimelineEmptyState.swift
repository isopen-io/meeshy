import SwiftUI

/// Placeholder shown in `StoryTimelineView` when the
/// project has no clips on any track. Replaces the previous behaviour where
/// the `CONTENT / AUDIO / EFFECTS` group headers rendered alone, leaving the
/// editor looking broken on first open.
public struct TimelineEmptyState: View, Equatable {

    public let isDark: Bool

    public init(isDark: Bool) {
        self.isDark = isDark
    }

    public var body: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(MeeshyColors.indigo500.opacity(isDark ? 0.20 : 0.14))
                    .frame(width: 56, height: 56)
                Image(systemName: "rectangle.stack.badge.plus")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(MeeshyColors.indigo500)
            }
            VStack(spacing: 4) {
                Text(String(localized: "story.timeline.empty.title", defaultValue: "Aucune piste", bundle: .module))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(isDark ? MeeshyColors.indigo100 : MeeshyColors.indigo900)
                Text(String(localized: "story.timeline.empty.subtitle",
                            defaultValue: "Ajoute une vidéo, une photo, du son ou du texte depuis la barre du composer.",
                            bundle: .module))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}
