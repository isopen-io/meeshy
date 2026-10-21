import Foundation
import UIKit

/// L'appareil qui enregistre un jeton push (#10858).
///
/// La passerelle ne garde qu'UN jeton actif par `(userId, deviceId, type)`
/// (`services/gateway/src/routes/push-tokens.ts`) ; sans `deviceId`, chaque
/// réinstallation laissait une ligne active de plus. `deviceId` est un
/// identifiant d'INSTALLATION persisté en trousseau (`ThisDeviceOnly` : il ne
/// voyage ni par sauvegarde ni vers un autre appareil), amorcé par
/// `identifierForVendor` — jamais l'IDFA. Le trousseau survit à la
/// désinstallation, `identifierForVendor` non : c'est ce qui rend l'identité
/// stable d'une réinstallation à l'autre.
public struct PushDeviceIdentity: Sendable, Equatable {
    public let deviceId: String?
    public let deviceName: String?
    public let appVersion: String?
    public let bundleId: String?

    public init(deviceId: String?, deviceName: String?, appVersion: String?, bundleId: String?) {
        self.deviceId = deviceId
        self.deviceName = deviceName
        self.appVersion = appVersion
        self.bundleId = bundleId
    }

    static let installationIdKey = "com.meeshy.push.installationId"

    static func installationId(keychain: any KeychainStoring, vendorId: () -> String?) -> String {
        if let stored = keychain.load(forKey: installationIdKey, account: nil), !stored.isEmpty {
            return stored
        }
        let seeded = vendorId() ?? UUID().uuidString
        try? keychain.save(seeded, forKey: installationIdKey, account: nil)
        return seeded
    }

    @MainActor
    public static func current(keychain: any KeychainStoring = KeychainManager.shared) -> PushDeviceIdentity {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String
        let build = info?["CFBundleVersion"] as? String
        let appVersion = version.map { short in build.map { "\(short) (\($0))" } ?? short }
        return PushDeviceIdentity(
            deviceId: installationId(keychain: keychain, vendorId: { UIDevice.current.identifierForVendor?.uuidString }),
            deviceName: String(hardwareModel().prefix(100)),
            appVersion: appVersion.map { String($0.prefix(50)) },
            bundleId: Bundle.main.bundleIdentifier
        )
    }

    private static func hardwareModel() -> String {
        if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] {
            return simulated
        }
        var system = utsname()
        uname(&system)
        let model = withUnsafeBytes(of: &system.machine) { buffer in
            String(decoding: buffer.prefix(while: { $0 != 0 }), as: UTF8.self)
        }
        return model.isEmpty ? UIDevice.current.model : model
    }
}
