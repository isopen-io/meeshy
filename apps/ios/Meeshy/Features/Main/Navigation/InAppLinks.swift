import SwiftUI
import SafariServices

/// **Un lien Meeshy touché dans l'app s'ouvre dans l'app** (#7808).
///
/// iOS ne renvoie jamais à une app un lien universel qu'elle ouvre elle-même :
/// sans cette action, `https://meeshy.me/story/<id>` touché dans un message
/// partait dans Safari. L'iPhone la posait en ligne dans `RootView`, l'iPad
/// pas du tout. La politique vit ici ; `Router.handleDeepLink` en est la
/// suite, identique au lancement système.
enum InAppLinks {
    /// Un lien à jeton d'e-mail touché dans l'app (bulle, post, commentaire)
    /// n'ouvre JAMAIS de session (#10874) : celui qui l'a posté a pu le
    /// demander pour SON compte, et le lecteur y serait connecté. Il s'ouvre
    /// dans un navigateur intégré, d'où il ne peut pas revenir à l'app comme
    /// lien universel ; l'app n'ouvre que celui que le système lui remet.
    static func isEmailLink(_ url: URL) -> Bool {
        if EmailLinkSecret.carriesSecret(url) { return true }
        switch DeepLinkParser.parse(url) {
        case .magicLink, .emailVerificationLink, .passwordResetLink: return true
        default: return false
        }
    }

    static func opensInApp(_ url: URL) -> Bool {
        if isEmailLink(url) { return false }
        switch DeepLinkParser.parse(url) {
        // Une invitation touchée dans l'app l'est par un compte connecté : elle
        // n'a rien à y ouvrir et part dans le navigateur, comme avant (#8075).
        // Un lien de réinitialisation touché dans un message part au navigateur :
        // il n'est pas une destination, et l'app ne présente que celui que le
        // système lui remet (#10868).
        case .external, .referral, .passwordResetLink, .magicLink, .emailVerificationLink: return false
        default: return true
        }
    }
}

extension View {
    /// Pose la politique des liens in-app sur une racine (iPhone, iPad).
    func inAppLinks(router: Router) -> some View {
        environment(\.openURL, OpenURLAction { url in
            if InAppLinks.isEmailLink(url) {
                EmailLinkBrowser.present(url)
                return .handled
            }
            guard InAppLinks.opensInApp(url) else { return .systemAction }
            router.handleDeepLink(url)
            return .handled
        })
    }
}

/// Le navigateur INTÉGRÉ d'un lien d'e-mail touché dans l'app (#10874) : un
/// `SFSafariViewController` ne rend jamais un lien universel à l'app qui le
/// présente, là où `UIApplication.open` laisse ce choix au système.
@MainActor
enum EmailLinkBrowser {
    static func present(_ url: URL) {
        guard url.scheme?.lowercased() == "https", let top = topMostController() else { return }
        top.present(SFSafariViewController(url: url), animated: true)
    }

    private static func topMostController() -> UIViewController? {
        var top = DeviceLayout.activeWindow?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }
}
