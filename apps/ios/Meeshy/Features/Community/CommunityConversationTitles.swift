import MeeshySDK

func communityConversationTitles(_ items: [APIConversation], readerId: String) -> [String: String] {
    Dictionary(items.map { ($0.id, $0.listTitle(currentUserId: readerId)) }, uniquingKeysWith: { _, latest in latest })
}
