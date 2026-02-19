import Foundation

public enum SocketConfig {
    public static var baseURL: URL? {
        URL(string: MeeshyConfig.shared.socketBaseURL)
    }
}
