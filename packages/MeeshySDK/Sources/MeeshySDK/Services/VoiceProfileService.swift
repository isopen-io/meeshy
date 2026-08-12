import Foundation

public protocol VoiceProfileServiceProviding: Sendable {
    func getConsentStatus() async throws -> VoiceConsentStatus
    func grantConsent(voiceCloningConsent: Bool, birthDate: String?) async throws -> VoiceConsentResponse
    func revokeConsent() async throws
    func getProfile() async throws -> VoiceProfile?
    func getSamples() async throws -> [VoiceSample]
    func uploadSample(audioData: Data, durationMs: Int) async throws -> VoiceSampleUploadResponse
    func toggleVoiceCloning(enabled: Bool) async throws
    func deleteProfile() async throws
    func deleteSample(sampleId: String) async throws
}

public final class VoiceProfileService: VoiceProfileServiceProviding, @unchecked Sendable {
    public static let shared = VoiceProfileService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    // MARK: - Consent

    public func getConsentStatus() async throws -> VoiceConsentStatus {
        let response: APIResponse<VoiceConsentStatus> = try await api.request(endpoint: "/voice/profile/consent")
        return response.data
    }

    /// Accorde le consentement d'enregistrement vocal (définition du profil
    /// vocal) et, si `voiceCloningConsent`, la traduction vocale utilisant ce
    /// profil. `birthDate` (YYYY-MM-DD) porte la vérification d'âge.
    public func grantConsent(voiceCloningConsent: Bool = false, birthDate: String? = nil) async throws -> VoiceConsentResponse {
        let body = VoiceConsentRequest(
            voiceRecordingConsent: true,
            voiceCloningConsent: voiceCloningConsent ? true : nil,
            birthDate: birthDate
        )
        let response: APIResponse<VoiceConsentResponse> = try await api.post(endpoint: "/voice/profile/consent", body: body)
        return response.data
    }

    public func revokeConsent() async throws {
        let body = VoiceConsentRequest(voiceRecordingConsent: false)
        let _: APIResponse<VoiceConsentResponse> = try await api.post(endpoint: "/voice/profile/consent", body: body)
    }

    // MARK: - Voice Profile
    //
    // Le gateway (`services/gateway/src/routes/voice-profile.ts`) modélise UN
    // profil vocal unique : création via `POST /register` (audio ≥ 10 s),
    // recalibrage via `PUT /:profileId`, lecture via `GET /voice/profile`
    // (renvoie `VoiceProfileDetails` avec `exists`), suppression via
    // `DELETE /voice/profile`. Il n'existe AUCUNE route d'échantillons
    // individuels ni de toggle-cloning dédié — d'où les mappings ci-dessous.

    public func getProfile() async throws -> VoiceProfile? {
        let response: APIResponse<VoiceProfileDetails> = try await api.request(endpoint: "/voice/profile")
        return response.data.toDomain()
    }

    /// Le gateway ne modélise pas de collection d'échantillons (profil unique).
    /// Retourne une liste vide : la vue de gestion affiche alors « aucun
    /// échantillon », et l'ajout d'audio passe par `uploadSample` (register /
    /// recalibrage) plutôt que par une liste éditable.
    public func getSamples() async throws -> [VoiceSample] {
        []
    }

    // MARK: - Upload Voice Sample (register / calibrate)

    /// Envoie un échantillon audio vers le profil vocal, mappé sur l'API réelle
    /// du gateway : si AUCUN profil n'existe encore → `POST /register` (crée le
    /// profil à partir de cet audio) ; si un profil existe → `PUT /:profileId`
    /// (recalibrage, vérification d'empreinte vocale côté serveur). Le boucle
    /// d'appel du wizard (un `uploadSample` par échantillon enregistré) produit
    /// donc : 1er échantillon = création, suivants = recalibrage. `durationMs`
    /// est conservé pour l'UI (le gateway déduit la durée de l'audio lui-même).
    public func uploadSample(audioData: Data, durationMs: Int) async throws -> VoiceSampleUploadResponse {
        let body = VoiceProfileAudioRequest(audioData: audioData, audioFormat: "m4a")
        let existing = try? await getProfile()
        if let profileId = existing?.id, !profileId.isEmpty {
            let response: APIResponse<VoiceProfileRegisterResponse> = try await api.put(
                endpoint: "/voice/profile/\(profileId)", body: body
            )
            return VoiceSampleUploadResponse(
                sampleId: response.data.profileId,
                profileId: response.data.profileId,
                durationMs: durationMs,
                sampleCount: (existing?.sampleCount ?? 0) + 1
            )
        } else {
            let response: APIResponse<VoiceProfileRegisterResponse> = try await api.post(
                endpoint: "/voice/profile/register", body: body
            )
            return VoiceSampleUploadResponse(
                sampleId: response.data.profileId,
                profileId: response.data.profileId,
                durationMs: durationMs,
                sampleCount: 1
            )
        }
    }

    // MARK: - Toggle Voice Cloning

    /// Le gateway n'expose pas de route `/toggle-cloning` dédiée : le clonage
    /// vocal se pilote via le consentement (`voiceCloningConsent`), qui pose /
    /// retire `voiceCloningEnabledAt`. On envoie donc explicitement le booléen
    /// (y compris `false` pour désactiver — le chemin `grantConsent` omet le
    /// champ quand il est faux, ce qui ne désactiverait rien).
    public func toggleVoiceCloning(enabled: Bool) async throws {
        let body = VoiceConsentRequest(voiceRecordingConsent: true, voiceCloningConsent: enabled)
        let _: APIResponse<VoiceConsentResponse> = try await api.post(endpoint: "/voice/profile/consent", body: body)
    }

    // MARK: - GDPR Delete

    public func deleteProfile() async throws {
        _ = try await api.delete(endpoint: "/voice/profile")
    }

    /// Pas de route gateway pour supprimer un échantillon individuel (le
    /// gateway ne gère qu'un profil entier via `deleteProfile`). No-op : la
    /// liste d'échantillons renvoyée par `getSamples()` est toujours vide, donc
    /// cette action n'est jamais présentée à l'utilisateur.
    public func deleteSample(sampleId: String) async throws {}
}
