import Foundation

public final class VoiceProfileService {
    public static let shared = VoiceProfileService()
    private init() {}
    private var api: APIClient { APIClient.shared }

    // MARK: - Consent

    public func getConsentStatus() async throws -> VoiceConsentStatus {
        let response: APIResponse<VoiceConsentStatus> = try await api.request(endpoint: "/voice-profile/consent")
        return response.data
    }

    public func grantConsent(ageVerification: Bool, birthDate: String? = nil) async throws -> VoiceConsentResponse {
        let body = VoiceConsentRequest(consentGiven: true, ageVerification: ageVerification, birthDate: birthDate)
        let response: APIResponse<VoiceConsentResponse> = try await api.post(endpoint: "/voice-profile/consent", body: body)
        return response.data
    }

    public func revokeConsent() async throws {
        let body = VoiceConsentRequest(consentGiven: false, ageVerification: false)
        let _: APIResponse<VoiceConsentResponse> = try await api.post(endpoint: "/voice-profile/consent", body: body)
    }

    // MARK: - Voice Profile

    public func getProfile() async throws -> VoiceProfile? {
        let response: APIResponse<VoiceProfile?> = try await api.request(endpoint: "/voice-profile")
        return response.data
    }

    public func getSamples() async throws -> [VoiceSample] {
        let response: APIResponse<[VoiceSample]> = try await api.request(endpoint: "/voice-profile/samples")
        return response.data
    }

    // MARK: - Upload Voice Sample

    public func uploadSample(audioData: Data, durationMs: Int) async throws -> VoiceSampleUploadResponse {
        let boundary = "Boundary-\(UUID().uuidString)"
        let endpoint = "/voice-profile/samples"

        guard let url = URL(string: "\(api.baseURL)\(endpoint)") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        if let token = api.authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"voice_sample.m4a\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/m4a\r\n\r\n".data(using: .utf8)!)
        body.append(audioData)
        body.append("\r\n".data(using: .utf8)!)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"durationMs\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(durationMs)".data(using: .utf8)!)
        body.append("\r\n".data(using: .utf8)!)
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let (data, _) = try await URLSession.shared.data(for: request)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let response = try decoder.decode(APIResponse<VoiceSampleUploadResponse>.self, from: data)
        return response.data
    }

    // MARK: - Toggle Voice Cloning

    public func toggleVoiceCloning(enabled: Bool) async throws {
        let body = VoiceCloningToggleRequest(enabled: enabled)
        let _: APIResponse<[String: Bool]> = try await api.post(endpoint: "/voice-profile/toggle-cloning", body: body)
    }

    // MARK: - GDPR Delete

    public func deleteProfile() async throws {
        _ = try await api.delete(endpoint: "/voice-profile")
    }

    public func deleteSample(sampleId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/voice-profile/samples/\(sampleId)")
    }
}
