import SwiftUI
import MeeshyUI

struct ContactsHubView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @EnvironmentObject private var router: Router
    @State private var scrollOffset: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            CollapsibleHeader(
                title: "Contacts",
                scrollOffset: scrollOffset,
                onBack: { router.pop() },
                titleColor: theme.textPrimary,
                backArrowColor: MeeshyColors.indigo500,
                backgroundColor: theme.backgroundPrimary
            )

            ScrollView {
                GeometryReader { geo in
                    Color.clear.preference(
                        key: ScrollOffsetPreferenceKey.self,
                        value: geo.frame(in: .named("scroll")).minY
                    )
                }
                .frame(height: 0)

                Text("Contacts Hub — En cours de developpement")
                    .foregroundColor(theme.textMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 40)
            }
            .coordinateSpace(name: "scroll")
            .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollOffset = $0 }
        }
        .background(theme.backgroundPrimary.ignoresSafeArea())
        .navigationBarHidden(true)
    }
}
