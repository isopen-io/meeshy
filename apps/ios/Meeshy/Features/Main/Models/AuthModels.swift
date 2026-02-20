import Foundation

// MARK: - Login Request

struct LoginRequest: Encodable {
    let username: String
    let password: String
    let rememberDevice: Bool
}

// MARK: - Login Response

// Backend returns: { success: true, data: { user: {...}, token: "...", sessionToken: "...", expiresIn: 86400 } }
struct LoginResponseData: Decodable {
    let user: MeeshyUser
    let token: String
    let sessionToken: String?
    let expiresIn: Int?
}

// MARK: - User Model

struct MeeshyUser: Codable, Identifiable {
    let id: String
    let username: String
    let email: String?
    let firstName: String?
    let lastName: String?
    let displayName: String?
    let bio: String?
    let avatar: String?
    let role: String?
    let systemLanguage: String?
    let regionalLanguage: String?
    let isOnline: Bool?
    let lastActiveAt: String?
    let createdAt: String?
}

// MARK: - /auth/me Response

struct MeResponseData: Decodable {
    let user: MeeshyUser
}
