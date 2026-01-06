//
//  NavigationCoordinator.swift
//  Meeshy
//
//  Central navigation coordinator for the app
//  iOS 16+ compatible
//

import SwiftUI

// MARK: - Navigation Destination

enum NavigationDestination: Hashable {
    case conversation(String)
    case conversations
    case userProfile(String)
    case settings
    case editProfile
    case notifications
    case newConversation
    case call(String)
    case group(String)
    case groups
    case contacts
    case search
    case affiliateSignup(String)
    case resetPassword(String)
}

// MARK: - Tab Selection

enum TabSelection: Int {
    case meeshy = 0
    case conversations = 1
    case calls = 2
    case notifications = 3
    case profile = 4
}

// MARK: - Navigation Coordinator

final class NavigationCoordinator: ObservableObject {
    // MARK: - Published Properties

    @Published var selectedTab: TabSelection = .conversations
    @Published var conversationsPath = NavigationPath()
    @Published var callsPath = NavigationPath()
    @Published var notificationsPath = NavigationPath()
    @Published var profilePath = NavigationPath()

    @Published var presentedSheet: SheetDestination?
    @Published var presentedFullScreenCover: FullScreenDestination?

    // MARK: - Sheet Destinations

    enum SheetDestination: Identifiable {
        case newConversation
        case userProfile(String)
        case editProfile
        case conversationSettings(String)
        case imageViewer([String], Int)

        var id: String {
            switch self {
            case .newConversation: return "newConversation"
            case .userProfile(let id): return "userProfile-\(id)"
            case .editProfile: return "editProfile"
            case .conversationSettings(let id): return "conversationSettings-\(id)"
            case .imageViewer(_, let index): return "imageViewer-\(index)"
            }
        }
    }

    // MARK: - Full Screen Destinations

    enum FullScreenDestination: Identifiable {
        case call(String)
        case camera
        case affiliateSignup(String)
        case resetPassword(String)

        var id: String {
            switch self {
            case .call(let id): return "call-\(id)"
            case .camera: return "camera"
            case .affiliateSignup(let code): return "affiliateSignup-\(code)"
            case .resetPassword(let token): return "resetPassword-\(token)"
            }
        }
    }

    // MARK: - Navigation Methods

    func navigate(to destination: NavigationDestination) {
        switch destination {
        case .conversation:
            selectedTab = .conversations
            conversationsPath.append(destination)

        case .conversations:
            selectedTab = .conversations
            popToRoot(for: .conversations)

        case .userProfile(let id):
            presentedSheet = .userProfile(id)

        case .settings:
            selectedTab = .profile
            profilePath.append(destination)

        case .editProfile:
            presentedSheet = .editProfile

        case .notifications:
            selectedTab = .notifications

        case .newConversation:
            presentedSheet = .newConversation

        case .call(let id):
            presentedFullScreenCover = .call(id)

        case .group(let groupId):
            // Navigate to group/community page
            selectedTab = .conversations
            conversationsPath.append(destination)

        case .groups:
            // Navigate to groups list (could be a tab or section)
            selectedTab = .conversations
            // Groups could be filtered view of conversations

        case .contacts:
            // Navigate to contacts/friends list
            selectedTab = .profile
            profilePath.append(destination)

        case .search:
            // Navigate to search
            selectedTab = .conversations
            conversationsPath.append(destination)

        case .affiliateSignup(let code):
            // Present affiliate signup flow
            presentedFullScreenCover = .affiliateSignup(code)

        case .resetPassword(let token):
            // Present password reset flow
            presentedFullScreenCover = .resetPassword(token)
        }
    }

    func popToRoot(for tab: TabSelection) {
        switch tab {
        case .meeshy:
            // Meeshy tab has no navigation path to reset
            break
        case .conversations:
            conversationsPath.removeLast(conversationsPath.count)
        case .calls:
            callsPath.removeLast(callsPath.count)
        case .notifications:
            notificationsPath.removeLast(notificationsPath.count)
        case .profile:
            profilePath.removeLast(profilePath.count)
        }
    }

    func dismissSheet() {
        presentedSheet = nil
    }

    func dismissFullScreen() {
        presentedFullScreenCover = nil
    }

    func reset() {
        selectedTab = .conversations
        conversationsPath = NavigationPath()
        callsPath = NavigationPath()
        notificationsPath = NavigationPath()
        profilePath = NavigationPath()
        presentedSheet = nil
        presentedFullScreenCover = nil
    }
}

// MARK: - Deep Link Handler

@MainActor
final class DeepLinkHandler {
    // MARK: - Singleton

    static let shared = DeepLinkHandler()

    private init() {}

    // MARK: - Handle Deep Link

    func handle(url: URL, coordinator: NavigationCoordinator) {
        guard url.scheme == "meeshy" else { return }

        switch url.host {
        case "conversation":
            if let id = url.pathComponents.dropFirst().first {
                coordinator.navigate(to: .conversation(id))
            }

        case "user":
            if let id = url.pathComponents.dropFirst().first {
                coordinator.navigate(to: .userProfile(id))
            }

        case "call":
            if let id = url.pathComponents.dropFirst().first {
                coordinator.navigate(to: .call(id))
            }

        default:
            break
        }
    }

    // MARK: - Create Deep Link

    func createDeepLink(for destination: NavigationDestination) -> URL? {
        var urlString = "meeshy://"

        switch destination {
        case .conversation(let id):
            urlString += "conversations/\(id)"
        case .conversations:
            urlString += "conversations"
        case .userProfile(let id):
            urlString += "u/\(id)"
        case .call(let id):
            urlString += "call/\(id)"
        case .group(let id):
            urlString += "groups/\(id)"
        case .groups:
            urlString += "groups"
        case .notifications:
            urlString += "notifications"
        case .contacts:
            urlString += "contacts"
        case .search:
            urlString += "search"
        case .settings:
            urlString += "settings"
        default:
            return nil
        }

        return URL(string: urlString)
    }

    /// Create a shareable universal link (https://meeshy.me/...)
    func createUniversalLink(for destination: NavigationDestination) -> URL? {
        var urlString = "https://meeshy.me"

        switch destination {
        case .conversation(let id):
            urlString += "/conversations/\(id)"
        case .userProfile(let username):
            urlString += "/u/\(username)"
        case .call(let id):
            urlString += "/call/\(id)"
        case .group(let id):
            urlString += "/groups/\(id)"
        default:
            return nil
        }

        return URL(string: urlString)
    }
}
