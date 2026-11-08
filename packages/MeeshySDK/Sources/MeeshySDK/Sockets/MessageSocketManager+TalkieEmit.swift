import Foundation
import SocketIO

// Émettre le talkie (#16927) sur la socket de messages : `talkie:start` (accusé), `talkie:send-chunk` (binaire natif,
// jamais du base64) et `talkie:end`, les trois noms de `TALKIE_CLIENT_EVENTS`.

/// Qui porte MA voix vers la passerelle. L'app ne voit pas la socket.
public protocol TalkieEmitting: AnyObject, Sendable {
    /// La socket est connectée : sans elle, l'appui dit « hors ligne » sans rien ouvrir.
    var isConnected: Bool { get }
    func start(toUserId: String) async -> TalkieStartVerdict
    func sendChunk(talkieId: String, seq: Int, capturedAt: Date, data: Data)
    func end(talkieId: String)
}

/// L'émission du talkie sur la socket de messages : un type à part, qui ne fait que porter trois événements et lire
/// l'accusé du premier — la socket de messages n'en grossit pas.
public final class TalkieSocketEmitter: TalkieEmitting {
    public static let shared = TalkieSocketEmitter(manager: .shared)

    /// `TALKIE_START_ACK_MS` : un accusé qui tarde au-delà, la socket est tenue pour tombée.
    static let startAckTimeout: Double = 5

    private let manager: MessageSocketManager

    init(manager: MessageSocketManager) {
        self.manager = manager
    }

    public var isConnected: Bool { manager.socket?.status == .connected }

    public func start(toUserId: String) async -> TalkieStartVerdict {
        guard let socket = manager.socket, socket.status == .connected else { return .refused(.offline) }
        let ack = await socket.emitWithAck(
            .talkieStart,
            ["toUserId": toUserId, "codec": TalkieContract.codec],
            as: TalkieOpenedWire.self,
            payloadAt: .data,
            timingOutAfter: Self.startAckTimeout
        )
        return TalkieStartVerdict.read(ack)
    }

    public func sendChunk(talkieId: String, seq: Int, capturedAt: Date, data: Data) {
        guard let socket = manager.socket, socket.status == .connected else { return }
        let payload: [String: Any] = [
            "talkieId": talkieId,
            "seq": seq,
            "capturedAt": Int((capturedAt.timeIntervalSince1970 * 1000).rounded()),
            "data": data,
        ]
        socket.emit(SocketEvent.talkieSendChunk.rawValue, payload)
    }

    public func end(talkieId: String) {
        guard let socket = manager.socket, socket.status == .connected else { return }
        socket.emit(SocketEvent.talkieEnd.rawValue, ["talkieId": talkieId])
    }
}
