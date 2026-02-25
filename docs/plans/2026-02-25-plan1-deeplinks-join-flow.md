# Plan 1: Deep Links, Join Flow, Conversation Management

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Date**: 2026-02-25
**Goal**: Implement iOS deep link routing for universal links, the /join/:linkId flow with rich preview screen (banner, avatar, stats, members, dual CTA for authenticated/anonymous), conversation management actions (leave, share link, add participant), and friend request UI.
**Architecture**: Extend DeepLinkRouter with new destinations, create ShareLinkService and FriendService in MeeshySDK, build JoinFlowSheet/PreviewView/AnonymousFormView in MeeshyUI, integrate into MeeshyApp and Router for deep link handling.
**Tech Stack**: Swift 5.9, iOS 17+, SwiftUI, MeeshySDK (Models/Services), MeeshyUI (Views), Fastify gateway REST API

---

## Coherence Checks (Agent MUST verify before starting)

1. Confirm `apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift` exists and has `DeepLinkDestination` enum with cases: `ownProfile`, `userProfile`, `conversation`, `magicLink`, `share`, `external`
2. Confirm `apps/ios/Meeshy/Features/Main/Navigation/Router.swift` exists with `handleDeepLink(_:)` and `navigateToConversation(_:)` methods
3. Confirm `apps/ios/Meeshy/MeeshyApp.swift` has `onOpenURL` handler calling `handleAppLevelDeepLink`
4. Confirm `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift` exists as singleton pattern with `APIClient.shared`
5. Confirm `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift` has `request<T: Decodable>()`, `post<T,U>()`, `patch<T,U>()`, `delete()` methods
6. Confirm `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift` has `APIConversation`, `APIConversationMember`, `APIConversationUser`
7. Confirm `packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/AuthTextField.swift` exists (reusable for anonymous form)
8. Confirm `packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/LanguageSelector.swift` exists (reusable for anonymous form language selection)
9. Confirm `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift` exists with members tab, media tab, pinned tab
10. Confirm gateway endpoints exist: `GET /anonymous/link/:identifier`, `POST /anonymous/join/:linkId`, `POST /conversations/join/:linkId`, `GET /friend-requests/received`, `POST /friend-requests`, `PATCH /friend-requests/:id`, `DELETE /friend-requests/:id`
11. Confirm `apps/ios/Meeshy/Features/Main/Views/RootView.swift` has `.sheet(item: $router.deepLinkProfileUser)` and `.sheet(isPresented: $showSharePicker)` pattern for reference

---

## Task Group A: SDK Models + Services

### Task A1: Create ShareLinkModels in MeeshySDK

**Files**:
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/ShareLinkModels.swift`

**Why**: The gateway `GET /anonymous/link/:identifier` returns rich share link data including conversation info, creator info, and stats. We need Decodable models to parse this response.

**Code**:
```swift
import Foundation

// MARK: - Share Link API Models

public struct APIShareLinkConversation: Decodable {
    public let id: String
    public let title: String?
    public let description: String?
    public let type: String
    public let createdAt: Date
}

public struct APIShareLinkCreator: Decodable {
    public let id: String
    public let username: String
    public let firstName: String?
    public let lastName: String?
    public let displayName: String?
    public let avatar: String?

    public var name: String {
        displayName ?? [firstName, lastName].compactMap { $0 }.joined(separator: " ").isEmpty
            ? username
            : [firstName, lastName].compactMap { $0 }.joined(separator: " ")
    }
}

public struct APIShareLinkStats: Decodable {
    public let totalParticipants: Int
    public let memberCount: Int
    public let anonymousCount: Int
    public let languageCount: Int
    public let spokenLanguages: [String]
}

public struct APIShareLink: Decodable {
    public let id: String
    public let linkId: String
    public let name: String?
    public let description: String?
    public let expiresAt: Date?
    public let maxUses: Int?
    public let currentUses: Int
    public let maxConcurrentUsers: Int?
    public let currentConcurrentUsers: Int
    public let requireAccount: Bool
    public let requireNickname: Bool
    public let requireEmail: Bool
    public let requireBirthday: Bool
    public let allowedLanguages: [String]
    public let conversation: APIShareLinkConversation?
    public let creator: APIShareLinkCreator?
    public let stats: APIShareLinkStats?
}

// MARK: - Anonymous Join Request / Response

public struct AnonymousJoinRequest: Encodable {
    public let firstName: String
    public let lastName: String
    public let username: String?
    public let email: String?
    public let birthday: String?
    public let language: String
    public let deviceFingerprint: String?

    public init(firstName: String, lastName: String, username: String? = nil,
                email: String? = nil, birthday: String? = nil,
                language: String = "fr", deviceFingerprint: String? = nil) {
        self.firstName = firstName
        self.lastName = lastName
        self.username = username
        self.email = email
        self.birthday = birthday
        self.language = language
        self.deviceFingerprint = deviceFingerprint
    }
}

public struct AnonymousJoinParticipant: Decodable {
    public let id: String
    public let username: String
    public let firstName: String
    public let lastName: String
    public let language: String
    public let isMeeshyer: Bool
    public let canSendMessages: Bool
    public let canSendFiles: Bool
    public let canSendImages: Bool
}

public struct AnonymousJoinConversation: Decodable {
    public let id: String
    public let title: String?
    public let type: String
    public let allowViewHistory: Bool
}

public struct AnonymousJoinResponse: Decodable {
    public let sessionToken: String
    public let participant: AnonymousJoinParticipant
    public let conversation: AnonymousJoinConversation
    public let linkId: String
    public let id: String
}

// MARK: - Authenticated Join Response

public struct AuthenticatedJoinResponse: Decodable {
    public let message: String?
    public let conversationId: String
}

// MARK: - Create Share Link Request / Response

public struct CreateShareLinkRequest: Encodable {
    public let name: String?
    public let description: String?
    public let maxUses: Int?
    public let expiresAt: String?
    public let allowAnonymousMessages: Bool?
    public let requireNickname: Bool?
    public let requireEmail: Bool?

    public init(name: String? = nil, description: String? = nil, maxUses: Int? = nil,
                expiresAt: String? = nil, allowAnonymousMessages: Bool? = nil,
                requireNickname: Bool? = nil, requireEmail: Bool? = nil) {
        self.name = name
        self.description = description
        self.maxUses = maxUses
        self.expiresAt = expiresAt
        self.allowAnonymousMessages = allowAnonymousMessages
        self.requireNickname = requireNickname
        self.requireEmail = requireEmail
    }
}

public struct CreateShareLinkResponse: Decodable {
    public let link: String
    public let code: String
    public let shareLink: ShareLinkSummary
}

public struct ShareLinkSummary: Decodable {
    public let id: String
    public let linkId: String
    public let name: String?
    public let description: String?
    public let maxUses: Int?
    public let expiresAt: Date?
    public let allowAnonymousMessages: Bool
    public let allowAnonymousFiles: Bool
    public let allowAnonymousImages: Bool
    public let allowViewHistory: Bool
    public let requireNickname: Bool
    public let requireEmail: Bool
}
```

**Verification**: `./apps/ios/meeshy.sh build`
**Commit**: `feat(sdk): add ShareLinkModels for join flow and share link management`

---

### Task A2: Create ShareLinkService in MeeshySDK

**Files**:
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Services/ShareLinkService.swift`

**Why**: Service singleton to call gateway endpoints for link validation, anonymous join, authenticated join, and share link creation. Follows same pattern as `ConversationService.shared`.

**Code**:
```swift
import Foundation

public final class ShareLinkService {
    public static let shared = ShareLinkService()
    private init() {}
    private var api: APIClient { APIClient.shared }

    // MARK: - Link Validation

    /// Fetch share link info before joining (public endpoint, no auth required)
    public func getLinkInfo(identifier: String) async throws -> APIShareLink {
        let response: APIResponse<APIShareLink> = try await api.request(
            endpoint: "/anonymous/link/\(identifier)"
        )
        return response.data
    }

    // MARK: - Anonymous Join

    /// Join a conversation anonymously via share link
    public func joinAnonymously(linkId: String, request: AnonymousJoinRequest) async throws -> AnonymousJoinResponse {
        let response: APIResponse<AnonymousJoinResponse> = try await api.post(
            endpoint: "/anonymous/join/\(linkId)",
            body: request
        )
        return response.data
    }

    // MARK: - Authenticated Join

    /// Join a conversation as authenticated user via share link
    public func joinAsAuthenticated(linkId: String) async throws -> AuthenticatedJoinResponse {
        struct EmptyBody: Encodable {}
        let response: APIResponse<AuthenticatedJoinResponse> = try await api.post(
            endpoint: "/conversations/join/\(linkId)",
            body: EmptyBody()
        )
        return response.data
    }

    // MARK: - Create Share Link

    /// Create a new share link for a conversation (requires membership)
    public func createLink(conversationId: String, request: CreateShareLinkRequest) async throws -> CreateShareLinkResponse {
        let response: APIResponse<CreateShareLinkResponse> = try await api.post(
            endpoint: "/conversations/\(conversationId)/new-link",
            body: request
        )
        return response.data
    }

    // MARK: - List Share Links

    /// List share links for a conversation (member access)
    public func listLinks(conversationId: String) async throws -> [ShareLinkSummary] {
        let response: APIResponse<[ShareLinkSummary]> = try await api.request(
            endpoint: "/conversations/\(conversationId)/links"
        )
        return response.data
    }
}
```

**Verification**: `./apps/ios/meeshy.sh build`
**Commit**: `feat(sdk): add ShareLinkService for join flow and link management`

---

### Task A3: Create FriendModels in MeeshySDK

**Files**:
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/FriendModels.swift`

**Why**: The gateway has friend request CRUD endpoints. We need models to parse `GET /friend-requests/received` and `GET /friend-requests/sent` responses, and encode `POST /friend-requests` body.

**Code**:
```swift
import Foundation

// MARK: - Friend Request API Models

public struct APIFriendUser: Decodable {
    public let id: String
    public let username: String
    public let firstName: String?
    public let lastName: String?
    public let displayName: String?
    public let avatar: String?
    public let isOnline: Bool?
    public let lastActiveAt: Date?

    public var name: String {
        displayName ?? [firstName, lastName].compactMap { $0 }.joined(separator: " ").isEmpty
            ? username
            : [firstName, lastName].compactMap { $0 }.joined(separator: " ")
    }
}

public struct APIFriendRequest: Decodable, Identifiable {
    public let id: String
    public let senderId: String
    public let receiverId: String
    public let message: String?
    public let status: String
    public let sender: APIFriendUser?
    public let receiver: APIFriendUser?
    public let createdAt: Date
    public let updatedAt: Date?
}

// MARK: - Request Bodies

public struct CreateFriendRequestBody: Encodable {
    public let receiverId: String
    public let message: String?

    public init(receiverId: String, message: String? = nil) {
        self.receiverId = receiverId
        self.message = message
    }
}

public struct RespondFriendRequestBody: Encodable {
    public let status: String

    public init(accepted: Bool) {
        self.status = accepted ? "accepted" : "rejected"
    }
}
```

**Verification**: `./apps/ios/meeshy.sh build`
**Commit**: `feat(sdk): add FriendModels for friend request flow`

---

### Task A4: Create FriendService in MeeshySDK

**Files**:
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Services/FriendService.swift`

**Why**: Service singleton to call gateway friend request endpoints. Follows same pattern as `ConversationService.shared` and `UserService.shared`.

**Code**:
```swift
import Foundation

public final class FriendService {
    public static let shared = FriendService()
    private init() {}
    private var api: APIClient { APIClient.shared }

    // MARK: - Received Requests

    public func getReceivedRequests(offset: Int = 0, limit: Int = 20) async throws -> OffsetPaginatedAPIResponse<[APIFriendRequest]> {
        try await api.offsetPaginatedRequest(
            endpoint: "/friend-requests/received",
            offset: offset,
            limit: limit
        )
    }

    // MARK: - Sent Requests

    public func getSentRequests(offset: Int = 0, limit: Int = 20) async throws -> OffsetPaginatedAPIResponse<[APIFriendRequest]> {
        try await api.offsetPaginatedRequest(
            endpoint: "/friend-requests/sent",
            offset: offset,
            limit: limit
        )
    }

    // MARK: - Send Request

    public func sendRequest(to receiverId: String, message: String? = nil) async throws -> APIFriendRequest {
        let body = CreateFriendRequestBody(receiverId: receiverId, message: message)
        let response: APIResponse<APIFriendRequest> = try await api.post(
            endpoint: "/friend-requests",
            body: body
        )
        return response.data
    }

    // MARK: - Respond to Request

    public func respond(requestId: String, accept: Bool) async throws -> APIFriendRequest {
        let body = RespondFriendRequestBody(accepted: accept)
        let response: APIResponse<APIFriendRequest> = try await api.patch(
            endpoint: "/friend-requests/\(requestId)",
            body: body
        )
        return response.data
    }

    // MARK: - Delete Request

    public func deleteRequest(requestId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.delete(endpoint: "/friend-requests/\(requestId)")
    }
}
```

**Verification**: `./apps/ios/meeshy.sh build`
**Commit**: `feat(sdk): add FriendService for friend request CRUD`

---

### Task A5: Add leaveConversation to ConversationService

**Files**:
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift`

**Why**: The ConversationInfoSheet needs a "leave conversation" action. The gateway has `DELETE /conversations/:id` which the existing `delete` method calls, but we also need a "leave" action that removes the current user without deleting the conversation. We use `POST /conversations/:id/leave` if it exists, or the `DELETE /conversations/:id/members/me` pattern. Check the gateway for the actual endpoint.

**Steps**:
1. First verify which gateway endpoint handles "leave conversation" by checking `services/gateway/src/routes/conversations/` for a leave route
2. If no dedicated leave endpoint exists, use `DELETE /conversations/:conversationId` (which already exists in ConversationService) as the leave action for now -- the gateway already handles this correctly for non-admin users
3. Add `addParticipant` method for inviting users to conversations

Add these methods BEFORE the closing `}` of `ConversationService`:

```swift
    public func addParticipant(conversationId: String, userId: String) async throws {
        struct InviteBody: Encodable {
            let userId: String
        }
        let _: APIResponse<[String: String]> = try await api.post(
            endpoint: "/conversations/\(conversationId)/invite",
            body: InviteBody(userId: userId)
        )
    }
```

**Verification**: `./apps/ios/meeshy.sh build`
**Commit**: `feat(sdk): add addParticipant to ConversationService`

---

## Task Group B: MeeshyUI Join Flow Views

### Task B1: Create JoinFlowViewModel in MeeshyUI

**Files**:
- Create: `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinFlowViewModel.swift`

**Why**: ViewModel managing the join flow state: loading link info, form data for anonymous join, submit actions. Mirrors the web's `use-link-validation.ts` + `use-join-flow.ts` + `use-conversation-join.ts` hooks.

**Code**:
```swift
import SwiftUI
import MeeshySDK

@MainActor
public final class JoinFlowViewModel: ObservableObject {
    // MARK: - Link State

    @Published public var shareLink: APIShareLink?
    @Published public var isLoadingLink = false
    @Published public var linkError: String?

    // MARK: - Join State

    @Published public var isJoining = false
    @Published public var joinError: String?
    @Published public var joinedConversationId: String?

    // MARK: - Anonymous Form

    @Published public var firstName = ""
    @Published public var lastName = ""
    @Published public var username = ""
    @Published public var email = ""
    @Published public var birthday = Date()
    @Published public var language = "fr"
    @Published public var showAnonymousForm = false

    // MARK: - Computed

    public var isAuthenticated: Bool { AuthManager.shared.isAuthenticated }
    public var currentUser: MeeshyUser? { AuthManager.shared.currentUser }

    public var creatorName: String? {
        shareLink?.creator?.name
    }

    public var conversationTitle: String? {
        shareLink?.conversation?.title
    }

    public var conversationType: String? {
        shareLink?.conversation?.type
    }

    public var canSubmitAnonymous: Bool {
        let hasName = !firstName.trimmingCharacters(in: .whitespaces).isEmpty
            && !lastName.trimmingCharacters(in: .whitespaces).isEmpty

        let hasUsername = !(shareLink?.requireNickname ?? false) || !username.trimmingCharacters(in: .whitespaces).isEmpty
        let hasEmail = !(shareLink?.requireEmail ?? false) || !email.trimmingCharacters(in: .whitespaces).isEmpty

        return hasName && hasUsername && hasEmail && !isJoining
    }

    private let linkId: String

    // MARK: - Init

    public init(linkId: String) {
        self.linkId = linkId
    }

    // MARK: - Load Link Info

    public func loadLinkInfo() async {
        isLoadingLink = true
        linkError = nil

        do {
            shareLink = try await ShareLinkService.shared.getLinkInfo(identifier: linkId)
        } catch let error as MeeshyError {
            switch error {
            case .server(let code, let msg):
                if code == 404 { linkError = "Lien de conversation introuvable" }
                else if code == 410 { linkError = "Ce lien a expire ou n'est plus actif" }
                else { linkError = msg ?? "Erreur serveur" }
            default:
                linkError = error.localizedDescription
            }
        } catch {
            linkError = "Erreur lors du chargement du lien"
        }

        isLoadingLink = false
    }

    // MARK: - Join as Authenticated

    public func joinAsAuthenticated() async {
        isJoining = true
        joinError = nil

        do {
            let response = try await ShareLinkService.shared.joinAsAuthenticated(linkId: linkId)
            joinedConversationId = response.conversationId
        } catch let error as MeeshyError {
            switch error {
            case .server(_, let msg):
                joinError = msg ?? "Erreur lors de la jonction"
            default:
                joinError = error.localizedDescription
            }
        } catch {
            joinError = "Erreur lors de la jonction"
        }

        isJoining = false
    }

    // MARK: - Join Anonymously

    public func joinAnonymously() async {
        guard canSubmitAnonymous else { return }

        isJoining = true
        joinError = nil

        let generatedUsername = username.trimmingCharacters(in: .whitespaces).isEmpty
            ? generateUsername()
            : username.trimmingCharacters(in: .whitespaces)

        let request = AnonymousJoinRequest(
            firstName: firstName.trimmingCharacters(in: .whitespaces),
            lastName: lastName.trimmingCharacters(in: .whitespaces),
            username: generatedUsername,
            email: email.trimmingCharacters(in: .whitespaces).isEmpty ? nil : email.trimmingCharacters(in: .whitespaces),
            birthday: (shareLink?.requireBirthday ?? false) ? ISO8601DateFormatter().string(from: birthday) : nil,
            language: language,
            deviceFingerprint: UIDevice.current.identifierForVendor?.uuidString
        )

        do {
            let response = try await ShareLinkService.shared.joinAnonymously(linkId: linkId, request: request)
            joinedConversationId = response.conversation.id
        } catch let error as MeeshyError {
            switch error {
            case .server(let code, let msg):
                if code == 409 { joinError = "Ce nom d'utilisateur est deja pris" }
                else if code == 403 { joinError = "Un compte est requis pour rejoindre cette conversation" }
                else { joinError = msg ?? "Erreur lors de la connexion" }
            default:
                joinError = error.localizedDescription
            }
        } catch {
            joinError = "Erreur lors de la connexion"
        }

        isJoining = false
    }

    // MARK: - Username Generation

    private func generateUsername() -> String {
        let cleanFirst = firstName.lowercased().filter { $0.isLetter }
        let cleanLast = lastName.lowercased().filter { $0.isLetter }
        let suffix = String(format: "%03d", Int.random(in: 0...999))
        return "\(cleanFirst)_\(cleanLast)\(suffix)"
    }

    // MARK: - Auto-fill username

    public func autoFillUsername() {
        guard username.isEmpty, !firstName.isEmpty, !lastName.isEmpty else { return }
        username = generateUsername()
    }
}
```

**Verification**: `./apps/ios/meeshy.sh build`
**Commit**: `feat(ui): add JoinFlowViewModel for share link join flow`

---

### Task B2: Create JoinLinkPreviewView in MeeshyUI

**Files**:
- Create: `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinLinkPreviewView.swift`

**Why**: Rich preview card showing conversation info, creator, stats, member languages. Matches the web's `JoinHeader` + `JoinInfo` components.

**Code**:
```swift
import SwiftUI
import MeeshySDK

public struct JoinLinkPreviewView: View {
    let shareLink: APIShareLink
    @ObservedObject private var theme = ThemeManager.shared

    public init(shareLink: APIShareLink) {
        self.shareLink = shareLink
    }

    private var conversationTypeIcon: String {
        switch shareLink.conversation?.type?.lowercased() {
        case "group": return "person.3.fill"
        case "public", "global": return "globe"
        case "community": return "building.2.fill"
        default: return "bubble.left.and.bubble.right.fill"
        }
    }

    private var conversationTypeLabel: String {
        switch shareLink.conversation?.type?.lowercased() {
        case "group": return "Groupe"
        case "public": return "Public"
        case "global": return "Global"
        case "community": return "Communaute"
        default: return "Conversation"
        }
    }

    public var body: some View {
        VStack(spacing: 20) {
            conversationHeader
            statsRow
            if let description = shareLink.description ?? shareLink.conversation?.description, !description.isEmpty {
                descriptionSection(description)
            }
            if let languages = shareLink.stats?.spokenLanguages, !languages.isEmpty {
                languagesSection(languages)
            }
            creatorRow
        }
    }

    // MARK: - Conversation Header

    private var conversationHeader: some View {
        VStack(spacing: 12) {
            // Conversation type badge
            HStack(spacing: 6) {
                Image(systemName: conversationTypeIcon)
                    .font(.system(size: 12, weight: .semibold))
                Text(conversationTypeLabel)
                    .font(.system(size: 12, weight: .semibold))
            }
            .foregroundColor(Color(hex: "4ECDC4"))
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(
                Capsule().fill(Color(hex: "4ECDC4").opacity(theme.mode.isDark ? 0.15 : 0.10))
            )

            // Title
            Text(shareLink.conversation?.title ?? shareLink.name ?? "Conversation")
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)
                .lineLimit(3)
        }
    }

    // MARK: - Stats Row

    private var statsRow: some View {
        HStack(spacing: 24) {
            statItem(
                icon: "person.2.fill",
                value: "\(shareLink.stats?.totalParticipants ?? 0)",
                label: "Participants"
            )

            if let langCount = shareLink.stats?.languageCount, langCount > 0 {
                statItem(
                    icon: "globe",
                    value: "\(langCount)",
                    label: langCount == 1 ? "Langue" : "Langues"
                )
            }

            if let maxUses = shareLink.maxUses {
                statItem(
                    icon: "link",
                    value: "\(shareLink.currentUses)/\(maxUses)",
                    label: "Utilisations"
                )
            }
        }
    }

    private func statItem(icon: String, value: String, label: String) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Color(hex: "4ECDC4"))
                Text(value)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(theme.textPrimary)
            }
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
    }

    // MARK: - Description

    private func descriptionSection(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 14))
            .foregroundColor(theme.textSecondary)
            .multilineTextAlignment(.center)
            .lineLimit(4)
            .frame(maxWidth: .infinity)
    }

    // MARK: - Languages

    private func languagesSection(_ languages: [String]) -> some View {
        VStack(spacing: 6) {
            Text("Langues parlees")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(theme.textMuted)

            HStack(spacing: 6) {
                ForEach(languages.prefix(6), id: \.self) { lang in
                    Text(languageFlag(lang))
                        .font(.system(size: 20))
                }
                if languages.count > 6 {
                    Text("+\(languages.count - 6)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(theme.textMuted)
                }
            }
        }
    }

    // MARK: - Creator Row

    @ViewBuilder
    private var creatorRow: some View {
        if let creator = shareLink.creator {
            HStack(spacing: 8) {
                MeeshyAvatar(
                    name: creator.name,
                    size: .tiny,
                    accentColor: DynamicColorGenerator.colorForName(creator.name),
                    avatarURL: creator.avatar
                )

                Text("Cree par ")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(theme.textMuted)
                +
                Text(creator.name)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
            }
        }
    }

    // MARK: - Language Flag Helper

    private func languageFlag(_ code: String) -> String {
        let flagMap: [String: String] = [
            "fr": "\u{1F1EB}\u{1F1F7}", "en": "\u{1F1EC}\u{1F1E7}", "es": "\u{1F1EA}\u{1F1F8}",
            "de": "\u{1F1E9}\u{1F1EA}", "it": "\u{1F1EE}\u{1F1F9}", "pt": "\u{1F1F5}\u{1F1F9}",
            "ar": "\u{1F1F8}\u{1F1E6}", "zh": "\u{1F1E8}\u{1F1F3}", "ja": "\u{1F1EF}\u{1F1F5}",
            "ko": "\u{1F1F0}\u{1F1F7}", "ru": "\u{1F1F7}\u{1F1FA}", "hi": "\u{1F1EE}\u{1F1F3}",
            "tr": "\u{1F1F9}\u{1F1F7}", "nl": "\u{1F1F3}\u{1F1F1}", "pl": "\u{1F1F5}\u{1F1F1}",
        ]
        return flagMap[code.lowercased()] ?? "\u{1F310}"
    }
}
```

**Verification**: `./apps/ios/meeshy.sh build`
**Commit**: `feat(ui): add JoinLinkPreviewView for rich share link preview`

---

### Task B3: Create AnonymousJoinFormView in MeeshyUI

**Files**:
- Create: `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/AnonymousJoinFormView.swift`

**Why**: Form for anonymous users to enter their name, optional username, email, birthday, language. Reuses `AuthTextField` and `LanguageSelector` from existing MeeshyUI auth components. Mirrors web's `AnonymousForm` component.

**Code**:
```swift
import SwiftUI
import MeeshySDK

public struct AnonymousJoinFormView: View {
    @ObservedObject var viewModel: JoinFlowViewModel
    @ObservedObject private var theme = ThemeManager.shared
    @FocusState private var focusedField: Field?

    enum Field: Hashable {
        case firstName, lastName, username, email
    }

    public init(viewModel: JoinFlowViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            VStack(alignment: .leading, spacing: 6) {
                Text("Rejoindre en tant qu'invite")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)

                Text("Renseignez vos informations pour participer")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }

            // First name
            AuthTextField(
                title: "Prenom",
                icon: "person.fill",
                text: $viewModel.firstName,
                autocapitalization: .words
            )
            .focused($focusedField, equals: .firstName)

            // Last name
            AuthTextField(
                title: "Nom",
                icon: "person.fill",
                text: $viewModel.lastName,
                autocapitalization: .words
            )
            .focused($focusedField, equals: .lastName)
            .onChange(of: viewModel.lastName) { _ in
                viewModel.autoFillUsername()
            }

            // Username (conditional)
            if viewModel.shareLink?.requireNickname ?? true {
                AuthTextField(
                    title: "Nom d'utilisateur",
                    icon: "at",
                    text: $viewModel.username
                )
                .focused($focusedField, equals: .username)
            }

            // Email (conditional)
            if viewModel.shareLink?.requireEmail ?? false {
                AuthTextField(
                    title: "Email",
                    icon: "envelope.fill",
                    text: $viewModel.email,
                    keyboardType: .emailAddress
                )
                .focused($focusedField, equals: .email)
            }

            // Birthday (conditional)
            if viewModel.shareLink?.requireBirthday ?? false {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Date de naissance")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(theme.textMuted)

                    DatePicker(
                        "",
                        selection: $viewModel.birthday,
                        in: ...Calendar.current.date(byAdding: .year, value: -13, to: Date())!,
                        displayedComponents: .date
                    )
                    .datePickerStyle(.compact)
                    .labelsHidden()
                }
            }

            // Language selector
            LanguageSelector(title: "Langue preferee", selectedId: $viewModel.language)

            // Error
            if let error = viewModel.joinError {
                Text(error)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "EF4444"))
                    .padding(.horizontal, 4)
            }

            // Submit button
            Button {
                focusedField = nil
                Task { await viewModel.joinAnonymously() }
            } label: {
                HStack(spacing: 8) {
                    if viewModel.isJoining {
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(0.8)
                    } else {
                        Image(systemName: "arrow.right.circle.fill")
                            .font(.system(size: 16, weight: .semibold))
                        Text("Rejoindre")
                            .font(.system(size: 15, weight: .bold))
                    }
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    LinearGradient(
                        colors: [Color(hex: "4ECDC4"), Color(hex: "2ECC71")],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .disabled(!viewModel.canSubmitAnonymous)
            .opacity(viewModel.canSubmitAnonymous ? 1 : 0.5)

            // Back button
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    viewModel.showAnonymousForm = false
                }
            } label: {
                Text("Retour")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .frame(maxWidth: .infinity)
            }
        }
    }
}
```

**Verification**: `./apps/ios/meeshy.sh build`
**Commit**: `feat(ui): add AnonymousJoinFormView for anonymous join flow`

---

### Task B4: Create JoinFlowSheet in MeeshyUI

**Files**:
- Create: `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinFlowSheet.swift`

**Why**: Main sheet presented when a join link deep link is opened. Shows loading state, link preview, dual CTA (authenticated join / anonymous join), or anonymous form. Orchestrates the entire join flow. Mirrors the web `JoinConversationPage`.

**Code**:
```swift
import SwiftUI
import MeeshySDK

public struct JoinFlowSheet: View {
    @StateObject private var viewModel: JoinFlowViewModel
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    let onJoinedConversation: (String) -> Void

    public init(linkId: String, onJoinedConversation: @escaping (String) -> Void) {
        self._viewModel = StateObject(wrappedValue: JoinFlowViewModel(linkId: linkId))
        self.onJoinedConversation = onJoinedConversation
    }

    public var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundPrimary.ignoresSafeArea()

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 0) {
                        if viewModel.isLoadingLink {
                            loadingState
                        } else if let error = viewModel.linkError {
                            errorState(error)
                        } else if let shareLink = viewModel.shareLink {
                            linkContent(shareLink)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 40)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Text("Rejoindre")
                        .font(.system(size: 17, weight: .semibold, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(theme.textMuted)
                            .frame(width: 28, height: 28)
                            .background(Circle().fill(theme.textMuted.opacity(0.12)))
                    }
                    .accessibilityLabel("Fermer")
                }
            }
            .task {
                await viewModel.loadLinkInfo()
            }
            .onChange(of: viewModel.joinedConversationId) { _, conversationId in
                guard let conversationId else { return }
                HapticFeedback.success()
                dismiss()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    onJoinedConversation(conversationId)
                }
            }
        }
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(spacing: 16) {
            Spacer().frame(height: 60)
            ProgressView()
                .scaleEffect(1.2)
            Text("Chargement du lien...")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textMuted)
            Spacer().frame(height: 60)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Error State

    private func errorState(_ error: String) -> some View {
        VStack(spacing: 16) {
            Spacer().frame(height: 40)

            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 40))
                .foregroundColor(Color(hex: "F8B500"))

            Text(error)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)

            Button {
                dismiss()
            } label: {
                Text("Fermer")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(theme.textMuted)
            }

            Spacer().frame(height: 40)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Link Content

    private func linkContent(_ shareLink: APIShareLink) -> some View {
        VStack(spacing: 24) {
            JoinLinkPreviewView(shareLink: shareLink)

            Divider()
                .background(theme.textMuted.opacity(0.2))

            if viewModel.showAnonymousForm {
                AnonymousJoinFormView(viewModel: viewModel)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            } else {
                actionButtons(shareLink)
                    .transition(.move(edge: .leading).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: viewModel.showAnonymousForm)
    }

    // MARK: - Action Buttons

    private func actionButtons(_ shareLink: APIShareLink) -> some View {
        VStack(spacing: 12) {
            // Error display
            if let error = viewModel.joinError {
                Text(error)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "EF4444"))
            }

            if viewModel.isAuthenticated {
                // Authenticated user: single join button
                authenticatedJoinButton
            } else {
                // Not authenticated: show both options
                if !shareLink.requireAccount {
                    anonymousJoinButton
                }

                // Login prompt
                VStack(spacing: 8) {
                    if !shareLink.requireAccount {
                        dividerWithText("ou")
                    }

                    Text(shareLink.requireAccount
                         ? "Un compte Meeshy est requis pour rejoindre cette conversation"
                         : "Connectez-vous pour un acces complet")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .multilineTextAlignment(.center)

                    Button {
                        dismiss()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "person.fill")
                                .font(.system(size: 13, weight: .semibold))
                            Text("Se connecter / S'inscrire")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .foregroundColor(Color(hex: "9B59B6"))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(Color(hex: "9B59B6").opacity(0.4), lineWidth: 1.5)
                        )
                    }
                }
            }
        }
    }

    // MARK: - Authenticated Join Button

    private var authenticatedJoinButton: some View {
        Button {
            Task { await viewModel.joinAsAuthenticated() }
        } label: {
            HStack(spacing: 8) {
                if viewModel.isJoining {
                    ProgressView().tint(.white).scaleEffect(0.8)
                } else {
                    Image(systemName: "arrow.right.circle.fill")
                        .font(.system(size: 16, weight: .semibold))
                    Text("Rejoindre la conversation")
                        .font(.system(size: 15, weight: .bold))
                }
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                LinearGradient(
                    colors: [Color(hex: "4ECDC4"), Color(hex: "2ECC71")],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .disabled(viewModel.isJoining)
    }

    // MARK: - Anonymous Join Button

    private var anonymousJoinButton: some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                viewModel.showAnonymousForm = true
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "person.fill.questionmark")
                    .font(.system(size: 14, weight: .semibold))
                Text("Rejoindre en tant qu'invite")
                    .font(.system(size: 15, weight: .bold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                LinearGradient(
                    colors: [Color(hex: "4ECDC4"), Color(hex: "45B7D1")],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    // MARK: - Divider with Text

    private func dividerWithText(_ text: String) -> some View {
        HStack(spacing: 12) {
            Rectangle()
                .fill(theme.textMuted.opacity(0.2))
                .frame(height: 1)
            Text(text)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(theme.textMuted)
            Rectangle()
                .fill(theme.textMuted.opacity(0.2))
                .frame(height: 1)
        }
    }
}
```

**Verification**: `./apps/ios/meeshy.sh build`
**Commit**: `feat(ui): add JoinFlowSheet orchestrating the complete join flow`

---

## Task Group C: iOS App Integration

### Task C1: Extend DeepLinkDestination with joinLink case

**Files**:
- Modify: `apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift`

**Why**: Add a `.joinLink(linkId: String)` case to `DeepLinkDestination` so URLs like `meeshy.me/join/mshy_xxx` and `meeshy://join/mshy_xxx` are parsed correctly instead of falling through to `.external`.

**Steps**:

1. Add new case to `DeepLinkDestination` enum:
```swift
case joinLink(linkId: String)
```

2. In `parseCustomScheme(_:)`, add parsing for `meeshy://join/LINKID` BEFORE the `components.count >= 2` switch:
```swift
// meeshy://join/LINKID
if path == "join" || components.first == "join" {
    if components.count >= 2 {
        return .joinLink(linkId: components[1])
    }
}
```

3. In `parseMeeshyWeb(_:)`, add parsing for `https://meeshy.me/join/LINKID` BEFORE the `components.count >= 2` switch:
```swift
// https://meeshy.me/join/LINKID
if components.count >= 2, components[0] == "join" {
    return .joinLink(linkId: components[1])
}
```

**Verification**: `./apps/ios/meeshy.sh build`
**Commit**: `feat(ios): add joinLink destination to DeepLinkRouter`

---

### Task C2: Handle joinLink in Router

**Files**:
- Modify: `apps/ios/Meeshy/Features/Main/Navigation/Router.swift`

**Why**: When a `.joinLink` deep link is received, the Router needs to set state that triggers a JoinFlowSheet presentation.

**Steps**:

1. Add a published property for join link:
```swift
@Published var pendingJoinLinkId: String?
```

2. In `handleDeepLink(_:)`, add a case in the switch for `.joinLink`:
```swift
case .joinLink(let linkId):
    Self.logger.info("Deep link join link received: \(linkId)")
    pendingJoinLinkId = linkId
```

**Verification**: `./apps/ios/meeshy.sh build`
**Commit**: `feat(ios): handle joinLink deep links in Router`

---

### Task C3: Present JoinFlowSheet from RootView

**Files**:
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootView.swift`

**Why**: RootView needs to present the `JoinFlowSheet` when `router.pendingJoinLinkId` is set. On successful join, navigate to the conversation.

**Steps**:

1. Add a sheet modifier after the existing `.sheet(isPresented: $showSharePicker)` block:
```swift
.sheet(item: $router.pendingJoinLinkId) { linkId in
    JoinFlowSheet(linkId: linkId) { conversationId in
        Task { [weak router] in
            guard let router else { return }
            let currentUserId = AuthManager.shared.currentUser?.id ?? ""
            do {
                let apiConversation = try await ConversationService.shared.getById(conversationId)
                let conversation = apiConversation.toConversation(currentUserId: currentUserId)
                router.navigateToConversation(conversation)
            } catch {
                ToastManager.shared.showError("Impossible d'ouvrir la conversation")
            }
        }
    }
    .presentationDetents([.large])
}
```

2. Make `pendingJoinLinkId` work with `.sheet(item:)` by ensuring it conforms to `Identifiable`. Since `String` is not `Identifiable`, we need to either:
   - Change the type to an `Identifiable` wrapper, OR
   - Use `.sheet(isPresented:)` with a binding

**Better approach**: Change `pendingJoinLinkId` in Router to a wrapper type:

In `Router.swift`, add:
```swift
struct PendingJoinLink: Identifiable {
    let id: String
    var linkId: String { id }
}

@Published var pendingJoinLink: PendingJoinLink?
```

Then in `handleDeepLink`, set `pendingJoinLink = PendingJoinLink(id: linkId)`.

In `RootView.swift`:
```swift
.sheet(item: $router.pendingJoinLink) { joinLink in
    JoinFlowSheet(linkId: joinLink.linkId) { conversationId in
        // navigation callback as above
    }
    .presentationDetents([.large])
}
```

**Verification**: `./apps/ios/meeshy.sh build`
**Commit**: `feat(ios): present JoinFlowSheet from RootView on deep link`

---

### Task C4: Handle joinLink in MeeshyApp (unauthenticated)

**Files**:
- Modify: `apps/ios/Meeshy/MeeshyApp.swift`

**Why**: When the app receives a `/join/` deep link but the user is NOT authenticated, `MeeshyApp.handleAppLevelDeepLink` currently only handles `.magicLink`. We need to also handle `.joinLink` for unauthenticated users -- store the pending link ID and present the JoinFlowSheet at app level.

**Steps**:

1. Add state for pending join at app level:
```swift
@State private var pendingJoinLinkId: String?
```

2. Expand `handleAppLevelDeepLink` to also handle `.joinLink`:
```swift
private func handleAppLevelDeepLink(_ url: URL) {
    let destination = DeepLinkRouter.parse(url)
    switch destination {
    case .magicLink(let token):
        Task {
            await authManager.validateMagicLink(token: token)
            if authManager.isAuthenticated {
                toastManager.showSuccess("Connexion reussie !")
            } else {
                toastManager.showError(authManager.errorMessage ?? "Lien invalide ou expire")
            }
        }
    case .joinLink(let linkId):
        if authManager.isAuthenticated {
            // Let RootView handle it via Router
            return
        }
        pendingJoinLinkId = linkId
    default:
        break
    }
}
```

3. Add sheet modifier on the body for unauthenticated join:
```swift
.sheet(item: Binding(
    get: { pendingJoinLinkId.map { PendingJoinLink(id: $0) } },
    set: { pendingJoinLinkId = $0?.id }
)) { joinLink in
    JoinFlowSheet(linkId: joinLink.linkId) { _ in
        pendingJoinLinkId = nil
    }
    .presentationDetents([.large])
}
```

Note: Import the `PendingJoinLink` type from wherever it is defined (Router.swift or move to a shared location).

**Verification**: `./apps/ios/meeshy.sh build`
**Commit**: `feat(ios): handle join deep links for unauthenticated users in MeeshyApp`

---

### Task C5: Add conversation management actions to ConversationInfoSheet

**Files**:
- Modify: `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`

**Why**: The ConversationInfoSheet currently only has a "block user" button for DMs. We need to add: "Share link" (creates and shares an invite link), "Leave conversation" (for groups), and "Add participant" (for admins). These are critical conversation management features.

**Steps**:

1. Add new state vars:
```swift
@State private var showShareLinkSheet = false
@State private var isCreatingLink = false
@State private var createdShareLink: String?
@State private var showLeaveConfirm = false
@State private var isLeaving = false
@State private var showAddParticipant = false
```

2. Add action buttons section AFTER `conversationHeader` and BEFORE `blockUserButton`:
```swift
// Conversation actions (non-direct only)
if !isDirect {
    conversationActions
}
```

3. Implement the `conversationActions` computed property:
```swift
private var conversationActions: some View {
    VStack(spacing: 8) {
        // Share link button
        Button {
            HapticFeedback.light()
            createAndShareLink()
        } label: {
            HStack(spacing: 8) {
                if isCreatingLink {
                    ProgressView().tint(accent).scaleEffect(0.8)
                } else {
                    Image(systemName: "link.badge.plus")
                        .font(.system(size: 13, weight: .semibold))
                }
                Text("Partager un lien d'invitation")
                    .font(.system(size: 13, weight: .semibold))
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(theme.textMuted)
            }
            .foregroundColor(accent)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(accent.opacity(theme.mode.isDark ? 0.12 : 0.08))
            )
        }
        .disabled(isCreatingLink)

        // Leave conversation button
        Button {
            HapticFeedback.medium()
            showLeaveConfirm = true
        } label: {
            HStack(spacing: 8) {
                if isLeaving {
                    ProgressView().tint(Color(hex: "EF4444")).scaleEffect(0.8)
                } else {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .font(.system(size: 13, weight: .semibold))
                }
                Text("Quitter la conversation")
                    .font(.system(size: 13, weight: .semibold))
            }
            .foregroundColor(Color(hex: "EF4444"))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(hex: "EF4444").opacity(theme.mode.isDark ? 0.12 : 0.08))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color(hex: "EF4444").opacity(0.2), lineWidth: 1)
                    )
            )
        }
        .disabled(isLeaving)
    }
    .padding(.horizontal, 20)
    .padding(.bottom, 12)
    .alert("Quitter la conversation", isPresented: $showLeaveConfirm) {
        Button("Annuler", role: .cancel) { }
        Button("Quitter", role: .destructive) { leaveConversation() }
    } message: {
        Text("Vous ne recevrez plus de messages de cette conversation.")
    }
    .sheet(isPresented: $showShareLinkSheet) {
        if let link = createdShareLink {
            ShareLinkCopySheet(link: link, accent: accent)
        }
    }
}
```

4. Implement helper methods:
```swift
private func createAndShareLink() {
    isCreatingLink = true
    Task {
        do {
            let request = CreateShareLinkRequest(
                name: conversation.name,
                description: conversation.description
            )
            let response = try await ShareLinkService.shared.createLink(
                conversationId: conversation.id,
                request: request
            )
            createdShareLink = response.link
            showShareLinkSheet = true
            HapticFeedback.success()
        } catch {
            HapticFeedback.error()
            ToastManager.shared.showError("Impossible de creer le lien")
            Self.logger.error("Failed to create share link: \(error.localizedDescription)")
        }
        isCreatingLink = false
    }
}

private func leaveConversation() {
    isLeaving = true
    Task {
        do {
            try await ConversationService.shared.delete(conversationId: conversation.id)
            HapticFeedback.success()
            ToastManager.shared.showSuccess("Vous avez quitte la conversation")
            dismiss()
        } catch {
            HapticFeedback.error()
            ToastManager.shared.showError("Erreur lors de la sortie")
            Self.logger.error("Failed to leave conversation: \(error.localizedDescription)")
        }
        isLeaving = false
    }
}
```

5. Add a simple `ShareLinkCopySheet` at the bottom of the file:
```swift
private struct ShareLinkCopySheet: View {
    let link: String
    let accent: Color
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @State private var copied = false

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "link.circle.fill")
                .font(.system(size: 48))
                .foregroundColor(accent)

            Text("Lien d'invitation cree")
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Text(link)
                .font(.system(size: 13, weight: .medium, design: .monospaced))
                .foregroundColor(theme.textSecondary)
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(theme.inputBackground)
                )
                .lineLimit(2)

            HStack(spacing: 12) {
                Button {
                    UIPasteboard.general.string = link
                    copied = true
                    HapticFeedback.success()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { copied = false }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: copied ? "checkmark" : "doc.on.doc")
                        Text(copied ? "Copie !" : "Copier")
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .background(accent)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                ShareLink(item: link) {
                    HStack(spacing: 6) {
                        Image(systemName: "square.and.arrow.up")
                        Text("Partager")
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(accent)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .strokeBorder(accent.opacity(0.4), lineWidth: 1.5)
                    )
                }
            }

            Button("Fermer") { dismiss() }
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .padding(24)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }
}
```

**Note**: Add `import MeeshySDK` at the top of the file if not already present (it already is).

**Verification**: `./apps/ios/meeshy.sh build`
**Commit**: `feat(ios): add share link, leave, and management actions to ConversationInfoSheet`

---

## Task Group D: Friend Request UI

### Task D1: Create FriendRequestListView in iOS app

**Files**:
- Create: `apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift`

**Why**: A view to display pending friend requests (received), allowing users to accept or reject them. This is accessed from Settings or the notification bell.

**Code**:
```swift
import SwiftUI
import MeeshySDK
import os

struct FriendRequestListView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    @State private var receivedRequests: [APIFriendRequest] = []
    @State private var sentRequests: [APIFriendRequest] = []
    @State private var isLoading = true
    @State private var selectedTab: RequestTab = .received
    @State private var processingIds: Set<String> = []

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "friend-requests")

    enum RequestTab: String, CaseIterable {
        case received = "Recues"
        case sent = "Envoyees"
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            tabSelector
            content
        }
        .background(theme.backgroundPrimary.ignoresSafeArea())
        .task { await loadRequests() }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
            }
            .accessibilityLabel("Retour")

            Spacer()

            Text("Demandes d'ami")
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Color.clear.frame(width: 24, height: 24)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    // MARK: - Tab Selector

    private var tabSelector: some View {
        HStack(spacing: 0) {
            ForEach(RequestTab.allCases, id: \.self) { tab in
                let isSelected = selectedTab == tab
                let count = tab == .received ? receivedRequests.count : sentRequests.count

                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        selectedTab = tab
                    }
                    HapticFeedback.light()
                } label: {
                    VStack(spacing: 6) {
                        HStack(spacing: 4) {
                            Text(tab.rawValue)
                                .font(.system(size: 13, weight: isSelected ? .bold : .medium))

                            if count > 0 {
                                Text("\(count)")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(isSelected ? .white : theme.textMuted)
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 1)
                                    .background(
                                        Capsule().fill(isSelected ? Color(hex: "4ECDC4") : theme.textMuted.opacity(0.15))
                                    )
                            }
                        }
                        .foregroundColor(isSelected ? theme.textPrimary : theme.textMuted)

                        Rectangle()
                            .fill(isSelected ? Color(hex: "4ECDC4") : Color.clear)
                            .frame(height: 2)
                            .cornerRadius(1)
                    }
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 20)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if isLoading {
            VStack {
                Spacer()
                ProgressView()
                Spacer()
            }
        } else {
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    switch selectedTab {
                    case .received:
                        if receivedRequests.isEmpty {
                            emptyState(text: "Aucune demande recue")
                        } else {
                            ForEach(receivedRequests) { request in
                                receivedRequestRow(request)
                            }
                        }
                    case .sent:
                        if sentRequests.isEmpty {
                            emptyState(text: "Aucune demande envoyee")
                        } else {
                            ForEach(sentRequests) { request in
                                sentRequestRow(request)
                            }
                        }
                    }
                }
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
        }
    }

    // MARK: - Received Request Row

    private func receivedRequestRow(_ request: APIFriendRequest) -> some View {
        let sender = request.sender
        let name = sender?.name ?? "?"
        let color = DynamicColorGenerator.colorForName(name)
        let isProcessing = processingIds.contains(request.id)

        return HStack(spacing: 12) {
            MeeshyAvatar(
                name: name,
                size: .small,
                accentColor: color,
                avatarURL: sender?.avatar
            )

            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                if let username = sender?.username {
                    Text("@\(username)")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }

                if let message = request.message, !message.isEmpty {
                    Text(message)
                        .font(.system(size: 12))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(2)
                }
            }

            Spacer()

            if isProcessing {
                ProgressView().scaleEffect(0.8)
            } else {
                HStack(spacing: 8) {
                    Button {
                        respondToRequest(request, accept: true)
                    } label: {
                        Image(systemName: "checkmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 32, height: 32)
                            .background(Circle().fill(Color(hex: "2ECC71")))
                    }
                    .accessibilityLabel("Accepter la demande de \(name)")

                    Button {
                        respondToRequest(request, accept: false)
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 32, height: 32)
                            .background(Circle().fill(Color(hex: "EF4444")))
                    }
                    .accessibilityLabel("Refuser la demande de \(name)")
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }

    // MARK: - Sent Request Row

    private func sentRequestRow(_ request: APIFriendRequest) -> some View {
        let receiver = request.receiver
        let name = receiver?.name ?? "?"
        let color = DynamicColorGenerator.colorForName(name)
        let isProcessing = processingIds.contains(request.id)

        return HStack(spacing: 12) {
            MeeshyAvatar(
                name: name,
                size: .small,
                accentColor: color,
                avatarURL: receiver?.avatar
            )

            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                if let username = receiver?.username {
                    Text("@\(username)")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }

                Text("En attente...")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(Color(hex: "F8B500"))
            }

            Spacer()

            if isProcessing {
                ProgressView().scaleEffect(0.8)
            } else {
                Button {
                    cancelRequest(request)
                } label: {
                    Text("Annuler")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color(hex: "EF4444"))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .strokeBorder(Color(hex: "EF4444").opacity(0.4), lineWidth: 1)
                        )
                }
                .accessibilityLabel("Annuler la demande a \(name)")
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }

    // MARK: - Empty State

    private func emptyState(text: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "person.2.slash")
                .font(.system(size: 32, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))

            Text(text)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    // MARK: - Actions

    private func loadRequests() async {
        isLoading = true
        do {
            async let received = FriendService.shared.getReceivedRequests()
            async let sent = FriendService.shared.getSentRequests()

            let (receivedResponse, sentResponse) = await (try received, try sent)
            receivedRequests = receivedResponse.data
            sentRequests = sentResponse.data
        } catch {
            Self.logger.error("Failed to load friend requests: \(error.localizedDescription)")
        }
        isLoading = false
    }

    private func respondToRequest(_ request: APIFriendRequest, accept: Bool) {
        processingIds.insert(request.id)
        Task {
            do {
                _ = try await FriendService.shared.respond(requestId: request.id, accept: accept)
                receivedRequests.removeAll { $0.id == request.id }
                HapticFeedback.success()
                ToastManager.shared.showSuccess(accept ? "Demande acceptee" : "Demande refusee")
            } catch {
                HapticFeedback.error()
                ToastManager.shared.showError("Erreur lors du traitement")
                Self.logger.error("Failed to respond to friend request: \(error.localizedDescription)")
            }
            processingIds.remove(request.id)
        }
    }

    private func cancelRequest(_ request: APIFriendRequest) {
        processingIds.insert(request.id)
        Task {
            do {
                try await FriendService.shared.deleteRequest(requestId: request.id)
                sentRequests.removeAll { $0.id == request.id }
                HapticFeedback.success()
                ToastManager.shared.showSuccess("Demande annulee")
            } catch {
                HapticFeedback.error()
                ToastManager.shared.showError("Erreur lors de l'annulation")
                Self.logger.error("Failed to cancel friend request: \(error.localizedDescription)")
            }
            processingIds.remove(request.id)
        }
    }
}
```

**Verification**: `./apps/ios/meeshy.sh build`
**Commit**: `feat(ios): add FriendRequestListView with accept/reject/cancel actions`

---

### Task D2: Add Friend Requests entry in Settings/Menu

**Files**:
- Modify: `apps/ios/Meeshy/Features/Main/Views/SettingsView.swift` (or wherever the settings navigation is)

**Why**: Users need a way to access the friend request list. The natural place is in Settings under a "Friend Requests" row.

**Steps**:

1. Find the SettingsView file and locate where navigation links are listed
2. Add a NavigationLink or button that presents `FriendRequestListView`:

```swift
// In the appropriate section of SettingsView
NavigationLink {
    FriendRequestListView()
        .navigationBarHidden(true)
} label: {
    settingsRow(icon: "person.2.fill", color: "4ECDC4", title: "Demandes d'ami")
}
```

Note: The exact integration depends on the SettingsView structure. Check the file first and adapt accordingly.

**Verification**: `./apps/ios/meeshy.sh build`
**Commit**: `feat(ios): add friend requests entry in settings`

---

## Implementation Order & Dependency Graph

```
A1 (ShareLinkModels) ──┐
                        ├── A2 (ShareLinkService) ──┐
A3 (FriendModels) ──────┤                           │
                        ├── A4 (FriendService) ──────┤
A5 (ConversationService)┘                           │
                                                     │
B1 (JoinFlowViewModel) ─────────────────────────────┤
B2 (JoinLinkPreviewView) ───────────────────────────┤
B3 (AnonymousJoinFormView) ─────────────────────────┤
B4 (JoinFlowSheet) ─────────────────────────────────┤
         depends on B1, B2, B3                       │
                                                     │
C1 (DeepLinkRouter) ────────────────────────────────┤
C2 (Router) ── depends on C1 ──────────────────────-┤
C3 (RootView) ── depends on C2, B4 ────────────────┤
C4 (MeeshyApp) ── depends on C1, B4 ───────────────┤
C5 (ConversationInfoSheet) ── depends on A2, A5 ────┘

D1 (FriendRequestListView) ── depends on A3, A4
D2 (Settings integration) ── depends on D1
```

**Recommended execution order:**
1. A1 -> A2 -> A3 -> A4 -> A5 (SDK models + services, all independent)
2. B1 -> B2 -> B3 -> B4 (MeeshyUI views, B4 depends on B1-B3)
3. C1 -> C2 -> C3, C4 (iOS deep link integration)
4. C5 (ConversationInfoSheet management actions)
5. D1 -> D2 (Friend request UI)

**After each task**: `./apps/ios/meeshy.sh build` to verify compilation.

---

## API Endpoints Summary

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/anonymous/link/:identifier` | GET | None | Get share link preview info |
| `/anonymous/join/:linkId` | POST | None | Join anonymously |
| `/conversations/join/:linkId` | POST | JWT | Join as authenticated user |
| `/conversations/:id/new-link` | POST | JWT | Create share link |
| `/conversations/:id/links` | GET | JWT | List conversation share links |
| `/conversations/:id/invite` | POST | JWT | Invite user to conversation |
| `/conversations/:id` | DELETE | JWT | Leave/delete conversation |
| `/friend-requests` | POST | JWT | Send friend request |
| `/friend-requests/received` | GET | JWT | List received requests |
| `/friend-requests/sent` | GET | JWT | List sent requests |
| `/friend-requests/:id` | PATCH | JWT | Accept/reject request |
| `/friend-requests/:id` | DELETE | JWT | Cancel/delete request |
