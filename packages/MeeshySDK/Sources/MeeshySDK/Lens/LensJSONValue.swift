// GÉNÉRÉ — ne pas éditer; source: packages/shared/types/lens-format.ts
// Régénérer : `cd packages/shared && bun run generate:lens-format`.
// Fraîcheur gardée par packages/shared/__tests__/lens-format-swift.test.ts ;
// comportement gardé par packages/shared/fixtures/lens-v1/vectors.json (vitest ET Swift).

import Foundation

/// Une valeur JSON EXACTE : un booléen n'est jamais un nombre, null n'est jamais une absence.
/// C'est ce que JavaScript distingue ; JSONSerialization (NSNumber) ne le distingue pas partout.
public indirect enum LensJSONValue: Sendable, Equatable, Decodable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([LensJSONValue])
    case object([String: LensJSONValue])

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([LensJSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: LensJSONValue].self))
        }
    }
}
