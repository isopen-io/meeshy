import XCTest
@testable import MeeshySDK

final class ConversationModelsTests: XCTestCase {

    // MARK: - MeeshyConversationTag

    func testTagInitSetsFields() {
        let tag = MeeshyConversationTag(id: "t1", name: "Travail", color: "3498DB")
        XCTAssertEqual(tag.id, "t1")
        XCTAssertEqual(tag.name, "Travail")
        XCTAssertEqual(tag.color, "3498DB")
    }

    func testTagEstimatedWidth() {
        let tag = MeeshyConversationTag(name: "Hello", color: "FF6B6B")
        let expected: CGFloat = CGFloat(5) * 7 + 22
        XCTAssertEqual(tag.estimatedWidth, expected)
    }

    func testTagCodableRoundtrip() throws {
        let original = MeeshyConversationTag(id: "abc", name: "Urgent", color: "E91E63")
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(MeeshyConversationTag.self, from: data)
        XCTAssertEqual(decoded.id, original.id)
        XCTAssertEqual(decoded.name, original.name)
        XCTAssertEqual(decoded.color, original.color)
    }

    func testTagSamplesArrayCount() {
        XCTAssertEqual(MeeshyConversationTag.samples.count, 10)
    }

    func testTagColorsArrayCount() {
        XCTAssertEqual(MeeshyConversationTag.colors.count, 10)
    }

    // MARK: - MeeshyConversationSection

    func testSectionInitSetsFields() {
        let section = MeeshyConversationSection(id: "s1", name: "Custom", icon: "star", color: "FFFFFF", order: 7)
        XCTAssertEqual(section.id, "s1")
        XCTAssertEqual(section.name, "Custom")
        XCTAssertEqual(section.icon, "star")
        XCTAssertEqual(section.color, "FFFFFF")
        XCTAssertEqual(section.order, 7)
        XCTAssertTrue(section.isExpanded)
    }

    func testPredefinedSections() {
        XCTAssertEqual(MeeshyConversationSection.pinned.id, "pinned")
        XCTAssertEqual(MeeshyConversationSection.pinned.order, 0)
        XCTAssertEqual(MeeshyConversationSection.work.id, "work")
        XCTAssertEqual(MeeshyConversationSection.work.order, 1)
        XCTAssertEqual(MeeshyConversationSection.family.id, "family")
        XCTAssertEqual(MeeshyConversationSection.family.order, 2)
        XCTAssertEqual(MeeshyConversationSection.friends.id, "friends")
        XCTAssertEqual(MeeshyConversationSection.friends.order, 3)
        XCTAssertEqual(MeeshyConversationSection.groups.id, "groups")
        XCTAssertEqual(MeeshyConversationSection.groups.order, 4)
        XCTAssertEqual(MeeshyConversationSection.other.id, "other")
        XCTAssertEqual(MeeshyConversationSection.other.order, 5)
    }

    func testAllSectionsCount() {
        XCTAssertEqual(MeeshyConversationSection.allSections.count, 6)
    }

    // MARK: - MeeshyConversation

    func testConversationInitDefaults() {
        let conv = MeeshyConversation(identifier: "test-conv")
        XCTAssertEqual(conv.identifier, "test-conv")
        XCTAssertEqual(conv.type, .direct)
        XCTAssertNil(conv.title)
        XCTAssertTrue(conv.isActive)
        XCTAssertEqual(conv.memberCount, 2)
        XCTAssertEqual(conv.unreadCount, 0)
        XCTAssertNil(conv.encryptionMode)
        XCTAssertFalse(conv.isPinned)
        XCTAssertFalse(conv.isMuted)
        XCTAssertTrue(conv.tags.isEmpty)
    }

    func testConversationTypeEnumRawValues() {
        XCTAssertEqual(MeeshyConversation.ConversationType.direct.rawValue, "direct")
        XCTAssertEqual(MeeshyConversation.ConversationType.group.rawValue, "group")
        XCTAssertEqual(MeeshyConversation.ConversationType.public.rawValue, "public")
        XCTAssertEqual(MeeshyConversation.ConversationType.global.rawValue, "global")
        XCTAssertEqual(MeeshyConversation.ConversationType.community.rawValue, "community")
        XCTAssertEqual(MeeshyConversation.ConversationType.channel.rawValue, "channel")
        XCTAssertEqual(MeeshyConversation.ConversationType.bot.rawValue, "bot")
    }

    func testConversationTypeAllCases() {
        XCTAssertEqual(MeeshyConversation.ConversationType.allCases.count, 7)
    }

    func testConversationNameReturnsTitle() {
        let conv = MeeshyConversation(identifier: "id-123", title: "My Group")
        XCTAssertEqual(conv.name, "My Group")
    }

    func testConversationNameFallsBackToIdentifier() {
        let conv = MeeshyConversation(identifier: "id-123", title: nil)
        XCTAssertEqual(conv.name, "id-123")
    }

    func testConversationIsArchivedWhenInactive() {
        let active = MeeshyConversation(identifier: "a", isActive: true)
        XCTAssertFalse(active.isArchived)

        let archived = MeeshyConversation(identifier: "b", isActive: false)
        XCTAssertTrue(archived.isArchived)
    }

    // MARK: - RecentMessagePreview

    func testRecentMessagePreviewInit() {
        let now = Date()
        let preview = RecentMessagePreview(
            id: "msg1", content: "Hello", senderName: "Alice",
            messageType: "text", createdAt: now, attachmentMimeType: nil, attachmentCount: 0
        )
        XCTAssertEqual(preview.id, "msg1")
        XCTAssertEqual(preview.content, "Hello")
        XCTAssertEqual(preview.senderName, "Alice")
        XCTAssertEqual(preview.messageType, "text")
        XCTAssertEqual(preview.createdAt, now)
        XCTAssertNil(preview.attachmentMimeType)
        XCTAssertEqual(preview.attachmentCount, 0)
    }

    func testRecentMessagePreviewCodableRoundtrip() throws {
        let preview = RecentMessagePreview(
            id: "msg2", content: "Bonjour", senderName: "Bob",
            messageType: "image", attachmentMimeType: "image/jpeg", attachmentCount: 1
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let data = try encoder.encode(preview)
        let decoded = try decoder.decode(RecentMessagePreview.self, from: data)
        XCTAssertEqual(decoded.id, preview.id)
        XCTAssertEqual(decoded.content, preview.content)
        XCTAssertEqual(decoded.senderName, preview.senderName)
        XCTAssertEqual(decoded.attachmentMimeType, "image/jpeg")
        XCTAssertEqual(decoded.attachmentCount, 1)
    }

    // MARK: - MeeshyCommunity

    func testCommunityInitDefaults() {
        let community = MeeshyCommunity(identifier: "comm-1", name: "Test Community", createdBy: "user1")
        XCTAssertEqual(community.identifier, "comm-1")
        XCTAssertEqual(community.name, "Test Community")
        XCTAssertEqual(community.createdBy, "user1")
        XCTAssertNil(community.description)
        XCTAssertNil(community.avatar)
        XCTAssertNil(community.banner)
        XCTAssertTrue(community.isPrivate)
        XCTAssertTrue(community.isActive)
        XCTAssertNil(community.deletedAt)
        XCTAssertEqual(community.memberCount, 0)
        XCTAssertEqual(community.conversationCount, 0)
        XCTAssertEqual(community.emoji, "")
        XCTAssertEqual(community.color, "4ECDC4")
    }

    func testCommunityInitWithAllFields() {
        let now = Date()
        let community = MeeshyCommunity(
            id: "c1", identifier: "my-community", name: "Dev Team",
            description: "For devs", avatar: "avatar.png", banner: "banner.png",
            isPrivate: false, isActive: true, deletedAt: nil,
            createdBy: "admin", createdAt: now, updatedAt: now,
            memberCount: 42, conversationCount: 5,
            emoji: "rocket", color: "FF6B6B"
        )
        XCTAssertEqual(community.id, "c1")
        XCTAssertEqual(community.name, "Dev Team")
        XCTAssertEqual(community.description, "For devs")
        XCTAssertFalse(community.isPrivate)
        XCTAssertEqual(community.memberCount, 42)
        XCTAssertEqual(community.conversationCount, 5)
        XCTAssertEqual(community.emoji, "rocket")
    }
}
