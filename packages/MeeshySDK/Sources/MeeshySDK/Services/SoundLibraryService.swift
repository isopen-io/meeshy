import Foundation

/// Accès à la bibliothèque de sons.
///
/// Deux vues, deux routes distinctes côté gateway :
/// - « Mes sons » → `GET /sounds/mine`, paginé par curseur, sons de l'appelant ;
/// - « Tendances » → `GET /stories/audio`, sons publics triés par `usageCount`.
///
/// La recherche du second porte sur le titre **ou** le pseudo de l'uploadeur :
/// un son capturé naît sans titre, le chercher par titre seul le rendrait
/// invisible.
public protocol SoundLibraryServiceProviding: Sendable {
    func mySounds(query: String?, cursor: Date?, limit: Int) async throws -> SoundPage
    func trendingSounds(query: String?, limit: Int) async throws -> [APISound]
    func rename(soundId: String, title: String) async throws -> APISound
    /// « Page du son » — les publications qui l'utilisent.
    func posts(soundId: String, cursor: Date?, limit: Int) async throws -> SoundPostPage
}

public struct SoundPostPage: Sendable {
    public let posts: [APISoundPost]
    public let nextCursor: Date?
    public var hasMore: Bool { nextCursor != nil }

    public init(posts: [APISoundPost], nextCursor: Date?) {
        self.posts = posts
        self.nextCursor = nextCursor
    }
}

public struct SoundPage: Sendable {
    public let sounds: [APISound]
    public let nextCursor: Date?
    public var hasMore: Bool { nextCursor != nil }

    public init(sounds: [APISound], nextCursor: Date?) {
        self.sounds = sounds
        self.nextCursor = nextCursor
    }
}

public final class SoundLibraryService: SoundLibraryServiceProviding, @unchecked Sendable {
    public static let shared = SoundLibraryService()
    private let api: APIClientProviding

    public init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    /// « Mes sons ». La recherche est appliquée CÔTÉ CLIENT : la route ne
    /// l'expose pas, et la bibliothèque personnelle d'un utilisateur tient dans
    /// quelques pages — inutile d'ajouter un balayage serveur pour ça.
    public func mySounds(query: String? = nil, cursor: Date? = nil, limit: Int = 30) async throws -> SoundPage {
        var items = [URLQueryItem(name: "limit", value: String(limit))]
        if let cursor {
            items.append(URLQueryItem(name: "cursor", value: soundCursorFormatter().string(from: cursor)))
        }
        let response: PaginatedSoundResponse = try await api.request(
            SoundsEndpoint.mine, method: "GET", body: nil, queryItems: items
        )
        let filtered = Self.filterLocally(response.data, query: query)
        return SoundPage(sounds: filtered, nextCursor: response.pagination?.nextCursorDate)
    }

    /// « Tendances » — la liste publique, triée par usage côté serveur.
    public func trendingSounds(query: String? = nil, limit: Int = 30) async throws -> [APISound] {
        var items = [URLQueryItem(name: "limit", value: String(limit))]
        if let query, !query.isEmpty {
            items.append(URLQueryItem(name: "q", value: query))
        }
        let response: APIResponse<[APISound]> = try await api.request(
            StoriesEndpoint.audio, method: "GET", body: nil, queryItems: items
        )
        return response.data
    }

    /// Nommer — ou renommer — un son dont on est l'auteur.
    ///
    /// Une chaîne vide est ACCEPTÉE et signifie « retire le titre » : c'est le
    /// seul moyen pour un auteur de défaire un titre malheureux sans qu'un
    /// administrateur coupe le son entier.
    public func rename(soundId: String, title: String) async throws -> APISound {
        let response: APIResponse<APISound> = try await api.patch(
            SoundsEndpoint.byId(id: soundId),
            body: ["title": title]
        )
        return response.data
    }

    /// Publications qui utilisent ce son.
    ///
    /// Le curseur suit les USAGES et non les publications — c'est la collection
    /// que le serveur pagine. Une page peut donc rendre moins d'éléments que
    /// `limit` sans que ce soit la fin : plusieurs usages désignent parfois la
    /// même publication, et les non publiques sont écartées. S'arrêter sur une
    /// page courte tronquerait la liste.
    public func posts(soundId: String, cursor: Date? = nil, limit: Int = 24) async throws -> SoundPostPage {
        var items = [URLQueryItem(name: "limit", value: String(limit))]
        if let cursor {
            items.append(URLQueryItem(name: "cursor", value: soundCursorFormatter().string(from: cursor)))
        }
        let response: PaginatedSoundPostResponse = try await api.request(
            SoundsEndpoint.byIdPosts(id: soundId), method: "GET", body: nil, queryItems: items
        )
        return SoundPostPage(posts: response.data, nextCursor: response.pagination?.nextCursorDate)
    }

    /// Filtre local sur le titre ET le pseudo — même règle que la recherche
    /// serveur de la liste publique, pour que les deux vues se comportent pareil.
    static func filterLocally(_ sounds: [APISound], query: String?) -> [APISound] {
        guard let query, !query.trimmingCharacters(in: .whitespaces).isEmpty else { return sounds }
        let needle = query.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
        return sounds.filter { sound in
            let haystacks = [sound.title, sound.uploader?.username ?? "", sound.uploader?.displayName ?? ""]
            return haystacks.contains { field in
                field.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
                    .contains(needle)
            }
        }
    }
}

/// La pagination voyage à la RACINE de l'enveloppe, pas sous `meta` — c'est ce
/// que produit `sendSuccess` (`utils/response.ts`).
struct PaginatedSoundResponse: Decodable {
    let success: Bool
    let data: [APISound]
    let pagination: SoundPagination?
}

struct PaginatedSoundPostResponse: Decodable {
    let success: Bool
    let data: [APISoundPost]
    let pagination: SoundPagination?
}

struct SoundPagination: Decodable {
    let limit: Int?
    let hasMore: Bool?
    let nextCursor: String?

    var nextCursorDate: Date? {
        guard let nextCursor else { return nil }
        return soundCursorFormatter().date(from: nextCursor)
    }
}

/// Le gateway sérialise avec les millisecondes (`toISOString`) : sans
/// `.withFractionalSeconds`, le curseur ne se décode pas et la pagination
/// s'arrête silencieusement à la première page.
///
/// Construit à CHAQUE appel plutôt que mis en cache dans un `static let` :
/// `ISO8601DateFormatter` n'est pas `Sendable`, et Swift 6 refuse un état
/// global mutable partagé. Le coût est négligeable — un curseur par page.
func soundCursorFormatter() -> ISO8601DateFormatter {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}
