import SwiftUI
import MeeshyUI

// MARK: - StoryNotificationOfflineContent
//
// Shown when `StoryNotificationTargetViewModel.load()` fails for any reason
// OTHER than a confirmed 404 (no connectivity, timeout, 5xx). Distinct from
// `StoryExpiredContent`: the story may still exist, so this offers a retry
// instead of a "Create a story" CTA that implies the original is gone for
// good. Reuses the existing `connection.offline`/`story.viewer.retry`
// catalog keys rather than minting new ones.

public struct StoryNotificationOfflineContent: View {

    public let onRetry: () -> Void

    @Environment(\.dismiss) private var dismiss

    public init(onRetry: @escaping () -> Void) {
        self.onRetry = onRetry
    }

    public var body: some View {
        ZStack {
            Color.black.opacity(0.85).ignoresSafeArea()

            VStack(spacing: 20) {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 40))
                    .foregroundStyle(.white.opacity(0.85))
                Text(String(localized: "connection.offline", defaultValue: "Hors ligne", bundle: .main))
                    .font(.title3.bold())
                    .foregroundStyle(.white)

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
