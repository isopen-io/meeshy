import Foundation

// MARK: - Page Result

/// Cursor-paginated page of conversations exposed at the SDK boundary.
/// The opaque `nextCursor` is the gateway-provided id of the last
/// conversation in this page (it filters the next request by
/// `lastMessageAt < cursor.lastMessageAt`). Callers must treat it as
/// opaque — the cursor value is not stable across sessions or
/// re-orderings.
///
/// `rawItems` carries the unconverted gateway payload alongside the
/// already-enriched `items`. ConversationListViewModel uses it to seed
/// presence (which needs the per-participant `isOnline`/`lastActiveAt`
/// fields the domain model strips), and the rest of the app only ever
/// touches `items`.
public struct ConversationPage: Sendable {
    public let items: [MeeshyConversation]
    public let rawItems: [APIConversation]
    public let nextCursor: String?
    public let hasMore: Bool

    public init(
        items: [MeeshyConversation],
        rawItems: [APIConversation] = [],
        nextCursor: String?,
        hasMore: Bool
    ) {
        self.items = items
        self.rawItems = rawItems
        self.nextCursor = nextCursor
        self.hasMore = hasMore
    }
}

// MARK: - Internal Response Decoding

/// Top-level shape returned by `GET /conversations`. The gateway returns
/// `pagination` (offset-based) AND `cursorPagination` (cursor-based) at
/// the root of the body, which the generic `PaginatedAPIResponse` cannot
/// represent (it would only decode the offset block). We pull both here
/// and let `listPage` prefer the cursor metadata.
struct ConversationListResponseBody: Decodable {
    let success: Bool
    let data: [APIConversation]
    let pagination: OffsetPagination?
    let cursorPagination: CursorPagination?
    let error: String?
}

/// Corps de `PATCH …/rights` quand seul `historyVisibleFrom` est écrit.
///
/// L'encodage synthétisé de Swift pour un `String?` appelle
/// `encodeIfPresent`, qui OMET la clé quand la valeur est `nil` — exactement
/// l'inverse de ce qu'il faut ici : retirer l'octroi doit envoyer `null`
/// explicite, pas absenter la clé (le gateway distingue les deux). D'où
/// l'`encode(to:)` manuel, qui passe par `encode(_:forKey:)` — l'overload
/// générique sur `Optional<String>: Encodable`, qui écrit `null` via
/// `encodeNil()` quand la valeur est `nil`.
private struct HistoryGrantBody: Encodable {
    let historyVisibleFrom: String?

    enum CodingKeys: String, CodingKey { case historyVisibleFrom }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(historyVisibleFrom, forKey: .historyVisibleFrom)
    }
}

// MARK: - Protocol

public protocol ConversationServiceProviding: Sendable {
    func list(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[APIConversation]>
    func listPage(before cursor: String?, limit: Int, currentUserId: String) async throws -> ConversationPage
    /// `GET /conversations/search?q=` — recherche serveur par titre ou nom de
    /// participant, au-delà de la première page chargée localement. Renvoie
    /// des `APIConversation` brutes (pas de `currentUserId` ici) : l'appelant
    /// les projette via `toConversation(currentUserId:)` quand il en a besoin.
    func search(query: String) async throws -> [APIConversation]
    func getById(_ conversationId: String) async throws -> APIConversation
    func create(type: String, title: String?, participantIds: [String]) async throws -> CreateConversationResponse
    func delete(conversationId: String) async throws
    func markRead(conversationId: String) async throws
    func markAsReceived(conversationId: String) async throws
    func markUnread(conversationId: String) async throws
    func getParticipants(conversationId: String, limit: Int, cursor: String?) async throws -> PaginatedAPIResponse<[APIParticipant]>
    func deleteForMe(conversationId: String) async throws
    func listSharedWith(userId: String, limit: Int) async throws -> [APIConversation]
    func findDirectWith(userId: String) async throws -> APIConversation?
    func removeParticipant(conversationId: String, key: String) async throws
    func updateParticipantRole(conversationId: String, userId: String, role: String) async throws
    func update(
        conversationId: String,
        title: String?,
        description: String?,
        avatar: String?,
        banner: String?,
        defaultWriteRole: String?,
        isAnnouncementChannel: Bool?,
        slowModeSeconds: Int?,
        autoTranslateEnabled: Bool?
    ) async throws -> APIConversation
    func leave(conversationId: String) async throws
    func banParticipant(conversationId: String, key: String) async throws
    func unbanParticipant(conversationId: String, key: String) async throws
}

public final class ConversationService: ConversationServiceProviding, @unchecked Sendable {
    public static let shared = ConversationService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func list(offset: Int = 0, limit: Int = 30) async throws -> OffsetPaginatedAPIResponse<[APIConversation]> {
        try await api.offsetPaginatedRequest(ConversationsEndpoint.root, offset: offset, limit: limit)
    }

    /// Cursor-based pagination over the user's conversations. Pass
    /// `cursor=nil` to fetch the first page; subsequent pages forward
    /// the previous response's `nextCursor`. The gateway resolves the
    /// cursor to the conversation's `lastMessageAt` and filters
    /// `lastMessageAt < cursor.lastMessageAt`, so pages never overlap
    /// even when new messages bump rows during scroll.
    ///
    /// Returns a `ConversationPage` with already-enriched
    /// `MeeshyConversation` items. The `currentUserId` is required to
    /// resolve the "other participant" of direct conversations and the
    /// caller-relative metadata (unread, isPinned, role) embedded in the
    /// row. Pass an empty string only when the caller will discard the
    /// derived display name (e.g. signed-out flows that should not call
    /// this in the first place).
    public func listPage(
        before cursor: String? = nil,
        limit: Int = 30,
        currentUserId: String = ""
    ) async throws -> ConversationPage {
        var queryItems: [URLQueryItem] = [URLQueryItem(name: "limit", value: "\(limit)")]
        if let cursor, !cursor.isEmpty {
            queryItems.append(URLQueryItem(name: "before", value: cursor))
        }
        let body: ConversationListResponseBody = try await api.request(
            ConversationsEndpoint.root,
            queryItems: queryItems
        )
        let items = body.data.map { $0.toConversation(currentUserId: currentUserId) }
        // Prefer cursorPagination meta when present (modern gateway
        // responses always include it). Fall back to the offset
        // pagination's hasMore as a last-ditch guard so a malformed
        // payload doesn't pin the list at "no more pages" forever.
        let nextCursor = body.cursorPagination?.nextCursor
        let hasMore = body.cursorPagination?.hasMore
            ?? body.pagination?.hasMore
            ?? (items.count == limit)
        return ConversationPage(
            items: items,
            rawItems: body.data,
            nextCursor: nextCursor,
            hasMore: hasMore
        )
    }

    /// `GET /conversations/search?q=` — pas de pagination côté serveur (le
    /// gateway renvoie tous les résultats matchés en une passe), donc pas de
    /// `limit`/`offset` à transmettre ici.
    public func search(query: String) async throws -> [APIConversation] {
        let response: APIResponse<[APIConversation]> = try await api.request(
            ConversationsEndpoint.search,
            queryItems: [URLQueryItem(name: "q", value: query)]
        )
        return response.data
    }

    public func getById(_ conversationId: String) async throws -> APIConversation {
        let response: APIResponse<APIConversation> = try await api.request(
            ConversationsEndpoint.byId(id: conversationId)
        )
        return response.data
    }

    public func create(type: String, title: String? = nil, participantIds: [String]) async throws -> CreateConversationResponse {
        let body = CreateConversationRequest(type: type, title: title, participantIds: participantIds)
        let response: APIResponse<CreateConversationResponse> = try await api.post(ConversationsEndpoint.root, body: body)
        return response.data
    }

    public func delete(conversationId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(ConversationsEndpoint.byId(id: conversationId))
    }

    // Endpoints fire-and-forget : la reponse est ignoree (`let _`). Les trois
    // handlers gateway ne renvoient PAS la meme forme de `data` — `/mark-read`
    // et `/mark-unread` renvoient `{ markedCount }` / `{ unreadCount }` (Int),
    // mais `/mark-as-received` renvoyait `{ message: String }`. Decoder un
    // `APIResponse<[String: Int]>` strict cassait sur cette String avec
    // `DecodingError: Type mismatch for type Int at path data.message` a
    // chaque ouverture de conversation. `SimpleAPIResponse` n'a pas de champ
    // `data` : il tolere n'importe quelle forme de corps, quel que soit
    // l'endpoint et quelle que soit l'evolution future du gateway.
    public func markRead(conversationId: String) async throws {
        let _: SimpleAPIResponse = try await api.request(ConversationsEndpoint.byIdMarkRead(id: conversationId), method: "POST")
    }

    public func markAsReceived(conversationId: String) async throws {
        let _: SimpleAPIResponse = try await api.request(ConversationsEndpoint.byConversationIdMarkAsReceived(conversationId: conversationId), method: "POST")
    }

    public func markUnread(conversationId: String) async throws {
        let _: SimpleAPIResponse = try await api.request(ConversationsEndpoint.byIdMarkUnread(id: conversationId), method: "POST")
    }

    public func getParticipants(conversationId: String, limit: Int = 100, cursor: String? = nil) async throws -> PaginatedAPIResponse<[APIParticipant]> {
        var queryItems = [URLQueryItem(name: "limit", value: "\(limit)")]
        if let cursor {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }
        return try await api.request(
            ConversationsEndpoint.byIdParticipants(id: conversationId),
            queryItems: queryItems
        )
    }

    /// Fiche d'un participant — la seule surface de profil des visiteurs SANS
    /// COMPTE, qui n'ont pas de page `/u/{pseudo}`.
    ///
    /// Le gateway décide seul de ce qu'il sert : les coordonnées (`email`,
    /// `birthday`) arrivent `nil` à un membre ordinaire. Le client ne refait
    /// jamais cet arbitrage — il rendrait un secret dépendant de la vue.
    public func getParticipantProfile(
        conversationId: String,
        participantId: String
    ) async throws -> ConversationParticipantProfile {
        let response: APIResponse<ConversationParticipantProfile> = try await api.request(
            ConversationsEndpoint.byIdParticipantsByParticipantIdProfile(id: conversationId, participantId: participantId)
        )
        return response.data
    }

    /// Accorder ou retirer un droit à un visiteur sans compte.
    ///
    /// N'envoie QUE les droits nommés : la surcharge est un delta côté gateway,
    /// et lui poster les huit gèlerait les sept autres à leur valeur du moment —
    /// ils cesseraient de suivre les conditions du join.
    ///
    /// Rend les droits RÉSOLUS après écriture. Un appelant affiche un état, pas
    /// une différence : recomposer la résolution côté client en tiendrait un
    /// second énoncé.
    ///
    /// Réservé aux administrateurs et modérateurs — le gateway le vérifie, et
    /// c'est lui qui décide : un appel non autorisé lève, il ne se prévient pas.
    public func updateParticipantRights(
        conversationId: String,
        participantId: String,
        rights: [String: Bool]
    ) async throws -> ParticipantEntryCapabilities {
        let response: APIResponse<ParticipantRightsUpdateResult> = try await api.patch(
            ConversationsEndpoint.byIdParticipantsByParticipantIdRights(id: conversationId, participantId: participantId),
            body: rights
        )
        return response.data.rights
    }

    /// Pose ou retire l'octroi d'historique par DATE sur un participant.
    ///
    /// Distinct de `updateParticipantRights` : ce levier vaut pour TOUT
    /// participant (inscrit compris), pas seulement les visiteurs sans compte,
    /// et sa permission d'écriture est plus étroite côté gateway (admin/creator,
    /// jamais modérateur) — le gateway le vérifie, il ne se prévient pas.
    ///
    /// `historyVisibleFrom: nil` retire l'octroi et DOIT voyager comme un
    /// `null` JSON explicite, jamais comme une clé absente : le corps distingue
    /// les deux (absente = ne touche à rien, `null` = retire), et le body
    /// encodé ici écrit toujours la clé.
    ///
    /// La date posée est NORMALISÉE au jour (`historyGrantFloor`) : ce levier
    /// est un octroi par DATE, et l'instant brut d'un sélecteur de date masque
    /// la matinée du jour choisi. Voir le doc-comment de `historyGrantFloor`.
    public func updateHistoryGrant(
        conversationId: String,
        participantId: String,
        historyVisibleFrom: Date?
    ) async throws -> Date? {
        let iso = historyVisibleFrom
            .map { Self.historyGrantFloor(for: $0) }
            .map { ISO8601DateFormatter().string(from: $0) }
        let response: APIResponse<ParticipantHistoryGrantUpdateResult> = try await api.patch(
            ConversationsEndpoint.byIdParticipantsByParticipantIdRights(id: conversationId, participantId: participantId),
            body: HistoryGrantBody(historyVisibleFrom: iso)
        )
        return response.data.historyVisibleFrom
    }

    /// L'instant que porte un octroi « voit l'historique depuis le <jour> ».
    ///
    /// Le gateway applique le plancher en `createdAt >= instant`. Envoyer
    /// l'instant BRUT rendu par un sélecteur de DATE poserait donc le plancher
    /// en MILIEU de journée : SwiftUI conserve l'heure de la valeur précédente
    /// sous `displayedComponents: [.date]`, si bien que « depuis le 15 » choisi
    /// à 14h32 masquait toute la matinée du 15 — un octroi qui ne tient pas la
    /// phrase qu'il affiche.
    ///
    /// Le jour retenu est celui que l'utilisateur a VU (calendrier LOCAL) ;
    /// l'instant envoyé est son minuit UTC. C'est exactement ce que le web
    /// compose depuis `<input type="date">`
    /// (`new Date(\`${value}T00:00:00.000Z\`)`, `ParticipantProfileCard.tsx`) —
    /// même geste, même plancher, dimension 6. Tronquer en UTC l'instant brut
    /// ne marcherait PAS : le soir, sur un fuseau à l'ouest, le jour UTC est
    /// déjà le suivant, et le plancher sauterait d'un jour entier.
    ///
    /// Borné au présent, parce que le gateway refuse un plancher futur
    /// (`historyVisibleFrom must not be in the future`) et que minuit UTC du
    /// jour local est à venir sur un fuseau très à l'est.
    public static func historyGrantFloor(
        for selection: Date,
        calendar: Calendar = .current,
        now: Date = Date()
    ) -> Date {
        let day = calendar.dateComponents([.year, .month, .day], from: selection)
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(secondsFromGMT: 0) ?? calendar.timeZone
        guard let midnight = utc.date(from: day) else { return min(selection, now) }
        return min(midnight, now)
    }

    public func deleteForMe(conversationId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(
            ConversationsEndpoint.byIdDeleteForMe(id: conversationId)
        )
    }

    /// Retire un membre de la conversation.
    ///
    /// `key` est un **`User.id` OU un `Participant.id`** : le gateway résout la
    /// cible sous les deux colonnes, ce qui rend expulsable un visiteur venu par
    /// un lien partagé — il n'a aucune ligne `User`, et son `Participant.id` est
    /// sa seule identité.
    ///
    /// Le paramètre s'appelait `userId` et n'acceptait que la première forme ;
    /// l'écriture passait alors par un `updateMany` qui, ne trouvant aucune
    /// ligne, **répondait 200 sans avoir rien fait**. Elle passe désormais par un
    /// `update` sur la ligne résolue : une expulsion qui ne trouve pas sa cible
    /// échoue au lieu de mentir.
    public func removeParticipant(conversationId: String, key: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(
            ConversationsEndpoint.byIdParticipantsByUserId(id: conversationId, userId: key),
            method: "DELETE"
        )
    }

    /// Change le rang d'un membre. Le segment d'URL est un **`User.id`**, jamais
    /// un `Participant.id` : le gateway filtre sur `where: { conversationId,
    /// userId }`, et un `Participant.id` y répond 404 « Participant not found ».
    ///
    /// Le paramètre s'appelait `participantId`, et c'est ce nom qui a produit
    /// l'erreur : la voisine `updateParticipantRights` attend, elle, un vrai
    /// `Participant.id`. Les deux natures coexistent à un segment près — le nom
    /// du paramètre est le seul endroit où la différence peut se lire.
    ///
    /// Un visiteur SANS COMPTE n'a pas de `User.id` et n'est donc pas
    /// promouvable : ses droits passent par `updateParticipantRights`.
    public func updateParticipantRole(conversationId: String, userId: String, role: String) async throws {
        struct RoleBody: Encodable { let role: String }
        let _: APIResponse<[String: String]> = try await api.patch(
            ConversationsEndpoint.byIdParticipantsByUserIdRole(id: conversationId, userId: userId),
            body: RoleBody(role: role)
        )
    }

    public func update(
        conversationId: String,
        title: String? = nil,
        description: String? = nil,
        avatar: String? = nil,
        banner: String? = nil,
        defaultWriteRole: String? = nil,
        isAnnouncementChannel: Bool? = nil,
        slowModeSeconds: Int? = nil,
        autoTranslateEnabled: Bool? = nil
    ) async throws -> APIConversation {
        struct UpdateConversationRequest: Encodable {
            let title: String?
            let description: String?
            let avatar: String?
            let banner: String?
            let defaultWriteRole: String?
            let isAnnouncementChannel: Bool?
            let slowModeSeconds: Int?
            let autoTranslateEnabled: Bool?

            func encode(to encoder: Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                if let title { try container.encode(title, forKey: .title) }
                if let description { try container.encode(description, forKey: .description) }
                if let avatar { try container.encode(avatar, forKey: .avatar) }
                if let banner { try container.encode(banner, forKey: .banner) }
                if let defaultWriteRole { try container.encode(defaultWriteRole, forKey: .defaultWriteRole) }
                if let isAnnouncementChannel { try container.encode(isAnnouncementChannel, forKey: .isAnnouncementChannel) }
                if let slowModeSeconds { try container.encode(slowModeSeconds, forKey: .slowModeSeconds) }
                if let autoTranslateEnabled { try container.encode(autoTranslateEnabled, forKey: .autoTranslateEnabled) }
            }

            enum CodingKeys: String, CodingKey {
                case title, description, avatar, banner
                case defaultWriteRole, isAnnouncementChannel, slowModeSeconds, autoTranslateEnabled
            }
        }
        let body = UpdateConversationRequest(
            title: title,
            description: description,
            avatar: avatar,
            banner: banner,
            defaultWriteRole: defaultWriteRole,
            isAnnouncementChannel: isAnnouncementChannel,
            slowModeSeconds: slowModeSeconds,
            autoTranslateEnabled: autoTranslateEnabled
        )
        let response: APIResponse<UpdateConversationResponse> = try await api.put(
            ConversationsEndpoint.byId(id: conversationId), body: body)
        return response.data.toAPIConversation()
    }

    public func leave(conversationId: String) async throws {
        let _: APIResponse<LeaveConversationResponse> = try await api.request(
            ConversationsEndpoint.byIdLeave(id: conversationId),
            method: "POST"
        )
    }

    /// Bannit un participant : le sort de la conversation ET **ferme le lien de
    /// partage par lequel il est entré**. Sortir quelqu'un sans fermer sa porte
    /// ne protège de rien — il revient par le même lien sous un autre
    /// pseudonyme, et un visiteur sans compte n'a que ce chemin.
    ///
    /// Ce qui est fermé, c'est la porte, pas la salle : les personnes déjà
    /// entrées par ce lien restent membres.
    ///
    /// `key` : `User.id` OU `Participant.id` — voir `removeParticipant`.
    public func banParticipant(conversationId: String, key: String) async throws {
        let _: APIResponse<BanParticipantResponse> = try await api.request(
            ConversationsEndpoint.byIdParticipantsByUserIdBan(id: conversationId, userId: key),
            method: "PATCH"
        )
    }

    /// Lève le bannissement. Le lien fermé par le bannissement n'est PAS rouvert :
    /// c'est une décision séparée, qui se prend sur l'écran des liens.
    ///
    /// `key` : `User.id` OU `Participant.id` — voir `removeParticipant`.
    public func unbanParticipant(conversationId: String, key: String) async throws {
        let _: APIResponse<UnbanParticipantResponse> = try await api.request(
            ConversationsEndpoint.byIdParticipantsByUserIdUnban(id: conversationId, userId: key),
            method: "PATCH"
        )
    }

    /// Récupère les conversations en commun avec un utilisateur spécifique
    public func listSharedWith(userId: String, limit: Int = 50) async throws -> [APIConversation] {
        let response: APIResponse<[APIConversation]> = try await api.request(
            ConversationsEndpoint.root,
            queryItems: [
                URLQueryItem(name: "withUserId", value: userId),
                URLQueryItem(name: "limit", value: "\(limit)")
            ]
        )
        return response.data
    }

    /// Finds the most recent existing direct conversation with a given user, or nil if none exists.
    public func findDirectWith(userId: String) async throws -> APIConversation? {
        let response: APIResponse<[APIConversation]> = try await api.request(
            ConversationsEndpoint.root,
            queryItems: [
                URLQueryItem(name: "type", value: "direct"),
                URLQueryItem(name: "withUserId", value: userId),
                URLQueryItem(name: "limit", value: "1")
            ]
        )
        return response.data.first
    }
}

// MARK: - Response Types

struct LeaveConversationResponse: Decodable {
    let conversationId: String
    let leftAt: String
}

struct BanParticipantResponse: Decodable {
    let userId: String
    let bannedAt: String
}

struct UnbanParticipantResponse: Decodable {
    let userId: String
}
