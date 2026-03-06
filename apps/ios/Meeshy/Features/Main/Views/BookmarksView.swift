import SwiftUI
import MeeshySDK

struct BookmarksView: View {
    @EnvironmentObject private var theme: ThemeManager

    var body: some View {
        VStack {
            Text("Bookmarks")
                .foregroundColor(theme.textPrimary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(theme.backgroundPrimary)
    }
}
