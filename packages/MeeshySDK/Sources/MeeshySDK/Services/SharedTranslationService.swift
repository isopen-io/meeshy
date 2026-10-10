import Foundation

/// #9899 — la traduction qu'un membre partage aux autres : partager la sienne,
/// lire celles des autres. Protocole à part : les doubles de test n'ont pas à
/// connaître un geste que seule la traduction sur l'appareil déclenche.
///
/// `envelope` est scellée sur l'appareil (`SharedTranslationSeal`) et la
/// passerelle la garde et la relaie sans l'ouvrir. Ce scellement n'est PAS une
/// confidentialité contre elle dans une conversation qu'elle lit déjà : elle
/// pourrait l'ouvrir, puisqu'elle détient le texte d'où la clé dérive (voir
/// l'en-tête de `SharedTranslationModels.swift`).
public protocol SharedTranslationServiceProviding: Sendable {
    /// `POST /conversations/:id/shared-translations`. `created == false` quand un
    /// autre membre l'avait déjà partagée : la sienne est rendue. Un refus que la
    /// passerelle motive par un code connu (`SharedTranslationShareRefusal` : le
    /// compte ne partage pas, ou le message a changé depuis la traduction) lève ce
    /// refus ; tout autre échec passe tel quel.
    func share(conversationId: String, body: ShareTranslationBody) async throws -> ShareTranslationResult

    /// `GET /conversations/:id/shared-translations`. Les identifiants et les
    /// langues que la passerelle refuserait sont écartés AVANT l'envoi — un seul
    /// invalide ferait échouer toute la lecture —, et les identifiants au-delà de
    /// 100 partent par requêtes successives. La passerelle EXIGE `languages` (1 à
    /// 8, le prisme du lecteur dans son ordre) : sans identifiant ni langue
    /// valable, rien ne part et la réponse est vide.
    func fetch(conversationId: String, messageIds: [String], languages: [String]) async throws -> [SharedTranslation]
}

public final class SharedTranslationService: SharedTranslationServiceProviding, @unchecked Sendable {
    public static let shared = SharedTranslationService()

    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func share(conversationId: String, body: ShareTranslationBody) async throws -> ShareTranslationResult {
        do {
            let response: APIResponse<ShareTranslationResult> = try await api.post(
                ConversationsEndpoint.byIdSharedTranslations(id: conversationId), body: body
            )
            return response.data
        } catch {
            if let refusal = SharedTranslationShareRefusal(code: StoryPublishRetryPolicy.rejectionCode(error)) {
                throw refusal
            }
            throw error
        }
    }

    public func fetch(
        conversationId: String,
        messageIds: [String],
        languages: [String]
    ) async throws -> [SharedTranslation] {
        let ids = Self.distinct(messageIds).filter(SharedTranslationFormat.isObjectId)
        let wanted = Array(
            Self.distinct(languages)
                .filter(SharedTranslationFormat.isLanguageCode)
                .prefix(SharedTranslationLimits.languagesMaxCount)
        )
        guard !ids.isEmpty, !wanted.isEmpty else { return [] }
        var collected: [SharedTranslation] = []
        for start in stride(from: 0, to: ids.count, by: SharedTranslationLimits.messageIdsMaxCount) {
            let chunk = ids[start..<min(start + SharedTranslationLimits.messageIdsMaxCount, ids.count)]
            let response: APIResponse<SharedTranslationsResult> = try await api.request(
                ConversationsEndpoint.byIdSharedTranslations(id: conversationId),
                queryItems: Self.queryItems(messageIds: Array(chunk), languages: wanted)
            )
            collected.append(contentsOf: response.data.sharedTranslations)
        }
        return collected
    }

    static func queryItems(messageIds: [String], languages: [String]) -> [URLQueryItem] {
        [
            URLQueryItem(name: "messageIds", value: messageIds.joined(separator: ",")),
            URLQueryItem(name: "languages", value: languages.joined(separator: ","))
        ]
    }

    /// Sans blancs ni doublons, dans l'ordre d'arrivée — comme la passerelle lit
    /// sa liste séparée par des virgules.
    private static func distinct(_ values: [String]) -> [String] {
        var seen = Set<String>()
        return values
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && seen.insert($0).inserted }
    }
}
