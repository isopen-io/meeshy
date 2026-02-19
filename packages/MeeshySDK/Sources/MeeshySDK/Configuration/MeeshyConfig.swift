import Foundation

public final class MeeshyConfig {
    public static let shared = MeeshyConfig()

    public var apiBaseURL: String = "https://gate.meeshy.me/api/v1"

    public var socketBaseURL: String {
        apiBaseURL.replacingOccurrences(of: "/api/v1", with: "")
    }

    public var appBundleId: String = "com.meeshy.app"

    private init() {}

    /// Call once at app startup to configure the SDK
    public func configure(apiURL: String, bundleId: String? = nil) {
        self.apiBaseURL = apiURL
        if let bundleId { self.appBundleId = bundleId }
    }

    /// Switch between remote and local gateway
    public func setUseLocalGateway(_ local: Bool) {
        apiBaseURL = local
            ? "http://localhost:3000/api/v1"
            : "https://gate.meeshy.me/api/v1"
    }
}
