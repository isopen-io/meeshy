import Foundation

struct SocketAckNoPayload: Decodable, Sendable, Equatable {}

enum SocketAckPayloadSource: Sendable {
    case data
    case root
    case none
}

struct SocketAckRefusal: Sendable, Equatable {
    let code: String?
    let errorCode: String?
    let errorMessage: String?
    let errorText: String?
    let endReason: String?
    let resetAt: String?
    let limit: Int?

    var message: String? { errorMessage ?? errorText }

    init(response: [String: Any]) {
        let error = response["error"] as? [String: Any]
        code = response["code"] as? String
        errorCode = error?["code"] as? String
        errorMessage = error?["message"] as? String
        errorText = response["error"] as? String
        endReason = error?["endReason"] as? String
        resetAt = response["resetAt"] as? String
        limit = response["limit"] as? Int
    }
}

enum SocketAck<Payload: Decodable & Sendable>: Sendable {
    case accepted(Payload)
    case acceptedWithoutPayload
    case undecodable(String)
    case refused(SocketAckRefusal)
    case timedOut
}

extension SocketAck: Equatable where Payload: Equatable {}

extension SocketAck {

    static func parse(
        _ first: Any?,
        payloadAt source: SocketAckPayloadSource,
        decoder: JSONDecoder = JSONDecoder()
    ) -> SocketAck<Payload> {
        guard let response = first as? [String: Any] else { return .timedOut }
        guard response["success"] as? Bool == true else { return .refused(SocketAckRefusal(response: response)) }
        switch source {
        case .none:
            return decodePayload(from: [:], decoder: decoder)
        case .root:
            return decodePayload(from: response, decoder: decoder)
        case .data:
            guard let data = response["data"] as? [String: Any] else { return .acceptedWithoutPayload }
            return decodePayload(from: data, decoder: decoder)
        }
    }

    private static func decodePayload(from object: [String: Any], decoder: JSONDecoder) -> SocketAck<Payload> {
        guard JSONSerialization.isValidJSONObject(object) else { return .undecodable("payload is not a JSON object") }
        do {
            let data = try JSONSerialization.data(withJSONObject: object)
            return .accepted(try decoder.decode(Payload.self, from: data))
        } catch {
            return .undecodable(error.localizedDescription)
        }
    }
}
