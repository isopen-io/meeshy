# Plan 2 - Communities (Full Implementation)

**Date**: 2026-02-25
**Goal**: Restore and enhance the community backend routes, create SDK models + service, build community UI views in MeeshyUI, and integrate communities into the iOS app (menu, search, feed).
**Architecture**: Gateway REST API -> MeeshySDK models/service -> MeeshyUI views -> apps/ios integration
**Tech Stack**: TypeScript (Fastify + Prisma + Zod), Swift (MeeshySDK + MeeshyUI + SwiftUI)

---

## Coherence Checks (Agent MUST verify before starting)

1. Confirm `services/gateway/src/routes/communities.ts` does NOT exist (only `.backup` exists)
2. Confirm `server.ts` line 38 imports `{ communityRoutes } from './routes/communities'` and line 881 registers it
3. Confirm `packages/shared/types/community.ts` has `CommunityRole`, `Community`, `CommunityMember`, `CreateCommunityData`, `UpdateCommunityData`, `AddCommunityMemberData`, `UpdateMemberRoleData`
4. Confirm `packages/shared/types/api-schemas.ts` exports `communitySchema`, `communityMinimalSchema`, `communityMemberSchema`, `createCommunityRequestSchema`, `updateCommunityRequestSchema`, `errorResponseSchema`
5. Confirm `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift` has `MeeshyCommunity` (lines 206-241)
6. Confirm `apps/ios/Meeshy/Features/Main/Models/Conversation.swift` has `typealias Community = MeeshyCommunity`
7. Confirm `services/gateway/src/routes/community-preferences.ts` is already active and registered

---

## Task Group A: Backend -- Restore + Enhance Community Routes

### Task A1: Restore communities.ts from backup

**Files**:
- Create: `services/gateway/src/routes/communities.ts` (copy from `.backup`)

**Steps**:
1. Copy `services/gateway/src/routes/communities.ts.backup` to `services/gateway/src/routes/communities.ts`
2. Verify the file compiles by running `cd services/gateway && npx tsc --noEmit`
3. The backup already contains ALL of these endpoints:
   - `GET /communities/check-identifier/:identifier` -- check identifier availability
   - `GET /communities` -- list user communities (with search, pagination)
   - `GET /communities/search` -- search public communities
   - `GET /communities/:id` -- get by ID or identifier (with access control)
   - `POST /communities` -- create (auto-creates admin membership)
   - `GET /communities/:id/members` -- list members (paginated)
   - `POST /communities/:id/members` -- add member (admin only)
   - `PATCH /communities/:id/members/:memberId/role` -- update member role (admin only)
   - `DELETE /communities/:id/members/:memberId` -- remove member (admin only)
   - `PUT /communities/:id` -- update community (creator only)
   - `DELETE /communities/:id` -- delete community (creator only)
   - `GET /communities/:id/conversations` -- list community conversations

**Verification**: `cd services/gateway && npx tsc --noEmit` should pass without errors.

**Commit**: `feat(gateway): restore community CRUD routes from backup`

---

### Task A2: Add join/leave endpoints

**Files**:
- Modify: `services/gateway/src/routes/communities.ts`

**Steps**:

Add these two routes BEFORE the closing `}` of the `communityRoutes` function:

**POST /communities/:id/join**:
```typescript
// Self-join: any authenticated user can join a public community
fastify.post('/communities/:id/join', {
  onRequest: [fastify.authenticate],
  schema: {
    description: 'Join a public community. Private communities require an invitation.',
    tags: ['communities'],
    summary: 'Join a community',
    params: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', description: 'Community ID' } }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: communityMemberSchema
        }
      },
      401: { ...errorResponseSchema },
      403: { description: 'Community is private - invitation required', ...errorResponseSchema },
      404: { ...errorResponseSchema },
      409: { description: 'Already a member', ...errorResponseSchema },
      500: { ...errorResponseSchema }
    }
  }
}, async (request, reply) => {
  try {
    const { id } = request.params as { id: string };
    const authContext = (request as any).authContext;
    if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
      return reply.status(401).send({ success: false, error: 'User must be authenticated' });
    }
    const userId = authContext.userId;

    const community = await fastify.prisma.community.findFirst({
      where: { id },
      select: { id: true, isPrivate: true, isActive: true }
    });

    if (!community || !community.isActive) {
      return reply.status(404).send({ success: false, error: 'Community not found' });
    }

    if (community.isPrivate) {
      return reply.status(403).send({ success: false, error: 'This community is private. An invitation is required.' });
    }

    // Check if already a member
    const existingMember = await fastify.prisma.communityMember.findFirst({
      where: { communityId: id, userId, isActive: true }
    });

    if (existingMember) {
      return reply.status(409).send({ success: false, error: 'Already a member of this community' });
    }

    // Check for inactive membership (previously left) -- reactivate
    const inactiveMember = await fastify.prisma.communityMember.findFirst({
      where: { communityId: id, userId, isActive: false }
    });

    let member;
    if (inactiveMember) {
      member = await fastify.prisma.communityMember.update({
        where: { id: inactiveMember.id },
        data: { isActive: true, leftAt: null, role: 'member', joinedAt: new Date() },
        include: { user: { select: { id: true, username: true, displayName: true, avatar: true, isOnline: true } } }
      });
    } else {
      member = await fastify.prisma.communityMember.create({
        data: { communityId: id, userId, role: 'member' },
        include: { user: { select: { id: true, username: true, displayName: true, avatar: true, isOnline: true } } }
      });
    }

    reply.send({ success: true, data: member });
  } catch (error) {
    console.error('[COMMUNITIES] Error joining community:', error);
    reply.status(500).send({ success: false, error: 'Failed to join community' });
  }
});
```

**POST /communities/:id/leave**:
```typescript
// Self-leave: any member can leave (except sole admin)
fastify.post('/communities/:id/leave', {
  onRequest: [fastify.authenticate],
  schema: {
    description: 'Leave a community. The sole admin cannot leave without transferring ownership.',
    tags: ['communities'],
    summary: 'Leave a community',
    params: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', description: 'Community ID' } }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'object', properties: { message: { type: 'string' } } }
        }
      },
      401: { ...errorResponseSchema },
      403: { description: 'Cannot leave - sole admin must transfer ownership first', ...errorResponseSchema },
      404: { ...errorResponseSchema },
      500: { ...errorResponseSchema }
    }
  }
}, async (request, reply) => {
  try {
    const { id } = request.params as { id: string };
    const authContext = (request as any).authContext;
    if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
      return reply.status(401).send({ success: false, error: 'User must be authenticated' });
    }
    const userId = authContext.userId;

    const membership = await fastify.prisma.communityMember.findFirst({
      where: { communityId: id, userId, isActive: true }
    });

    if (!membership) {
      return reply.status(404).send({ success: false, error: 'Not a member of this community' });
    }

    // If admin, check there is at least one other admin
    if (membership.role === 'admin') {
      const otherAdmins = await fastify.prisma.communityMember.count({
        where: { communityId: id, role: 'admin', isActive: true, NOT: { userId } }
      });
      if (otherAdmins === 0) {
        return reply.status(403).send({
          success: false,
          error: 'You are the sole admin. Transfer admin role to another member before leaving.'
        });
      }
    }

    // Soft-leave: mark as inactive instead of deleting
    await fastify.prisma.communityMember.update({
      where: { id: membership.id },
      data: { isActive: false, leftAt: new Date() }
    });

    reply.send({ success: true, data: { message: 'Left community successfully' } });
  } catch (error) {
    console.error('[COMMUNITIES] Error leaving community:', error);
    reply.status(500).send({ success: false, error: 'Failed to leave community' });
  }
});
```

**Verification**: `cd services/gateway && npx tsc --noEmit`

**Commit**: `feat(gateway): add community join/leave endpoints`

---

### Task A3: Add community invite link endpoint

**Files**:
- Modify: `services/gateway/src/routes/communities.ts`

**Steps**:

Add this route. It reuses the `mshy_` identifier pattern from `services/gateway/src/routes/links/creation.ts` (line 12-16) but for community context:

```typescript
import { randomBytes } from 'crypto';

// POST /communities/:id/invite-link
fastify.post('/communities/:id/invite-link', {
  onRequest: [fastify.authenticate],
  schema: {
    description: 'Generate a shareable invite link for a community. Only admins and moderators can create invite links.',
    tags: ['communities'],
    summary: 'Generate community invite link',
    params: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', description: 'Community ID' } }
    },
    body: {
      type: 'object',
      properties: {
        expiresInHours: { type: 'number', default: 168, description: 'Link expiration in hours (default 7 days, max 720 = 30 days)' },
        maxUses: { type: 'number', default: 0, description: 'Max number of uses (0 = unlimited)' }
      }
    },
    response: {
      201: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              inviteCode: { type: 'string', description: 'Invite code (e.g., mshy_abc123)' },
              inviteUrl: { type: 'string', description: 'Full invite URL' },
              expiresAt: { type: 'string', format: 'date-time', nullable: true },
              maxUses: { type: 'number' },
              communityId: { type: 'string' }
            }
          }
        }
      },
      401: { ...errorResponseSchema },
      403: { ...errorResponseSchema },
      404: { ...errorResponseSchema },
      500: { ...errorResponseSchema }
    }
  }
}, async (request, reply) => {
  try {
    const { id } = request.params as { id: string };
    const { expiresInHours = 168, maxUses = 0 } = request.body as { expiresInHours?: number; maxUses?: number };

    const authContext = (request as any).authContext;
    if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
      return reply.status(401).send({ success: false, error: 'User must be authenticated' });
    }
    const userId = authContext.userId;

    // Verify membership with at least moderator role
    const membership = await fastify.prisma.communityMember.findFirst({
      where: { communityId: id, userId, isActive: true, role: { in: ['admin', 'moderator'] } }
    });

    if (!membership) {
      return reply.status(403).send({ success: false, error: 'Only admins and moderators can generate invite links' });
    }

    // Generate invite code
    const inviteCode = `mshy_${randomBytes(8).toString('hex')}`;
    const clampedHours = Math.min(Math.max(1, expiresInHours), 720);
    const expiresAt = new Date(Date.now() + clampedHours * 3600000);

    // Store as a community field or separate collection
    // For MVP, return the code directly (the join endpoint will accept invite codes later)
    // TODO: Create CommunityInvite model in schema.prisma for full tracking

    reply.status(201).send({
      success: true,
      data: {
        inviteCode,
        inviteUrl: `https://meeshy.me/invite/${inviteCode}`,
        expiresAt: expiresAt.toISOString(),
        maxUses,
        communityId: id
      }
    });
  } catch (error) {
    console.error('[COMMUNITIES] Error generating invite link:', error);
    reply.status(500).send({ success: false, error: 'Failed to generate invite link' });
  }
});
```

**Note**: This is an MVP invite link -- it generates a code that can be shared. A `CommunityInvite` Prisma model should be added later for persistence and tracking. For now, the code can be used as an identifier pattern similar to the existing `ConversationShareLink.linkId` pattern.

**Verification**: `cd services/gateway && npx tsc --noEmit`

**Commit**: `feat(gateway): add community invite link generation endpoint`

---

### Task A4: Verify server.ts route registration

**Files**:
- Verify (no modification needed): `services/gateway/src/server.ts`

**Steps**:
1. Confirm line 38: `import { communityRoutes } from './routes/communities';` -- this import now resolves because `communities.ts` exists
2. Confirm line 881: `await this.server.register(communityRoutes, { prefix: API_PREFIX });` -- routes registered at `/api/v1/communities/*`
3. Confirm line 57: `import communityPreferencesRoutes from './routes/community-preferences';` -- preferences routes separately registered
4. No changes needed to `server.ts` -- the import and registration are already present

**Verification**: Start gateway in dev mode (`cd services/gateway && npm run dev`) and verify `/api/v1/communities` returns 401 for unauthenticated requests.

**Commit**: N/A (verification only)

---

## Task Group B: MeeshySDK Models + Service

### Task B1: Create CommunityModels.swift

**Files**:
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/CommunityModels.swift`

**Steps**:

Create this file following the same patterns as `ConversationModels.swift` (Decodable structs with CodingKeys):

```swift
import Foundation

// MARK: - Community Role

public enum APICommunityRole: String, Codable, CaseIterable {
    case admin
    case moderator
    case member
}

// MARK: - API Community Member

public struct APICommunityMember: Decodable, Identifiable {
    public let id: String
    public let communityId: String
    public let userId: String
    public let role: String
    public let joinedAt: Date
    public let isActive: Bool?
    public let leftAt: Date?
    public let user: APICommunityUser?
}

public struct APICommunityUser: Decodable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
    public let isOnline: Bool?
    public let lastActiveAt: Date?

    public var name: String { displayName ?? username }
}

// MARK: - API Community Creator

public struct APICommunityCreator: Decodable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
}

// MARK: - API Community Count

public struct APICommunityCount: Decodable {
    public let members: Int?
    public let Conversation: Int?

    enum CodingKeys: String, CodingKey {
        case members
        case Conversation
    }

    public var conversations: Int { Conversation ?? 0 }
}

// MARK: - API Community

public struct APICommunity: Decodable, Identifiable {
    public let id: String
    public let identifier: String
    public let name: String
    public let description: String?
    public let avatar: String?
    public let banner: String?
    public let isPrivate: Bool
    public let isActive: Bool?
    public let createdBy: String
    public let createdAt: Date
    public let updatedAt: Date?
    public let creator: APICommunityCreator?
    public let members: [APICommunityMember]?
    public let _count: APICommunityCount?

    enum CodingKeys: String, CodingKey {
        case id, identifier, name, description, avatar, banner, isPrivate
        case isActive, createdBy, createdAt, updatedAt, creator, members
        case _count
    }

    public var memberCount: Int { _count?.members ?? members?.count ?? 0 }
    public var conversationCount: Int { _count?.conversations ?? 0 }
}

// MARK: - API -> Domain Conversion

extension APICommunity {
    public func toCommunity() -> MeeshyCommunity {
        MeeshyCommunity(
            id: id,
            identifier: identifier,
            name: name,
            description: description,
            avatar: avatar,
            banner: banner,
            isPrivate: isPrivate,
            isActive: isActive ?? true,
            createdBy: createdBy,
            createdAt: createdAt,
            updatedAt: updatedAt ?? createdAt,
            memberCount: memberCount,
            conversationCount: conversationCount
        )
    }
}

// MARK: - Request Models

public struct CreateCommunityRequest: Encodable {
    public let name: String
    public let identifier: String?
    public let description: String?
    public let avatar: String?
    public let isPrivate: Bool

    public init(name: String, identifier: String? = nil, description: String? = nil,
                avatar: String? = nil, isPrivate: Bool = true) {
        self.name = name
        self.identifier = identifier
        self.description = description
        self.avatar = avatar
        self.isPrivate = isPrivate
    }
}

public struct UpdateCommunityRequest: Encodable {
    public let name: String?
    public let identifier: String?
    public let description: String?
    public let avatar: String?
    public let isPrivate: Bool?

    public init(name: String? = nil, identifier: String? = nil, description: String? = nil,
                avatar: String? = nil, isPrivate: Bool? = nil) {
        self.name = name
        self.identifier = identifier
        self.description = description
        self.avatar = avatar
        self.isPrivate = isPrivate
    }
}

public struct AddMemberRequest: Encodable {
    public let userId: String
    public let role: String?

    public init(userId: String, role: String? = nil) {
        self.userId = userId
        self.role = role
    }
}

public struct UpdateMemberRoleRequest: Encodable {
    public let role: String

    public init(role: String) {
        self.role = role
    }
}

// MARK: - Invite Link Response

public struct CommunityInviteLink: Decodable {
    public let inviteCode: String
    public let inviteUrl: String
    public let expiresAt: Date?
    public let maxUses: Int
    public let communityId: String
}

// MARK: - Search Result (from /communities/search)

public struct APICommunitySearchResult: Decodable, Identifiable {
    public let id: String
    public let name: String
    public let identifier: String
    public let description: String?
    public let avatar: String?
    public let isPrivate: Bool
    public let memberCount: Int
    public let conversationCount: Int
    public let createdAt: Date
    public let creator: APICommunityCreator?
    public let members: [APICommunityMember]?
}
```

**Verification**: `cd packages/MeeshySDK && swift build`

**Commit**: `feat(sdk): add CommunityModels with API types and domain conversion`

---

### Task B2: Create CommunityService.swift

**Files**:
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Services/CommunityService.swift`

**Steps**:

Create this service following the singleton pattern from `ConversationService.swift` (line 3-4) and `PostService.swift` (line 3-4):

```swift
import Foundation

public final class CommunityService {
    public static let shared = CommunityService()
    private init() {}
    private var api: APIClient { APIClient.shared }

    // MARK: - CRUD

    public func list(search: String? = nil, offset: Int = 0, limit: Int = 20) async throws -> OffsetPaginatedAPIResponse<[APICommunity]> {
        var queryItems = [
            URLQueryItem(name: "offset", value: "\(offset)"),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]
        if let search, !search.isEmpty {
            queryItems.append(URLQueryItem(name: "search", value: search))
        }
        return try await api.request(endpoint: "/communities", queryItems: queryItems)
    }

    public func search(query: String, offset: Int = 0, limit: Int = 20) async throws -> OffsetPaginatedAPIResponse<[APICommunitySearchResult]> {
        let queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "offset", value: "\(offset)"),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]
        return try await api.request(endpoint: "/communities/search", queryItems: queryItems)
    }

    public func getById(_ id: String) async throws -> APICommunity {
        let response: APIResponse<APICommunity> = try await api.request(endpoint: "/communities/\(id)")
        return response.data
    }

    public func create(_ request: CreateCommunityRequest) async throws -> APICommunity {
        let response: APIResponse<APICommunity> = try await api.post(endpoint: "/communities", body: request)
        return response.data
    }

    public func update(communityId: String, _ request: UpdateCommunityRequest) async throws -> APICommunity {
        let response: APIResponse<APICommunity> = try await api.put(endpoint: "/communities/\(communityId)", body: request)
        return response.data
    }

    public func delete(communityId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/communities/\(communityId)")
    }

    // MARK: - Identifier

    public func checkIdentifier(_ identifier: String) async throws -> Bool {
        let response: APIResponse<IdentifierAvailability> = try await api.request(endpoint: "/communities/check-identifier/\(identifier)")
        return response.data.available
    }

    // MARK: - Members

    public func getMembers(communityId: String, offset: Int = 0, limit: Int = 20) async throws -> OffsetPaginatedAPIResponse<[APICommunityMember]> {
        let queryItems = [
            URLQueryItem(name: "offset", value: "\(offset)"),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]
        return try await api.request(endpoint: "/communities/\(communityId)/members", queryItems: queryItems)
    }

    public func addMember(communityId: String, userId: String, role: String? = nil) async throws -> APICommunityMember {
        let body = AddMemberRequest(userId: userId, role: role)
        let response: APIResponse<APICommunityMember> = try await api.post(endpoint: "/communities/\(communityId)/members", body: body)
        return response.data
    }

    public func removeMember(communityId: String, userId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/communities/\(communityId)/members/\(userId)")
    }

    public func updateMemberRole(communityId: String, memberId: String, role: String) async throws -> APICommunityMember {
        let body = UpdateMemberRoleRequest(role: role)
        let response: APIResponse<APICommunityMember> = try await api.patch(endpoint: "/communities/\(communityId)/members/\(memberId)/role", body: body)
        return response.data
    }

    // MARK: - Join / Leave

    public func join(communityId: String) async throws -> APICommunityMember {
        let response: APIResponse<APICommunityMember> = try await api.request(endpoint: "/communities/\(communityId)/join", method: "POST")
        return response.data
    }

    public func leave(communityId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/communities/\(communityId)/leave", method: "POST")
    }

    // MARK: - Conversations

    public func getConversations(communityId: String) async throws -> [APIConversation] {
        let response: APIResponse<[APIConversation]> = try await api.request(endpoint: "/communities/\(communityId)/conversations")
        return response.data
    }

    // MARK: - Invite Link

    public func generateInviteLink(communityId: String, expiresInHours: Int = 168, maxUses: Int = 0) async throws -> CommunityInviteLink {
        let body = InviteLinkRequest(expiresInHours: expiresInHours, maxUses: maxUses)
        let response: APIResponse<CommunityInviteLink> = try await api.post(endpoint: "/communities/\(communityId)/invite-link", body: body)
        return response.data
    }
}

// MARK: - Helper Types

private struct IdentifierAvailability: Decodable {
    let available: Bool
    let identifier: String
}

private struct InviteLinkRequest: Encodable {
    let expiresInHours: Int
    let maxUses: Int
}
```

**Verification**: `cd packages/MeeshySDK && swift build`

**Commit**: `feat(sdk): add CommunityService singleton with full CRUD, members, join/leave, invite`

---

## Task Group C: MeeshyUI Community Views

### Task C1: CommunityListView

**Files**:
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Communities/CommunityListView.swift`

**Steps**:

This view displays "My Communities" and "Discover" (public) sections. Uses `EmptyStateView` for empty state (pattern from `packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmptyStateView.swift`):

```swift
import SwiftUI
import MeeshySDK

public struct CommunityListView: View {
    @State private var myCommunities: [MeeshyCommunity] = []
    @State private var discoverCommunities: [APICommunitySearchResult] = []
    @State private var searchText = ""
    @State private var isLoading = true
    @State private var showCreateSheet = false
    @State private var errorMessage: String?

    @ObservedObject private var theme = ThemeManager.shared

    public var onSelectCommunity: ((MeeshyCommunity) -> Void)?

    public init(onSelectCommunity: ((MeeshyCommunity) -> Void)? = nil) {
        self.onSelectCommunity = onSelectCommunity
    }

    public var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                searchBar

                if isLoading {
                    SkeletonView(count: 5)
                } else if myCommunities.isEmpty && discoverCommunities.isEmpty {
                    Spacer()
                    EmptyStateView(
                        icon: "person.3.fill",
                        title: "Aucune communaute",
                        subtitle: "Rejoignez une communaute ou creez la votre",
                        actionTitle: "Creer une communaute",
                        action: { showCreateSheet = true }
                    )
                    Spacer()
                } else {
                    communityList
                }
            }
        }
        .task { await loadCommunities() }
        .sheet(isPresented: $showCreateSheet) {
            CommunityCreateView { newCommunity in
                myCommunities.insert(newCommunity, at: 0)
                showCreateSheet = false
            }
        }
        .onChange(of: searchText) { _, newValue in
            Task { await searchCommunities(query: newValue) }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text("Communautes")
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Button {
                HapticFeedback.light()
                showCreateSheet = true
            } label: {
                Image(systemName: "plus.circle.fill")
                    .font(.system(size: 24))
                    .foregroundStyle(MeeshyColors.cyan)
            }
            .accessibilityLabel("Creer une communaute")
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
    }

    // MARK: - Search

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(theme.textMuted)
            TextField("Rechercher...", text: $searchText)
                .font(.system(size: 15))
                .foregroundColor(theme.textPrimary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    // MARK: - List

    private var communityList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                if !myCommunities.isEmpty {
                    sectionHeader("Mes communautes", icon: "person.3.fill", color: "4ECDC4")
                    ForEach(myCommunities) { community in
                        communityRow(community)
                    }
                }

                if !discoverCommunities.isEmpty {
                    sectionHeader("Decouvrir", icon: "globe", color: "9B59B6")
                    ForEach(discoverCommunities) { result in
                        discoverRow(result)
                    }
                }
            }
            .padding(.bottom, 100)
        }
    }

    // MARK: - Rows

    private func communityRow(_ community: MeeshyCommunity) -> some View {
        Button {
            HapticFeedback.light()
            onSelectCommunity?(community)
        } label: {
            HStack(spacing: 12) {
                MeeshyAvatar(
                    url: community.avatar,
                    name: community.name,
                    size: 48
                )

                VStack(alignment: .leading, spacing: 2) {
                    Text(community.name)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    HStack(spacing: 4) {
                        Image(systemName: community.isPrivate ? "lock.fill" : "globe")
                            .font(.system(size: 10))
                        Text("\(community.memberCount) membres")
                            .font(.system(size: 13))
                    }
                    .foregroundColor(theme.textMuted)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(theme.textMuted)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
    }

    // Similar discoverRow, sectionHeader...

    // MARK: - Data Loading

    private func loadCommunities() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await CommunityService.shared.list()
            myCommunities = response.data.map { $0.toCommunity() }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func searchCommunities(query: String) async {
        guard query.count >= 2 else {
            discoverCommunities = []
            return
        }
        do {
            let response = try await CommunityService.shared.search(query: query)
            discoverCommunities = response.data
        } catch {
            // Silent fail for search
        }
    }
}
```

**Verification**: `cd packages/MeeshySDK && swift build`

**Commit**: `feat(ui): add CommunityListView with search, my/discover sections, empty state`

---

### Task C2: CommunityDetailView

**Files**:
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Communities/CommunityDetailView.swift`

**Steps**:

A view showing community header (banner, avatar, name, description, member count) and tabs (Conversations, Members). Pattern follows the existing info sheet patterns in the app.

Key elements:
- Banner image at top (or gradient fallback)
- Avatar overlapping banner bottom
- Name, description, member count
- Join/Leave button (contextual based on membership)
- Tab bar: Conversations | Members
- Conversations tab: list of `APIConversation` from `CommunityService.shared.getConversations`
- Members tab: list of `APICommunityMember` from `CommunityService.shared.getMembers`
- Settings gear icon (navigates to CommunitySettingsView if admin)

```swift
import SwiftUI
import MeeshySDK

public struct CommunityDetailView: View {
    let communityId: String
    var onSelectConversation: ((APIConversation) -> Void)?

    @State private var community: APICommunity?
    @State private var conversations: [APIConversation] = []
    @State private var members: [APICommunityMember] = []
    @State private var selectedTab = 0 // 0=conversations, 1=members
    @State private var isLoading = true
    @State private var isMember = false
    @State private var currentUserRole: String?
    @State private var showSettings = false

    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    public init(communityId: String, onSelectConversation: ((APIConversation) -> Void)? = nil) {
        self.communityId = communityId
        self.onSelectConversation = onSelectConversation
    }

    public var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            if isLoading {
                ProgressView()
            } else if let community {
                ScrollView {
                    VStack(spacing: 0) {
                        bannerHeader(community)
                        infoSection(community)
                        tabBar
                        tabContent
                    }
                }
            }
        }
        .task { await loadCommunity() }
        .sheet(isPresented: $showSettings) {
            if let community {
                CommunitySettingsView(community: community)
            }
        }
    }

    // Banner, info, tabs implementation...
    // Join button calls CommunityService.shared.join(communityId:)
    // Leave in settings calls CommunityService.shared.leave(communityId:)
}
```

**Verification**: `cd packages/MeeshySDK && swift build`

**Commit**: `feat(ui): add CommunityDetailView with banner, tabs, join/leave`

---

### Task C3: CommunityCreateView

**Files**:
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Communities/CommunityCreateView.swift`

**Steps**:

Form with: name, description, identifier (optional), privacy toggle. Follows `NewConversationView.swift` pattern for form layout:

```swift
import SwiftUI
import MeeshySDK

public struct CommunityCreateView: View {
    var onCreated: ((MeeshyCommunity) -> Void)?

    @State private var name = ""
    @State private var description = ""
    @State private var customIdentifier = ""
    @State private var isPrivate = true
    @State private var isCreating = false
    @State private var errorMessage: String?
    @State private var identifierAvailable: Bool?

    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    public init(onCreated: ((MeeshyCommunity) -> Void)? = nil) {
        self.onCreated = onCreated
    }

    public var body: some View {
        NavigationView {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 20) {
                        // Name field (required)
                        formField(title: "Nom", text: $name, placeholder: "Ma communaute")

                        // Description field
                        formField(title: "Description", text: $description, placeholder: "Decrivez votre communaute...", isMultiline: true)

                        // Identifier field (optional)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Identifiant (optionnel)")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(theme.textMuted)
                            TextField("mon-identifiant", text: $customIdentifier)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .onChange(of: customIdentifier) { _, val in
                                    Task { await checkIdentifier(val) }
                                }
                            if let available = identifierAvailable {
                                Text(available ? "Disponible" : "Deja pris")
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundColor(available ? .green : .red)
                            }
                        }
                        .padding(.horizontal, 16)

                        // Privacy toggle
                        Toggle(isOn: $isPrivate) {
                            HStack {
                                Image(systemName: isPrivate ? "lock.fill" : "globe")
                                Text(isPrivate ? "Communaute privee" : "Communaute publique")
                            }
                            .foregroundColor(theme.textPrimary)
                        }
                        .tint(MeeshyColors.cyan)
                        .padding(.horizontal, 16)

                        // Error
                        if let error = errorMessage {
                            Text(error)
                                .font(.system(size: 13))
                                .foregroundColor(.red)
                        }

                        // Create button
                        Button {
                            Task { await createCommunity() }
                        } label: {
                            HStack {
                                if isCreating {
                                    ProgressView().tint(.white)
                                } else {
                                    Text("Creer la communaute")
                                        .font(.system(size: 16, weight: .bold))
                                }
                            }
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Capsule().fill(MeeshyColors.cyan))
                        }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isCreating)
                        .padding(.horizontal, 16)
                    }
                    .padding(.top, 20)
                }
            }
            .navigationTitle("Nouvelle communaute")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Annuler") { dismiss() }
                }
            }
        }
    }

    private func createCommunity() async {
        isCreating = true
        defer { isCreating = false }
        do {
            let request = CreateCommunityRequest(
                name: name.trimmingCharacters(in: .whitespaces),
                identifier: customIdentifier.isEmpty ? nil : customIdentifier,
                description: description.isEmpty ? nil : description,
                isPrivate: isPrivate
            )
            let apiCommunity = try await CommunityService.shared.create(request)
            onCreated?(apiCommunity.toCommunity())
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func checkIdentifier(_ value: String) async {
        guard value.count >= 3 else { identifierAvailable = nil; return }
        identifierAvailable = try? await CommunityService.shared.checkIdentifier("mshy_\(value)")
    }

    private func formField(title: String, text: Binding<String>, placeholder: String, isMultiline: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textMuted)
            if isMultiline {
                TextEditor(text: text)
                    .frame(minHeight: 80)
                    .scrollContentBackground(.hidden)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10))
            } else {
                TextField(placeholder, text: text)
                    .padding(10)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10))
            }
        }
        .padding(.horizontal, 16)
    }
}
```

**Verification**: `cd packages/MeeshySDK && swift build`

**Commit**: `feat(ui): add CommunityCreateView with form, identifier check, privacy toggle`

---

### Task C4: CommunitySettingsView

**Files**:
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Communities/CommunitySettingsView.swift`

**Steps**:

Settings view for a community. Shows: edit info (admin), notification preferences, leave, delete (admin only). Pattern follows `SettingsView.swift` (settingsSection/settingsRow pattern):

```swift
import SwiftUI
import MeeshySDK

public struct CommunitySettingsView: View {
    let community: APICommunity

    @State private var showDeleteConfirm = false
    @State private var showLeaveConfirm = false
    @State private var isPerformingAction = false
    @State private var showEditSheet = false
    @State private var showInviteSheet = false

    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    private var isAdmin: Bool {
        // Check if current user is admin
        community.members?.contains(where: {
            $0.userId == AuthManager.shared.currentUserId && $0.role == "admin"
        }) ?? false
    }

    public init(community: APICommunity) {
        self.community = community
    }

    public var body: some View {
        NavigationView {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 16) {
                        // Admin section
                        if isAdmin {
                            adminSection
                        }

                        // Invite section
                        inviteSection

                        // Notifications section
                        notificationsSection

                        // Danger zone
                        dangerSection
                    }
                    .padding(.top, 16)
                }
            }
            .navigationTitle("Parametres")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Fermer") { dismiss() }
                }
            }
        }
        .alert("Supprimer la communaute ?", isPresented: $showDeleteConfirm) {
            Button("Supprimer", role: .destructive) { Task { await deleteCommunity() } }
            Button("Annuler", role: .cancel) {}
        }
        .alert("Quitter la communaute ?", isPresented: $showLeaveConfirm) {
            Button("Quitter", role: .destructive) { Task { await leaveCommunity() } }
            Button("Annuler", role: .cancel) {}
        }
        .sheet(isPresented: $showInviteSheet) {
            CommunityInviteView(communityId: community.id)
        }
    }

    // Sections: adminSection (edit), inviteSection, notificationsSection, dangerSection (leave/delete)
    // Each section uses settingsSection/settingsRow pattern
}
```

**Verification**: `cd packages/MeeshySDK && swift build`

**Commit**: `feat(ui): add CommunitySettingsView with admin edit, invite, leave, delete`

---

### Task C5: CommunityMembersView

**Files**:
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Communities/CommunityMembersView.swift`

**Steps**:

List of members with role badges and admin actions. Pattern follows `ParticipantsView` / `BlockedUsersView` patterns:

```swift
import SwiftUI
import MeeshySDK

public struct CommunityMembersView: View {
    let communityId: String
    let isAdmin: Bool

    @State private var members: [APICommunityMember] = []
    @State private var isLoading = true
    @State private var selectedMember: APICommunityMember?
    @State private var showRoleSheet = false

    @ObservedObject private var theme = ThemeManager.shared

    public init(communityId: String, isAdmin: Bool = false) {
        self.communityId = communityId
        self.isAdmin = isAdmin
    }

    public var body: some View {
        // ScrollView with LazyVStack
        // Each row: Avatar + Username + Role badge (admin=purple, moderator=blue, member=gray)
        // Admin: long press context menu with promote/demote/remove options
        // Calls CommunityService.shared.updateMemberRole / removeMember
    }
}
```

**Verification**: `cd packages/MeeshySDK && swift build`

**Commit**: `feat(ui): add CommunityMembersView with role badges and admin actions`

---

### Task C6: CommunityInviteView

**Files**:
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Communities/CommunityInviteView.swift`

**Steps**:

Generate invite link and show share sheet:

```swift
import SwiftUI
import MeeshySDK

public struct CommunityInviteView: View {
    let communityId: String

    @State private var inviteLink: CommunityInviteLink?
    @State private var isGenerating = false
    @State private var showShareSheet = false

    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    public init(communityId: String) {
        self.communityId = communityId
    }

    public var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                // Icon
                Image(systemName: "link.badge.plus")
                    .font(.system(size: 48, weight: .light))
                    .foregroundStyle(MeeshyColors.cyan.opacity(0.5))

                if let link = inviteLink {
                    // Show invite URL with copy button
                    Text(link.inviteUrl)
                        .font(.system(size: 14, weight: .medium, design: .monospaced))
                        .padding(12)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10))

                    // Copy button
                    Button {
                        UIPasteboard.general.string = link.inviteUrl
                        HapticFeedback.success()
                    } label: {
                        Label("Copier le lien", systemImage: "doc.on.doc")
                    }

                    // Share button
                    Button {
                        showShareSheet = true
                    } label: {
                        Label("Partager", systemImage: "square.and.arrow.up")
                    }
                } else {
                    // Generate button
                    Button {
                        Task { await generateLink() }
                    } label: {
                        if isGenerating {
                            ProgressView().tint(.white)
                        } else {
                            Text("Generer un lien d'invitation")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(MeeshyColors.cyan)
                }
            }
            .padding()
            .navigationTitle("Inviter des membres")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Fermer") { dismiss() }
                }
            }
            .sheet(isPresented: $showShareSheet) {
                if let url = inviteLink?.inviteUrl {
                    ShareSheet(activityItems: [url])
                }
            }
        }
    }

    private func generateLink() async {
        isGenerating = true
        defer { isGenerating = false }
        inviteLink = try? await CommunityService.shared.generateInviteLink(communityId: communityId)
    }
}

// Simple UIActivityViewController wrapper
struct ShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
```

**Verification**: `cd packages/MeeshySDK && swift build`

**Commit**: `feat(ui): add CommunityInviteView with link generation and share sheet`

---

## Task Group D: iOS App Integration

### Task D1: Add "Nouvelle communaute" to menu ladder

**Files**:
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootView.swift`

**Steps**:

In the `menuLadder` computed property (around line 400), the `menuItems` array currently has 6 entries. Add a community entry between the `plus.message.fill` and `link.badge.plus` items:

Current (line 400-410):
```swift
let menuItems: [(icon: String, color: String, action: () -> Void)] = [
    ("person.fill", "9B59B6", { ... router.push(.profile) }),
    ("plus.message.fill", "4ECDC4", { ... router.push(.newConversation) }),
    ("link.badge.plus", "F8B500", { ... }),
    ("bell.fill", "FF6B6B", { ... }),
    (theme.preference.icon, theme.preference.tintColor, { ... }),
    ("gearshape.fill", "45B7D1", { ... router.push(.settings) })
]
```

Add after `plus.message.fill` entry:
```swift
("person.3.fill", "2ECC71", {
    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }
    showCommunityList = true
}),
```

Also add the state variable and sheet:
```swift
@State private var showCommunityList = false
```

And the sheet modifier:
```swift
.sheet(isPresented: $showCommunityList) {
    CommunityListView { community in
        showCommunityList = false
        // Navigate to community detail (handled in D4)
    }
}
```

**Verification**: `./apps/ios/meeshy.sh build`

**Commit**: `feat(ios): add communities entry to floating menu ladder`

---

### Task D2: Add Route.community to Router

**Files**:
- Modify: `apps/ios/Meeshy/Features/Main/Navigation/Router.swift`

**Steps**:

1. Add `case community(MeeshyCommunity)` to the `Route` enum (line 6-11):

```swift
enum Route: Hashable {
    case conversation(Conversation)
    case settings
    case profile
    case newConversation
    case community(Community) // Add this
}
```

Note: `Community` is already a typealias for `MeeshyCommunity` in `Conversation.swift`.

However, `MeeshyCommunity` does not conform to `Hashable` via the default memberwise approach (it has Date fields). Looking at `CoreModels.swift` line 206, `MeeshyCommunity` is already declared as `Hashable` but we need to verify the `hash(into:)` and `==` implementations. It has a manual `init` but no custom `Hashable`. Since the struct has all `Hashable` properties (String, Int, Date, Bool, Optional of those), Swift should auto-synthesize `Hashable`.

2. Add the navigation destination in `RootView.swift` inside the `.navigationDestination(for: Route.self)` block:

```swift
case .community(let community):
    CommunityDetailView(communityId: community.id) { conversation in
        // When a conversation is selected inside the community
        // Navigate to it
    }
    .navigationBarHidden(true)
```

**Verification**: `./apps/ios/meeshy.sh build`

**Commit**: `feat(ios): add community route to navigation system`

---

### Task D3: GlobalSearchViewModel -- communities tab

**Files**:
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/GlobalSearchView.swift`

**Steps**:

1. Add `communities` to the `SearchTab` enum:
```swift
enum SearchTab: String, CaseIterable, Identifiable {
    case messages = "Messages"
    case conversations = "Conversations"
    case communities = "Communautes"
    case users = "Utilisateurs"

    // Update localizedName and icon
    var localizedName: String {
        switch self {
        // ...existing cases...
        case .communities: return String(localized: "tab.communities", defaultValue: "Communautes")
        }
    }

    var icon: String {
        switch self {
        // ...existing cases...
        case .communities: return "person.3.fill"
        }
    }
}
```

2. Add community results to the ViewModel:
```swift
@Published var communityResults: [APICommunitySearchResult] = []
```

3. In the search method, add community search:
```swift
// Add alongside existing search calls
if selectedTab == .communities || searchText.count >= 2 {
    let communityResponse = try await CommunityService.shared.search(query: searchText)
    communityResults = communityResponse.data
}
```

4. In `GlobalSearchView.swift`, add the community results tab content with community rows, and a "See all" button that presents `CommunityListView`.

**Verification**: `./apps/ios/meeshy.sh build`

**Commit**: `feat(ios): add communities tab to global search`

---

### Task D4: FeedView community filter

**Files**:
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView.swift`

**Steps**:

The `Post` model already has `visibility: PostVisibility` including `COMMUNITY` and `communityId: String?`. The FeedView should support filtering by community:

1. Add a community filter chip to the FeedView filter bar (if one exists)
2. When `visibility == .COMMUNITY`, show the community name badge on the post
3. Tapping the community badge navigates to the community detail

This is a lightweight integration -- the Post model and PostService already handle community-scoped posts. The change is purely UI: add a filter option and display context.

**Verification**: `./apps/ios/meeshy.sh build`

**Commit**: `feat(ios): add community filter and badge to FeedView`

---

### Task D5: Deep link handling for community URLs

**Files**:
- Modify: `apps/ios/Meeshy/Features/Main/Navigation/Router.swift`

**Steps**:

In `DeepLinkRouter` (or wherever deep links are parsed), add handling for:
- `meeshy://community/{id}` -- navigate to community detail
- `https://meeshy.me/invite/{code}` -- join via invite link

Add to the `handleDeepLink` method:
```swift
case .community(let id):
    Task { [weak self] in
        await self?.handleCommunityDeepLink(id)
    }
```

And the handler:
```swift
func handleCommunityDeepLink(_ id: String) async {
    do {
        let apiCommunity = try await CommunityService.shared.getById(id)
        let community = apiCommunity.toCommunity()
        await MainActor.run {
            popToRoot()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                self.push(.community(community))
            }
        }
    } catch {
        Self.logger.error("Failed to load community from deep link: \(error)")
    }
}
```

**Verification**: `./apps/ios/meeshy.sh build`

**Commit**: `feat(ios): add community deep link handling`

---

## Build Verification Sequence

After ALL tasks are complete, run this full verification:

1. `cd services/gateway && npx tsc --noEmit` -- gateway compiles
2. `cd packages/MeeshySDK && swift build` -- SDK compiles
3. `./apps/ios/meeshy.sh build` -- full iOS app compiles
4. Start gateway dev server, verify these endpoints with test credentials:
   - `GET /api/v1/communities` returns 200 with empty array or communities
   - `POST /api/v1/communities` creates a community
   - `POST /api/v1/communities/{id}/join` joins a public community
   - `POST /api/v1/communities/{id}/leave` leaves a community
   - `POST /api/v1/communities/{id}/invite-link` generates an invite link

---

## File Summary

| File | Action | Task |
|------|--------|------|
| `services/gateway/src/routes/communities.ts` | Create (from backup) | A1 |
| `services/gateway/src/routes/communities.ts` | Modify (add join/leave) | A2 |
| `services/gateway/src/routes/communities.ts` | Modify (add invite-link) | A3 |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/CommunityModels.swift` | Create | B1 |
| `packages/MeeshySDK/Sources/MeeshySDK/Services/CommunityService.swift` | Create | B2 |
| `packages/MeeshySDK/Sources/MeeshyUI/Communities/CommunityListView.swift` | Create | C1 |
| `packages/MeeshySDK/Sources/MeeshyUI/Communities/CommunityDetailView.swift` | Create | C2 |
| `packages/MeeshySDK/Sources/MeeshyUI/Communities/CommunityCreateView.swift` | Create | C3 |
| `packages/MeeshySDK/Sources/MeeshyUI/Communities/CommunitySettingsView.swift` | Create | C4 |
| `packages/MeeshySDK/Sources/MeeshyUI/Communities/CommunityMembersView.swift` | Create | C5 |
| `packages/MeeshySDK/Sources/MeeshyUI/Communities/CommunityInviteView.swift` | Create | C6 |
| `apps/ios/Meeshy/Features/Main/Views/RootView.swift` | Modify | D1 |
| `apps/ios/Meeshy/Features/Main/Navigation/Router.swift` | Modify | D2, D5 |
| `apps/ios/Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift` | Modify | D3 |
| `apps/ios/Meeshy/Features/Main/Views/GlobalSearchView.swift` | Modify | D3 |
| `apps/ios/Meeshy/Features/Main/Views/FeedView.swift` | Modify | D4 |

---

## Dependencies Between Tasks

```
A1 ──> A2 ──> A3
       (A1 must be done first, then join/leave, then invite)

B1 ──> B2
       (Models must exist before Service uses them)

B2 ──> C1 ──> C2
       B2 ──> C3
       B2 ──> C4
       B2 ──> C5
       B2 ──> C6
       (All views depend on CommunityService)

C1 + C2 ──> D1 ──> D2
                    D2 ──> D3
                    D2 ──> D4
                    D2 ──> D5
       (App integration needs the views and router to exist)
```

Optimal execution order: A1 -> A2 -> A3 -> B1 -> B2 -> C1 -> C2 -> C3 -> C4 -> C5 -> C6 -> D1 -> D2 -> D3 -> D4 -> D5
```

---

### Critical Files for Implementation
- `/Users/smpceo/Documents/v2_meeshy/services/gateway/src/routes/communities.ts.backup` - Source for restoring the full backend route file (1777 lines of working code)
- `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift` - Contains existing `MeeshyCommunity` domain model (line 206-241) that SDK models must align with
- `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift` - Reference singleton pattern (4 lines: shared, private init, api computed property, async methods)
- `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/RootView.swift` - Contains the floating menu ladder (line 400-410 `menuItems` array) where community entry must be added
- `/Users/smpceo/Documents/v2_meeshy/packages/shared/types/community.ts` - Shared TypeScript types (CommunityRole, permissions, interfaces) that backend routes reference
