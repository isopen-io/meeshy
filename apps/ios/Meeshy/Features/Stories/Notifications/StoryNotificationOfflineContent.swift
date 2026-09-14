import SwiftUI
import MeeshyUI

// MARK: - StoryNotificationOfflineContent
//
// Shown when `StoryNotificationTargetViewModel.load()` got no answer: the
// request never arrived (`.network`) or the server failed (`.server`).
// Distinct from `StoryExpiredContent`: the story may still exist, so this
// offers a retry instead of a "Create a story" CTA that implies the original
// is gone for good. The words come from `ContentFetchFailure+Copy`, shared
// with the post detail and the reel reader: a server failure no longer says
// "offline" (#6508).

public struct StoryNotificationOfflineContent: View {

    let cause: ContentFetchFailure
    public let onRetry: () -> Void

    @Environment(\.dismiss) private var dismiss

    init(cause: ContentFetchFailure, onRetry: @escaping () -> Void) {
        self.cause = cause
        self.onRetry = onRetry
    }

    public var body: some View {
        ZStack {
            Color.black.opacity(0.85).ignoresSafeArea()

            VStack(spacing: 20) {
                Image(systemName: cause.symbolName)
                    .font(.system(size: 40))
                    .foregroundStyle(.white.opacity(0.85))
                    .accessibilityHidden(true)
                VStack(spacing: 8) {
                    Text(cause.title)
                        .font(.title3.bold())
                        .foregroundStyle(.white)
                    Text(cause.message)
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.75))
                }
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

                Button {
                    HapticFeedback.light()
                    onRetry()
                } label: {
                    Text(String(localized: "story.viewer.retry", defaultValue: "Réessayer", bundle: .main))
                        .font(.headline)
                        .padding(.horizontal, 28)
                        .padding(.vertical, 12)
                        .background(Capsule().fill(.white))
                        .foregroundStyle(.black)
                }
                .buttonStyle(.plain)

                Button {
                    dismiss()
                } label: {
                    Text("notifications.story.expired.back")
                        .font(.subheadline)
                        .underline()
                        .foregroundStyle(.white.opacity(0.7))
                }
                .buttonStyle(.plain)
            }
        }
    }
}
