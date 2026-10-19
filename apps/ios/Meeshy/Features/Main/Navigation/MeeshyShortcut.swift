import SwiftUI

enum MeeshyShortcut: CaseIterable, Hashable {
    case newConversation
    case search
    case closeWindow
    case back
    case conversations
    case contacts
    case notifications
    case settings

    static let sections: [MeeshyShortcut] = [.conversations, .contacts, .notifications, .settings]

    var key: KeyEquivalent {
        switch self {
        case .newConversation: return "n"
        case .search: return "f"
        case .closeWindow: return "w"
        case .back: return "["
        case .conversations: return "1"
        case .contacts: return "2"
        case .notifications: return "3"
        case .settings: return "4"
        }
    }

    var modifiers: EventModifiers { .command }

    var title: String {
        switch self {
        case .newConversation:
            return String(localized: "commands.new_conversation", defaultValue: "Nouvelle conversation", bundle: .main)
        case .search:
            return String(localized: "commands.search", defaultValue: "Rechercher", bundle: .main)
        case .closeWindow:
            return String(localized: "commands.close_window", defaultValue: "Fermer la fenêtre", bundle: .main)
        case .back:
            return String(localized: "commands.back", defaultValue: "Retour", bundle: .main)
        case .conversations:
            return String(localized: "route.title.conversations", defaultValue: "Conversations", bundle: .main)
        case .contacts:
            return String(localized: "commands.contacts", defaultValue: "Contacts", bundle: .main)
        case .notifications:
            return String(localized: "root.ipad.notifications", defaultValue: "Notifications", bundle: .main)
        case .settings:
            return String(localized: "root.ipad.settings", defaultValue: "Paramètres", bundle: .main)
        }
    }

    var systemImage: String {
        switch self {
        case .newConversation: return "square.and.pencil"
        case .search: return "magnifyingglass"
        case .closeWindow: return "xmark"
        case .back: return "chevron.backward"
        case .conversations: return "bubble.left.and.bubble.right"
        case .contacts: return "person.2"
        case .notifications: return "bell"
        case .settings: return "gearshape"
        }
    }

    var route: Route? {
        switch self {
        case .contacts: return .contacts()
        case .notifications: return .notifications
        case .settings: return .settings
        case .newConversation, .search, .closeWindow, .back, .conversations: return nil
        }
    }

    func keyboardShortcut(enabled: Bool) -> KeyboardShortcut? {
        guard enabled else { return nil }
        return KeyboardShortcut(key, modifiers: modifiers)
    }
}
