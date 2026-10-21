import Foundation
import os

/// Décodage des charges temps réel : hors du fil principal, dans l'ordre d'arrivée.
enum SocketPayloadDecoder {

    /// Shared, pre-configured decoder. Used ONLY on `decodeQueue` (serial), so a
    /// single reused instance is race-free and avoids allocating a decoder plus
    /// wiring its date strategy on every realtime event.
    private static let socketDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            if let date = WireDate.date(from: dateStr) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
        }
        return decoder
    }()

    /// Serial so payloads decode in arrival order, off the main thread.
    private static let decodeQueue = DispatchQueue(label: "me.meeshy.socket.decode", qos: .userInitiated)

    static func decode<T: Decodable & Sendable>(_ type: T.Type, from data: [Any], handler: @escaping @MainActor @Sendable (T) -> Void) {
        guard let first = data.first else {
            Logger.socket.error("decode DROP type=\(String(describing: type), privacy: .public) reason=empty-payload")
            return
        }

        // Socket.IO's handle queue defaults to MAIN, so doing the JSONDecoder work
        // inline parsed every realtime event (message / reaction / receipt …) on
        // the main thread — visible CPU on busy conversations. Serialise the dict
        // here (cheap), then decode off-main on a serial queue that preserves
        // arrival order; the handler still lands on main (`@MainActor`).
        let jsonData: Data
        if let dict = first as? [String: Any] {
            do {
                jsonData = try JSONSerialization.data(withJSONObject: dict)
            } catch {
                Logger.socket.error("decode DROP type=\(String(describing: type), privacy: .public) reason=reserialize-failed: \(error.localizedDescription, privacy: .public)")
                return
            }
        } else if let str = first as? String {
            jsonData = Data(str.utf8)
        } else {
            Logger.socket.error("decode DROP type=\(String(describing: type), privacy: .public) reason=unexpected-payload-shape")
            return
        }

        // Capture only the (Sendable) key names so a decode failure can still log
        // them off-main, without retaining the non-Sendable payload dictionary.
        let payloadKeys: [String] = (first as? [String: Any]).map { Array($0.keys) } ?? []

        Self.decodeQueue.async {
            do {
                let decoded = try Self.socketDecoder.decode(type, from: jsonData)
                Task { @MainActor in handler(decoded) }
            } catch {
                if payloadKeys.isEmpty {
                    Logger.socket.error("decode FAILED type=\(String(describing: type)): \(error)")
                } else {
                    let keys = payloadKeys.sorted().joined(separator: ", ")
                    Logger.socket.error("decode FAILED type=\(String(describing: type)): \(error) — keys: [\(keys)]")
                }
            }
        }
    }
}
