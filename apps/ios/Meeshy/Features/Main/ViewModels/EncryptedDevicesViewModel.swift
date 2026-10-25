import Combine
import Foundation
import MeeshyE2EE
import MeeshySDK

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
        /// Le compte sous lequel le code a été lu : il seul peut confirmer.
        let userId: String
        var id: UInt32 { candidate.deviceId }
    }

    enum Notice: Equatable, Identifiable {
        case noMatch
        /// Le code lu est celui d'un autre de mes appareils que celui qu'on approuve.
        case otherDevice
        case approved(deviceId: UInt32)
        case actionFailed

        var id: String {
            switch self {
            case .noMatch: "noMatch"
            case .otherDevice: "otherDevice"
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
        linking: any EndToEndOwnDeviceLinking,
        cache: EncryptedDevicesCache,
        networkMonitor: any NetworkMonitorProviding,
        userId: @escaping @MainActor () -> String?
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

    /// Le texte d'un QR lu par la caméra. Il ne fait que DÉSIGNER un appareil ;
    /// ouvert depuis la feuille d'un appareil (`expecting`), il ne désigne que lui.
    func scanned(_ payload: String, expecting expectedDeviceId: UInt32? = nil) async {
        guard pendingApproval == nil, !examiningScan, let userId = userId() else { return }
        examiningScan = true
        defer { examiningScan = false }
        do {
            guard let candidate = try await linking.candidate(matching: payload, as: userId) else {
                notice = .noMatch
                return
            }
            guard expectedDeviceId == nil || candidate.deviceId == expectedDeviceId else {
                notice = .otherDevice
                return
            }
            pendingApproval = PendingApproval(candidate: candidate, device: devices.first { $0.deviceId == candidate.deviceId }, userId: userId)
        } catch {
            notice = .actionFailed
        }
    }

    func cancelApproval() {
        pendingApproval = nil
    }

    /// Une confirmation acceptée par le geste « Approuver » : seule
    /// `acceptApproval(_:)` en fabrique une.
    struct AcceptedApproval {
        fileprivate let pending: PendingApproval
    }

    /// Le geste « Approuver », SYNCHRONE : la confirmation présentée se
    /// referme dans le même tour que le geste, pour que l'alerte ne se
    /// représente pas. Annulée, remplacée ou lue sous un autre compte, elle
    /// n'est pas acceptée.
    func acceptApproval(_ presented: PendingApproval) -> AcceptedApproval? {
        guard let pending = pendingApproval, pending == presented else { return nil }
        pendingApproval = nil
        guard userId() == pending.userId else { return nil }
        busyDeviceId = pending.candidate.deviceId
        return AcceptedApproval(pending: pending)
    }

    /// Le SEUL chemin qui épingle une clé : une confirmation acceptée.
    func approve(_ accepted: AcceptedApproval) async {
        let pending = accepted.pending
        defer { busyDeviceId = nil }
        guard userId() == pending.userId else { return }
        do {
            try await linking.approve(pending.candidate, as: pending.userId)
            notice = .approved(deviceId: pending.candidate.deviceId)
        } catch {
            notice = .actionFailed
        }
        await revalidate(as: pending.userId)
    }

    func confirmApproval(_ presented: PendingApproval) async {
        guard let accepted = acceptApproval(presented) else { return }
        await approve(accepted)
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
