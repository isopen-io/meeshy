import Foundation

// MARK: - Models

/// Une session ouverte du compte, telle que `GET /auth/sessions` la sert
/// (`sessionSchema`, `packages/shared/types/api-schemas/session.ts`).
///
/// **Tout ce qui s'est ajouté depuis est FACULTATIF** (#9223) : un serveur
/// antérieur au relevé (#9610) ou à la base de géolocalisation locale (#9609)
/// sert une session sans version, sans moyen de connexion ni ville, et elle se
/// décode quand même.
public struct UserSession: Codable, Sendable, Identifiable, Equatable {
    public let id: String
    public let deviceName: String?
    public let ipAddress: String?
    public let lastActive: Date?
    public let createdAt: Date
    public let isCurrent: Bool

    public let deviceType: String?
    public let deviceVendor: String?
    public let deviceModel: String?
    public let osName: String?
    public let osVersion: String?
    public let browserName: String?
    public let browserVersion: String?
    public let isMobile: Bool?
    /// Ce que le client a déclaré (#9610).
    public let appVersion: String?
    public let appBuild: String?
    /// `ios` · `web` · `pwa` · `android-shell`.
    public let platform: String?
    /// Posé par le SERVEUR (`SESSION_LOGIN_METHODS`).
    public let loginMethod: String?
    /// Code ISO 3166-1 alpha-2.
    public let country: String?
    /// APPROXIMATIVE : tirée de l'adresse IP par une base locale (#9609).
    public let city: String?
    public let location: String?
    /// Fuseau IANA déclaré par le client.
    public let timezone: String?
    public let isTrusted: Bool?

    enum CodingKeys: String, CodingKey {
        case id
        case deviceName
        case ipAddress
        case lastActive = "lastActivityAt"
        case createdAt
        case isCurrent = "isCurrentSession"
        case deviceType, deviceVendor, deviceModel
        case osName, osVersion, browserName, browserVersion, isMobile
        case appVersion, appBuild, platform, loginMethod
        case country, city, location, timezone, isTrusted
    }

    public init(
        id: String,
        deviceName: String?,
        ipAddress: String?,
        lastActive: Date?,
        createdAt: Date,
        isCurrent: Bool,
        deviceType: String? = nil,
        deviceVendor: String? = nil,
        deviceModel: String? = nil,
        osName: String? = nil,
        osVersion: String? = nil,
        browserName: String? = nil,
        browserVersion: String? = nil,
        isMobile: Bool? = nil,
        appVersion: String? = nil,
        appBuild: String? = nil,
        platform: String? = nil,
        loginMethod: String? = nil,
        country: String? = nil,
        city: String? = nil,
        location: String? = nil,
        timezone: String? = nil,
        isTrusted: Bool? = nil
    ) {
        self.id = id
        self.deviceName = deviceName
        self.ipAddress = ipAddress
        self.lastActive = lastActive
        self.createdAt = createdAt
        self.isCurrent = isCurrent
        self.deviceType = deviceType
        self.deviceVendor = deviceVendor
        self.deviceModel = deviceModel
        self.osName = osName
        self.osVersion = osVersion
        self.browserName = browserName
        self.browserVersion = browserVersion
        self.isMobile = isMobile
        self.appVersion = appVersion
        self.appBuild = appBuild
        self.platform = platform
        self.loginMethod = loginMethod
        self.country = country
        self.city = city
        self.location = location
        self.timezone = timezone
        self.isTrusted = isTrusted
    }
}

extension UserSession: CacheIdentifiable {}

/// L'attribution que la licence CC-BY 4.0 de DB-IP Lite exige partout où un
/// lieu déduit de l'adresse est montré (`GEOLOCATION_ATTRIBUTION`,
/// `packages/shared/utils/client-session.ts`).
public struct GeolocationAttribution: Codable, Sendable, Equatable {
    public let provider: String?
    public let text: String
    public let url: String?
    public let license: String?
    /// Une ville tirée d'une adresse se dit « approximative », jamais comme un fait.
    public let approximate: Bool?

    public init(provider: String?, text: String, url: String?, license: String?, approximate: Bool?) {
        self.provider = provider
        self.text = text
        self.url = url
        self.license = license
        self.approximate = approximate
    }

    /// Le miroir du contrat serveur, pour une liste tirée du cache (l'attribution
    /// ne s'y garde pas) : la même base l'a servie.
    public static let dbIP = GeolocationAttribution(
        provider: "DB-IP",
        text: "IP Geolocation by DB-IP",
        url: "https://db-ip.com",
        license: "CC-BY-4.0",
        approximate: true
    )
}

/// Ce que `GET /auth/sessions` rend : les sessions, et l'attribution du lieu.
public struct SessionsList: Sendable, Equatable {
    public let sessions: [UserSession]
    /// `nil` d'un serveur antérieur à #9609.
    public let geolocation: GeolocationAttribution?

    public init(sessions: [UserSession], geolocation: GeolocationAttribution?) {
        self.sessions = sessions
        self.geolocation = geolocation
    }
}

struct SessionsListData: Decodable {
    let sessions: [UserSession]
    let totalCount: Int
    var geolocation: GeolocationAttribution? = nil
}

// MARK: - Protocol

public protocol SessionServiceProviding: Sendable {
    func listSessions() async throws -> SessionsList
    func revokeSession(sessionId: String) async throws
    func revokeAllOtherSessions() async throws
}

// MARK: - Implementation

public final class SessionService: SessionServiceProviding, @unchecked Sendable {
    public static let shared = SessionService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func listSessions() async throws -> SessionsList {
        let response: APIResponse<SessionsListData> = try await api.request(AuthEndpoint.sessions)
        return SessionsList(sessions: response.data.sessions, geolocation: response.data.geolocation)
    }

    public func revokeSession(sessionId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(AuthEndpoint.sessionsBySessionId(sessionId: sessionId))
    }

    public func revokeAllOtherSessions() async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(AuthEndpoint.sessions)
    }
}
