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
        isAuthenticated = false
        hasResolvedStoredSession = false
        isSwitchingAccount = false
        revocationNotice = nil
        systemLanguage = nil
    }
}

extension AuthManager: AppRootSessionSource {
    var rootSystemLanguage: String? { nil }
}
