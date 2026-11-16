import Combine
import Foundation
import SocketIO

// La batterie des proches (#14147) sur la socket de messages : `battery:changed`, `battery:cleared` et
// `battery:pull-requested`, dans la room `user:<id>` (`packages/shared/types/socketio-events/battery-event-names.ts`).

public extension Notification.Name {
    /// `battery:changed` — l'objet est un `BatteryChanged`.
    static let batteryChanged = Notification.Name("me.meeshy.batteryChanged")
    /// `battery:cleared` — l'objet est un `BatteryCleared`.
    static let batteryCleared = Notification.Name("me.meeshy.batteryCleared")
    /// `battery:pull-requested` — l'objet est un `BatteryPullRequested`.
    static let batteryPullRequested = Notification.Name("me.meeshy.batteryPullRequested")
}

/// Les trois flux de la batterie, typés. Un écran s'y abonne sans connaître `NotificationCenter`.
public enum BatteryEvents {
    public static var changed: AnyPublisher<BatteryChanged, Never> { publisher(.batteryChanged) }
    public static var cleared: AnyPublisher<BatteryCleared, Never> { publisher(.batteryCleared) }
    public static var pullRequested: AnyPublisher<BatteryPullRequested, Never> { publisher(.batteryPullRequested) }

    private static func publisher<Event>(_ name: Notification.Name) -> AnyPublisher<Event, Never> {
        NotificationCenter.default.publisher(for: name)
            .compactMap { $0.object as? Event }
            .eraseToAnyPublisher()
    }
}

extension MessageSocketRoutes {

    static func battery(_ m: MessageSocketManager) -> [SocketInboundRoute] {
        [
            m.route(.batteryChanged, BatteryChanged.self) { _, event in
                NotificationCenter.default.post(name: .batteryChanged, object: event)
            },
            m.route(.batteryCleared, BatteryCleared.self) { _, event in
                NotificationCenter.default.post(name: .batteryCleared, object: event)
            },
            m.route(.batteryPullRequested, BatteryPullRequested.self) { _, event in
                NotificationCenter.default.post(name: .batteryPullRequested, object: event)
            },
        ]
    }
}

// MARK: - Émettre

/// Le relevé porté par la socket quand elle est connectée, sinon par REST (`POST /me/device/battery`).
public final class BatterySocketReportSender: BatteryReportSending {
    public static let shared = BatterySocketReportSender(manager: .shared, rest: BatteryService.shared)

    private let manager: MessageSocketManager
    private let rest: BatteryServiceProviding

    init(manager: MessageSocketManager, rest: BatteryServiceProviding) {
        self.manager = manager
        self.rest = rest
    }

    public func send(_ report: BatteryReport) async -> BatteryReportOutcome {
        guard let socket = manager.socket, socket.status == .connected else { return await rest.report(report) }
        let ack = await socket.emitWithAck(
            .batteryReport, report.wirePayload, as: ReportAck.self, payloadAt: .data, timingOutAfter: 10
        )
        let outcome = Self.outcome(ack)
        return outcome == .offline ? await rest.report(report) : outcome
    }

    /// L'accusé lu : `tracked` dit si ce téléphone est celui que la passerelle suit ; une échéance vaut hors ligne
    /// (et le relevé repasse par REST).
    static func outcome(_ ack: SocketAck<ReportAck>) -> BatteryReportOutcome {
        switch ack {
        case .accepted(let payload): return payload.tracked ? .tracked : .ignored
        case .acceptedWithoutPayload: return .ignored
        case .timedOut: return .offline
        case .refused(let refusal): return BatteryService.reportOutcome(code: refusal.code)
        case .undecodable: return .refused
        }
    }

    struct ReportAck: Decodable, Sendable { let tracked: Bool }
}
