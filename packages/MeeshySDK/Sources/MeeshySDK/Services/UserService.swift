import Foundation

// MARK: - Protocol

public protocol UserServiceProviding: Sendable {
    func search(query: String, limit: Int, offset: Int) async throws -> OffsetPaginatedAPIResponse<[UserSearchResult]>
    func searchUsers(query: String, limit: Int, offset: Int) async throws -> [UserSearchResult]
    func updateProfile(_ request: UpdateProfileRequest) async throws -> MeeshyUser
    func updateAvatar(url: String) async throws -> MeeshyUser
    func updateBanner(url: String) async throws -> MeeshyUser
    func uploadImage(_ imageData: Data, filename: String) async throws -> String
    /// LA lecture d'un profil public — `handle` est un identifiant ou un pseudo.
    func getProfile(handle: String, expand: Set<ProfileExpansion>) async throws -> PublicProfile
    func getProfile(idOrUsername: String) async throws -> MeeshyUser
    func getProfileByEmail(_ email: String) async throws -> MeeshyUser
    func getProfileById(_ id: String) async throws -> MeeshyUser
    func getProfileByPhone(_ phone: String) async throws -> MeeshyUser
    func changeEmail(_ request: ChangeEmailRequest) async throws -> ChangeEmailResponse
    func verifyEmailChange(_ request: VerifyEmailChangeRequest) async throws -> VerifyEmailChangeResponse
    func resendEmailChangeVerification() async throws -> ChangeEmailResponse
    func changePhone(_ request: ChangePhoneRequest) async throws -> ChangePhoneResponse
    func verifyPhoneChange(_ request: VerifyPhoneChangeRequest) async throws -> VerifyPhoneChangeResponse
    func getUserStats(userId: String) async throws -> UserStats
}

public final class UserService: UserServiceProviding, @unchecked Sendable {
    public static let shared = UserService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func search(query: String, limit: Int = 20, offset: Int = 0) async throws -> OffsetPaginatedAPIResponse<[UserSearchResult]> {
        try await api.offsetPaginatedRequest(UsersEndpoint.search, offset: offset, limit: limit)
        // Note: the query param needs to be added manually
    }

    public func searchUsers(query: String, limit: Int = 20, offset: Int = 0) async throws -> [UserSearchResult] {
        let response: APIResponse<[UserSearchResult]> = try await api.request(
            UsersEndpoint.search,
            queryItems: [
                URLQueryItem(name: "q", value: query),
                URLQueryItem(name: "limit", value: "\(limit)"),
                URLQueryItem(name: "offset", value: "\(offset)"),
            ]
        )
        return response.data
    }

    public func updateProfile(_ request: UpdateProfileRequest) async throws -> MeeshyUser {
        let response: APIResponse<UpdateProfileResponse> = try await api.patch(UsersEndpoint.me, body: request)
        return response.data.user
    }

    public func updateAvatar(url: String) async throws -> MeeshyUser {
        struct Body: Encodable { let avatar: String }
        let response: APIResponse<UpdateProfileResponse> = try await api.patch(
            UsersEndpoint.meAvatar, body: Body(avatar: url)
        )
        return response.data.user
    }

    public func updateBanner(url: String) async throws -> MeeshyUser {
        struct Body: Encodable { let banner: String }
        let response: APIResponse<UpdateProfileResponse> = try await api.patch(
            UsersEndpoint.meBanner, body: Body(banner: url)
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
            let fileUrl: String
        }

        let decoded = try JSONDecoder().decode(UploadResponse.self, from: data)
        guard let fileURLObject = decoded.data.attachments.first?.fileUrl else {
            throw APIError.noData
        }
        return fileURLObject
    }

    /// LA lecture d'un profil public, à l'adresse canonique (#4161).
    ///
    /// Le SDK visait TROIS adresses pour la même ligne — `/users/{id}`,
    /// `/users/id/{id}` et `/u/{pseudo}` — dont deux servaient des formes de
    /// réponse différentes. Elles restent servies en alias côté passerelle,
    /// pour les versions déjà installées ; le SDK, lui, n'en appelle plus
    /// qu'une.
    ///
    /// `expand` décide ce qui accompagne le profil. Demander `.stats` ici fond
    /// deux allers-retours en un — c'est la raison d'être du paramètre, pas une
    /// commodité : un écran de profil coûtait systématiquement deux appels.
    public func getProfile(
        handle: String,
        expand: Set<ProfileExpansion> = []
    ) async throws -> PublicProfile {
        let encoded = handle.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? handle
        // Trié : deux appels demandant les mêmes expansions produisent la même
        // URL, donc la même entrée de cache HTTP et le même ETag.
        let items = expand.isEmpty
            ? nil
            : [URLQueryItem(name: "expand", value: expand.map(\.rawValue).sorted().joined(separator: ","))]
        let response: APIResponse<PublicProfile> = try await api.request(
            DirectoryEndpoint.peopleByHandle(handle: encoded),
            method: "GET",
            body: nil,
            queryItems: items
        )
        return response.data
    }

    public func getProfile(idOrUsername: String) async throws -> MeeshyUser {
        try await getProfile(handle: idOrUsername).user
    }

    public func getProfileByEmail(_ email: String) async throws -> MeeshyUser {
        let encoded = email.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? email
        let response: APIResponse<MeeshyUser> = try await api.request(
            UsersEndpoint.emailByEmail(email: encoded)
        )
        return response.data
    }

    /// Conservée pour les sites d'appel existants — elle ne vise plus
    /// `/users/id/{id}` mais l'adresse canonique, comme sa jumelle
    /// `getProfile(idOrUsername:)`. Un identifiant EST un `handle`.
    public func getProfileById(_ id: String) async throws -> MeeshyUser {
        try await getProfile(handle: id).user
    }

    public func getProfileByPhone(_ phone: String) async throws -> MeeshyUser {
        let digits = phone.replacingOccurrences(of: "+", with: "")
        let encoded = digits.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? digits
        let response: APIResponse<MeeshyUser> = try await api.request(
            UsersEndpoint.phoneByPhone(phone: encoded)
        )
        return response.data
    }

    // MARK: - Contact Change

    public func changeEmail(_ request: ChangeEmailRequest) async throws -> ChangeEmailResponse {
        let response: APIResponse<ChangeEmailResponse> = try await api.post(
            UsersEndpoint.meChangeEmail, body: request
        )
        return response.data
    }

    public func verifyEmailChange(_ request: VerifyEmailChangeRequest) async throws -> VerifyEmailChangeResponse {
        let response: APIResponse<VerifyEmailChangeResponse> = try await api.post(
            UsersEndpoint.meVerifyEmailChange, body: request
        )
        return response.data
    }

    public func resendEmailChangeVerification() async throws -> ChangeEmailResponse {
        struct Empty: Encodable {}
        let response: APIResponse<ChangeEmailResponse> = try await api.post(
            UsersEndpoint.meResendEmailChangeVerification, body: Empty()
        )
        return response.data
    }

    public func changePhone(_ request: ChangePhoneRequest) async throws -> ChangePhoneResponse {
        let response: APIResponse<ChangePhoneResponse> = try await api.post(
            UsersEndpoint.meChangePhone, body: request
        )
        return response.data
    }

    public func verifyPhoneChange(_ request: VerifyPhoneChangeRequest) async throws -> VerifyPhoneChangeResponse {
        let response: APIResponse<VerifyPhoneChangeResponse> = try await api.post(
            UsersEndpoint.meVerifyPhoneChange, body: request
        )
        return response.data
    }

    // MARK: - Stats

    /// Les statistiques d'un profil, à la MÊME adresse que le profil.
    ///
    /// `GET /users/{id}/stats` reste servie, mais elle recopiait le calcul et
    /// avait divergé — son `totalTranslations` valait 0 pour tout le monde.
    /// Passer par `?expand=stats` donne le calcul unique du serveur, et permet
    /// aux hôtes qui ont AUSSI besoin du profil de ne faire qu'un appel.
    public func getUserStats(userId: String) async throws -> UserStats {
        guard let stats = try await getProfile(handle: userId, expand: [.stats]).stats else {
            throw MeeshyError.server(statusCode: 0, message: "Le profil n'a pas rendu de statistiques")
        }
        return stats
    }
}
