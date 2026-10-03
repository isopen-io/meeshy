import Combine
import Foundation
import SocketIO

// #9214 — le cadre en direct d'un appel à DEUX, vu du socket. Miroir de
// `packages/shared/types/call-live-frame.ts`. Seul le CHOIX voyage — l'identifiant
// du cadre (ou `nil` pour le retirer) et les textes que l'émetteur partage ;
// chaque appareil compose sa vue chez lui, la vidéo envoyée ne porte jamais le
// cadre. La passerelle ne relaie qu'à l'autre participant d'un appel à deux.

/// Les textes qu'un participant partage avec le cadre : son prénom, sa ville s'il l'autorise.
public struct CallLiveFrameTexts: Codable, Sendable, Equatable {
    public let name: String?
    public let city: String?

    public init(name: String? = nil, city: String? = nil) {
        self.name = name
        self.city = city
    }

    /// La forme envoyée : seulement les textes non vides, bornés comme la passerelle les borne.
    var payload: [String: String] {
        [("name", name), ("city", city)].reduce(into: [String: String]()) { result, entry in
            guard let value = entry.1?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return }
            result[entry.0] = String(value.prefix(Self.maxLength))
        }
    }

    public static let maxLength = 64
}

/// `call:frame-selected` — l'autre participant a posé (ou retiré, `frameId == nil`) le cadre en direct.
public struct CallLiveFrameSelectedEvent: Decodable, Sendable, Equatable {
    public let callId: String
    public let userId: String
    public let frameId: String?
    public let texts: CallLiveFrameTexts?

    public init(callId: String, userId: String, frameId: String?, texts: CallLiveFrameTexts? = nil) {
        self.callId = callId
        self.userId = userId
        self.frameId = frameId
        self.texts = texts
    }
}

public protocol CallLiveFrameSocketProviding: AnyObject, Sendable {
    var callLiveFrameEvents: AnyPublisher<CallLiveFrameSelectedEvent, Never> { get }
    func selectCallLiveFrame(callId: String, frameId: String?, texts: CallLiveFrameTexts?) async throws
}

public enum CallLiveFrameSocketChannel {
    nonisolated(unsafe) public static let events = PassthroughSubject<CallLiveFrameSelectedEvent, Never>()
}

extension MessageSocketManager: CallLiveFrameSocketProviding {

    public var callLiveFrameEvents: AnyPublisher<CallLiveFrameSelectedEvent, Never> {
        CallLiveFrameSocketChannel.events.eraseToAnyPublisher()
    }

    func registerCallLiveFrameHandlers(on socket: SocketIOClient) {
        socket.on("call:frame-selected") { [weak self] data, _ in
            self?.decode(CallLiveFrameSelectedEvent.self, from: data) { event in
                CallLiveFrameSocketChannel.events.send(event)
            }
        }
    }

    public func selectCallLiveFrame(callId: String, frameId: String?, texts: CallLiveFrameTexts?) async throws {
        guard let socket else { throw CallControlRefusal(code: "NO_SOCKET") }
        let payload = Self.callLiveFramePayload(callId: callId, frameId: frameId, texts: texts)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            socket.emitWithAck("call:frame-select", payload).timingOut(after: 10) { items in
                if let refusal = Self.callControlRefusal(items.first) {
                    continuation.resume(throwing: refusal)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    /// `frameId: nil` part en `NSNull` : la passerelle exige la clé, `null` retire le cadre.
    static func callLiveFramePayload(callId: String, frameId: String?, texts: CallLiveFrameTexts?) -> [String: Any] {
        let base: [String: Any] = ["callId": callId, "frameId": frameId.map { $0 as Any } ?? NSNull()]
        guard let shared = texts?.payload, !shared.isEmpty else { return base }
        return base.merging(["texts": shared]) { current, _ in current }
    }
}
