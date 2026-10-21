import SwiftUI
import MeeshySDK

struct GuestSessionCoverActions {
    let dismiss: () -> Void
    let sessionCreated: (GuestSession, AnonymousSessionContext) -> Void
    let accountRequested: (GuestSession, InviteLandingChoice) -> Void
    let newLink: (GuestSession, String) -> Void
}

struct GuestSessionCover: ViewModifier {
    let guest: GuestSession?
    let isAuthenticated: Bool
    let actions: GuestSessionCoverActions

    func body(content: Content) -> some View {
        content.fullScreenCover(isPresented: .init(
            get: { RootPresentationRules.showsGuestCover(guest: guest, isAuthenticated: isAuthenticated) },
            set: { if !$0 { actions.dismiss() } }
        )) {
            if let guest {
                GuestConversationContainer(
                    session: guest,
                    onSessionCreated: { actions.sessionCreated(guest, $0) },
                    onAccountRequest: { actions.accountRequested(guest, $0) },
                    onNewLink: { actions.newLink(guest, $0) }
                )
            }
        }
    }
}

extension View {
    func guestSessionCover(guest: GuestSession?, isAuthenticated: Bool, actions: GuestSessionCoverActions) -> some View {
        modifier(GuestSessionCover(guest: guest, isAuthenticated: isAuthenticated, actions: actions))
    }
}
