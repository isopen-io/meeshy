import Foundation

// MARK: - Device Token Registration

public struct RegisterDeviceTokenRequest: Encodable {
    public let token: String
    public let platform: String
    public let type: String
    /// "development" for sandbox APNs (debug builds), "production" for App Store/TestFlight.
    /// Optional — gateway defaults to "production" when omitted.
    public let apnsEnvironment: String?
    /// L'appareil (#10858) : la passerelle désactive les jetons précédents du
    /// même `(userId, deviceId, type)`. Absents ⇒ clés omises, comme avant.
    public let deviceId: String?
    public let deviceName: String?
    public let appVersion: String?
    public let bundleId: String?

    public init(
        token: String,
        platform: String = "ios",
        type: String = "apns",
        apnsEnvironment: String? = nil,
        device: PushDeviceIdentity? = nil
    ) {
        self.token = token
        self.platform = platform
        self.type = type
        self.apnsEnvironment = apnsEnvironment
        self.deviceId = device?.deviceId
        self.deviceName = device?.deviceName
        self.appVersion = device?.appVersion
        self.bundleId = device?.bundleId
    }
}

public struct UnregisterDeviceTokenRequest: Encodable {
    public let token: String

    public init(token: String) {
        self.token = token
    }
}

public struct RegisterDeviceTokenResponse: Decodable {
    public let id: String?
    public let type: String?
    public let platform: String?
    public let deviceName: String?
    public let isNew: Bool?
    public let message: String?
}
