import Foundation

public final class UserService {
    public static let shared = UserService()
    private init() {}
    private var api: APIClient { APIClient.shared }

    public func search(query: String, limit: Int = 20, offset: Int = 0) async throws -> OffsetPaginatedAPIResponse<[UserSearchResult]> {
        try await api.offsetPaginatedRequest(endpoint: "/users/search", offset: offset, limit: limit)
        // Note: the query param needs to be added manually
    }

    public func searchUsers(query: String, limit: Int = 20, offset: Int = 0) async throws -> [UserSearchResult] {
        let response: OffsetPaginatedAPIResponse<[UserSearchResult]> = try await api.request(
            endpoint: "/users/search",
            queryItems: [
                URLQueryItem(name: "q", value: query),
                URLQueryItem(name: "limit", value: "\(limit)"),
                URLQueryItem(name: "offset", value: "\(offset)"),
            ]
        )
        return response.data
    }

    public func updateProfile(_ request: UpdateProfileRequest) async throws -> MeeshyUser {
        let response: APIResponse<UpdateProfileResponse> = try await api.put(endpoint: "/users/me", body: request)
        return response.data.user
    }

    public func updateAvatar(url: String) async throws -> MeeshyUser {
        struct Body: Encodable { let avatar: String }
        let response: APIResponse<UpdateProfileResponse> = try await api.patch(
            endpoint: "/users/me/avatar", body: Body(avatar: url)
        )
        return response.data.user
    }

    public func updateBanner(url: String) async throws -> MeeshyUser {
        struct Body: Encodable { let banner: String }
        let response: APIResponse<UpdateProfileResponse> = try await api.patch(
            endpoint: "/users/me/banner", body: Body(banner: url)
        )
        return response.data.user
    }

    public func uploadImage(_ imageData: Data, filename: String = "image.jpg") async throws -> String {
        let boundary = UUID().uuidString
        var body = Data()

        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"files\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(imageData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        guard let url = URL(string: "\(api.baseURL)/attachments/upload") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        if let token = api.authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw APIError.serverError(
                (response as? HTTPURLResponse)?.statusCode ?? 500,
                "Upload failed"
            )
        }

        struct UploadResponse: Decodable {
            let success: Bool
            let data: UploadData
        }
        struct UploadData: Decodable {
            let attachments: [UploadedAttachment]
        }
        struct UploadedAttachment: Decodable {
            let url: String
        }

        let decoded = try JSONDecoder().decode(UploadResponse.self, from: data)
        guard let fileURL = decoded.data.attachments.first?.url else {
            throw APIError.noData
        }
        return fileURL
    }

    public func getProfile(idOrUsername: String) async throws -> MeeshyUser {
        let encoded = idOrUsername.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? idOrUsername
        let response: APIResponse<MeeshyUser> = try await api.request(
            endpoint: "/users/\(encoded)"
        )
        return response.data
    }

    public func getPublicProfile(username: String) async throws -> MeeshyUser {
        let encoded = username.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? username
        let response: APIResponse<MeeshyUser> = try await api.request(
            endpoint: "/u/\(encoded)"
        )
        return response.data
    }

    public func getProfileByEmail(_ email: String) async throws -> MeeshyUser {
        let encoded = email.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? email
        let response: APIResponse<MeeshyUser> = try await api.request(
            endpoint: "/users/email/\(encoded)"
        )
        return response.data
    }

    public func getProfileById(_ id: String) async throws -> MeeshyUser {
        let response: APIResponse<MeeshyUser> = try await api.request(
            endpoint: "/users/id/\(id)"
        )
        return response.data
    }

    public func getProfileByPhone(_ phone: String) async throws -> MeeshyUser {
        let digits = phone.replacingOccurrences(of: "+", with: "")
        let encoded = digits.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? digits
        let response: APIResponse<MeeshyUser> = try await api.request(
            endpoint: "/users/phone/\(encoded)"
        )
        return response.data
    }

    // MARK: - Contact Change

    public func changeEmail(_ request: ChangeEmailRequest) async throws -> ChangeEmailResponse {
        let response: APIResponse<ChangeEmailResponse> = try await api.post(
            endpoint: "/users/me/change-email", body: request
        )
        return response.data
    }

    public func verifyEmailChange(_ request: VerifyEmailChangeRequest) async throws -> VerifyEmailChangeResponse {
        let response: APIResponse<VerifyEmailChangeResponse> = try await api.post(
            endpoint: "/users/me/verify-email-change", body: request
        )
        return response.data
    }

    public func resendEmailChangeVerification() async throws -> ChangeEmailResponse {
        struct Empty: Encodable {}
        let response: APIResponse<ChangeEmailResponse> = try await api.post(
            endpoint: "/users/me/resend-email-change-verification", body: Empty()
        )
        return response.data
    }

    public func changePhone(_ request: ChangePhoneRequest) async throws -> ChangePhoneResponse {
        let response: APIResponse<ChangePhoneResponse> = try await api.post(
            endpoint: "/users/me/change-phone", body: request
        )
        return response.data
    }

    public func verifyPhoneChange(_ request: VerifyPhoneChangeRequest) async throws -> VerifyPhoneChangeResponse {
        let response: APIResponse<VerifyPhoneChangeResponse> = try await api.post(
            endpoint: "/users/me/verify-phone-change", body: request
        )
        return response.data
    }
}
