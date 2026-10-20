import Foundation
import UIKit

public struct MeeshyConversationSection: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let icon: String
    public let color: String
    public var isExpanded: Bool = true
    public let order: Int

    public init(id: String = UUID().uuidString, name: String, icon: String, color: String, isExpanded: Bool = true, order: Int = 0) {
        self.id = id
        self.name = name
        self.icon = icon
        self.color = color
        self.isExpanded = isExpanded
        self.order = order
    }

    public static let pinned = MeeshyConversationSection(id: "pinned", name: "Epingles", icon: "pin.fill", color: "FF6B6B", order: 0)
    public static let work = MeeshyConversationSection(id: "work", name: "Travail", icon: "briefcase.fill", color: "3498DB", order: 1)
    public static let family = MeeshyConversationSection(id: "family", name: "Famille", icon: "house.fill", color: "2ECC71", order: 2)
    public static let friends = MeeshyConversationSection(id: "friends", name: "Amis", icon: "person.2.fill", color: "9B59B6", order: 3)
    public static let groups = MeeshyConversationSection(id: "groups", name: "Groupes", icon: "person.3.fill", color: "F8B500", order: 4)
    public static let other = MeeshyConversationSection(id: "other", name: "Mes conversations", icon: "tray.fill", color: "45B7D1", order: 5)

    public static let allSections: [MeeshyConversationSection] = [.pinned, .work, .family, .friends, .groups, .other]
}
