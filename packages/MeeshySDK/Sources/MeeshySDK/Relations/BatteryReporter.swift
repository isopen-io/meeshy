import Combine
import Foundation
import UIKit

// MARK: - Contrats

/// Le téléphone émetteur de la batterie (#14147) : il observe l'appareil et remonte ses relevés selon
/// `BatteryReportCadence`. Il ne fait jamais avancer l'épisode — le serveur seul décide des paliers.
@MainActor
public protocol BatteryReportingProviding: AnyObject {
    /// `false` sur une tablette ou un appareil qui ne lit pas sa batterie : rien n'est jamais envoyé.
    var isAvailable: Bool { get }
    /// Observe l'appareil et envoie selon la cadence, tant que l'app a du temps d'exécution.
    func start()
    /// Cesse d'observer ; le battement critique s'arrête.
    func stop()
    /// Relève et envoie MAINTENANT, hors cadence : `battery:pull-requested`, push silencieux, réveil d'arrière-plan.
    @discardableResult
    func reportNow() async -> BatteryReportOutcome
}

/// Ce que la plateforme sait de sa batterie. Isolée pour être remplacée en test.
@MainActor
public protocol BatteryDeviceReading: AnyObject {
    /// Un TÉLÉPHONE : la passerelle ne suit jamais une tablette.
    var isTrackable: Bool { get }
    var deviceLabel: String? { get }
    func enableMonitoring()
    func disableMonitoring()
    /// `nil` quand le niveau est inconnu (surveillance coupée, simulateur).
    func currentReading() -> BatteryReading?
    /// Un signal à chaque changement de niveau, d'état de charge ou du mode économie.
    var changes: AnyPublisher<Void, Never> { get }
}

/// Qui porte un relevé jusqu'à la passerelle : la socket quand elle est là, sinon REST.
public protocol BatteryReportSending: Sendable {
    func send(_ report: BatteryReport) async -> BatteryReportOutcome
}

// MARK: - Le téléphone émetteur

@MainActor
public final class BatteryReporter: BatteryReportingProviding {

    private let device: BatteryDeviceReading
    private let sender: BatteryReportSending
    private let now: () -> Date
    private let sleep: @concurrent @Sendable (TimeInterval) async -> Bool
    private var lastSent: BatteryReading?
    private var changeSubscription: Set<AnyCancellable>?
    private var heartbeatTask: Task<Void, Never>?
    private var inFlight = false

    nonisolated deinit {}

    public init(
        device: BatteryDeviceReading,
        sender: BatteryReportSending,
        now: @escaping () -> Date = { Date() },
        sleep: @escaping @concurrent @Sendable (TimeInterval) async -> Bool = { seconds in
            do {
                try await Task.sleep(for: .seconds(seconds))
                return true
            } catch {
                return false
            }
        }
    ) {
        self.device = device
        self.sender = sender
        self.now = now
        self.sleep = sleep
    }

    public var isAvailable: Bool { device.isTrackable }

    public var isRunning: Bool { changeSubscription != nil }

    public func start() {
        guard device.isTrackable, changeSubscription == nil else { return }
        device.enableMonitoring()
        var subscriptions = Set<AnyCancellable>()
        let lane = OrderedEventLane()
        device.changes
            .relay(through: lane) { [weak self] _ in await self?.reportIfDue() }
            .store(in: &subscriptions)
        lane.store(in: &subscriptions)
        changeSubscription = subscriptions
        Task { @MainActor [weak self] in await self?.reportIfDue() }
    }

    public func stop() {
        changeSubscription = nil
        heartbeatTask?.cancel()
        heartbeatTask = nil
        device.disableMonitoring()
    }

    @discardableResult
    public func reportNow() async -> BatteryReportOutcome {
        guard device.isTrackable else { return .unavailable }
        let wasMonitoring = isRunning
        if !wasMonitoring { device.enableMonitoring() }
        defer { if !wasMonitoring { device.disableMonitoring() } }
        guard let reading = device.currentReading() else { return .unavailable }
        return await send(reading)
    }

    /// Le relevé courant part si la cadence le veut.
    func reportIfDue() async {
        guard device.isTrackable, let reading = device.currentReading(),
              BatteryReportCadence.shouldReport(lastSent: lastSent, current: reading) else { return }
        await send(reading)
    }

    @discardableResult
    private func send(_ reading: BatteryReading) async -> BatteryReportOutcome {
        guard !inFlight else { return .rateLimited }
        inFlight = true
        defer { inFlight = false }
        let report = BatteryReport(
            level: reading.level, charging: reading.charging, lowPower: reading.lowPower,
            measuredAt: now(), deviceLabel: device.deviceLabel
        )
        let outcome = await sender.send(report)
        if outcome == .tracked || outcome == .ignored { lastSent = reading }
        armHeartbeat(after: reading)
        return outcome
    }

    /// En zone critique, sur batterie : un relevé toutes les 60 s tant que l'observation tourne.
    private func armHeartbeat(after reading: BatteryReading) {
        heartbeatTask?.cancel()
        heartbeatTask = nil
        guard isRunning, let interval = BatteryReportCadence.heartbeat(after: reading) else { return }
        let sleep = self.sleep
        heartbeatTask = Task { @MainActor [weak self] in
            guard await sleep(interval), !Task.isCancelled else { return }
            await self?.reportNow()
        }
    }
}

// MARK: - L'appareil réel

/// `UIDevice` + `ProcessInfo`. Le niveau iOS est au pas de 5 % : il est rendu tel quel.
@MainActor
public final class UIDeviceBatteryReader: BatteryDeviceReading {

    public static let shared = UIDeviceBatteryReader()

    private let uiDevice: UIDevice
    private let processInfo: ProcessInfo
    private let center: NotificationCenter

    nonisolated deinit {}

    public init(uiDevice: UIDevice = .current, processInfo: ProcessInfo = .processInfo, center: NotificationCenter = .default) {
        self.uiDevice = uiDevice
        self.processInfo = processInfo
        self.center = center
    }

    /// Le modèle générique dit « iPhone » sur un téléphone, « iPad » sur une tablette.
    public var isTrackable: Bool { uiDevice.model.hasPrefix("iPhone") }

    /// Le modèle générique (« iPhone ») : jamais le nom que l'utilisateur a donné à son appareil.
    public var deviceLabel: String? { uiDevice.model }

    public func enableMonitoring() {
        uiDevice.isBatteryMonitoringEnabled = true
    }

    public func disableMonitoring() {
        uiDevice.isBatteryMonitoringEnabled = false
    }

    public func currentReading() -> BatteryReading? {
        let raw = uiDevice.batteryLevel
        guard raw >= 0 else { return nil }
        let charging: Bool
        switch uiDevice.batteryState {
        case .charging, .full: charging = true
        case .unplugged: charging = false
        case .unknown: return nil
        @unknown default: return nil
        }
        return BatteryReading(
            level: Int((raw * 100).rounded()),
            charging: charging,
            lowPower: processInfo.isLowPowerModeEnabled
        )
    }

    public var changes: AnyPublisher<Void, Never> { Self.changes(in: center) }

    /// Hors de tout acteur : `NSProcessInfoPowerStateDidChange` peut être posté hors du fil principal, et un maillon
    /// isolé au MainActor y piégerait l'app.
    nonisolated static func changes(in center: NotificationCenter) -> AnyPublisher<Void, Never> {
        Publishers.MergeMany(
            center.publisher(for: UIDevice.batteryLevelDidChangeNotification),
            center.publisher(for: UIDevice.batteryStateDidChangeNotification),
            center.publisher(for: Notification.Name.NSProcessInfoPowerStateDidChange)
        )
        .map { @Sendable _ in () }
        .eraseToAnyPublisher()
    }
}
