import Foundation
import MeeshyE2EE
import MeeshySDK
import os

/// L'installation libsignal RÉELLE de cette app (#3707) : la base scellée et le
/// verrou du groupe d'apps (partagés avec l'extension de notification), le
/// trousseau `AfterFirstUnlockThisDeviceOnly`, l'annuaire `/e2ee`. C'est le
/// seul site qui les touche ; le reste de l'app parle à
/// `EndToEndMessagingProviding`.
nonisolated final class LibsignalDeviceProvisioning: EndToEndDeviceProvisioning, @unchecked Sendable {
    typealias Storage = (vault: E2EEGRDBRecordVault, lock: E2EEProcessLock)

    private let lock = OSAllocatedUnfairLock()
    private var opened: Storage?
    private let secrets: any E2EESecretStoreProviding
    private let directory: any E2EEDirectoryClientProviding
    private let openStorage: @Sendable (any E2EESecretStoreProviding) throws -> Storage

    /// `storage` ouvre la base et son verrou : ceux du groupe d'apps par défaut,
    /// une base en mémoire pour les témoins (#12916).
    init(
        directory: any E2EEDirectoryClientProviding = E2EEDirectoryClient(),
        secrets: any E2EESecretStoreProviding = E2EEKeychainSecretStore(),
        storage: @escaping @Sendable (any E2EESecretStoreProviding) throws -> Storage = LibsignalDeviceProvisioning.appGroupStorage
    ) {
        self.directory = directory
        self.secrets = secrets
        self.openStorage = storage
    }

    @Sendable static func appGroupStorage(secrets: any E2EESecretStoreProviding) throws -> Storage {
        let processLock = try E2EEProcessLock.shared()
        return (try E2EEGRDBRecordVault.shared(secrets: secrets, lock: processLock), processLock)
    }

    /// La base et son verrou, ouverts une fois par processus.
    private func storage() throws -> Storage {
        try lock.withLock { _ in
            if let opened { return opened }
            let storage = try openStorage(secrets)
            opened = storage
            return storage
        }
    }

    func plaintexts(owner: String) throws -> any E2EEPlaintextStoring {
        E2EEPlaintextVault(vault: try storage().vault, owner: owner)
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
        let store = MeeshySignalProtocolStore(identity: enrolled.identity, ownUserId: enrolled.device.userId)
        let cipher = E2EESessionCipher(local: enrolled.device.address, store: store, vault: vault, lock: processLock)
        let approvals = E2EEOwnDeviceApprovals(vault: vault)
        return EndToEndReadyDevice(
            device: enrolled.device,
            sealer: E2EEMessageSealer(local: enrolled.device, cipher: cipher, directory: directory, approvals: approvals),
            opener: E2EEEnvelopeOpener(
                local: enrolled.device, cipher: cipher, plaintexts: E2EEPlaintextVault(vault: vault),
                directory: directory, approvals: approvals
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
