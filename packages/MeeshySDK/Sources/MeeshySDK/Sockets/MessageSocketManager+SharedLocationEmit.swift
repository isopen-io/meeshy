import Foundation
import SocketIO

// Émettre ma position à des personnes (#16983) sur la socket de messages : `location:share-start`, `location:share-update`
// et `location:share-stop`, chacun avec son accusé (`SharedLocationAck`, `SharedLocationStopAck`).

/// Qui porte MA position vers la passerelle. L'app ne voit pas la socket.
public protocol SharedLocationEmitting: AnyObject, Sendable {
    var isConnected: Bool { get }
    func start(_ request: SharedLocationStartRequest) async -> SharedLocationStartVerdict
    func update(_ fix: SharedLocationFix) async -> SharedLocationStartVerdict
    /// `true` quand la passerelle a confirmé l'arrêt.
    func stop() async -> Bool
}

/// L'émission du partage de position sur la socket de messages : un type à part, qui porte trois événements et lit
/// leurs accusés — la socket de messages n'en grossit pas.
public final class SharedLocationSocketEmitter: SharedLocationEmitting {
    public static let shared = SharedLocationSocketEmitter(manager: .shared)

    /// Un accusé qui tarde au-delà, la socket est tenue pour tombée.
    static let ackTimeout: Double = 8

    private let manager: MessageSocketManager

    init(manager: MessageSocketManager) {
        self.manager = manager
    }

    public var isConnected: Bool { manager.socket?.status == .connected }

    public func start(_ request: SharedLocationStartRequest) async -> SharedLocationStartVerdict {
        await send(.locationShareStart, request.wire)
    }

    public func update(_ fix: SharedLocationFix) async -> SharedLocationStartVerdict {
        await send(.locationShareUpdate, fix.wire)
    }

    public func stop() async -> Bool {
        guard let socket = manager.socket, socket.status == .connected else { return false }
        let ack = await socket.emitWithAck(
            .locationShareStop,
            [String: String](),
            as: SocketAckNoPayload.self,
            payloadAt: .none,
            timingOutAfter: Self.ackTimeout
        )
        if case .accepted = ack { return true }
        return false
    }

    private func send(_ event: SocketEvent, _ payload: [String: Any]) async -> SharedLocationStartVerdict {
        guard let socket = manager.socket, socket.status == .connected else { return .refused(.offline) }
        let ack = await socket.emitWithAck(
            event,
            payload,
            as: SharedLocationStartedWire.self,
            payloadAt: .data,
            timingOutAfter: Self.ackTimeout
        )
        return SharedLocationStartVerdict.read(ack)
    }
}
