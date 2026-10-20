import Foundation

// MARK: - API Response Types

public struct APIResponse<T: Decodable>: Decodable {
    public let success: Bool
    public let data: T
    public let error: String?

    enum CodingKeys: String, CodingKey {
        case success, data, error
    }
}

public struct SimpleAPIResponse: Decodable {
    public let success: Bool
    public let message: String?
    public let error: String?
}

public struct PaginatedAPIResponse<T: Decodable>: Decodable {
    public let success: Bool
    public let data: T
    public let pagination: CursorPagination?
    public let error: String?
    public let meta: APIResponseMeta?

    /// `meta` par défaut à `nil` : les call sites qui fabriquent une page à la
    /// main (tests, chemins optimistes) restent inchangés.
    public init(success: Bool, data: T, pagination: CursorPagination?, error: String?,
                meta: APIResponseMeta? = nil) {
        self.success = success
        self.data = data
        self.pagination = pagination
        self.error = error
        self.meta = meta
    }
}

public struct CursorPagination: Decodable, Sendable {
    public let nextCursor: String?
    public let hasMore: Bool?
    public let limit: Int?

    /// Init PUBLIC : les doubles de l'app (`apps/ios/MeeshyTests`) importent le
    /// SDK sans `@testable` et ne voient donc pas l'init mémoire synthétisée,
    /// interne. Sans lui, un double ne peut pas fabriquer une page à curseur —
    /// il doit rendre `pagination: nil`, et le témoin cesse alors de pouvoir
    /// mesurer la propagation du curseur, qui est justement ce qu'il garde.
    public init(nextCursor: String?, hasMore: Bool?, limit: Int?) {
        self.nextCursor = nextCursor
        self.hasMore = hasMore
        self.limit = limit
    }
}

public struct OffsetPagination: Decodable, Sendable {
    public let total: Int?
    public let hasMore: Bool?
    public let limit: Int?
    public let offset: Int?
    /// LA RAMPE DE #4175/#4901 : la page 1 servie AU RANG porte l'ancre de la
    /// suite AU CURSEUR. Sans cette clé, le curseur servi était JETÉ au
    /// décodage et aucun client ne pouvait emprunter la rampe.
    public let nextCursor: String?

    public init(total: Int?, hasMore: Bool?, limit: Int?, offset: Int?, nextCursor: String? = nil) {
        self.total = total
        self.hasMore = hasMore
        self.limit = limit
        self.offset = offset
        self.nextCursor = nextCursor
    }
}

public struct OffsetPaginatedAPIResponse<T: Decodable>: Decodable {
    public let success: Bool
    public let data: T
    public let pagination: OffsetPagination?
    public let error: String?

    /// Voir `APIResponseMeta` : la page delta des conversations y porte les
    /// conversations SORTIES de la vue, que `data` ne peut pas exprimer. Le
    /// bloc n'existe que sur une page delta — d'où l'optionnel, qui vaut aussi
    /// rétro-compatibilité avec un gateway antérieur.
    ///
    /// `meta` par défaut à `nil` : les call sites qui fabriquent une page à la
    /// main (tests, chemins optimistes) restent inchangés.
    public let meta: APIResponseMeta?

    public init(success: Bool, data: T, pagination: OffsetPagination?, error: String?,
                meta: APIResponseMeta? = nil) {
        self.success = success
        self.data = data
        self.pagination = pagination
        self.error = error
        self.meta = meta
    }
}
