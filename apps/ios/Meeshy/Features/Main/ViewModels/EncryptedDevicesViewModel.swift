import Combine
import Foundation
import MeeshyE2EE
import MeeshySDK

/// La dernière liste connue de mes appareils chiffrés, par compte, le temps du
/// processus : l'écran rouvert s'affiche à l'instant (cache-first). Elle ne
/// porte aucune clé — des numéros, des noms de modèle, un état d'approbation.
@MainActor
final class EncryptedDevicesCache {
    nonisolated deinit {}

    static let shared = EncryptedDevicesCache()

    private var byUser: [String: [EndToEndOwnDevice]] = [:]

    func devices(for userId: String) -> [EndToEndOwnDevice] { byUser[userId] ?? [] }

    func store(_ devices: [EndToEndOwnDevice], for userId: String) { byUser[userId] = devices }
}

/// Sécurité › Mes appareils chiffrés (#13009, spec E2EE § 3.5). Un sens à la
/// fois : cet appareil LIT le code d'un autre de mes appareils, l'utilisateur
/// CONFIRME l'appareil nommé, et seulement alors la clé s'épingle. Montrer mon
/// code permet à l'autre de m'approuver à son tour.
@MainActor
final class EncryptedDevicesViewModel: ObservableObject {
    nonisolated deinit {}

    enum LoadState: Equatable {
        case idle, loading, loaded, offline, failed
    }

    /// Mon code, montré à UN de mes appareils : l'empreinte est propre à la paire.
    struct ShownCode: Equatable, Identifiable {
        let device: EndToEndOwnDevice
        let code: E2EEPairingCode
        var id: UInt32 { device.deviceId }

        /// Les 60 chiffres en 12 groupes de 5, comme Signal les montre.
        var groups: [String] {
            let digits = Array(code.displayable.filter(\.isNumber))
            return stride(from: 0, to: digits.count, by: 5).map { String(digits[$0..<min($0 + 5, digits.count)]) }
        }
    }

    /// Un code lu qui désigne un de mes appareils : en attente de la confirmation.
    struct PendingApproval: Equatable, Identifiable {
        let candidate: E2EEPairingCandidate
        /// La ligne connue de cet appareil, pour le NOMMER ; `nil` s'il vient de s'inscrire.
        let device: EndToEndOwnDevice?
        var id: UInt32 { candidate.deviceId }
    }

    enum Notice: Equatable, Identifiable {
        case noMatch
        case approved(deviceId: UInt32)
        case actionFailed

        var id: String {
            switch self {
            case .noMatch: "noMatch"
            case .approved(let deviceId): "approved-\(deviceId)"
            case .actionFailed: "actionFailed"
            }
        }
    }

    @Published private(set) var devices: [EndToEndOwnDevice] = []
    @Published private(set) var loadState: LoadState = .idle
    @Published var shownCode: ShownCode?
    @Published private(set) var pendingApproval: PendingApproval?
    @Published var notice: Notice?
    @Published private(set) var busyDeviceId: UInt32?

    private let linking: any EndToEndOwnDeviceLinking
    private let cache: EncryptedDevicesCache
    private let networkMonitor: any NetworkMonitorProviding
    private let userId: @MainActor () -> String?
    /// Un code lu pendant qu'un autre est en cours d'examen n'est pas lu.
    private var examiningScan = false

    init(
        linking: any EndToEndOwnDeviceLinking = EndToEndMessagingRuntime.shared,
        cache: EncryptedDevicesCache = .shared,
        networkMonitor: any NetworkMonitorProviding = NetworkMonitor.shared,
        userId: @escaping @MainActor () -> String? = { AuthManager.shared.currentUser?.id }
    ) {
        self.linking = linking
        self.cache = cache
        self.networkMonitor = networkMonitor
        self.userId = userId
    }

    var currentDevice: EndToEndOwnDevice? { devices.first(where: \.isCurrent) }
    var otherDevices: [EndToEndOwnDevice] { devices.filter { !$0.isCurrent } }

    /// La liste connue, avant tout appel : jamais de squelette sur un cache non vide.
    func showCached() {
        guard devices.isEmpty, let userId = userId() else { return }
        devices = cache.devices(for: userId)
    }

    func load() async {
        showCached()
        guard let userId = userId() else {
            loadState = .failed
            return
        }
        if devices.isEmpty { loadState = .loading }
        await revalidate(as: userId)
    }

    private func revalidate(as userId: String) async {
        do {
            let fresh = try await linking.linkedDevices(of: userId)
            devices = fresh
            cache.store(fresh, for: userId)
            loadState = .loaded
        } catch {
            loadState = networkMonitor.isOnline ? .failed : .offline
        }
    }

    func showCode(towards device: EndToEndOwnDevice) async {
        guard !device.isCurrent, let userId = userId() else { return }
        busyDeviceId = device.deviceId
        defer { busyDeviceId = nil }
        do {
            shownCode = ShownCode(device: device, code: try await linking.pairingCode(towards: device.deviceId, as: userId))
        } catch {
            notice = .actionFailed
        }
    }

    /// Le texte d'un QR lu par la caméra. Il ne fait que DÉSIGNER un appareil.
    func scanned(_ payload: String) async {
        guard pendingApproval == nil, !examiningScan, let userId = userId() else { return }
        examiningScan = true
        defer { examiningScan = false }
        do {
            guard let candidate = try await linking.candidate(matching: payload, as: userId) else {
                notice = .noMatch
                return
            }
            pendingApproval = PendingApproval(candidate: candidate, device: devices.first { $0.deviceId == candidate.deviceId })
        } catch {
            notice = .actionFailed
        }
    }

    func cancelApproval() {
        pendingApproval = nil
    }

    /// Le SEUL chemin qui épingle une clé : le geste « Approuver » de la confirmation.
    func confirmApproval() async {
        guard let pending = pendingApproval, let userId = userId() else { return }
        pendingApproval = nil
        busyDeviceId = pending.candidate.deviceId
        defer { busyDeviceId = nil }
        do {
            try await linking.approve(pending.candidate, as: userId)
            notice = .approved(deviceId: pending.candidate.deviceId)
        } catch {
            notice = .actionFailed
        }
        await revalidate(as: userId)
    }

    func revokeApproval(of device: EndToEndOwnDevice) async {
        await act(on: device) { linking, deviceId, userId in try await linking.revokeApproval(of: deviceId, as: userId) }
    }

    func retire(_ device: EndToEndOwnDevice) async {
        await act(on: device) { linking, deviceId, _ in try await linking.retire(deviceId: deviceId) }
    }

    private func act(
        on device: EndToEndOwnDevice,
        _ action: @escaping @concurrent @Sendable (any EndToEndOwnDeviceLinking, UInt32, String) async throws -> Void
    ) async {
        guard !device.isCurrent, let userId = userId() else { return }
        busyDeviceId = device.deviceId
        defer { busyDeviceId = nil }
        do {
            try await action(linking, device.deviceId, userId)
        } catch {
            notice = .actionFailed
        }
        await revalidate(as: userId)
    }
}
