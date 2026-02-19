import Foundation

public enum MeeshySDK {
    public static let version = "1.0.0"

    /// Initialize the SDK with API URL
    public static func initialize(apiURL: String = "https://gate.meeshy.me/api/v1", bundleId: String? = nil) {
        MeeshyConfig.shared.configure(apiURL: apiURL, bundleId: bundleId)
    }
}
