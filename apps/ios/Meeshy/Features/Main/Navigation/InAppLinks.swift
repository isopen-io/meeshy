import SwiftUI

/// **Un lien Meeshy touché dans l'app s'ouvre dans l'app** (#7808).
///
/// iOS ne renvoie jamais à une app un lien universel qu'elle ouvre elle-même :
/// sans cette action, `https://meeshy.me/story/<id>` touché dans un message
/// partait dans Safari. L'iPhone la posait en ligne dans `RootView`, l'iPad
/// pas du tout. La politique vit ici ; `Router.handleDeepLink` en est la
/// suite, identique au lancement système.
enum InAppLinks {
    static func opensInApp(_ url: URL) -> Bool {
        switch DeepLinkParser.parse(url) {
        // Une invitation touchée dans l'app l'est par un compte connecté : elle
        // n'a rien à y ouvrir et part dans le navigateur, comme avant (#8075).
        // Un lien de réinitialisation touché dans un message part au navigateur :
        // il n'est pas une destination, et l'app ne présente que celui que le
        // système lui remet (#10868).
        case .external, .referral, .passwordResetLink: return false
        default: return true
        }
    }
}

extension View {
    /// Pose la politique des liens in-app sur une racine (iPhone, iPad).
    func inAppLinks(router: Router) -> some View {
        environment(\.openURL, OpenURLAction { url in
            guard InAppLinks.opensInApp(url) else { return .systemAction }
            router.handleDeepLink(url)
            return .handled
        })
    }
}
