import Foundation

/// La charge d'un DELETE réussi (#10605). La passerelle y met ce qu'elle veut —
/// `{ message }`, `{ message, revokedCount }`, `{ deleted: true }`, rien — et
/// aucun site ne s'en sert pour décider : un 2xx EST la confirmation. Décoder
/// cette charge en `[String: Bool]` faisait d'une réussite une erreur dès
/// qu'une valeur n'était pas un booléen. Seuls les drapeaux booléens servis
/// sont gardés ; tout le reste est ignoré, jamais refusé.
struct DeletionAcknowledgement: Decodable {
    let success: Bool
    let flags: [String: Bool]
    let error: String?

    private enum CodingKeys: String, CodingKey { case success, data, error }

    private struct AnyValue: Decodable {
        let bool: Bool?
        init(from decoder: Decoder) throws {
            bool = try? decoder.singleValueContainer().decode(Bool.self)
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        success = try container.decodeIfPresent(Bool.self, forKey: .success) ?? true
        error = try? container.decodeIfPresent(String.self, forKey: .error)
        let values = (try? container.decodeIfPresent([String: AnyValue].self, forKey: .data)) ?? nil
        flags = (values ?? [:]).compactMapValues(\.bool)
    }

    var response: APIResponse<[String: Bool]> {
        APIResponse(success: success, data: flags, error: error)
    }
}
