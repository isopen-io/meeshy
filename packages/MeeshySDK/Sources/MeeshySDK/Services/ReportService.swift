import Foundation

// MARK: - Protocol

public protocol ReportServiceProviding: Sendable {
    func reportMessage(messageId: String, reportType: String, reason: String?) async throws
    func reportUser(userId: String, reportType: String, reason: String?) async throws
    func reportPost(postId: String, reportType: String, reason: String?) async throws
    func reportStory(storyId: String, reportType: String, reason: String?) async throws
    func reportConversation(conversationId: String, reportType: String, reason: String?) async throws
}

/// Signaler un contenu est un geste ORDINAIRE (S2), pas un geste
/// d'administration (#4155).
///
/// Ces cinq appels visaient `/admin/reports` — la seule route d'administration
/// que l'app appelait. Toute règle d'infrastructure posée un jour sur le
/// préfixe `/admin` (liste blanche d'IP, WAF, journalisation renforcée) aurait
/// cassé le signalement sur les trois plateformes, sans que personne ne fasse
/// le lien. L'adresse dit désormais ce que le geste est.
///
/// `/admin/reports` reste servie en adaptateur mince le temps que les versions
/// déjà installées disparaissent.
public final class ReportService: ReportServiceProviding, @unchecked Sendable {
    public static let shared = ReportService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func reportMessage(messageId: String, reportType: String, reason: String? = nil) async throws {
        let body = CreateReportBody(
            reportedType: "message",
            reportedEntityId: messageId,
            reportType: reportType,
            reason: reason
        )
        let _: APIResponse<ReportResponseData> = try await api.post(endpoint: "/reports", body: body)
    }

    public func reportUser(userId: String, reportType: String, reason: String? = nil) async throws {
        let body = CreateReportBody(
            reportedType: "user",
            reportedEntityId: userId,
            reportType: reportType,
            reason: reason
        )
        let _: APIResponse<ReportResponseData> = try await api.post(endpoint: "/reports", body: body)
    }

    public func reportPost(postId: String, reportType: String, reason: String? = nil) async throws {
        let body = CreateReportBody(
            reportedType: "post",
            reportedEntityId: postId,
            reportType: reportType,
            reason: reason
        )
        let _: APIResponse<ReportResponseData> = try await api.post(endpoint: "/reports", body: body)
    }

    public func reportStory(storyId: String, reportType: String, reason: String? = nil) async throws {
        let body = CreateReportBody(
            reportedType: "story",
            reportedEntityId: storyId,
            reportType: reportType,
            reason: reason
        )
        let _: APIResponse<ReportResponseData> = try await api.post(endpoint: "/reports", body: body)
    }

    public func reportConversation(conversationId: String, reportType: String, reason: String? = nil) async throws {
        let body = CreateReportBody(
            reportedType: "conversation",
            reportedEntityId: conversationId,
            reportType: reportType,
            reason: reason
        )
        let _: APIResponse<ReportResponseData> = try await api.post(endpoint: "/reports", body: body)
    }
}

struct CreateReportBody: Encodable {
    let reportedType: String
    let reportedEntityId: String
    let reportType: String
    let reason: String?
}

public struct ReportResponseData: Decodable {
    public let id: String?
}
