import SwiftUI
import MeeshySDK

struct AppRootSessionCommands {
    let acknowledgeRevocationNotice: () -> Void
}

struct AppRootGate<Content: View>: View {
    @ObservedObject private var auth: AuthManager
    private let content: (AppRootSession, AppRootSessionCommands) -> Content

    init(
        auth: AuthManager = .shared,
        @ViewBuilder content: @escaping (AppRootSession, AppRootSessionCommands) -> Content
    ) {
        _auth = ObservedObject(wrappedValue: auth)
        self.content = content
    }

    var body: some View {
        content(
            AppRootSession(auth),
            AppRootSessionCommands(acknowledgeRevocationNotice: { [auth] in auth.acknowledgeSessionRevocationNotice() })
        )
    }
}
