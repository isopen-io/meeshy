#if DEBUG
import SwiftUI
import MeeshySDK

/// **Aperçu DEBUG de « Se connecter en tant que @x ? »** (#10880), sans lien ni
/// réseau — pour vérifier la feuille au simulateur.
///
/// ```
/// xcrun simctl launch <udid> me.meeshy.app -MeeshyLinkSignInConfirmationPreview replacing
/// ```
///
/// États : `fresh` (aucun compte ouvert, par défaut) et `replacing` (un autre
/// compte est ouvert). Les réponses ne font rien.
enum LinkSignInConfirmationPreviewLaunch {
    static let argument = "-MeeshyLinkSignInConfirmationPreview"

    static var isActive: Bool {
        ProcessInfo.processInfo.arguments.contains(argument)
    }

    static var signedIn: MeeshyUser? {
        let arguments = ProcessInfo.processInfo.arguments
        let value = arguments.firstIndex(of: argument)
            .flatMap { arguments.indices.contains($0 + 1) ? arguments[$0 + 1] : nil }
        return value == "replacing" ? MeeshyUser(id: "preview-me", username: "awa", displayName: "Awa Diallo") : nil
    }
}

struct LinkSignInConfirmationPreviewScreen: View {
    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.35).ignoresSafeArea()
            LinkSignInConfirmationView(
                content: LinkSignInConfirmationContent(
                    account: LinkSignInAccount(id: "preview-link", username: "mallory", displayName: "Mallory Martin"),
                    signedIn: LinkSignInConfirmationPreviewLaunch.signedIn
                ),
                onAnswer: { _ in }
            )
            .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            .frame(maxHeight: 560)
        }
        .ignoresSafeArea(edges: .bottom)
    }
}
#endif
