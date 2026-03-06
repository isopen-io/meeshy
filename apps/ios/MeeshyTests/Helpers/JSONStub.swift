import Foundation

enum JSONStub {
    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)

            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: dateString) {
                return date
            }

            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: dateString) {
                return date
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot decode date: \(dateString)"
            )
        }
        return decoder
    }()

    static func decode<T: Decodable>(_ json: String) -> T {
        guard let data = json.data(using: .utf8) else {
            fatalError("JSONStub: invalid UTF-8 string")
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            fatalError("JSONStub: failed to decode \(T.self) from JSON: \(error)")
        }
    }
}
