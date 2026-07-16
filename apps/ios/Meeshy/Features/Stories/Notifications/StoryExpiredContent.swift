import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - openStoryComposer Notification
//
// Decoupled CTA mechanism. The "Create a story" button posts this notification
// instead of holding a direct reference to `StoryViewModel.showStoryComposer`,
// because this view can be reached from a deep navigation stack where the
// composer's owning view (StoryTrayView, presented from RootView) is not in
// scope. Mirrors the existing fire-and-forget pattern used elsewhere by
// RootView (`sendMessageToUser`, `pushNavigateToRoute`).
//
// The receiver lives in RootView (Phase F). Posting here while no listener is
// attached is a no-op — safe behaviour during tests and for older flows.

public extension Notification.Name {
    static let openStoryComposer = Notification.Name("openStoryComposer")
}

// MARK: - StoryExpiredContent
//
// Empty-state screen surfaced when a notification points at a story that is
// no longer available (expired, deleted, or 404). Composition top → bottom:
//   1. Actor header (avatar 32 + display name + relative time)
//   2. Trigger visual (large emoji for reaction, bubble symbol for comment)
//   3. Optional comment excerpt (italic, only when trigger is .comment)
//   4. Localised title + subtitle ("Story expired" / "no longer available")
//   5. Primary CTA — "Create a story" (posts .openStoryComposer)
//   6. Secondary link — "Back to notifications" (dismisses)
//
// The background colour is sampled once (per instance) from
// `StoryBackgroundPalette.randomBackgroundColorAsColor()` so the screen
// matches the playful identity of the composer canvas. Foreground colour is
// chosen via `Self.foregroundOnBackground(_:)` against WCAG luminance to
// stay legible across that palette without per-tone overrides.

public struct StoryExpiredContent: View {

    public let storyId: String
    public let context: StoryNotificationContext

    @Environment(\.dismiss) private var dismiss

    @State private var background: Color = StoryBackgroundPalette.randomBackgroundColorAsColor()

    public init(storyId: String, context: StoryNotificationContext) {
        self.storyId = storyId
        self.context = context
    }

    public var body: some View {
        ZStack {
            background.ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer(minLength: 0)
                actorHeader
                triggerVisual
                triggerExcerpt
                titleBlock
                Spacer(minLength: 0)
                createCTA
                backLink
                    .padding(.bottom, 24)
            }
            .padding(.horizontal, 32)
        }
        .foregroundStyle(Self.foregroundOnBackground(background))
    }

    // MARK: - Adaptive foreground (pure, exposed for tests)

    /// Picks the legible foreground colour for arbitrary backgrounds based on
    /// WCAG relative luminance. The 0.6 threshold matches the design tokens
    /// used by the story canvases.
    public static func foregroundOnBackground(_ bg: Color) -> Color {
        bg.luminance > 0.6 ? .black : .white
    }

    // MARK: - Sub-views

    @ViewBuilder
    private var actorHeader: some View {
        let foreground = Self.foregroundOnBackground(background)
        HStack(spacing: 12) {
            MeeshyAvatar(
                name: context.actorDisplayName,
                context: .custom(32),
                avatarURL: context.actorAvatar
            )
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(context.actorDisplayName)
                    .font(.headline)
                    .foregroundStyle(foreground)
                Text(context.occurredAt.formatted(.relative(presentation: .named)))
                    .font(.caption)
                    .foregroundStyle(foreground.opacity(0.7))
            }
            Spacer(minLength: 0)
        }
        // Avatar label duplicates the adjacent name — hide it, then read the
        // header as one element ("<name>, <relative time>") for a single swipe.
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var triggerVisual: some View {
        switch context.trigger {
        case .reaction(let emoji):
            // Hero glyph ≥40pt → kept fixed (scaling a 64pt visual under Dynamic
            // Type would blow the empty-state layout). The emoji IS the reaction
            // content, so it stays labelled for VoiceOver.
            Text(emoji)
                .font(.system(size: 64))
                .accessibilityLabel(Text(emoji))
        case .comment:
            // Decorative counterpart to the reaction emoji — the comment excerpt
            // and localised title already convey the trigger, so hide it from
            // VoiceOver. Hero glyph ≥40pt → kept fixed, same rationale as above.
            Image(systemName: "bubble.left.fill")
                .font(.system(size: 56))
                .foregroundStyle(Self.foregroundOnBackground(background).opacity(0.85))
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder
    private var triggerExcerpt: some View {
        if case .comment(let preview) = context.trigger, !preview.isEmpty {
            Text("« \(preview) »")
                .italic()
                .font(.body)
                .multilineTextAlignment(.center)
                .lineLimit(3)
        } else {
            EmptyView()
        }
    }

    @ViewBuilder
    private var titleBlock: some View {
        let foreground = Self.foregroundOnBackground(background)
        VStack(spacing: 8) {
            Text("notifications.story.expired.title")
                .font(.title2.bold())
                .foregroundStyle(foreground)
                .multilineTextAlignment(.center)
            Text("notifications.story.expired.subtitle")
                .font(.body)
                .foregroundStyle(foreground.opacity(0.8))
                .multilineTextAlignment(.center)
        }
        // Read title + subtitle as one statement rather than two separate swipes.
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var createCTA: some View {
        let foreground = Self.foregroundOnBackground(background)
        Button {
            HapticFeedback.medium()
            // Dismiss first so the composer presents from RootView with a
            // clean navigation stack — `.fullScreenCover` over `.fullScreenCover`
            // animates poorly on iOS 16/17.
            dismiss()
            NotificationCenter.default.post(name: .openStoryComposer, object: nil)
        } label: {
            Text("notifications.story.expired.cta.create")
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 14)
                        .fill(foreground)
                )
                .foregroundStyle(background)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var backLink: some View {
        let foreground = Self.foregroundOnBackground(background)
        Button {
            dismiss()
        } label: {
            Text("notifications.story.expired.back")
                .font(.subheadline)
                .underline()
                .foregroundStyle(foreground.opacity(0.85))
        }
        .buttonStyle(.plain)
    }
}
