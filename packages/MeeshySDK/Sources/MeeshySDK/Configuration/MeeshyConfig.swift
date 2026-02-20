import Foundation

public final class MeeshyConfig {
    public static let shared = MeeshyConfig()

    private static let remoteOrigin = "https://gate.meeshy.me"
    private static let localOrigin = "http://localhost:3000"
    private static let defaultApiPath = "/api/v1"

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

    public var appBundleId: String = "com.meeshy.app"

    private init() {}

    /// Resolve a potentially relative media URL (e.g. "/api/v1/attachments/file/...")
    /// into an absolute URL by prepending the server origin.
    public static func resolveMediaURL(_ urlString: String) -> URL? {
        let resolved = urlString.hasPrefix("/")
            ? shared.serverOrigin + urlString
            : urlString
        return URL(string: resolved)
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
}
