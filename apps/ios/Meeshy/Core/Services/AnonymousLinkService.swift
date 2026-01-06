//
//  AnonymousLinkService.swift
//  Meeshy
//
//  Service for managing anonymous link operations
//  Handles link info retrieval, validation, and anonymous session management
//  iOS 16+
//

import Foundation
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Link Info Response

/// Response from GET /anonymous/link/{linkId}
struct LinkInfoResponse: Codable {
    let link: LinkInfo
    let conversation: ConversationInfo?
    let creator: CreatorInfo?

    struct LinkInfo: Codable {
        let id: String
        let linkId: String
        let identifier: String?
        let conversationId: String
        let name: String?
        let description: String?
        let isActive: Bool
        let expiresAt: Date?
        let maxUses: Int?
        let currentUses: Int

        // Requirements
        let requireAccount: Bool
        let requireNickname: Bool
        let requireEmail: Bool
        let requireBirthday: Bool

        // Permissions
        let allowAnonymousMessages: Bool
        let allowAnonymousFiles: Bool
        let allowAnonymousImages: Bool
        let allowViewHistory: Bool

        var isExpired: Bool {
            guard let expiresAt = expiresAt else { return false }
            return expiresAt < Date()
        }

        var isMaxUsesReached: Bool {
            guard let maxUses = maxUses else { return false }
            return currentUses >= maxUses
        }

        var isAvailable: Bool {
            isActive && !isExpired && !isMaxUsesReached
        }
    }

    struct ConversationInfo: Codable {
        let id: String
        let title: String?
        let description: String?
        let type: String
        let image: String?
        let memberCount: Int?
    }

    struct CreatorInfo: Codable {
        let id: String
        let displayName: String?
        let username: String
        let avatar: String?
    }
}

// MARK: - Username Check Response

struct UsernameCheckResponse: Codable {
    let available: Bool
    let suggestedUsername: String?
}

// MARK: - Anonymous Session

struct AnonymousSession: Codable {
    let token: String
    let participantId: String
    let conversationId: String
    let shareLinkId: String
    let createdAt: Date
    let expiresAt: Date

    var isExpired: Bool {
        expiresAt < Date()
    }
}

// MARK: - Link Status

enum LinkStatus {
    case loading
    case valid(LinkInfoResponse)
    case expired
    case inactive
    case maxUsesReached
    case notFound
    case error(String)

    var isValid: Bool {
        if case .valid = self { return true }
        return false
    }
}

// MARK: - Anonymous Link Service

@MainActor
final class AnonymousLinkService: ObservableObject {
    // MARK: - Singleton

    static let shared = AnonymousLinkService()

    // MARK: - Published Properties

    @Published private(set) var currentLinkStatus: LinkStatus = .loading
    @Published private(set) var currentLinkInfo: LinkInfoResponse?
    @Published private(set) var currentSession: AnonymousSession?
    @Published private(set) var isLoading = false

    // MARK: - Private Properties

    private let logger = authLogger
    private let sessionKey = "meeshy.anonymous.session"
    private let linkIdKey = "meeshy.anonymous.linkId"

    // MARK: - Initialization

    private init() {
        loadStoredSession()
    }

    // MARK: - Public Methods

    /// Fetch link information from the server
    /// - Parameter linkId: The unique link identifier
    /// - Returns: LinkInfoResponse if successful
    func fetchLinkInfo(linkId: String) async throws -> LinkInfoResponse {
        isLoading = true
        currentLinkStatus = .loading

        defer { isLoading = false }

        do {
            let response: APIResponse<LinkInfoResponse> = try await APIClient.shared
                .request(AuthEndpoints.getLinkInfo(linkId: linkId))

            guard let data = response.data else {
                currentLinkStatus = .notFound
                throw AnonymousLinkError.linkNotFound
            }

            // Validate link status
            if !data.link.isActive {
                currentLinkStatus = .inactive
                throw AnonymousLinkError.linkInactive
            }

            if data.link.isExpired {
                currentLinkStatus = .expired
                throw AnonymousLinkError.linkExpired
            }

            if data.link.isMaxUsesReached {
                currentLinkStatus = .maxUsesReached
                throw AnonymousLinkError.maxUsesReached
            }

            currentLinkInfo = data
            currentLinkStatus = .valid(data)

            logger.info("🔗 Link info fetched successfully: \(linkId)")
            return data

        } catch let error as AnonymousLinkError {
            throw error
        } catch {
            let message = error.localizedDescription
            currentLinkStatus = .error(message)
            logger.error("❌ Failed to fetch link info: \(message)")
            throw AnonymousLinkError.networkError(message)
        }
    }

    /// Check if a username is available
    /// - Parameter username: The username to check
    /// - Returns: UsernameCheckResponse with availability status
    func checkUsername(_ username: String) async throws -> UsernameCheckResponse {
        let response: APIResponse<UsernameCheckResponse> = try await APIClient.shared
            .request(AuthEndpoints.checkUsername(username: username))

        guard let data = response.data else {
            throw AnonymousLinkError.networkError("Invalid response")
        }

        return data
    }

    /// Join a conversation anonymously
    /// - Parameters:
    ///   - linkId: The link identifier
    ///   - firstName: User's first name
    ///   - lastName: User's last name
    ///   - username: Optional username (auto-generated if nil)
    ///   - email: Optional email (required if link.requireEmail)
    ///   - birthday: Optional birthday (required if link.requireBirthday)
    ///   - language: User's preferred language
    /// - Returns: AnonymousJoinResponse with participant info and session token
    func joinAnonymously(
        linkId: String,
        firstName: String,
        lastName: String,
        username: String? = nil,
        email: String? = nil,
        birthday: Date? = nil,
        language: String = "fr"
    ) async throws -> AnonymousJoinResponse {
        isLoading = true
        defer { isLoading = false }

        // Generate device fingerprint
        #if canImport(UIKit)
        let deviceFingerprint = await MainActor.run {
            UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
        }
        #else
        let deviceFingerprint = UUID().uuidString
        #endif

        // Generate username if not provided
        let finalUsername = username ?? generateUsername(firstName: firstName, lastName: lastName)

        let request = JoinAnonymousRequest(
            firstName: firstName,
            lastName: lastName,
            username: finalUsername,
            email: email,
            language: language,
            deviceFingerprint: deviceFingerprint
        )

        let response: APIResponse<AnonymousJoinResponse> = try await APIClient.shared
            .request(AuthEndpoints.joinAnonymous(linkId: linkId, request: request))

        guard let data = response.data else {
            throw AnonymousLinkError.joinFailed("Invalid response from server")
        }

        // Store session
        let session = AnonymousSession(
            token: data.sessionToken,
            participantId: data.participant.id,
            conversationId: data.participant.conversationId,
            shareLinkId: data.participant.shareLinkId,
            createdAt: Date(),
            expiresAt: Date().addingTimeInterval(24 * 60 * 60) // 24 hours
        )

        saveSession(session)
        storeLinkId(linkId)
        currentSession = session

        logger.info("✅ Successfully joined conversation anonymously as: \(finalUsername)")
        return data
    }

    /// Leave the current anonymous session
    func leaveSession() async throws {
        guard let session = currentSession else {
            logger.warn("⚠️ No active anonymous session to leave")
            return
        }

        // Call API to leave session (with session token header)
        // Note: This would need custom header support in APIClient
        // For now, just clear local session
        clearSession()

        logger.info("👋 Left anonymous session")
    }

    /// Check if user has an active anonymous session
    var hasActiveSession: Bool {
        guard let session = currentSession else { return false }
        return !session.isExpired
    }

    /// Get stored link ID for current session
    func getStoredLinkId() -> String? {
        UserDefaults.standard.string(forKey: linkIdKey)
    }

    /// Clear all anonymous session data
    func clearSession() {
        currentSession = nil
        currentLinkInfo = nil
        currentLinkStatus = .loading

        UserDefaults.standard.removeObject(forKey: sessionKey)
        UserDefaults.standard.removeObject(forKey: linkIdKey)

        // Also clear from Keychain
        KeychainService.shared.delete(forKey: sessionKey)

        logger.info("🧹 Anonymous session cleared")
    }

    // MARK: - Private Methods

    private func loadStoredSession() {
        // Try to load from Keychain first (more secure)
        if let sessionData = KeychainService.shared.load(forKey: sessionKey),
           let data = sessionData.data(using: .utf8),
           let session = try? JSONDecoder().decode(AnonymousSession.self, from: data) {
            if !session.isExpired {
                currentSession = session
                logger.info("📱 Loaded active anonymous session from storage")
            } else {
                clearSession()
                logger.info("⏰ Stored anonymous session expired, cleared")
            }
        }
    }

    private func saveSession(_ session: AnonymousSession) {
        if let data = try? JSONEncoder().encode(session),
           let string = String(data: data, encoding: .utf8) {
            KeychainService.shared.save(string, forKey: sessionKey)
        }
    }

    private func storeLinkId(_ linkId: String) {
        UserDefaults.standard.set(linkId, forKey: linkIdKey)
    }

    private func generateUsername(firstName: String, lastName: String) -> String {
        let cleanFirst = firstName.lowercased().replacingOccurrences(of: "[^a-z]", with: "", options: .regularExpression)
        let cleanLast = lastName.lowercased().replacingOccurrences(of: "[^a-z]", with: "", options: .regularExpression)
        let randomSuffix = String(format: "%03d", Int.random(in: 0...999))
        return "\(cleanFirst)_\(cleanLast)\(randomSuffix)"
    }
}

// MARK: - Errors

enum AnonymousLinkError: LocalizedError {
    case linkNotFound
    case linkExpired
    case linkInactive
    case maxUsesReached
    case usernameTaken(suggested: String?)
    case joinFailed(String)
    case networkError(String)
    case invalidForm(String)

    var errorDescription: String? {
        switch self {
        case .linkNotFound:
            return "Ce lien n'existe pas ou a été supprimé"
        case .linkExpired:
            return "Ce lien a expiré"
        case .linkInactive:
            return "Ce lien n'est plus actif"
        case .maxUsesReached:
            return "Ce lien a atteint son nombre maximum d'utilisations"
        case .usernameTaken(let suggested):
            if let suggested = suggested {
                return "Ce nom d'utilisateur est déjà pris. Suggestion: \(suggested)"
            }
            return "Ce nom d'utilisateur est déjà pris"
        case .joinFailed(let message):
            return "Impossible de rejoindre: \(message)"
        case .networkError(let message):
            return "Erreur réseau: \(message)"
        case .invalidForm(let field):
            return "Le champ \(field) est requis"
        }
    }
}
