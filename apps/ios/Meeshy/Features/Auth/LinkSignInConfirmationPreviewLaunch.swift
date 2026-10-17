#if DEBUG
import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Aperçu DEBUG de « Se connecter en tant que @x ? »** (#10880), sans lien ni
/// réseau — pour vérifier la feuille au simulateur.
///
/// ```
/// xcrun simctl launch <udid> me.meeshy.app -MeeshyLinkSignInConfirmationPreview replacing
/// ```
///
/// États : `fresh` (aucun compte ouvert, par défaut), `replacing` (un autre
/// compte est ouvert) et `claim` (le lien revendique une adresse, #10883). Les
/// réponses ne font rien.
enum LinkSignInConfirmationPreviewLaunch {
    static let argument = "-MeeshyLinkSignInConfirmationPreview"

    static var isActive: Bool {
        ProcessInfo.processInfo.arguments.contains(argument)
    }

    private static var state: String? {
        let arguments = ProcessInfo.processInfo.arguments
        return arguments.firstIndex(of: argument)
            .flatMap { arguments.indices.contains($0 + 1) ? arguments[$0 + 1] : nil }
    }

    static var signedIn: MeeshyUser? {
        state == "replacing" ? MeeshyUser(id: "preview-me", username: "awa", displayName: "Awa Diallo") : nil
    }

    static var question: LinkConfirmationRequired {
        let account = LinkSignInAccount(id: "preview-link", username: "mallory", displayName: "Mallory Martin")
        return state == "claim"
            ? LinkConfirmationRequired(account: account, intent: .claimEmail, maskedEmail: "ma....e@e*****om")
            : LinkConfirmationRequired(account: account, maskedEmail: "ma....y@e*****om")
    }
}

struct LinkSignInConfirmationPreviewScreen: View {
    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.35).ignoresSafeArea()
            LinkSignInConfirmationView(
                content: LinkSignInConfirmationContent(
                    question: LinkSignInConfirmationPreviewLaunch.question,
                    signedIn: LinkSignInConfirmationPreviewLaunch.signedIn
                ),
                onAnswer: { _ in }
            )
            .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: MeeshyRadius.xxl, style: .continuous))
            .frame(maxHeight: 560)
        }
        .ignoresSafeArea(edges: .bottom)
    }
}
#endif
