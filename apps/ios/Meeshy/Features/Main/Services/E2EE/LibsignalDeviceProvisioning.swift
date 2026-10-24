import Foundation
import MeeshyE2EE
import MeeshySDK

/// L'installation libsignal RÉELLE de cette app (#3707) : la base scellée et le
/// verrou du groupe d'apps (partagés avec l'extension de notification), le
/// trousseau `AfterFirstUnlockThisDeviceOnly`, l'annuaire `/e2ee`. C'est le
/// seul site qui les touche ; le reste de l'app parle à
/// `EndToEndMessagingProviding`.
nonisolated final class LibsignalDeviceProvisioning: EndToEndDeviceProvisioning, @unchecked Sendable {
    private let lock = NSLock()
    private var opened: (vault: E2EEGRDBRecordVault, lock: E2EEProcessLock)?
    private let secrets = E2EEKeychainSecretStore()
    private let directory: any E2EEDirectoryClientProviding

    init(directory: any E2EEDirectoryClientProviding = E2EEDirectoryClient()) {
        self.directory = directory
    }

    /// La base et son verrou, ouverts une fois par processus.
    private func storage() throws -> (vault: E2EEGRDBRecordVault, lock: E2EEProcessLock) {
        try lock.withLock {
            if let opened { return opened }
            let processLock = try E2EEProcessLock.shared()
            let vault = try E2EEGRDBRecordVault.shared(secrets: secrets, lock: processLock)
            opened = (vault, processLock)
            return (vault, processLock)
        }
    }

    func plaintexts() throws -> any E2EEPlaintextStoring {
        E2EEPlaintextVault(vault: try storage().vault)
    }

    func registrar() throws -> any E2EEDeviceRegistering {
        let (vault, processLock) = try storage()
        return E2EEDeviceRegistrar(
            identities: E2EEIdentityVault(secrets: secrets), vault: vault, lock: processLock,
            directory: directory, platform: Self.platform, label: Self.label
        )
    }

    func ready(for userId: String) async throws -> EndToEndReadyDevice {
        let (vault, processLock) = try storage()
        let enrolled = try await registrar().ensureEnrolled(userId: userId)
        let store = MeeshySignalProtocolStore(identity: enrolled.identity)
        let cipher = E2EESessionCipher(local: enrolled.device.address, store: store, vault: vault, lock: processLock)
        return EndToEndReadyDevice(
            device: enrolled.device,
            sealer: E2EEMessageSealer(
                local: enrolled.device, cipher: cipher, directory: directory, approvals: E2EEOwnDeviceApprovals(vault: vault)
            ),
            opener: E2EEEnvelopeOpener(
                local: enrolled.device, cipher: cipher, plaintexts: E2EEPlaintextVault(vault: vault), directory: directory
            )
        )
    }

    /// L'app iOS sur Mac (« Designed for iPad ») s'annonce Mac.
    private static var platform: E2EEPlatform {
        ProcessInfo.processInfo.isiOSAppOnMac ? .macos : .ios
    }

    /// Le MODÈLE, jamais le nom de l'appareil (« iPhone de Jean ») : le serveur
    /// n'a pas à le connaître.
    private static var label: String {
        if ProcessInfo.processInfo.isiOSAppOnMac { return "Mac" }
        return hardwareModel.hasPrefix("iPad") ? "iPad" : "iPhone"
    }

    /// `hw.machine` (« iPhone17,1 », « iPad13,4 ») : lisible hors du fil principal, contrairement à `UIDevice`.
    private static var hardwareModel: String {
        var size = 0
        sysctlbyname("hw.machine", nil, &size, nil, 0)
        var machine = [CChar](repeating: 0, count: max(size, 1))
        sysctlbyname("hw.machine", &machine, &size, nil, 0)
        return String(cString: machine)
    }
}
