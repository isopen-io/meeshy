import MeeshySDK

@MainActor
protocol AppRootSessionSource: AnyObject {
    var isAuthenticated: Bool { get }
    var hasResolvedStoredSession: Bool { get }
    var isSwitchingAccount: Bool { get }
    var sessionRevocationNotice: SessionRevocationNotice? { get }
    var rootSystemLanguage: String? { get }
}

struct AppRootSession: Equatable {
    let isAuthenticated: Bool
    let hasResolvedStoredSession: Bool
    let isSwitchingAccount: Bool
    let revocationNotice: SessionRevocationNotice?
    let systemLanguage: String?

    init(_ source: some AppRootSessionSource) {
        isAuthenticated = source.isAuthenticated
        hasResolvedStoredSession = source.hasResolvedStoredSession
        isSwitchingAccount = source.isSwitchingAccount
        revocationNotice = source.sessionRevocationNotice
        systemLanguage = source.rootSystemLanguage
    }
}

extension AuthManager: AppRootSessionSource {
    var rootSystemLanguage: String? { currentUser?.systemLanguage }
}
