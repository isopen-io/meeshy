import SwiftUI
import MeeshySDK

struct SessionContent: View {
    let session: AppRootSession
    let commands: AppRootSessionCommands
    let route: RootRoute
    let pendingDeepLink: DeepLink?
    let onLoginAppear: () -> Void

    @ViewBuilder
    var body: some View {
        switch route {
        case .connected:
            AdaptiveRootView()
                .environment(\.mentionContactsProvider, MentionContactsAudienceBridge())
                .modifier(ProfileSheetEnvironment())
        case .login:
            loginScreen
        case .none:
            EmptyView()
        }
    }

    private var loginScreen: some View {
        LoginView()
            .safeAreaInset(edge: .top, spacing: 0) {
                PendingLinkNotice(isVisible: pendingDeepLink?.opensAfterSignIn == true)
            }
            .animation(.easeOut(duration: 0.25), value: pendingDeepLink)
            .onAppear { onLoginAppear() }
            .sheet(item: revocationNotice) { notice in
                SessionClosedNoticeView(notice: notice) { commands.acknowledgeRevocationNotice() }
            }
    }

    private var revocationNotice: Binding<SessionRevocationNotice?> {
        Binding(
            get: { session.revocationNotice },
            set: { if $0 == nil { commands.acknowledgeRevocationNotice() } }
        )
    }
}
