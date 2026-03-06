import SwiftUI
import MeeshySDK

struct PostDetailView: View {
    let postId: String
    var initialPost: FeedPost?

    @EnvironmentObject private var theme: ThemeManager

    var body: some View {
        VStack {
            Text("Post Detail: \(postId)")
                .foregroundColor(theme.textPrimary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(theme.backgroundPrimary)
    }
}
