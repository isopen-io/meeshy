import Foundation
import MeeshySDK

// MARK: - Search Result Item (app-only)

struct SearchResultItem: Identifiable {
    let id: String
    let conversationId: String
    let content: String
    let matchedText: String
    let matchType: String // "content" or "translation"
    let senderName: String
    let senderAvatar: String?
    let createdAt: Date
}
