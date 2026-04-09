import Foundation

public struct DataExportData: Decodable, Sendable {
    public let exportDate: String
    public let format: String
    public let requestedTypes: [String]
    public let profile: ExportedProfile?
    public let messages: [ExportedMessage]?
    public let messagesCount: Int?
    public let contacts: [ExportedContact]?
    public let contactsCount: Int?
    public let csv: [String: String]?
}

public struct ExportedProfile: Decodable, Sendable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let firstName: String?
    public let lastName: String?
    public let email: String?
    public let phoneNumber: String?
    public let bio: String?
    public let avatar: String?
    public let banner: String?
    public let systemLanguage: String?
    public let regionalLanguage: String?
    public let customDestinationLanguage: String?
    public let timezone: String?
    public let createdAt: Date?
    public let lastActiveAt: Date?
}

public struct ExportedMessage: Decodable, Sendable {
    public let id: String
    public let conversationId: String
    public let content: String
    public let originalLanguage: String?
    public let messageType: String?
    public let messageSource: String?
    public let createdAt: Date?
    public let editedAt: Date?
}

public struct ExportedContactParticipant: Decodable, Sendable {
    public let displayName: String
    public let type: String
}

public struct ExportedContact: Decodable, Sendable {
    public let conversationId: String
    public let conversationName: String?
    public let conversationType: String?
    public let role: String?
    public let joinedAt: Date?
    public let participants: [ExportedContactParticipant]
}

public protocol DataExportServiceProviding: AnyObject, Sendable {
    func requestExport(format: String, types: [String]) async throws -> DataExportData
}

public final class DataExportService: DataExportServiceProviding, @unchecked Sendable {
    public static let shared = DataExportService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func requestExport(format: String, types: [String]) async throws -> DataExportData {
        let typesStr = types.joined(separator: ",")
        let queryItems = [
            URLQueryItem(name: "format", value: format),
            URLQueryItem(name: "types", value: typesStr),
        ]
        let response: APIResponse<DataExportData> = try await api.request(
            endpoint: "/me/export",
            queryItems: queryItems
        )
        return response.data
    }
}
