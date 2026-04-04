import Testing
import MeeshySDK

@Suite("MeeshySDK Core Models Tests")
struct CoreModelsTests {
    
    @Test("Creating a conversation with default values")
    func createConversation() async throws {
        let conversation = MeeshyConversation(
            identifier: "test_conv",
            type: .direct,
            title: "Test User"
        )
        
        #expect(conversation.identifier == "test_conv")
        #expect(conversation.type == .direct)
        #expect(conversation.title == "Test User")
        #expect(conversation.unreadCount == 0)
        #expect(conversation.isPinned == false)
    }
    
    @Test("Creating a message with attachments")
    func createMessage() async throws {
        let attachment = MeeshyMessageAttachment(
            type: .image,
            url: "https://example.com/image.jpg"
        )
        
        let message = MeeshyMessage(
            conversationId: "conv_123",
            senderId: "user_456",
            type: .image,
            content: "Check this out!",
            attachments: [attachment]
        )
        
        #expect(message.conversationId == "conv_123")
        #expect(message.senderId == "user_456")
        #expect(message.attachments.count == 1)
        #expect(message.attachments.first?.type == .image)
    }
    
    @Test("Creating conversation tags")
    func createTags() async throws {
        let tag = MeeshyConversationTag(
            name: "Work",
            color: "3498DB"
        )
        
        #expect(tag.name == "Work")
        #expect(tag.color == "3498DB")
    }
    
    @Test("Conversation with tags and pinned status")
    func conversationWithTags() async throws {
        let tags = [
            MeeshyConversationTag(name: "Important", color: "FF6B6B"),
            MeeshyConversationTag(name: "Work", color: "3498DB")
        ]
        
        let conversation = MeeshyConversation(
            identifier: "conv_work",
            type: .group,
            title: "Project Team",
            memberCount: 5,
            tags: tags,
            isPinned: true,
            theme: .work
        )
        
        #expect(conversation.tags.count == 2)
        #expect(conversation.isPinned == true)
        #expect(conversation.theme == .work)
        #expect(conversation.memberCount == 5)
    }
}
