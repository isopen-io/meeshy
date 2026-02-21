// LoginRequest, LoginResponseData, MeeshyUser, MeResponseData
// are now sourced from MeeshySDK/Auth/AuthModels.swift to avoid type ambiguity.

import MeeshySDK

// MARK: - Refresh Token Response (not in SDK)

struct RefreshTokenData: Decodable {
    let token: String
    let expiresIn: Int
}
