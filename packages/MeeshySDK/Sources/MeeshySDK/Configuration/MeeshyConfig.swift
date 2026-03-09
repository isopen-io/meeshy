import Foundation

public final class MeeshyConfig: @unchecked Sendable {
    public static let shared = MeeshyConfig()

    private static let remoteOrigin = "https://gate.meeshy.me"
    private static let localOrigin = "http://localhost:3000"
    private static let defaultApiPath = "/api/v1"
    private static let environmentKey = "meeshy_selected_environment"
    private static let customHostKey = "meeshy_custom_host"

    public enum ServerEnvironment: String, CaseIterable, Sendable {
        case production = "gate.meeshy.me"
        case staging = "gate.staging.meeshy.me"
        case localhost = "localhost:3000"
        case custom = "custom"

        public var label: String {
            switch self {
            case .production: return "Production"
            case .staging: return "Staging"
            case .localhost: return "Localhost"
            case .custom: return "Custom"
            }
        }

        public var origin: String {
            switch self {
            case .production: return "https://gate.meeshy.me"
            case .staging: return "https://gate.staging.meeshy.me"
            case .localhost: return "http://localhost:3000"
            case .custom: return ""
            }
        }
    }

    /// Full API base URL including version path (e.g. "https://gate.meeshy.me/api/v1")
    public var apiBaseURL: String = "\(remoteOrigin)\(defaultApiPath)"

    /// Server origin without path (e.g. "https://gate.meeshy.me")
    public var serverOrigin: String {
        guard let url = URL(string: apiBaseURL),
              let scheme = url.scheme,
              let host = url.host else { return apiBaseURL }
        let port = url.port.map { ":\($0)" } ?? ""
        return "\(scheme)://\(host)\(port)"
    }

    public var socketBaseURL: String { serverOrigin }

    public var appBundleId: String = "me.meeshy.app"

    private init() {}

    /// Resolve a potentially relative media URL (e.g. "/api/v1/attachments/file/...")
    /// into an absolute URL by prepending the server origin.
    /// Validates scheme (https only, http for localhost) and blocks private IPs (SSRF protection).
    public static func resolveMediaURL(_ urlString: String) -> URL? {
        let resolved: String
        if urlString.hasPrefix("http://") || urlString.hasPrefix("https://") {
            resolved = urlString
        } else if urlString.hasPrefix("/") {
            resolved = shared.serverOrigin + urlString
        } else {
            resolved = shared.serverOrigin + "/" + urlString
        }
        guard let url = URL(string: resolved),
              let scheme = url.scheme?.lowercased(),
              let host = url.host?.lowercased() else { return nil }

        guard scheme == "https" || (scheme == "http" && isLocalhost(host)) else { return nil }
        guard !isPrivateIP(host) else { return nil }

        return url
    }

    private static func isLocalhost(_ host: String) -> Bool {
        host == "localhost" || host == "127.0.0.1" || host == "::1"
    }

    private static func isPrivateIP(_ host: String) -> Bool {
        let parts = host.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 4 else { return false }
        if parts[0] == 10 { return true }
        if parts[0] == 172 && (16...31).contains(parts[1]) { return true }
        if parts[0] == 192 && parts[1] == 168 { return true }
        if parts[0] == 169 && parts[1] == 254 { return true }
        if parts[0] == 127 { return true }
        return false
    }

    /// Call once at app startup to configure the SDK
    public func configure(apiURL: String, bundleId: String? = nil) {
        self.apiBaseURL = apiURL
        if let bundleId { self.appBundleId = bundleId }
    }

    /// Switch between remote and local gateway, preserving the API version path
    public func setUseLocalGateway(_ local: Bool) {
        let origin = local ? Self.localOrigin : Self.remoteOrigin
        let path = URL(string: apiBaseURL)?.path ?? Self.defaultApiPath
        apiBaseURL = origin + path
    }

    /// Currently selected environment, persisted in UserDefaults
    public var selectedEnvironment: ServerEnvironment {
        get {
            guard let raw = UserDefaults.standard.string(forKey: Self.environmentKey),
                  let env = ServerEnvironment(rawValue: raw) else { return .production }
            return env
        }
        set {
            UserDefaults.standard.set(newValue.rawValue, forKey: Self.environmentKey)
        }
    }

    /// Custom host string for the .custom environment
    public var customHost: String {
        get { UserDefaults.standard.string(forKey: Self.customHostKey) ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: Self.customHostKey) }
    }

    /// Apply the selected environment, updating apiBaseURL
    public func applyEnvironment(_ env: ServerEnvironment, customHost: String? = nil) {
        selectedEnvironment = env
        let origin: String
        switch env {
        case .custom:
            let host = customHost ?? self.customHost
            self.customHost = host
            origin = host.hasPrefix("http") ? host : "https://\(host)"
        default:
            origin = env.origin
        }
        apiBaseURL = origin + Self.defaultApiPath
    }

    /// Restore the persisted environment on app launch
    public func restoreEnvironment() {
        let env = selectedEnvironment
        guard env != .production else { return }
        applyEnvironment(env)
    }
}
