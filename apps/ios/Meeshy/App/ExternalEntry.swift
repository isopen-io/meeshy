import Foundation

enum ExternalEntry: Equatable {
    case shareRelay(id: String)
    case shareCompose(id: String)
    case signIn(SignInLink)
    case deepLink(URL)

    enum Origin: Equatable {
        case openURL
        case browsingActivity
    }

    static func classify(url: URL, origin: Origin) -> ExternalEntry {
        .deepLink(url)
    }
}
