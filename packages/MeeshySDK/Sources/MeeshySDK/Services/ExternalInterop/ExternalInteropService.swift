import Foundation

// MARK: - Protocol

public protocol ExternalInteropServiceProviding: Sendable {
    func consentStatus() async throws -> ExternalInteropConsentStatus
    func recordConsent(granted: Bool) async throws -> ExternalInteropConsentStatus
    func reportExternalContent(
        conversationId: String,
        reportType: String,
        disclosedText: String?,
        blockPeer: Bool
    ) async throws -> ExternalReportAcknowledgement
}

/// La conformité de l'interopérabilité WhatsApp (#17120, chantier #17007) :
/// l'information sur ce qui part chez Meta, le consentement sous sa version en
/// vigueur, et le signalement d'un contenu reçu de WhatsApp.
///
/// - Le consentement ne porte jamais de date : la passerelle date.
/// - Un signalement ne transporte le texte du message que si la personne l'a
///   JOINT (`disclosedText`) ; vide, il ne part pas.
public final class ExternalInteropService: ExternalInteropServiceProviding, Sendable {
    public static let shared = ExternalInteropService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func consentStatus() async throws -> ExternalInteropConsentStatus {
        let response: APIResponse<ExternalInteropConsentStatus> = try await api.request(
            ConversationsEndpoint.externalConsent,
            queryItems: [URLQueryItem(name: "network", value: "whatsapp")]
        )
        return response.data
    }

    public func recordConsent(granted: Bool) async throws -> ExternalInteropConsentStatus {
        let body = ConsentBody(network: "whatsapp", noticeVersion: ExternalInteropNotice.version, granted: granted)
        let response: APIResponse<ExternalInteropConsentStatus> = try await api.put(ConversationsEndpoint.externalConsent, body: body)
        return response.data
    }

    public func reportExternalContent(
        conversationId: String,
        reportType: String,
        disclosedText: String?,
        blockPeer: Bool
    ) async throws -> ExternalReportAcknowledgement {
        let trimmed = disclosedText?.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = ReportBody(
            reportType: reportType,
            blockPeer: blockPeer,
            disclosedText: (trimmed?.isEmpty ?? true) ? nil : trimmed
        )
        let response: APIResponse<ExternalReportAcknowledgement> = try await api.post(
            ConversationsEndpoint.byIdExternalReport(id: conversationId),
            body: body
        )
        return response.data
    }
}

private struct ConsentBody: Encodable {
    let network: String
    let noticeVersion: String
    let granted: Bool
}

private struct ReportBody: Encodable {
    let reportType: String
    let blockPeer: Bool
    let disclosedText: String?
}
