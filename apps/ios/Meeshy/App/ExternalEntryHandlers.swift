import SwiftUI

struct ExternalEntryHandlers: ViewModifier {
    let dispatcher: any ExternalEntryDispatcherProviding

    func body(content: Content) -> some View {
        content
            .onOpenURL { url in
                dispatcher.open(ExternalEntry.classify(url: url, origin: .openURL))
            }
            .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { userActivity in
                guard let url = userActivity.webpageURL else { return }
                dispatcher.open(ExternalEntry.classify(url: url, origin: .browsingActivity))
            }
            .onContinueUserActivity(CallBackRequest.startCallActivityType) { userActivity in
                dispatcher.dial(activity: userActivity)
            }
    }
}
